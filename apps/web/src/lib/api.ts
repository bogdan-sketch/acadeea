// API client matching iOS services layer
import { createTokenRefresher } from './auth-refresh';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.horae.ca';

/** Image paths from the API are relative (`/api/v1/images/<id>`) — prefix them with the API host. */
export function resolveApiUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:)/i.test(path)) return path;
  return `${API_BASE}${path}`;
}

async function uploadImage<T>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const res = await fetchWithRefresh(`${API_BASE}${path}`, (token) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return { method: 'POST', headers, body: form };
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.code, err.message);
  }
  return res.json() as Promise<T>;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code?: string,
    message?: string,
  ) {
    super(message || `API Error ${status}`);
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

// Public/auth pages must not be bounced to /login when a stale token's session
// can't be refreshed (e.g. a locked account opening a reset link).
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/auth/handoff',
  '/landing',
  '/changelog',
  // Legal pages — linked from the App Store listing; a failed token refresh
  // must never bounce an anonymous reader to /login from here.
  '/privacy',
  '/support',
];
function onPublicPage(): boolean {
  return (
    typeof window !== 'undefined' &&
    PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))
  );
}

async function request<T>(path: string, options: RequestInit = {}, expectStatus = 200): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Refresh (shared single flight), then retry once with the rotated token.
    // The retry goes through the same status handling below (204, expectStatus).
    await refreshOrEndSession(token);
    headers['Authorization'] = `Bearer ${getToken()}`;
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  }

  if (res.status !== expectStatus && !res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.code ?? err.errorCode, err.message);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// Single-flight refresh, see auth-refresh.ts: concurrent 401s share ONE token
// rotation (the server revokes the old refresh token on every refresh), and only
// a 401/403 from /auth/refresh ends the session.
const tryRefresh = createTokenRefresher({
  refreshUrl: `${API_BASE}/api/v1/auth/refresh`,
  fetch: (input, init) => fetch(input, init),
  storage: {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
  },
});

/**
 * After a 401: resolves once the access token is fresh. A rejected refresh takes
 * the shared logout path; a transient failure (429, 5xx, offline) throws a
 * non-auth error and KEEPS the tokens, so the user stays signed in.
 */
async function refreshOrEndSession(rejectedToken: string | null): Promise<void> {
  const outcome = await tryRefresh(rejectedToken);
  if (outcome === 'refreshed') return;
  if (outcome === 'rejected') handleRefreshFailure();
  throw new ApiError(
    503,
    'SESSION_REFRESH_UNAVAILABLE',
    'Nu am putut reînnoi sesiunea. Verifică conexiunea și încearcă din nou.',
  );
}

// Shared logout path for a failed refresh. Don't redirect away from public pages
// (reset/invite/login) — the user is there to set a password or create an
// account, not to use an old session.
function handleRefreshFailure(): never {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  if (!onPublicPage()) window.location.href = '/login';
  throw new ApiError(401, 'AUTH_002', 'Session expired');
}

// 401→refresh→retry for raw fetch() callers that can't route through request()
// (binary/blob downloads, multipart uploads). Runs the SAME single-flight
// refresh as request() so a concurrent 401 storm shares one token rotation; a
// rejected refresh takes the shared logout path, a transient one keeps the
// session. `build` is called again on retry so the retried request carries the
// freshly rotated access token.
async function fetchWithRefresh(
  url: string,
  build: (token: string | null) => RequestInit,
): Promise<Response> {
  const token = getToken();
  const res = await fetch(url, build(token));
  if (res.status !== 401) return res;
  await refreshOrEndSession(token);
  return fetch(url, build(getToken()));
}

function buildQuery(params: object): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      // Lists go as one comma-separated value (e.g. statuses=NOUA,PREGATITA).
      if (val.length) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val.join(','))}`);
    } else if (val !== undefined && val !== null && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// Logos come back as RELATIVE paths to the API's cacheable binary endpoint
// (/api/v1/organization/by-slug/<slug>/logo/<variant>) instead of multi-MB
// base64 data URIs. Make them absolute so <img src> hits the API host.
function absolutizeLogos<
  T extends {
    logoUrl?: string | null;
    logoLightUrl?: string | null;
    logoDarkUrl?: string | null;
    appLogoLightUrl?: string | null;
    appLogoDarkUrl?: string | null;
  } | null,
>(org: T): T {
  if (!org) return org;
  const abs = (v: string | null | undefined) => (v && v.startsWith('/') ? `${API_BASE}${v}` : v);
  return {
    ...org,
    logoUrl: abs(org.logoUrl),
    logoLightUrl: abs(org.logoLightUrl),
    logoDarkUrl: abs(org.logoDarkUrl),
    appLogoLightUrl: abs(org.appLogoLightUrl),
    appLogoDarkUrl: abs(org.appLogoDarkUrl),
  };
}

function absolutizeLoginResponse(
  res: import('./types').LoginResponse,
): import('./types').LoginResponse {
  return { ...res, organization: absolutizeLogos(res.organization) };
}

// Raw POST for the PUBLIC provider-login endpoints. Deliberately does NOT route
// through request(): those return 401 PROVIDER_NO_ACCOUNT for an unknown identity,
// and request() would treat any 401 as an expired session (refresh→redirect),
// swallowing the real error code. Preserves `errorCode` so callers can branch.
async function postProviderAuth(
  path: string,
  body: import('./types').ProviderAuthRequest,
): Promise<import('./types').LoginResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.code ?? err.errorCode, err.message);
  }
  return absolutizeLoginResponse(await res.json());
}

// ========== Auth ==========
export const auth = {
  login: async (email: string, password: string) =>
    absolutizeLoginResponse(
      await request<import('./types').LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    ),

  me: () => request<import('./types').User>('/api/v1/auth/me'),

  // ----- Sign in with Apple / Google (public; same AuthResponse as login) -----
  // Verified server-side against the provider JWKS. A new account is created ONLY
  // when `invitationToken` is present (invite-only sign-up); otherwise an unknown
  // identity → 401 PROVIDER_NO_ACCOUNT.
  apple: (body: import('./types').ProviderAuthRequest) =>
    postProviderAuth('/api/v1/auth/apple', body),

  google: (body: import('./types').ProviderAuthRequest) =>
    postProviderAuth('/api/v1/auth/google', body),

  // ----- Link / unlink a provider on the CURRENT user (authed) -----
  // link → 409 PROVIDER_ALREADY_LINKED if the identity belongs to another user;
  // idempotent 200 if already linked to the current user.
  linkProvider: (
    provider: import('./types').AuthProvider,
    body: import('./types').LinkProviderRequest,
  ) =>
    request<import('./types').LinkedProvidersResponse>(`/api/v1/auth/link/${provider}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // unlink → 400 LAST_LOGIN_METHOD if it would leave the user with no way to log in.
  unlinkProvider: (provider: import('./types').AuthProvider) =>
    request<import('./types').LinkedProvidersResponse>(`/api/v1/auth/link/${provider}`, {
      method: 'DELETE',
    }),

  // Redeem a single-use apex→subdomain handoff code for a fresh token pair.
  // Raw fetch, no bearer — runs on a logged-out origin.
  redeemHandoff: async (code: string): Promise<import('./types').LoginResponse> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/handoff/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return absolutizeLoginResponse(await res.json());
  },

  logout: () =>
    request('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: localStorage.getItem('refreshToken') }),
    }),

  // Self-service account deletion — confirms the current password, then the
  // server anonymizes the account and revokes all sessions. Returns 200.
  deleteAccount: (password: string) =>
    request<{ deleted: true }>('/api/v1/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),

  checkInvite: async (
    token: string,
  ): Promise<{ valid: boolean; reason?: string; email?: string }> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/invite-status/${token}`);
    if (!res.ok) return { valid: false, reason: 'invalid' };
    return res.json();
  },

  acceptInvite: async (
    data: import('./types').AcceptInviteRequest,
  ): Promise<import('./types').LoginResponse> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.json();
  },

  forgotPassword: async (email: string): Promise<void> => {
    // Always resolves regardless of whether the account exists (no enumeration).
    await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  },

  resetStatus: async (
    token: string,
  ): Promise<{ valid: boolean; reason?: string; purpose?: 'RESET' | 'REACTIVATION' }> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/reset-status/${token}`);
    if (!res.ok) return { valid: false, reason: 'invalid' };
    return res.json();
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
  },
};

