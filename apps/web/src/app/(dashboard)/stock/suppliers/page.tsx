'use client';

import { useEffect, useState, useCallback } from 'react';
import { suppliers as api } from '@/lib/api';
import type { Supplier, CreateSupplierRequest } from '@/lib/types';
import { formatUnitQty } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Plus, Loader2, Pencil, Trash2, Truck, AlertTriangle, Save, X } from 'lucide-react';

// Loose formats: RO phones with spaces/dots/dashes and an optional +40; any
// "x@y.z" email. The goal is catching garbage, not validating deliverability.
const PHONE_RE = /^\+?[\d\s().-]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
import { BackLink } from '@/components/back-link';
import { usePermissions } from '@/contexts/auth-context';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';
import { toast } from 'sonner';

const EMPTY: CreateSupplierRequest = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  notes: '',
};

export default function SuppliersPage() {
  const { can } = usePermissions();
  const canManage = can('manage', 'RawMaterial');

  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyLow, setOnlyLow] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateSupplierRequest>(EMPTY);
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY);
  }, []);
  const isDirty = JSON.stringify(form) !== baseline;
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({
    isDirty,
    onClose: closeDialog,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api.list());
    } catch {
      toast.error('Eroare la încărcarea furnizorilor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setBaseline(JSON.stringify(EMPTY));
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    const values: CreateSupplierRequest = {
      name: s.name,
      contactPerson: s.contactPerson ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      notes: s.notes ?? '',
    };
    setEditingId(s.id);
    setForm(values);
    setBaseline(JSON.stringify(values));
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Numele furnizorului este obligatoriu');
      return;
    }
    const phone = (form.phone ?? '').trim();
    const email = (form.email ?? '').trim();
    if (phone && !PHONE_RE.test(phone)) {
      toast.error('Telefonul nu arată ca un număr', {
        description:
          'Folosește doar cifre, spații, +, paranteze sau cratime (ex: +40 744 123 456).',
      });
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      toast.error('Emailul nu e valid', { description: 'Formatul așteptat: nume@domeniu.ro' });
      return;
    }
    const payload: CreateSupplierRequest = {
      ...form,
      name: form.name.trim(),
      contactPerson: (form.contactPerson ?? '').trim(),
      phone,
      email,
      notes: (form.notes ?? '').trim(),
    };
    setSaving(true);
    try {
      if (editingId) await api.update(editingId, payload);
      else await api.create(payload);
      toast.success(editingId ? 'Furnizor actualizat' : 'Furnizor adăugat');
      closeDialog();
      load();
    } catch (err) {
      toast.error((err as { message?: string }).message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  const remove = (s: Supplier) => setPendingDelete(s);

  const confirmRemove = async () => {
    const s = pendingDelete;
    if (!s) return;
    setDeleting(true);
    try {
      await api.remove(s.id);
      toast.success('Furnizor șters');
      setPendingDelete(null);
      load();
    } catch (err: unknown) {
      toast.error('Eroare la ștergere', { description: (err as { message?: string }).message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div>
        <BackLink href="/stock" label="Stoc" />
        <PageHead title="Furnizori" meta="Produse grupate per furnizor — comandă rapid">
          <label className="flex h-[42px] items-center gap-2 text-[13px] font-semibold text-muted-foreground">
            Doar stoc scăzut
            <Switch checked={onlyLow} onCheckedChange={setOnlyLow} />
          </label>
          {canManage && (
            <IconAction
              icon={Plus}
              word="Furnizor"
              tone="primary"
              label="Furnizor nou"
              title="Adaugă un furnizor și grupează produsele lui"
              onClick={openCreate}
            />
          )}
        </PageHead>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Niciun furnizor. Adaugă unul pentru a grupa produsele.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((s) => {
            const materials = onlyLow ? s.materials.filter((m) => m.isLow) : s.materials;
            if (onlyLow && materials.length === 0) return null;
            return (
              <Card key={s.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{s.name}</span>
                        {s.lowStockCount > 0 && (
                          <Badge className="st-red gap-1 rounded-full border-0 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {s.lowStockCount} de comandat
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[s.contactPerson, s.phone, s.email].filter(Boolean).join(' · ') ||
                          `${s.materialCount} produse`}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <IconAction
                          row
                          icon={Pencil}
                          label="Editează furnizorul"
                          onClick={() => openEdit(s)}
                        />
                        <IconAction
                          row
                          icon={Trash2}
                          label="Șterge furnizorul"
                          onClick={() => remove(s)}
                        />
                      </div>
                    )}
                  </div>

                  {materials.length > 0 && (
                    <div className="mt-3 divide-y rounded-md border">
                      {materials.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <span>{m.title}</span>
                          <span
                            className={m.isLow ? 'font-semibold' : ''}
                            style={m.isLow ? { color: 'var(--st-red)' } : undefined}
                          >
                            {formatUnitQty(m.stockCount, m.unit)}
                            {m.isLow && ` · min ${formatUnitQty(m.minimumStock, m.unit)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editează furnizor' : 'Furnizor nou'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="supplier-name">Nume *</Label>
              <Input
                id="supplier-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-contact">Persoană de contact</Label>
              <Input
                id="supplier-contact"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="supplier-phone">Telefon</Label>
                <Input
                  id="supplier-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-email">Email</Label>
                <Input
                  id="supplier-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-notes">Note</Label>
              <Input
                id="supplier-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Închide fără să salvezi"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            />
            <IconAction
              icon={Save}
              word={editingId ? 'Salvează' : 'Creează'}
              tone="primary"
              label={editingId ? 'Salvează furnizorul' : 'Adaugă furnizorul'}
              title={form.name.trim() ? 'Salvează furnizorul' : 'Numele furnizorului e obligatoriu'}
              onClick={save}
              disabled={saving}
              spinning={saving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Ștergi furnizorul „${pendingDelete?.name ?? ''}”?`}
        description="Produsele rămân, doar asocierea cu furnizorul se șterge."
        confirmLabel="Șterge furnizorul"
        tone="danger"
        busy={deleting}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
