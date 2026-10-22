import { redirect } from 'next/navigation';

/**
 * Branding & temă is gone: the colour scheme is a personal preference
 * (Profil › Date › Preferințe) and the logo lives in Setări › Identitate.
 */
export default function BrandingRedirect() {
  redirect('/profil?tab=setari#identitate');
}
