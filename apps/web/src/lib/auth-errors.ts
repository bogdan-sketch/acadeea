// Romanian, user-facing messages for the provider (Apple/Google) sign-in flow.
// Shared by the login and accept-invite pages so both branch on the same codes.

interface ApiErrorLike {
  code?: string;
  message?: string;
}

function codeOf(err: unknown): string {
  const e = (err ?? {}) as ApiErrorLike;
  return e.code || e.message || '';
}

/**
 * Message for a FAILED provider LOGIN (login page + accept-invite fallback).
 * `PROVIDER_NO_ACCOUNT` (401) is the "no account for this identity" case —
 * the user needs an invitation to sign up.
 */
export function providerAuthErrorMessage(err: unknown): string {
  const code = codeOf(err);
  if (code.includes('PROVIDER_NO_ACCOUNT')) {
    return 'Nu există cont pentru acest Apple/Google. Ai nevoie de o invitație.';
  }
  return 'Autentificarea a eșuat. Încearcă din nou.';
}

/** Message for a FAILED provider LINK in settings (Conturi conectate). */
export function providerLinkErrorMessage(err: unknown): string {
  const code = codeOf(err);
  if (code.includes('PROVIDER_ALREADY_LINKED')) {
    return 'Acest cont este deja conectat la un alt utilizator.';
  }
  return 'Nu am putut conecta contul. Încearcă din nou.';
}

/** Message for a FAILED provider UNLINK in settings. */
export function providerUnlinkErrorMessage(err: unknown): string {
  const code = codeOf(err);
  if (code.includes('LAST_LOGIN_METHOD')) {
    return 'Nu poți deconecta ultima metodă de autentificare.';
  }
  return 'Nu am putut deconecta contul. Încearcă din nou.';
}
