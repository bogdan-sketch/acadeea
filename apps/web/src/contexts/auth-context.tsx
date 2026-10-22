'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { auth } from '@/lib/api';
import { isPosthogEnabled, posthog } from '@/lib/posthog';
import type { AuthProvider, LoginResponse, ProviderAuthRequest, User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  /**
   * Login WITHOUT persisting tokens on this origin — used on the apex domain
   * (horae.ca), where the session is immediately handed off to the user's org
   * subdomain via the single-use handoffCode in the response.
   */
  loginForHandoff: (email: string, password: string) => Promise<LoginResponse>;
  /**
   * Sign in (or invite-only sign up) with Apple/Google. Returns the SAME
   * AuthResponse as password login. When `handoff` is true, tokens are NOT
   * persisted here (apex flow — the caller redeems the handoffCode on the org
   * subdomain); otherwise the session is consumed like a normal login.
   */
  providerLogin: (
    provider: AuthProvider,
    body: ProviderAuthRequest,
    handoff?: boolean,
  ) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Only a definitive 401 (token refresh failed too) ends the session. A
    // 429, 5xx or network error is retried, and if it keeps failing we leave
    // the tokens in place so the next load signs the user back in.
    const delays = [0, 800, 2000, 4000, 8000, 12000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
      try {
        const me = await auth.me();
        setUser(me);
        // Tie product analytics events to the signed-in user (no-op when disabled).
        if (isPosthogEnabled()) {
          posthog.identify(me.id, { email: me.email, role: me.role?.slug });
        }
        return;
      } catch (e) {
        const status =
          e && typeof e === 'object' && 'status' in e
            ? (e as { status?: number }).status
            : undefined;
        if (status === 401 || status === 403) {
          setUser(null);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          return;
        }
      }
    }
    // Still failing after ~27 s: keep an already loaded user (the page keeps
    // working and the next call retries); only a cold start shows the login.
    setUser((u) => u ?? null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      refresh().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refresh]);

  // Shared post-auth bootstrap: persist the token pair on this origin and hydrate
  // the user. Reused by password login AND provider (Apple/Google) login so both
  // paths behave identically once they hold an AuthResponse.
  const consumeSession = useCallback(
    async (res: LoginResponse) => {
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
      try {
        await refresh();
      } catch (err) {
        // Don't strand half-written tokens — a failed hydrate would otherwise
        // block the next password login (stale token → me() 401 loop).
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
        throw err;
      }
      return res;
    },
    [refresh],
  );

  const login = async (email: string, password: string) =>
    consumeSession(await auth.login(email, password));

  const loginForHandoff = async (email: string, password: string) => {
    // No token persistence: the apex origin never keeps a session.
    return auth.login(email, password);
  };

  const providerLogin = async (
    provider: AuthProvider,
    body: ProviderAuthRequest,
    handoff = false,
  ) => {
    const res = provider === 'apple' ? await auth.apple(body) : await auth.google(body);
    // Apex handoff flow → don't persist here; caller redeems the code on the subdomain.
    return handoff ? res : consumeSession(res);
  };

  const logout = async () => {
    try {
      await auth.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    // Drop the identified user so subsequent events are anonymous (no-op when disabled).
    if (isPosthogEnabled()) {
      posthog.reset();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginForHandoff,
        providerLogin,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// CASL-style permissions matching iOS PermissionManager
type CASLAction = 'manage' | 'create' | 'read' | 'update' | 'delete';
type CASLSubject =
  | 'all'
  | 'Recipe'
  | 'RecipeCost'
  | 'Task'
  | 'Order'
  | 'OrderItem'
  | 'DeliveryNote'
  | 'RawMaterial'
  | 'Consumable'
  | 'StockMovement'
  | 'Location'
  | 'Transfer'
  | 'User'
  | 'Invitation'
  | 'Activity'
  | 'Organization'
  | 'Equipment'
  | 'Integration';

const roleRules: Record<string, { action: CASLAction | CASLAction[]; subject: CASLSubject }[]> = {
  administrator: [{ action: 'manage', subject: 'all' }],
  // ---- Current seeded roles (mirror apps/api/src/prisma/seed.ts; backend
  // subject 'StockTransfer' maps to 'Transfer' here) ----
  'sef-cofetar': [
    { action: 'read', subject: 'Recipe' },
    { action: 'read', subject: 'RecipeCost' },
    { action: 'manage', subject: 'Task' },
    { action: 'read', subject: 'Order' },
    { action: 'read', subject: 'OrderItem' },
    { action: ['read', 'create', 'update'], subject: 'RawMaterial' },
    { action: ['read', 'create', 'update'], subject: 'Consumable' },
    { action: ['read', 'create'], subject: 'StockMovement' },
    { action: 'read', subject: 'Location' },
    { action: ['read', 'create', 'update'], subject: 'Transfer' },
    { action: ['read', 'create'], subject: 'DeliveryNote' },
  ],
  // NO read Recipe — a recipe is visible only from an active task.
  cofetar: [
    { action: ['read', 'update'], subject: 'Task' },
    { action: ['read', 'create', 'update'], subject: 'RawMaterial' },
    { action: ['read', 'create', 'update'], subject: 'Consumable' },
    { action: ['read', 'create'], subject: 'StockMovement' },
    { action: 'read', subject: 'Location' },
    { action: ['read', 'create', 'update'], subject: 'Transfer' },
    { action: ['read', 'create'], subject: 'DeliveryNote' },
  ],
  gestionar: [
    { action: ['read', 'create', 'update'], subject: 'RawMaterial' },
    { action: ['read', 'create', 'update'], subject: 'Consumable' },
    { action: ['read', 'create'], subject: 'StockMovement' },
    { action: 'read', subject: 'Location' },
    { action: ['read', 'create', 'update'], subject: 'Transfer' },
    { action: ['read', 'create'], subject: 'DeliveryNote' },
  ],
  sofer: [
    { action: ['read', 'create', 'update'], subject: 'Transfer' },
    { action: ['read', 'create'], subject: 'DeliveryNote' },
    { action: 'read', subject: 'Location' },
  ],
  user: [{ action: 'read', subject: 'Task' }],
  // ---- Legacy slugs (pre-2026 role set) — kept for older accounts ----
  'sef-laborator': [
    { action: 'manage', subject: 'Recipe' },
    { action: 'read', subject: 'RawMaterial' },
    { action: 'read', subject: 'Consumable' },
    { action: 'manage', subject: 'Task' },
    { action: 'read', subject: 'Order' },
    { action: 'manage', subject: 'Transfer' },
    { action: 'read', subject: 'Location' },
    { action: 'read', subject: 'StockMovement' },
    { action: 'read', subject: 'Activity' },
  ],
  'sef-evenimente': [
    { action: ['read', 'create'], subject: 'Recipe' },
    { action: 'manage', subject: 'Order' },
    { action: 'manage', subject: 'OrderItem' },
    { action: 'manage', subject: 'DeliveryNote' },
    { action: 'read', subject: 'RawMaterial' },
    { action: 'read', subject: 'Consumable' },
    { action: ['read', 'create', 'update'], subject: 'Task' },
    { action: 'read', subject: 'StockMovement' },
    { action: 'read', subject: 'Location' },
    { action: 'read', subject: 'Activity' },
  ],
  patiser: [
    { action: 'read', subject: 'Recipe' },
    { action: 'read', subject: 'RawMaterial' },
    { action: 'read', subject: 'Consumable' },
    { action: 'manage', subject: 'Task' },
    { action: 'read', subject: 'Order' },
    { action: 'read', subject: 'Location' },
    { action: 'read', subject: 'Activity' },
  ],
  'ajutor-cofetar': [
    { action: 'read', subject: 'Recipe' },
    { action: 'read', subject: 'RawMaterial' },
    { action: 'read', subject: 'Task' },
    { action: 'read', subject: 'Activity' },
  ],
  magazioner: [
    { action: 'manage', subject: 'RawMaterial' },
    { action: 'manage', subject: 'Consumable' },
    { action: 'manage', subject: 'StockMovement' },
    { action: 'manage', subject: 'Location' },
    { action: 'manage', subject: 'Transfer' },
    { action: 'read', subject: 'Task' },
    { action: 'read', subject: 'Recipe' },
    { action: 'read', subject: 'Order' },
    { action: 'read', subject: 'Activity' },
  ],
};

export function usePermissions() {
  const { user } = useAuth();

  const can = useCallback(
    (action: CASLAction, subject: CASLSubject): boolean => {
      if (!user?.role) return false;
      const rules = roleRules[user.role.slug] || [];
      return rules.some((rule) => {
        const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
        const subjectMatch = rule.subject === 'all' || rule.subject === subject;
        const actionMatch = actions.includes('manage') || actions.includes(action);
        return subjectMatch && actionMatch;
      });
    },
    [user],
  );

  return { can };
}
