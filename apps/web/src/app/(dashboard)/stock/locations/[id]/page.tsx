'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { locations as locApi, users as usersApi, transfers as transfersApi } from '@/lib/api';
import type { Location, LocationStock, LocationUser, Transfer, User } from '@/lib/types';
import { TransferStatus, LocationType } from '@/lib/types';
import { locationTypeLabels } from '@/lib/constants';
import { DataTable, type Column } from '@/components/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  MapPin,
  Package,
  Users as UsersIcon,
  ArrowLeftRight,
  Plus,
  Trash2,
  Pencil,
  Check,
  Save,
  X,
} from 'lucide-react';
import { usePermissions } from '@/contexts/auth-context';
import { useWooDeliveryEnabled } from '@/hooks/use-woo-delivery';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';
import { BackLink } from '@/components/back-link';
import { toast } from 'sonner';
import { formatUnitQty, unitQtySortKey } from '@/lib/utils';

const TYPE_OPTIONS = (Object.values(LocationType) as LocationType[]).map((t) => ({
  value: t,
  label: locationTypeLabels[t],
}));

// Design stat card: tinted 38px icon chip, 12.5px muted label, 30px/700 value.
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-(--shadow-card-sm)">
      <div className="mb-4 flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-accent text-primary">
        <Icon className="h-[19px] w-[19px]" />
      </div>
      <div className="text-[12.5px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-[30px] font-bold leading-none tracking-[-.5px]">{value}</div>
    </div>
  );
}

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const [location, setLocation] = useState<Location | null>(null);
  const [stock, setStock] = useState<LocationStock[]>([]);
  const [locationUsers, setLocationUsers] = useState<LocationUser[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignUserId, setAssignUserId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    type: '' as string,
    address: '',
    externalId: '',
    isMainUnit: false,
  });
  // Shop delivery (Pickupia): externalId + main units only with the org switch on.
  const wooEnabled = useWooDeliveryEnabled();
  const [baseline, setBaseline] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const closeEdit = useCallback(() => setShowEdit(false), []);
  const isDirty = JSON.stringify(editForm) !== baseline;
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({
    isDirty,
    onClose: closeEdit,
  });

  useEffect(() => {
    async function load() {
      try {
        const [loc, s, users, transfers] = await Promise.all([
          locApi.get(id),
          locApi.stock(id),
          locApi.users(id).catch(() => [] as LocationUser[]),
          transfersApi
            .list({ status: TransferStatus.IN_ASTEPTARE, limit: 50 })
            .catch(() => ({ data: [] as Transfer[] })),
        ]);
        setLocation(loc);
        setStock(s);
        setLocationUsers(users);
        setPendingTransfers(
          transfers.data.filter((t) => t.toLocationId === id || t.fromLocationId === id),
        );
        // Load all users for assign dropdown
        const allU = await usersApi.list({ limit: 100, isActive: true });
        setAllUsers(allU.data);
      } catch {
        toast.error('Eroare la încărcare');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleAssignUser = async () => {
    if (!assignUserId) return;
    setAssigning(true);
    try {
      await locApi.assignUser(id, assignUserId);
      toast.success('Utilizator asignat');
      setAssignUserId('');
      const users = await locApi.users(id).catch(() => []);
      setLocationUsers(users);
    } catch {
      toast.error('Eroare la asignare');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      await locApi.removeUser(id, userId);
      toast.success('Utilizator eliminat');
      setLocationUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch {
      toast.error('Eroare la eliminare');
    }
  };

  const handleApproveTransfer = async (transferId: string) => {
    try {
      await transfersApi.approve(transferId);
      toast.success('Transfer aprobat');
      setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
    } catch {
      toast.error('Eroare');
    }
  };

  const handleRejectTransfer = async (transferId: string) => {
    try {
      await transfersApi.reject(transferId);
      toast.success('Transfer respins');
      setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
    } catch {
      toast.error('Eroare');
    }
  };

  const openEdit = () => {
    if (!location) return;
    const values = {
      name: location.name,
      type: location.type as string,
      address: location.address || '',
      externalId: location.externalId || '',
      isMainUnit: !!location.isMainUnit,
    };
    setEditForm(values);
    setBaseline(JSON.stringify(values));
    setShowEdit(true);
  };

  const handleEdit = async () => {
    setEditSaving(true);
    try {
      const updated = await locApi.update(id, {
        name: editForm.name,
        type: editForm.type as LocationType,
        address: editForm.address || undefined,
        // null clears the Pickupia id on the API.
        externalId: editForm.externalId.trim() || null,
        ...(wooEnabled ? { isMainUnit: editForm.isMainUnit } : {}),
      });
      setLocation(updated);
      closeEdit();
      toast.success('Locație actualizată');
    } catch (err: unknown) {
      // Surfaces the API message, e.g. a duplicate external id (409).
      toast.error('Eroare la salvare', { description: (err as { message?: string }).message });
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!location)
    return (
      <div>
        <BackLink href="/stock/locations" label="Locații" />
        <p className="mt-4 text-sm text-muted-foreground">Locația nu a fost găsită.</p>
      </div>
    );

  const stockColumns: Column<LocationStock>[] = [
    {
      key: 'material',
      header: 'Material',
      sortValue: (s) => s.rawMaterialTitle,
      cell: (s) => <span className="font-medium">{s.rawMaterialTitle}</span>,
    },
    {
      key: 'quantity',
      header: 'Cantitate',
      sortValue: (s) => unitQtySortKey(s.quantity, s.unit),
      cell: (s) => formatUnitQty(s.quantity, s.unit),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/stock/locations" label="Locații" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-[26px] font-bold leading-[1.15] tracking-[-0.3px]">
              {location.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-muted px-[9px] py-[3px] text-[11px] font-semibold text-muted-foreground">
                {locationTypeLabels[location.type]}
              </span>
              {location.address && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {location.address}
                </span>
              )}
              {wooEnabled && location.isMainUnit && (
                <span
                  title="Unitate principală: vânzările de pe site se scad din stocul ei"
                  className="rounded-full bg-accent px-[9px] py-[3px] text-[11px] font-bold text-primary"
                >
                  Principală
                </span>
              )}
              {wooEnabled && location.externalId && (
                <span
                  className="text-xs text-muted-foreground"
                  title="ID extern (WooCommerce / Pickupia)"
                >
                  ID extern: {location.externalId}
                </span>
              )}
            </div>
          </div>
          {can('update', 'Location') && (
            <IconAction
              icon={Pencil}
              word="Editează"
              label="Editează locația"
              title="Schimbă numele, tipul sau adresa"
              onClick={openEdit}
            />
          )}
        </div>
      </div>

      {/* Stats — design stat cards: 38px tinted icon chip + 12.5px label + 30px/700 value */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={Package} label="Materiale" value={stock.length} />
        <StatCard icon={UsersIcon} label="Utilizatori" value={locationUsers.length} />
        <StatCard
          icon={ArrowLeftRight}
          label="Transferuri în așteptare"
          value={pendingTransfers.length}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stock */}
        <Card>
          <CardHeader>
            <CardTitle>Stoc la locație</CardTitle>
          </CardHeader>
          <CardContent>
            {stock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niciun material</p>
            ) : (
              <DataTable columns={stockColumns} data={stock} />
            )}
          </CardContent>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader>
            <CardTitle>Utilizatori</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {locationUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5"
              >
                <span className="text-sm font-medium">
                  {u.firstName} {u.lastName}
                </span>
                {can('manage', 'Location') && (
                  <IconAction
                    row
                    icon={Trash2}
                    label="Scoate utilizatorul din locație"
                    onClick={() => handleRemoveUser(u.userId)}
                  />
                )}
              </div>
            ))}
            {can('manage', 'Location') && (
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <ChoiceListField
                    title="Alege utilizatorul"
                    placeholder="Selectează utilizator"
                    searchPlaceholder="Caută utilizator…"
                    emptyText="Toți utilizatorii sunt deja în această locație."
                    value={assignUserId}
                    options={allUsers
                      .filter((u) => !locationUsers.some((lu) => lu.userId === u.id))
                      .map((u) => ({
                        value: u.id,
                        label: `${u.firstName} ${u.lastName}`,
                        hint: u.email,
                      }))}
                    onChange={setAssignUserId}
                  />
                </div>
                <IconAction
                  icon={Plus}
                  word="Adaugă"
                  tone="primary"
                  label="Adaugă utilizatorul la locație"
                  title={
                    assignUserId
                      ? 'Dă-i acces la stocul și operațiunile acestei locații'
                      : 'Alege mai întâi un utilizator'
                  }
                  onClick={handleAssignUser}
                  disabled={!assignUserId || assigning}
                  spinning={assigning}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending transfers */}
      {pendingTransfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transferuri în așteptare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingTransfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">
                      {t.fromLocationName} → {t.toLocationName}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.items?.length || 0} articole</p>
                  </div>
                  {can('manage', 'Transfer') && (
                    <div className="flex gap-1">
                      <IconAction
                        row
                        icon={Check}
                        label="Aprobă transferul"
                        onClick={() => handleApproveTransfer(t.id)}
                      />
                      <IconAction
                        row
                        icon={X}
                        label="Respinge transferul"
                        onClick={() => handleRejectTransfer(t.id)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează locația</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location-edit-name">Nume *</Label>
              <Input
                id="location-edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tip</Label>
              <ChoiceChips
                label="Tip locație"
                value={editForm.type}
                onChange={(v) => v && setEditForm({ ...editForm, type: v })}
                options={TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-edit-address">Adresă</Label>
              <Input
                id="location-edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            {wooEnabled && (
              <div className="space-y-2">
                <Label htmlFor="location-edit-external-id">ID extern (WooCommerce)</Label>
                <Input
                  id="location-edit-external-id"
                  placeholder="ex: napoca-15"
                  maxLength={100}
                  value={editForm.externalId}
                  onChange={(e) => setEditForm({ ...editForm, externalId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  ID-ul setat pe metoda de livrare în pluginul Pickupia din WooCommerce. Comenzile
                  de pe site cu acest ID devin ridicări de la această locație.
                </p>
              </div>
            )}
            {wooEnabled && (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="location-edit-main-unit">Unitate principală</Label>
                  <p className="text-xs text-muted-foreground">
                    Vânzările de pe site se scad din stocul acestei locații (locația de ridicare
                    dacă e unitate principală, altfel prima unitate principală).
                  </p>
                </div>
                <Switch
                  id="location-edit-main-unit"
                  checked={editForm.isMainUnit}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, isMainUnit: checked })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Închide fără să salvezi"
              onClick={() => handleOpenChange(false)}
            />
            <IconAction
              icon={Save}
              word="Salvează"
              tone="primary"
              label="Salvează locația"
              title={editForm.name ? 'Salvează modificările' : 'Dă-i un nume locației'}
              onClick={handleEdit}
              disabled={editSaving || !editForm.name}
              spinning={editSaving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
