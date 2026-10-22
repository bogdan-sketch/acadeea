'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { users as usersApi, roles as rolesApi } from '@/lib/api';
import type { User, RoleInfo } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { UserCheck, UserX, Users } from 'lucide-react';
import { Pill } from '../../stock/_ui/parts';
import { usePermissions, useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const { user: me } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [availableRoles, setAvailableRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    usersApi
      .get(id)
      .then(setUser)
      .catch(() => toast.error('Eroare'))
      .finally(() => setLoading(false));
    rolesApi
      .list()
      .then(setAvailableRoles)
      .catch(() => {});
  }, [id]);

  const changeRole = async (roleId: string) => {
    setUpdating(true);
    try {
      await usersApi.changeRole(id, roleId);
      const newRole = availableRoles.find((r) => r.id === roleId);
      setUser((u) =>
        u
          ? {
              ...u,
              role: newRole ? { id: newRole.id, slug: newRole.slug, name: newRole.name } : u.role,
            }
          : null,
      );
      toast.success('Rol actualizat');
    } catch {
      toast.error('Eroare');
    } finally {
      setUpdating(false);
    }
  };

  const toggleActive = async () => {
    setUpdating(true);
    try {
      if (user?.isActive) {
        await usersApi.deactivate(id);
        setUser((u) => (u ? { ...u, isActive: false } : null));
        toast.success('Utilizator dezactivat');
      } else {
        await usersApi.reactivate(id);
        setUser((u) => (u ? { ...u, isActive: true } : null));
        toast.success('Utilizator reactivat — i-am trimis un email pentru a-și seta o parolă nouă');
      }
    } catch {
      toast.error('Eroare');
    } finally {
      setUpdating(false);
    }
  };

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (!user)
    return (
      <div className="flex flex-col gap-5">
        <BackLink href="/users" label="Utilizatori" />
        <EmptyState
          icon={Users}
          title="Utilizatorul nu a fost găsit"
          description="A fost șters sau nu mai ai acces la el."
          actionLabel="Înapoi la echipă"
          actionHref="/users"
        />
      </div>
    );

  const isMe = me?.id === user.id;

  // Design-system krow: key-value rows with hairline dividers.
  const krow = 'flex items-center justify-between gap-3 border-t border-border px-6 py-[11px]';

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <BackLink href="/users" label="Utilizatori" />
        {/* Same head ramp as PageHead: 60px avatar + serif 28/34 name + email + status badge. */}
        <div className="mt-2 flex items-center gap-[15px]">
          <span className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full bg-accent text-xl font-bold text-primary">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.4px] sm:text-[34px]">
              {user.firstName} {user.lastName}
            </h1>
            <Truncate text={user.email} className="mt-1 text-[14.5px] text-muted-foreground" />
          </div>
          <StatusBadge
            label={user.isActive ? 'Activ' : 'Inactiv'}
            colorClass={user.isActive ? 'st-green' : 'st-red'}
          />
        </div>
      </div>

      {/* Design grid-2: Detalii (krow) + Acțiuni. */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="gap-0 py-0">
          <div className="px-6 pb-4 pt-5 text-[15px] font-bold">Detalii</div>
          <div className={`${krow} items-start`}>
            <span className="pt-2 text-sm text-muted-foreground">Rol</span>
            {can('update', 'User') && !isMe ? (
              <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="Rol">
                {availableRoles.map((r) => (
                  <Pill
                    key={r.id}
                    on={user.role?.id === r.id}
                    className={updating ? 'pointer-events-none opacity-60' : ''}
                    onClick={() => user.role?.id !== r.id && changeRole(r.id)}
                  >
                    {r.name}
                  </Pill>
                ))}
              </div>
            ) : (
              <StatusBadge label={user.role?.name ?? '—'} colorClass="st-gray" />
            )}
          </div>
          <div className={krow}>
            <span className="text-sm text-muted-foreground">Email</span>
            <Truncate text={user.email} className="text-sm" />
          </div>
          <div className={krow}>
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusBadge
              label={user.isActive ? 'Activ' : 'Inactiv'}
              colorClass={user.isActive ? 'st-green' : 'st-red'}
            />
          </div>
          <div className={krow}>
            <span className="text-sm text-muted-foreground">Creat</span>
            <span className="text-sm">
              {format(new Date(user.createdAt), 'd MMM yyyy', { locale: ro })}
            </span>
          </div>
        </Card>

        {can('delete', 'User') && !isMe && (
          <TutorialAnchor id="users.roles.deactivate">
            <Card className="p-6">
              <div className="mb-4 text-[15px] font-bold tracking-[-.1px]">Acțiuni</div>
              <Button
                variant="outline"
                className="w-full justify-center text-destructive hover:text-destructive"
                onClick={toggleActive}
                disabled={updating}
              >
                {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                {user.isActive ? 'Dezactivează utilizatorul' : 'Reactivează utilizatorul'}
              </Button>
            </Card>
          </TutorialAnchor>
        )}
      </div>
    </div>
  );
}