// ========== Tasks ==========
export const tasks = {
  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/tasks/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/tasks/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/tasks/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  /** "Task multiplu"/"familie": creates a group of tasks in one call. */
  createMulti: (data: import('./types').CreateMultiTaskRequest) =>
    request<{ groupId: string; tasks: import('./types').Task[] }>(
      '/api/v1/tasks/multi',
      { method: 'POST', body: JSON.stringify(data) },
      201,
    ),

  list: (query: import('./types').TaskQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').Task>>(
      `/api/v1/tasks${buildQuery(query)}`,
    ),

  get: (id: string) => request<import('./types').Task>(`/api/v1/tasks/${id}`),

  traceability: (id: string) =>
    request<import('./types').TaskTraceability>(`/api/v1/tasks/${id}/traceability`),

  materialRequirements: (id: string) =>
    request<import('./types').TaskMaterialRequirement[]>(
      `/api/v1/tasks/${id}/material-requirements`,
    ),

  previewRequirements: (
    recipeId: string,
    targetQuantity: number,
    targetUnit: import('@horae/shared-types').UnitType,
    locationId?: string,
  ) =>
    request<import('./types').TaskMaterialRequirement[]>(
      `/api/v1/tasks/preview-requirements?recipeId=${recipeId}&targetQuantity=${targetQuantity}&targetUnit=${targetUnit}` +
        (locationId ? `&locationId=${locationId}` : ''),
    ),

  create: (data: import('./types').CreateTaskRequest) =>
    request<import('./types').Task>(
      '/api/v1/tasks',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  update: (id: string, data: Partial<import('./types').CreateTaskRequest>) =>
    request<import('./types').Task>(`/api/v1/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  transition: (id: string, data: import('./types').TransitionTaskRequest) =>
    request<import('./types').Task>(`/api/v1/tasks/${id}/transition`, {
      method: 'POST',
      // Backend DTO expects { status, reason, actualYield, byproducts } — map from the web shape.
      body: JSON.stringify({
        status: data.toStatus,
        actualYield: data.actualYield,
        reason: data.cancelReason,
        byproducts: data.byproducts,
      }),
    }),

  assign: (id: string, assignedToId: string) =>
    request<import('./types').Task>(`/api/v1/tasks/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedToId }),
    }),

  delete: (id: string) => request(`/api/v1/tasks/${id}`, { method: 'DELETE' }),

  shoppingList: () =>
    request<{ items: import('./types').ShoppingListItem[] }>('/api/v1/tasks/shopping-list').then(
      (res) => res.items ?? [],
    ),

  calendar: (from: string, to: string) =>
    request<import('./types').TaskCalendarDay[]>(`/api/v1/tasks/calendar?from=${from}&to=${to}`),
};

