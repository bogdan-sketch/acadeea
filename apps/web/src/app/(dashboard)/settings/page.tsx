import { redirect } from 'next/navigation';

/** The Setări hub became the Setări tab of Profil (17.10.2026). */
export default function SettingsRedirect() {
  redirect('/profil?tab=setari');
}
