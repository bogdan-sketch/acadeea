/**
 * Ambient types for the third-party sign-in SDKs loaded at runtime via
 * `next/script` (Google Identity Services + AppleID JS). Neither ships its own
 * types and we don't want the `@types/*` packages, so we declare the small,
 * stable slice we use on `window`. Keep in sync with `components/auth/social-auth-buttons.tsx`.
 */

// ---------- Google Identity Services (accounts.google.com/gsi/client) ----------
interface GoogleCredentialResponse {
  /** The signed JWT id_token — this is what we POST to /auth/google. */
  credential: string;
  select_by?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
  context?: 'signin' | 'signup' | 'use';
}

interface GooglePromptMoment {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  isDismissedMoment(): boolean;
  getNotDisplayedReason(): string;
  getSkippedReason(): string;
  getDismissedReason(): string;
}

interface GsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  prompt(momentListener?: (notification: GooglePromptMoment) => void): void;
  renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
  cancel(): void;
  disableAutoSelect(): void;
}

// ---------- AppleID JS (appleid.cdn-apple.com/appleauth/.../appleid.auth.js) ----------
interface AppleAuthConfig {
  clientId: string;
  scope?: string;
  redirectURI: string;
  state?: string;
  nonce?: string;
  usePopup?: boolean;
}

interface AppleSignInResponse {
  authorization: {
    code: string;
    /** The signed JWT id_token — this is what we POST to /auth/apple. */
    id_token: string;
    state?: string;
  };
  /** Apple returns the name ONLY on the first authorization. */
  user?: {
    name?: { firstName?: string; lastName?: string };
    email?: string;
  };
}

interface AppleAuth {
  init(config: AppleAuthConfig): void;
  signIn(config?: Partial<AppleAuthConfig>): Promise<AppleSignInResponse>;
}

interface Window {
  google?: { accounts: { id: GoogleAccountsId } };
  AppleID?: { auth: AppleAuth };
}