// ========== Recipes ==========
export const recipes = {
  uploadPhoto: (id: string, file: File) =>
    uploadImage<import('./types').Recipe>(`/api/v1/recipes/${id}/photo`, 'photo', file),

  deletePhoto: (id: string) =>
    request<import('./types').Recipe>(`/api/v1/recipes/${id}/photo`, { method: 'DELETE' }),

  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/recipes/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/recipes/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/recipes/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  list: (query: import('./types').RecipeQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').Recipe>>(
      `/api/v1/recipes${buildQuery(query)}`,
    ),

  get: (id: string) => request<import('./types').Recipe>(`/api/v1/recipes/${id}`),

  nutrition: (id: string) =>
    request<import('./types').RecipeNutrition>(`/api/v1/recipes/${id}/nutrition`),

  create: (data: import('./types').CreateRecipeRequest) =>
    request<import('./types').Recipe>(
      '/api/v1/recipes',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  update: (id: string, data: Partial<import('./types').CreateRecipeRequest>) =>
    request<import('./types').Recipe>(`/api/v1/recipes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request(`/api/v1/recipes/${id}`, { method: 'DELETE' }),

  // Archive/unarchive — separate from update() so it never touches versioning.
  setArchived: (id: string, archived: boolean) =>
    request<import('./types').Recipe>(`/api/v1/recipes/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    }),

  // Publish/unpublish a draft — separate from update() (mirrors setArchived).
  setDraft: (id: string, draft: boolean) =>
    request<import('./types').Recipe>(`/api/v1/recipes/${id}/draft`, {
      method: 'PATCH',
      body: JSON.stringify({ draft }),
    }),

  yieldHistory: async (id: string): Promise<import('./types').RecipeYieldEntry[]> => {
    // Backend returns a PaginatedDto whose rows use targetQuantity/recordedAt;
    // the web shape is a plain array with expectedYield/createdAt. Unwrap and
    // map defensively (tolerating either shape) — treating the response as an
    // array made "Istoric randament" permanently empty.
    type WireEntry = Partial<import('./types').RecipeYieldEntry> & {
      targetQuantity?: number;
      recordedAt?: string;
    };
    const res = await request<{ data?: WireEntry[] } | WireEntry[]>(
      `/api/v1/recipes/${id}/yield-history`,
    );
    const rows = Array.isArray(res) ? res : (res?.data ?? []);
    return rows.map((r, i) => ({
      id: r.id ?? `${id}-yield-${i}`,
      taskId: r.taskId ?? '',
      expectedYield: r.expectedYield ?? r.targetQuantity ?? 0,
      actualYield: r.actualYield ?? 0,
      varianceAbsolute: r.varianceAbsolute ?? 0,
      variancePercent: r.variancePercent ?? 0,
      createdAt: r.createdAt ?? r.recordedAt ?? '',
    }));
  },

  cost: (id: string) => request<import('./types').RecipeCost>(`/api/v1/recipes/${id}/cost`),

  // Three separate category lists: MATERIE_PRIMA (raw materials + consumables),
  // SEMIPREPARAT (semi-finished recipes), PRODUS_FINIT (final recipes).
  categories: (kind: import('./types').CategoryKind = 'MATERIE_PRIMA') =>
    request<string[]>(`/api/v1/recipes/categories?kind=${kind}`),

  // Active recipes per category ("" = uncategorized), optionally for one type.
  categoryCounts: (type?: import('@horae/shared-types').RecipeType) =>
    request<Record<string, number>>(
      `/api/v1/recipes/categories/counts${type ? `?type=${type}` : ''}`,
    ),

  // Detailed category list, ALREADY ordered by the admin sortOrder (then name).
  categoryConfigs: (kind: import('./types').CategoryKind = 'MATERIE_PRIMA') =>
    request<
      { name: string; isSystem: boolean; color?: string | null; parentName?: string | null }[]
    >(`/api/v1/recipes/categories/detailed?kind=${kind}`),

  // Flat list of ALL categories (across every super-category) in the saved
  // GLOBAL display order — exactly what the stock carousel renders. Each row
  // carries its super-category (kind) colour.
  categoryCarousel: () =>
    request<{ name: string; kind: string; color?: string | null; parentName?: string | null }[]>(
      '/api/v1/recipes/categories/carousel',
    ),

  // Persist a GLOBAL display order across ALL categories: index in `items` =
  // display order everywhere (carousel, filters). Returns the updated carousel.
  reorderAllCategories: (items: { name: string; kind: string }[]) =>
    request<{ name: string; kind: string; color?: string | null; parentName?: string | null }[]>(
      '/api/v1/recipes/categories/reorder-global',
      {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      },
    ),

  // Super-categories (the kind-level groups), returned in their admin order.
  superCategories: () =>
    request<{ kind: string; name: string; color?: string | null; isSystem: boolean }[]>(
      '/api/v1/recipes/super-categories',
    ),

  // Persist a new category display order for a kind. Body { kind, names }; the
  // server sets sortOrder to match and returns the reordered names.
  reorderCategories: (kind: import('./types').CategoryKind, names: string[]) =>
    request<string[]>('/api/v1/recipes/categories/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ kind, names }),
    }),

  // Persist the super-category (kind) order.
  reorderSuperCategories: (kinds: string[]) =>
    request<{ kind: string; name: string; color?: string | null; isSystem: boolean }[]>(
      '/api/v1/recipes/super-categories/reorder',
      {
        method: 'PATCH',
        body: JSON.stringify({ kinds }),
      },
    ),

  addCategory: (name: string, kind: import('./types').CategoryKind = 'MATERIE_PRIMA') =>
    request<string[]>(
      '/api/v1/recipes/categories',
      {
        method: 'POST',
        body: JSON.stringify({ name, kind }),
      },
      201,
    ),

  renameCategory: (
    name: string,
    newName: string,
    kind: import('./types').CategoryKind = 'MATERIE_PRIMA',
  ) =>
    request<string[]>(`/api/v1/recipes/categories/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName, kind }),
    }),

  removeCategory: (name: string, kind: import('./types').CategoryKind = 'MATERIE_PRIMA') =>
    request<string[]>(`/api/v1/recipes/categories/${encodeURIComponent(name)}?kind=${kind}`, {
      method: 'DELETE',
    }),
};

// ========== Orders ==========
export const orders = {
  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/orders/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/orders/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/orders/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  list: (query: import('./types').OrderQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').Order>>(
      `/api/v1/orders${buildQuery(query)}`,
    ),

  get: (id: string) => request<import('./types').Order>(`/api/v1/orders/${id}`),

  /** Archive / unarchive an order (only LIVRATA/ANULATA can be archived). */
  setArchived: (id: string, archived: boolean) =>
    request<import('./types').Order>(`/api/v1/orders/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    }),

  /** Bulk-archive every delivered/cancelled order. Returns the count. */
  archiveCompleted: () =>
    request<{ archived: number }>('/api/v1/orders/archive-completed', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  create: (data: import('./types').CreateOrderRequest) =>
    request<import('./types').Order>(
      '/api/v1/orders',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  update: (
    id: string,
    data: Partial<import('./types').CreateOrderRequest> & {
      status?: import('./types').OrderStatus;
    },
  ) =>
    request<import('./types').Order>(`/api/v1/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Backend addItem/updateItem/removeItem all return the full updated Order.
  addItem: (
    orderId: string,
    item: {
      recipeId: string;
      quantity: number;
      unit: import('@horae/shared-types').UnitType;
      notes?: string;
    },
  ) =>
    request<import('./types').Order>(
      `/api/v1/orders/${orderId}/items`,
      {
        method: 'POST',
        body: JSON.stringify(item),
      },
      201,
    ),

  updateItem: (orderId: string, itemId: string, data: Partial<import('./types').OrderItem>) =>
    request<import('./types').Order>(`/api/v1/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteItem: (orderId: string, itemId: string) =>
    request<import('./types').Order>(`/api/v1/orders/${orderId}/items/${itemId}`, {
      method: 'DELETE',
    }),

  // POST /orders/:id/delivery-note takes no body and returns the full Order.
  createDeliveryNote: (orderId: string) =>
    request<import('./types').Order>(
      `/api/v1/orders/${orderId}/delivery-note`,
      { method: 'POST' },
      201,
    ),

  // PATCH /orders/:id/delivery-note/sign — multipart: signature (PNG blob) + signedByName + notes?.
  signDeliveryNote: async (
    orderId: string,
    data: { signature: Blob; signedByName: string; notes?: string },
  ): Promise<import('./types').Order> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('signature', data.signature, 'signature.png');
    formData.append('signedByName', data.signedByName);
    if (data.notes) formData.append('notes', data.notes);
    const res = await fetch(`${API_BASE}/api/v1/orders/${orderId}/delivery-note/sign`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.json();
  },

  getDeliveryNote: (orderId: string) =>
    request<import('./types').DeliveryNote>(`/api/v1/orders/${orderId}/delivery-note`),

  stats: () => request<import('./types').OrderStats>('/api/v1/orders/stats'),

  /** Shop delivery methods on orders + admin short names, most used first. */
  deliveryMethods: () =>
    request<import('./types').DeliveryMethodSummary[]>('/api/v1/orders/delivery-methods'),

  /**
   * Set a method's short name and/or kind (admin); omitted fields stay unchanged,
   * `shortName` null/"" = default label, `kind` null = auto. Returns the full updated list.
   */
  setDeliveryMethodAlias: (
    name: string,
    patch: { shortName?: string | null; kind?: import('./types').DeliveryMethodKind | null },
  ) =>
    request<import('./types').DeliveryMethodSummary[]>('/api/v1/orders/delivery-methods/alias', {
      method: 'PUT',
      body: JSON.stringify({ name, ...patch }),
    }),

  calendar: (
    from?: string,
    to?: string,
    status?: string[],
    opts: {
      view?: import('./types').OrderView;
      deliveryMethod?: string;
      deliveryKind?: import('./types').DeliveryMethodKind;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status?.length) params.set('status', status.join(','));
    if (opts.view) params.set('view', opts.view);
    if (opts.deliveryMethod) params.set('deliveryMethod', opts.deliveryMethod);
    if (opts.deliveryKind) params.set('deliveryKind', opts.deliveryKind);
    return request<Record<string, import('./types').Order[]>>(
      `/api/v1/orders/calendar${params.toString() ? `?${params}` : ''}`,
    );
  },

  uploadInvoice: async (orderId: string, file: File): Promise<import('./types').Order> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/api/v1/orders/${orderId}/invoice`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.json();
  },

  downloadInvoice: (orderId: string) => `${API_BASE}/api/v1/orders/${orderId}/invoice`,

  deleteInvoice: (orderId: string) =>
    request<import('./types').Order>(`/api/v1/orders/${orderId}/invoice`, { method: 'DELETE' }),
};

// ========== Raw Materials ==========
export const rawMaterials = {
  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/raw-materials/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/raw-materials/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/raw-materials/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  list: (query: import('./types').RawMaterialQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').RawMaterial>>(
      `/api/v1/raw-materials${buildQuery(query)}`,
    ),

  get: (id: string) => request<import('./types').RawMaterial>(`/api/v1/raw-materials/${id}`),

  priceHistory: (id: string) =>
    request<import('./types').RawMaterialPriceHistory[]>(
      `/api/v1/raw-materials/${id}/price-history`,
    ),

  create: (data: import('./types').CreateRawMaterialRequest) =>
    request<import('./types').RawMaterial>(
      '/api/v1/raw-materials',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  update: (
    id: string,
    data: Partial<import('./types').CreateRawMaterialRequest> & {
      nutrition?: import('./types').NutritionValues | null;
    },
  ) =>
    request<import('./types').RawMaterial>(`/api/v1/raw-materials/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request(`/api/v1/raw-materials/${id}`, { method: 'DELETE' }),

  // Info gating the permanent delete: current stock + whether a hard delete is
  // allowed (stock must be 0) + whether the material was ever used (recipes/production).
  deleteInfo: (id: string) =>
    request<import('./types').RawMaterialDeleteInfo>(`/api/v1/raw-materials/${id}/delete-info`),

  // Permanent delete (DELETE ?hard=true) — 200 with a JSON body, NOT 204.
  hardDelete: (id: string) =>
    request<{ deleted: boolean }>(
      `/api/v1/raw-materials/${id}?hard=true`,
      { method: 'DELETE' },
      200,
    ),
};

// ========== Consumables ==========
export const consumables = {
  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/consumables/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/consumables/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/consumables/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  list: (query: import('./types').PaginationQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').Consumable>>(
      `/api/v1/consumables${buildQuery(query)}`,
    ),

  get: (id: string) => request<import('./types').Consumable>(`/api/v1/consumables/${id}`),

  create: (data: import('./types').CreateConsumableRequest) =>
    request<import('./types').Consumable>(
      '/api/v1/consumables',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  update: (id: string, data: Partial<import('./types').CreateConsumableRequest>) =>
    request<import('./types').Consumable>(`/api/v1/consumables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request(`/api/v1/consumables/${id}`, { method: 'DELETE' }),
};

// ========== Suppliers ==========
export const suppliers = {
  list: () => request<import('./types').Supplier[]>('/api/v1/suppliers'),

  get: (id: string) => request<import('./types').Supplier>(`/api/v1/suppliers/${id}`),

  create: (data: import('./types').CreateSupplierRequest) =>
    request<import('./types').Supplier>(
      '/api/v1/suppliers',
      { method: 'POST', body: JSON.stringify(data) },
      201,
    ),

  update: (id: string, data: Partial<import('./types').CreateSupplierRequest>) =>
    request<import('./types').Supplier>(`/api/v1/suppliers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (id: string) => request(`/api/v1/suppliers/${id}`, { method: 'DELETE' }, 204),
};

// ========== Stock ==========
export const stock = {
  movements: (query: import('./types').StockMovementQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').StockMovement>>(
      `/api/v1/stock/movements${buildQuery(query)}`,
    ),

  getMovement: (id: string) =>
    request<import('./types').StockMovement>(`/api/v1/stock/movements/${id}`),

  createMovement: (data: import('./types').CreateStockMovementRequest) =>
    request<import('./types').StockMovement>(
      '/api/v1/stock/movements',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  // Manual movement for produced-product stock (semipreparat / produs finit).
  createRecipeMovement: (data: import('./types').CreateRecipeMovementRequest) =>
    request<import('./types').StockMovement>(
      '/api/v1/stock/recipe-movements',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  // Multi-line goods receipt (Recepție marfă) — POST /stock/movements/batch → StockMovement[].
  batchReceive: (data: import('./types').BatchReceiveRequest) =>
    request<import('./types').StockMovement[]>(
      '/api/v1/stock/movements/batch',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  recipeStock: async (query: import('./types').PaginationQuery = {}) => {
    // Backend returns { id, name, ... }; the web shape uses recipeId/recipeName.
    const res = await request<
      import('./types').PaginatedResponse<
        { id: string; name: string } & Omit<
          import('./types').RecipeStock,
          'recipeId' | 'recipeName'
        >
      >
    >(`/api/v1/stock/recipes${buildQuery(query)}`);
    return {
      ...res,
      data: res.data.map(({ id, name, ...rest }) => ({
        recipeId: id,
        recipeName: name,
        ...rest,
      })),
    } satisfies import('./types').PaginatedResponse<import('./types').RecipeStock>;
  },

  lots: (params: { rawMaterialId?: string; consumableId?: string }) =>
    request<import('./types').StockLot[]>(`/api/v1/stock/lots${buildQuery(params)}`),

  // Hold/release a lot for FIFO — held lots are consumed last by production.
  setLotHold: (id: string, onHold: boolean) =>
    request<import('./types').StockLot>(`/api/v1/stock/lots/${id}/hold`, {
      method: 'PATCH',
      body: JSON.stringify({ onHold }),
    }),

  // Per-item stock breakdown (locations, task reservations, pending transfers).
  // Exactly one of rawMaterialId / consumableId / recipeId must be set.
  itemAvailability: (params: {
    rawMaterialId?: string;
    consumableId?: string;
    recipeId?: string;
  }) =>
    request<import('./types').StockItemAvailability>(
      `/api/v1/stock/item-availability${buildQuery(params)}`,
    ),

  // Every task that used (or produced) one item; from/to = ISO instants.
  traceability: (params: {
    rawMaterialId?: string;
    consumableId?: string;
    recipeId?: string;
    from?: string;
    to?: string;
  }) =>
    request<import('./types').StockTraceability>(`/api/v1/stock/traceability${buildQuery(params)}`),

  lowStock: () => request<import('./types').LowStockItem[]>('/api/v1/stock/low-stock'),

  expiring: (days = 30) =>
    request<import('./types').ExpiringItem[]>(`/api/v1/stock/expiring?days=${days}`),

  requirementsPlan: (items: import('./types').RequirementsPlanItem[]) =>
    request<import('./types').RequirementsPlanResult>('/api/v1/stock/requirements-plan', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  requirementsPlanExport: async (items: import('./types').RequirementsPlanItem[]) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/v1/stock/requirements-plan/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },
};

// ========== Locations ==========
export const locations = {
  list: () => request<import('./types').Location[]>('/api/v1/locations'),

  myLocations: () => request<import('./types').Location[]>('/api/v1/locations/my-locations'),

  get: (id: string) => request<import('./types').Location>(`/api/v1/locations/${id}`),

  create: (data: import('./types').CreateLocationRequest) =>
    request<import('./types').Location>(
      '/api/v1/locations',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  update: (id: string, data: Partial<import('./types').CreateLocationRequest>) =>
    request<import('./types').Location>(`/api/v1/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/api/v1/locations/${id}`, { method: 'DELETE' }, 204),

  stock: (id: string) =>
    request<import('./types').LocationStock[]>(`/api/v1/locations/${id}/stock`),

  dashboard: (id: string) =>
    request<import('./types').LocationDashboard>(`/api/v1/locations/${id}/dashboard`),

  users: (id: string) => request<import('./types').LocationUser[]>(`/api/v1/locations/${id}/users`),

  assignUser: (locationId: string, userId: string) =>
    request<void>(
      `/api/v1/locations/${locationId}/users`,
      {
        method: 'POST',
        body: JSON.stringify({ userId }),
      },
      201,
    ),

  removeUser: (locationId: string, userId: string) =>
    request<void>(`/api/v1/locations/${locationId}/users/${userId}`, {
      method: 'DELETE',
    }),
};

// ========== Transfers ==========
// The API returns a NESTED DTO (fromLocation/toLocation objects, createdBy, items
// with recipeId). The web works with a FLAT `Transfer` — flatten here so pages get
// stable `fromLocationName` / `toLocationName` etc. (see lib/types.ts).
function mapTransfer(t: import('./types').TransferApiResponse): import('./types').Transfer {
  return {
    id: t.id,
    fromLocationId: t.fromLocation.id,
    fromLocationName: t.fromLocation.name,
    fromLocationAddress: t.fromLocation.address,
    toLocationId: t.toLocation.id,
    toLocationName: t.toLocation.name,
    toLocationAddress: t.toLocation.address,
    adhocDestination: t.adhocDestination ?? false,
    destinationContact: t.destinationContact ?? null,
    status: t.status,
    notes: t.notes,
    items: t.items.map((it) => ({
      id: it.id,
      rawMaterialId: it.rawMaterialId,
      recipeId: it.recipeId,
      rawMaterialTitle: it.rawMaterialTitle,
      quantity: it.quantity,
      unit: it.unit,
    })),
    createdById: t.createdBy.id,
    createdByName: `${t.createdBy.firstName} ${t.createdBy.lastName}`,
    createdBy: t.createdBy,
    assignedTo: t.assignedTo,
    delegateIdCard: t.delegateIdCard ?? null,
    transportMeans: t.transportMeans ?? null,
    dispatchedAt: t.dispatchedAt ?? null,
    receiverName: t.receiverName ?? null,
    receivedAt: t.receivedAt ?? null,
    hasReceiverSignature: t.hasReceiverSignature ?? false,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export const transfers = {
  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/stock/transfers/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/stock/transfers/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/stock/transfers/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  list: async (query: import('./types').TransferQuery = {}) => {
    const res = await request<
      import('./types').PaginatedResponse<import('./types').TransferApiResponse>
    >(`/api/v1/stock/transfers${buildQuery(query)}`);
    return { ...res, data: res.data.map(mapTransfer) };
  },

  get: async (id: string) =>
    mapTransfer(
      await request<import('./types').TransferApiResponse>(`/api/v1/stock/transfers/${id}`),
    ),

  create: async (data: import('./types').CreateTransferRequest) =>
    mapTransfer(
      await request<import('./types').TransferApiResponse>(
        '/api/v1/stock/transfers',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        201,
      ),
    ),

  // PATCH /stock/transfers/:id — status machine (IN_ASTEPTARE→IN_TRANZIT→FINALIZAT,
  // or ANULAT). Moving into IN_TRANZIT requires a transporter (assignedToId set here
  // or already on the transfer).
  updateStatus: async (
    id: string,
    data: { status: import('./types').TransferStatus; assignedToId?: string },
  ) =>
    mapTransfer(
      await request<import('./types').TransferApiResponse>(`/api/v1/stock/transfers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ),

  // PATCH /stock/transfers/:id/approval — sets the approval record (does NOT change
  // the transfer status). status ∈ APPROVED | REJECTED.
  setApproval: async (
    id: string,
    status: import('./types').TransferApprovalStatus,
    reason?: string,
  ) =>
    mapTransfer(
      await request<import('./types').TransferApiResponse>(
        `/api/v1/stock/transfers/${id}/approval`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, reason }),
        },
      ),
    ),

  approve: (id: string) => transfers.setApproval(id, 'APPROVED'),

  reject: (id: string) => transfers.setApproval(id, 'REJECTED'),

  // Produced-recipe stock at a location (GET /locations/:id/recipe-stock) — used by
  // the create-transfer picker alongside locations.stock (raw materials).
  recipeStock: (locationId: string) =>
    request<import('./types').LocationRecipeStock[]>(
      `/api/v1/locations/${locationId}/recipe-stock`,
    ),

  // GET /stock/transfers/:id/aviz — legal "aviz de însoțire a mărfii" payload.
  // The serial is assigned + persisted server-side on the first call; reprints keep it.
  aviz: (id: string) =>
    request<import('./types').TransferAviz>(`/api/v1/stock/transfers/${id}/aviz`),

  // GET /stock/transfers/:id/conformity — declarație de conformitate payload.
  conformity: (id: string) =>
    request<import('./types').TransferConformity>(`/api/v1/stock/transfers/${id}/conformity`),

  // PATCH /stock/transfers/:id/aviz/sign — multipart: signature (PNG blob) + receiverName.
  signAviz: async (
    id: string,
    data: { signature: Blob; receiverName: string },
  ): Promise<import('./types').Transfer> => {
    const formData = new FormData();
    formData.append('signature', data.signature, 'signature.png');
    formData.append('receiverName', data.receiverName);
    // fetchWithRefresh so an expired access token rotates transparently (a
    // long-open transfer page would otherwise 401 on submit), matching signatureBlob.
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/stock/transfers/${id}/aviz/sign`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { method: 'PATCH', headers, body: formData };
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return mapTransfer(await res.json());
  },

  // GET /stock/transfers/:id/aviz/signature — the receipt signature as a PNG blob.
  signatureBlob: async (id: string): Promise<Blob> => {
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/stock/transfers/${id}/aviz/signature`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { headers };
      },
    );
    if (!res.ok) throw new ApiError(res.status, undefined, 'Signature not found');
    return res.blob();
  },
};

// ========== Roles ==========
export const roles = {
  list: () => request<import('./types').RoleInfo[]>('/api/v1/roles'),

  get: (id: string) => request<import('./types').RoleDetail>(`/api/v1/roles/${id}`),

  subjects: () => request<import('./types').RoleSubjectsMeta>('/api/v1/roles/subjects'),

  create: (data: import('./types').CreateRoleRequest) =>
    request<import('./types').RoleDetail>(
      '/api/v1/roles',
      { method: 'POST', body: JSON.stringify(data) },
      201,
    ),

  update: (id: string, data: import('./types').CreateRoleRequest) =>
    request<import('./types').RoleDetail>(`/api/v1/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (id: string) => request(`/api/v1/roles/${id}`, { method: 'DELETE' }, 204),

  setPermissions: (id: string, permissions: import('./types').PermissionRule[]) =>
    request<import('./types').RoleDetail>(`/api/v1/roles/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
};

// ========== Users ==========
export const users = {
  uploadMyAvatar: (file: File) =>
    uploadImage<import('./types').User>('/api/v1/users/me/avatar', 'avatar', file),

  deleteMyAvatar: () =>
    request<import('./types').User>('/api/v1/users/me/avatar', { method: 'DELETE' }),

  uploadAvatar: (id: string, file: File) =>
    uploadImage<import('./types').User>(`/api/v1/users/${id}/avatar`, 'avatar', file),

  deleteAvatar: (id: string) =>
    request<import('./types').User>(`/api/v1/users/${id}/avatar`, { method: 'DELETE' }),

  list: (query: import('./types').PaginationQuery & { isActive?: boolean; role?: string } = {}) =>
    request<import('./types').PaginatedResponse<import('./types').User>>(
      `/api/v1/users${buildQuery(query)}`,
    ),

  get: (id: string) => request<import('./types').User>(`/api/v1/users/${id}`),

  // PATCH /users/:id needs `update User` (admin). There is no "update me"
  // endpoint — a non-admin's name is changed by an admin from Echipă & roluri.
  update: (id: string, data: { firstName?: string; lastName?: string }) =>
    request<import('./types').User>(`/api/v1/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  invite: (data: import('./types').InviteUserRequest) =>
    request(
      '/api/v1/users/invite',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  invitations: () => request<import('./types').UserInvitation[]>('/api/v1/users/invitations'),

  changeRole: (id: string, roleId: string) =>
    request(`/api/v1/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ roleId }),
    }),

  deactivate: (id: string) => request(`/api/v1/users/${id}`, { method: 'DELETE' }),

  reactivate: (id: string) => request(`/api/v1/users/${id}/reactivate`, { method: 'PATCH' }),
};

// ========== Activity ==========
export const activity = {
  list: (query: import('./types').ActivityQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').Activity>>(
      `/api/v1/activity${buildQuery(query)}`,
    ),
};

// ========== Organization ==========
export const organization = {
  get: async () =>
    absolutizeLogos(await request<import('./types').Organization>('/api/v1/organization')),

  // Public branding lookup by subdomain slug — no auth (login/landing theming).
  getBySlug: async (slug: string): Promise<import('./types').OrgBranding> => {
    const res = await fetch(`${API_BASE}/api/v1/organization/by-slug/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new ApiError(res.status, undefined, 'Organization not found');
    return absolutizeLogos(await res.json());
  },

  update: async (data: Partial<import('./types').Organization>) =>
    absolutizeLogos(
      await request<import('./types').Organization>('/api/v1/organization', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ),

  uploadLogo: async (file: File, variant = 'default') => {
    const token = getToken();
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('variant', variant);
    const res = await fetch(`${API_BASE}/api/v1/organization/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new ApiError(res.status, undefined, 'Logo upload failed');
    return absolutizeLogos((await res.json()) as import('./types').Organization);
  },

  resetLogo: async (variant = 'default') =>
    absolutizeLogos(
      await request<import('./types').Organization>(
        `/api/v1/organization/logo?variant=${variant}`,
        {
          method: 'DELETE',
        },
      ),
    ),
};

// ========== Tutorial ==========
export const tutorial = {
  content: async () =>
    await request<{ flows: import('./types').TutorialFlow[] }>('/api/v1/tutorial/content'),
};

// ========== Dashboard ==========
export const dashboard = {
  stats: () => request<import('./types').DashboardStats>('/api/v1/dashboard/stats'),
};

// ========== Analytics ==========
export const analytics = {
  summary: () => request<import('./types').AnalyticsSummary>('/api/v1/analytics/summary'),

  production: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<import('./types').ProductionAnalytics>(`/api/v1/analytics/production?${params}`);
  },

  orders: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<import('./types').OrderAnalytics>(`/api/v1/analytics/orders?${params}`);
  },

  users: () => request<import('./types').UserProductivity[]>('/api/v1/analytics/users'),
};

// ========== Pricing ==========
export const pricing = {
  recipeMargin: (recipeId: string) =>
    request<import('./types').RecipeMargin>(`/api/v1/recipes/${recipeId}/margin`),

  setManualCost: (recipeId: string, manualCost: number | null) =>
    request<import('./types').RecipeMargin>(`/api/v1/recipes/${recipeId}/manual-cost`, {
      method: 'PATCH',
      body: JSON.stringify({ manualCost }),
    }),

  setSellingPrice: (recipeId: string, price: number) =>
    request<void>(`/api/v1/recipes/${recipeId}/selling-price`, {
      method: 'PATCH',
      body: JSON.stringify({ sellingPrice: price }),
    }),

  history: () => request<import('./types').PriceHistoryEntry[]>('/api/v1/pricing/history'),
};

// ========== Integrations ==========
export const integrations = {
  list: () => request<import('./types').Integration[]>('/api/v1/integrations'),

  get: (id: string) => request<import('./types').Integration>(`/api/v1/integrations/${id}`),

  create: (data: { provider: string }) =>
    request<import('./types').Integration>(
      '/api/v1/integrations',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  delete: (id: string) => request<void>(`/api/v1/integrations/${id}`, { method: 'DELETE' }),

  mappings: (id: string) =>
    request<import('./types').ProductMapping[]>(`/api/v1/integrations/${id}/mappings`),

  createMapping: (id: string, data: import('./types').CreateProductMappingRequest) =>
    request<import('./types').ProductMapping>(
      `/api/v1/integrations/${id}/mappings`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      201,
    ),

  removeMapping: (id: string, mappingId: string) =>
    request<void>(`/api/v1/integrations/${id}/mappings/${mappingId}`, { method: 'DELETE' }, 204),

  sync: (id: string) =>
    request<{ synced: number; failed: number }>(`/api/v1/integrations/${id}/sync`, {
      method: 'POST',
    }),

  externalOrders: (id: string) =>
    request<import('./types').ExternalOrder[]>(`/api/v1/integrations/${id}/orders`),
};

// ========== Backups (admin-only) ==========
export const stockExtra = {
  /** Consum de materii prime pentru teste (IESIRE_TESTE). */
  testConsumption: (data: import('./types').TestConsumptionRequest) =>
    request<unknown[]>('/api/v1/stock/test-consumption', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Loturile (șarjele) unui produs finit, doar cele cu stoc rămas. */
  recipeLots: (recipeId: string, locationId?: string) =>
    request<import('./types').RecipeLot[]>(
      `/api/v1/stock/recipes/${recipeId}/lots${locationId ? `?locationId=${locationId}` : ''}`,
    ),

  /** Tot stocul ca fișier Excel (Blob descărcabil). */
  exportExcel: async () => {
    const res = await fetchWithRefresh(`${API_BASE}/api/v1/stock/export`, (token) => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return { headers };
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },

  /** Import Excel: dryRun=true doar calculează diff-ul, false aplică. */
  importExcel: async (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/stock/import?dryRun=${dryRun}`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { method: 'POST', headers, body: form };
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.json() as Promise<import('./types').StockImportResult>;
  },

  /** Revizie stocuri: tot stocul, un rând per lot, pe 4 foi (Blob .xlsx). */
  reviewExport: async () => {
    const res = await fetchWithRefresh(`${API_BASE}/api/v1/stock/review/export`, (token) => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return { headers };
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },

  /** Revizie stocuri: dryRun=true doar raportul, false aplică (doar rândurile din fișier). */
  reviewImport: async (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/stock/review/import?dryRun=${dryRun}`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { method: 'POST', headers, body: form };
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.json() as Promise<import('./types').StockReviewResult>;
  },

  /** Jurnalul de mișcări ca .xlsx, cu aceleași filtre ca lista (implicit ultimele 30 de zile). */
  movementsExport: async (query: import('./types').StockMovementQuery = {}) => {
    const { page: _p, limit: _l, ...rest } = query;
    void _p;
    void _l;
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/stock/movements/export${buildQuery(rest)}`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { headers };
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },
};

/** Scădere stoc din vânzări (eBriza Excel / manual / WooCommerce) — doar pe Test. */
export const salesDeductions = {
  bulkDeletePreview: (ids: string[]) =>
    request<import('./types').BulkDeletePreview>('/api/v1/sales-deductions/bulk-delete/preview', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<import('./types').BulkDeleteResult>('/api/v1/sales-deductions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, cascade: true }),
    }),

  bulkAction: (ids: string[], action: string, params: Record<string, unknown> = {}) =>
    request<import('./types').BulkActionResult>('/api/v1/sales-deductions/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ ids, action, params }),
    }),

  feature: () => request<{ enabled: boolean }>('/api/v1/sales-deductions/feature'),

  list: (page = 1, limit = 20) =>
    request<import('./types').PaginatedResponse<import('./types').SalesDeduction>>(
      `/api/v1/sales-deductions?page=${page}&limit=${limit}`,
    ),

  get: (id: string) => request<import('./types').SalesDeduction>(`/api/v1/sales-deductions/${id}`),

  products: (locationId: string) =>
    request<import('./types').SalesProductOption[]>(
      `/api/v1/sales-deductions/products?locationId=${locationId}`,
    ),

  /** CSV template (every sellable product, quantity blank) for a manual deduction. */
  template: async (locationId: string) => {
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/sales-deductions/template?locationId=${encodeURIComponent(locationId)}`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { headers };
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },

  fromExcel: async (file: File, locationId: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('locationId', locationId);
    const res = await fetchWithRefresh(`${API_BASE}/api/v1/sales-deductions/excel`, (token) => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return { method: 'POST', headers, body: form };
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code ?? err.errorCode, err.message);
    }
    return res.json() as Promise<import('./types').SalesDeduction>;
  },

  manual: (locationId: string) =>
    request<import('./types').SalesDeduction>(
      '/api/v1/sales-deductions/manual',
      { method: 'POST', body: JSON.stringify({ locationId }) },
      201,
    ),

  fromWoo: (locationId: string, from: string, to: string) =>
    request<import('./types').SalesDeduction>(
      '/api/v1/sales-deductions/woocommerce',
      { method: 'POST', body: JSON.stringify({ locationId, from, to }) },
      201,
    ),

  confirm: (id: string, lines: import('./types').ConfirmSalesDeductionLine[], note?: string) =>
    request<import('./types').SalesDeduction>(`/api/v1/sales-deductions/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ lines, note }),
    }),

  discard: (id: string) =>
    request<void>(`/api/v1/sales-deductions/${id}/discard`, { method: 'POST' }, 204),

  revert: (id: string) =>
    request<import('./types').SalesDeduction>(`/api/v1/sales-deductions/${id}/revert`, {
      method: 'POST',
    }),
};

/** Jurnal sistem — acțiuni, erori, emailuri, joburi (admin). */
export const systemLogs = {
  access: () => request<{ platformAdmin: boolean }>('/api/v1/system-logs/access'),
  list: (q: import('./types').SystemLogQuery) =>
    request<import('./types').PaginatedResponse<import('./types').SystemLog>>(
      `/api/v1/system-logs${buildQuery(q)}`,
    ),
};

export const dataReset = {
  preview: () =>
    request<{ categories: import('./types').ResetCategoryPreview[] }>('/api/v1/data-reset/preview'),

  run: (categories: import('./types').ResetCategoryKey[]) =>
    request<import('./types').DataResetResult>('/api/v1/data-reset', {
      method: 'POST',
      body: JSON.stringify({ categories, confirm: 'RESETEAZA' }),
    }),
};

export const orgSnapshots = {
  list: () => request<import('./types').OrgSnapshot[]>('/api/v1/backups/snapshots'),

  create: (label?: string) =>
    request<import('./types').OrgSnapshot>(
      '/api/v1/backups/snapshots',
      { method: 'POST', body: JSON.stringify({ label }) },
      201,
    ),

  restore: (id: string) =>
    request<{ restored: Record<string, number> }>(`/api/v1/backups/snapshots/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'RESTAUREAZA' }),
    }),

  remove: (id: string) =>
    request<void>(`/api/v1/backups/snapshots/${id}`, { method: 'DELETE' }, 204),

  /** Snapshot .json.gz ca Blob — doar pentru emailurile din BACKUP_ADMIN_EMAILS. */
  download: async (id: string) => {
    const res = await fetchWithRefresh(
      `${API_BASE}/api/v1/backups/snapshots/${id}/download`,
      (token) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        return { headers };
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },
};

export const backups = {
  list: () => request<import('./types').BackupInfo[]>('/api/v1/backups'),

  runNow: () => request<import('./types').BackupInfo>('/api/v1/backups/run', { method: 'POST' }),

  restore: (name: string) =>
    request<{ restored: string }>(`/api/v1/backups/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
    }),

  /** Fresh dump as a Blob for download. */
  export: async () => {
    const res = await fetchWithRefresh(`${API_BASE}/api/v1/backups/export`, (token) => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return { headers };
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.blob();
  },

  /** Upload a .dump file and restore the database from it. */
  import: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetchWithRefresh(`${API_BASE}/api/v1/backups/import`, (token) => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return { method: 'POST', headers, body: form };
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.code, err.message);
    }
    return res.json() as Promise<{ restored: string }>;
  },
};

// ========== Notifications ==========
export const notifications = {
  // Paginated, newest first, scoped to the current user.
  list: (query: import('./types').PaginationQuery = {}) =>
    request<import('./types').PaginatedResponse<import('./types').Notification>>(
      `/api/v1/notifications${buildQuery(query)}`,
    ),

  unreadCount: () =>
    request<{ count: number }>('/api/v1/notifications/unread-count').then((r) => r.count),

  markRead: (id: string) =>
    request<import('./types').Notification>(`/api/v1/notifications/${id}/read`, {
      method: 'PATCH',
    }),

  markAllRead: () => request<void>('/api/v1/notifications/read-all', { method: 'PATCH' }),
};

export { ApiError };
