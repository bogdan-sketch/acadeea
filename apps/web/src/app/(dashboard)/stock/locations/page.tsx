'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { locations as api, organization as orgApi } from '@/lib/api';
import type { Location, Organization } from '@/lib/types';
import { LocationType } from '@/lib/types';
import { locationTypeLabels } from '@/lib/constants';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { ChoiceChips } from '@/components/choice-chips';
import { Truncate } from '@/components/truncate';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Plus, MapPin, ArrowUpDown, PenLine, Trash2, Save, X } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { usePermissions } from '@/contexts/auth-context';
import { useWooDeliveryEnabled } from '@/hooks/use-woo-delivery';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type SortKey = 'name' | 'type';

const EMPTY_FORM = {
  name: '',
  type: LocationType.DEPOZIT as string,
  address: '',
  externalId: '',
  isMainUnit: false,
};

const TYPE_OPTIONS = (Object.values(LocationType) as LocationType[]).map((t) => ({
  value: t,
  label: locationTypeLabels[t],
}));

export default function LocationsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  // Shop delivery (Pickupia): externalId + main units only with the org switch on.
  const wooEnabled = useWooDeliveryEnabled();
  const [locs, setLocs] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  // One dialog serves both create (editingId = null) and edit (design's pen action).
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  // In-app confirmation for delete (no native confirm()).
  const [pendingDelete, setPendingDelete] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);
  // Organizația — poartă defaultDeliveryLocationId (toggle-ul "Livrare implicită").
  const [org, setOrg] = useState<Organization | null>(null);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);
  const isDirty = JSON.stringify(form) !== baseline;
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({
    isDirty,
    onClose: closeForm,
  });

  const load = async () => {
    try {
      const res = await api.list();
      setLocs(res);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    orgApi
      .get()
      .then(setOrg)
      .catch(() => {});
  }, []);

  // Exactly one default delivery location: turning a row ON moves the default
  // there; turning the active one OFF clears it (deliveries then show only
  // under "Toate" in dashboard stats).
  const handleDefaultDelivery = async (loc: Location, checked: boolean) => {
    try {
      const updated = await orgApi.update({
        defaultDeliveryLocationId: checked ? loc.id : null,
      });
      setOrg(updated);
      toast.success(
        checked
          ? `Livrările pleacă implicit din ${loc.name}`
          : 'Locația de livrare implicită a fost ștearsă',
      );
    } catch {
      toast.error('Eroare la salvare');
    }
  };

  // Exactly one default production/reception location (ClickUp: loc implicit
  // receptie) — preselectată la crearea unui task și la recepția de marfă.
  const handleDefaultLocation = async (loc: Location, checked: boolean) => {
    try {
      const updated = await orgApi.update({
        defaultLocationId: checked ? loc.id : null,
      });
      setOrg(updated);
      toast.success(
        checked
          ? `${loc.name} e acum locația implicită pentru orice operațiune`
          : 'Locația implicită a fost ștearsă',
      );
    } catch {
      toast.error('Eroare la salvare');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    const list = [...locs];
    list.sort((a, b) => {
      const va = sortKey === 'name' ? a.name : locationTypeLabels[a.type];
      const vb = sortKey === 'name' ? b.name : locationTypeLabels[b.type];
      return sortAsc ? va.localeCompare(vb, 'ro') : vb.localeCompare(va, 'ro');
    });
    return list;
  }, [locs, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBaseline(JSON.stringify(EMPTY_FORM));
    setShowForm(true);
  };

  const openEdit = (loc: Location) => {
    const values = {
      name: loc.name,
      type: loc.type as string,
      address: loc.address || '',
      externalId: loc.externalId || '',
      isMainUnit: !!loc.isMainUnit,
    };
    setEditingId(loc.id);
    setForm(values);
    setBaseline(JSON.stringify(values));
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type as LocationType,
        address: form.address.trim(),
        ...(wooEnabled ? { isMainUnit: form.isMainUnit } : {}),
      };
      const externalId = form.externalId.trim();
      if (editingId) {
        // null clears the Pickupia id on the API.
        await api.update(editingId, { ...payload, externalId: externalId || null });
        toast.success('Locație actualizată');
      } else {
        await api.create({ ...payload, ...(externalId ? { externalId } : {}) });
        toast.success('Locație creată');
      }
      closeForm();
      load();
    } catch (err: unknown) {
      toast.error(editingId ? 'Eroare la salvarea locației' : 'Eroare la crearea locației', {
        description: (err as { message?: string }).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (loc: Location) => setPendingDelete(loc);

  const confirmDelete = async () => {
    const loc = pendingDelete;
    if (!loc) return;
    setDeleting(true);
    try {
      await api.delete(loc.id);
      toast.success(`Locația „${loc.name}” a fost ștearsă`);
      setLocs((prev) => prev.filter((l) => l.id !== loc.id));
      setPendingDelete(null);
    } catch (err: unknown) {
      toast.error('Eroare la ștergere', { description: (err as { message?: string }).message });
    } finally {
      setDeleting(false);
    }
  };

  // API: name ≥ 2 chars, address ≥ 3 chars (both required).
  const canSave = form.name.trim().length >= 2 && form.address.trim().length >= 3;
  const saveHint = !form.name.trim()
    ? 'Dă-i un nume locației'
    : form.name.trim().length < 2
      ? 'Numele are cel puțin 2 caractere'
      : form.address.trim().length < 3
        ? 'Adresa e obligatorie (cel puțin 3 caractere)'
        : editingId
          ? 'Salvează modificările'
          : 'Salvează locația nouă';

  const canUpdate = can('update', 'Location');
  const canDelete = can('delete', 'Location');

  const canUpdateOrg = can('update', 'Organization');

  // Grid: Nume | Adresă | Tip | Status | Livrare implicită | Implicită | Acțiuni.
  // Name/address take the free width (minimum 180px each) so a name like
  // "Cofetărie Napoca" is never squeezed into a 90px column; narrower
  // viewports scroll the table horizontally instead.
  const gridCols =
    'grid-cols-[minmax(180px,1.5fr)_minmax(180px,1.2fr)_120px_100px_130px_130px_90px]';

  return (
    <div className="space-y-5">
      {/* Locations live under Setări → Organizație (admin) — the stock-hub
          entry was removed (2026-07-10). */}
      <div>
        <BackLink href="/profil?tab=setari#locatii" label="Profil & setări" />
        <PageHead title="Locații" meta="Depozite, laboratoare și puncte de vânzare">
          {can('create', 'Location') && (
            <TutorialAnchor id="locations.manage.create">
              <span className="inline-flex">
                <IconAction
                  icon={Plus}
                  word="Locație"
                  tone="primary"
                  label="Locație nouă"
                  title="Adaugă un depozit, laborator sau punct de vânzare"
                  onClick={openCreate}
                />
              </span>
            </TutorialAnchor>
          )}
        </PageHead>
      </div>

      {loading ? (
        <p className="mt-4 text-muted-foreground">Se încarcă...</p>
      ) : locs.length === 0 ? (
        <EmptyState icon={MapPin} title="Nicio locație" description="Adaugă prima locație." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
            {/* Header row — design .thead: surface-2 uppercase band */}
            <div
              className={`grid ${gridCols} min-w-[1000px] gap-x-4 bg-muted px-6 pb-3 pt-3.5 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground`}
            >
              <button
                type="button"
                onClick={() => toggleSort('name')}
                className="flex cursor-pointer items-center gap-1 uppercase tracking-[.4px]"
              >
                Nume
                <ArrowUpDown className="h-[11px] w-[11px]" />
              </button>
              <span>Adresă</span>
              <button
                type="button"
                onClick={() => toggleSort('type')}
                className="flex cursor-pointer items-center gap-1 uppercase tracking-[.4px]"
              >
                Tip
                <ArrowUpDown className="h-[11px] w-[11px]" />
              </button>
              <span>Status</span>
              <span title="Locația din care pleacă implicit comenzile cu livrare">
                Livrare implicită
              </span>
              <span title="Locația preselectată la orice operațiune: task, recepție, stoc nou, vânzări, consum test, transfer">
                Implicită
              </span>
              <span className="text-right">Acțiuni</span>
            </div>
            {sorted.map((loc) => (
              <div
                key={loc.id}
                onClick={() => router.push(`/stock/locations/${loc.id}`)}
                className={`grid ${gridCols} min-w-[1000px] cursor-pointer items-center gap-x-4 border-t border-border px-6 py-[9px] text-[13.5px] transition-colors hover:bg-muted/60`}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Truncate text={loc.name} className="font-semibold" />
                    {wooEnabled && loc.isMainUnit && (
                      <span
                        title="Unitate principală: vânzările de pe site se scad din stocul ei"
                        className="shrink-0 rounded-full bg-accent px-[7px] py-[1px] text-[10.5px] font-bold text-primary"
                      >
                        Principală
                      </span>
                    )}
                  </span>
                  {wooEnabled && loc.externalId && (
                    <Truncate
                      text={`ID extern (WooCommerce): ${loc.externalId}`}
                      className="text-[11.5px] text-muted-foreground"
                    >
                      ID extern: {loc.externalId}
                    </Truncate>
                  )}
                </span>
                <Truncate text={loc.address || '—'} className="text-muted-foreground" />
                <span>
                  <span className="rounded-full bg-muted px-[9px] py-[3px] text-[11px] font-semibold text-muted-foreground">
                    {locationTypeLabels[loc.type]}
                  </span>
                </span>
                <span>
                  {/* No isActive on Location — a listed location is active by definition. */}
                  <span className="st-green rounded-full px-[9px] py-[3px] text-[11px] font-semibold">
                    Activă
                  </span>
                </span>
                <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                  <TutorialAnchor id="locations.manage.defaultDelivery">
                    <Switch
                      checked={org?.defaultDeliveryLocationId === loc.id}
                      disabled={!canUpdateOrg}
                      onCheckedChange={(checked) => handleDefaultDelivery(loc, checked)}
                      title={
                        org?.defaultDeliveryLocationId === loc.id
                          ? 'Comenzile cu livrare pleacă implicit de aici — oprește pentru a renunța'
                          : `Setează ${loc.name} ca locație implicită de livrare`
                      }
                    />
                  </TutorialAnchor>
                </span>
                <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                  <TutorialAnchor id="locations.manage.defaultProduction">
                    <Switch
                      checked={org?.defaultLocationId === loc.id}
                      disabled={!canUpdateOrg}
                      onCheckedChange={(checked) => handleDefaultLocation(loc, checked)}
                      title={
                        org?.defaultLocationId === loc.id
                          ? 'Orice operațiune pornește implicit de aici — oprește pentru a renunța'
                          : `Setează ${loc.name} ca locație implicită pentru orice operațiune`
                      }
                    />
                  </TutorialAnchor>
                </span>
                <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {canUpdate && (
                    <IconAction
                      row
                      icon={PenLine}
                      label={`Editează ${loc.name}`}
                      onClick={() => openEdit(loc)}
                    />
                  )}
                  {canDelete && (
                    <IconAction
                      row
                      icon={Trash2}
                      label={`Șterge ${loc.name}`}
                      onClick={() => handleDelete(loc)}
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Locațiile apar în pickerul de producție, la mișcări de stoc și la transferuri. Comenzile
            cu livrare pleacă din locația marcată „Livrare implicită&rdquo; — fără ea, livrările
            apar doar pe „Toate&rdquo; în statisticile de pe ecranul principal.
          </p>
        </>
      )}

      <Dialog open={showForm} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editează locația' : 'Locație nouă'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location-name">Nume *</Label>
              <Input
                id="location-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tip</Label>
              <ChoiceChips
                label="Tip locație"
                value={form.type}
                onChange={(v) => v && setForm({ ...form, type: v })}
                options={TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-address">Adresă *</Label>
              <Input
                id="location-address"
                placeholder="ex: Str. Florilor 12, Cluj-Napoca"
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            {wooEnabled && (
              <div className="space-y-2">
                <Label htmlFor="location-external-id">ID extern (WooCommerce)</Label>
                <Input
                  id="location-external-id"
                  placeholder="ex: napoca-15"
                  maxLength={100}
                  value={form.externalId}
                  onChange={(e) => setForm({ ...form, externalId: e.target.value })}
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
                  <Label htmlFor="location-main-unit">Unitate principală</Label>
                  <p className="text-xs text-muted-foreground">
                    Vânzările de pe site se scad din stocul acestei locații (locația de ridicare
                    dacă e unitate principală, altfel prima unitate principală).
                  </p>
                </div>
                <Switch
                  id="location-main-unit"
                  checked={form.isMainUnit}
                  onCheckedChange={(checked) => setForm({ ...form, isMainUnit: checked })}
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
              word={editingId ? 'Salvează' : 'Creează'}
              tone="primary"
              label={editingId ? 'Salvează locația' : 'Creează locația'}
              title={saveHint}
              onClick={handleSave}
              disabled={saving || !canSave}
              spinning={saving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Ștergi locația „${pendingDelete?.name ?? ''}”?`}
        description="Locația dispare din pickerele de producție, recepție și transfer. Stocul ei trebuie mutat înainte."
        confirmLabel="Șterge locația"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
