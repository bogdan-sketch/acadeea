import { redirect } from 'next/navigation';

// Roles now live inside "Echipă & roluri" (users page, tab "Roluri & drepturi").
export default function RolesPage() {
  redirect('/users?tab=roles');
}
