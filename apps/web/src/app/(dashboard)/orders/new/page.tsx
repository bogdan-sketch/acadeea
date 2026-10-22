'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  locations as locationsApi,
  orders as ordersApi,
  recipes as recipesApi,
  users as usersApi,
} from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import type { Recipe, User, CreateOrderRequest, Location } from '@/lib/types';
import { RecipeType, UnitType } from '@horae/shared-types';
import { unitTypeLabels } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import { ChevronLeft, Plus, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

type FulfillmentType = 'DELIVERY' | 'PICKUP';

const FULFILLMENT_OPTIONS: [FulfillmentType, string][] = [
  ['DELIVERY', 'Livrare'],
  ['PICKUP', 'Ridicare'],
];

interface OrderItemForm {
  recipeId: string;
  quantity: number;
  unit: UnitType;
}

export default function NewOrderPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);
  const [userList, setUserList] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);

  const [locationList, setLocationList] = useState<Location[]>([]);

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DELIVERY');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const isPickup = fulfillmentType === 'PICKUP';
  const [deliveryPoint, setDeliveryPoint] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([
    { recipeId: '', quantity: 0, unit: UnitType.BUCATI },
  ]);

  // Dirty tracking: snapshot the initial (empty) form, compare to current.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const currentSnapshot = JSON.stringify({
    fulfillmentType,
    pickupLocationId,
    deliveryPoint,
    deliveryAddress,
    dueDate,
    notes,
    assignedToId,
    items,
  });
  useEffect(() => {
    setSnapshot(currentSnapshot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- baseline captured once from first render
  const isDirty = snapshot !== null && currentSnapshot !== snapshot;
  const { guardedNavigate, dialog } = useUnsavedChanges(isDirty);

  useEffect(() => {
    Promise.all([
      recipesApi.list({ limit: 200, type: RecipeType.FINAL }),
      usersApi.list({ limit: 100, isActive: true }),
      locationsApi.list().catch(() => [] as Location[]),
    ]).then(([r, u, l]) => {
      setRecipeList(r.data);
      setUserList(u.data);
      setLocationList(l.filter((loc) => loc.isActive !== false));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const point = deliveryPoint.trim();
      const pickupName = locationList.find((l) => l.id === pickupLocationId)?.name;
      const data: CreateOrderRequest = {
        fulfillmentType,
        // Ridicare: numele clientului e opțional — punctul devine locația aleasă.
        deliveryPoint: point || (isPickup ? (pickupName ?? 'Ridicare') : ''),
        pickupLocationId: isPickup ? pickupLocationId : undefined,
        deliveryAddress: !isPickup && deliveryAddress ? deliveryAddress : undefined,
        // Doar data (YYYY-MM-DD): API-ul o păstrează la miezul nopții UTC, adică
        // aceeași zi și în ora României (miezul nopții local ar fi ziua precedentă în UTC).
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        assignedToId: assignedToId || undefined,
        items: items.filter((i) => i.recipeId),
      };
      await ordersApi.create(data);
      setSnapshot(currentSnapshot);
      toast.success('Comandă creată cu succes');
      router.push('/orders');
    } catch (err: unknown) {
      toast.error('Eroare la crearea comenzii', {
        description: (err as { message?: string }).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const chosen = items.filter((i) => i.recipeId);
  const missingPlace = isPickup ? !pickupLocationId : !deliveryPoint.trim();
  // The API rejects quantity < 0.01 — block it here with the reason.
  const zeroQty = chosen.some((i) => !(i.quantity > 0));
  const canSubmit = !saving && chosen.length > 0 && !zeroQty && !missingPlace;
  const submitHint = missingPlace
    ? isPickup
      ? 'Alege locația de unde clientul ridică comanda'
      : 'Scrie punctul de livrare ca să poți crea comanda'
    : chosen.length === 0
      ? 'Alege cel puțin un produs ca să poți crea comanda'
      : zeroQty
        ? 'Fiecare produs ales are nevoie de o cantitate mai mare decât 0'
        : 'Salvează comanda cu produsele de mai jos';

  const recipeOptions = recipeList.map((r) => ({
    value: r.id,
    label: r.name,
    hint: r.category ?? undefined,
    meta: unitTypeLabels[r.unit] ?? r.unit,
  }));

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => guardedNavigate(() => router.back())}
          className="-ml-1.5 mb-1.5 inline-flex min-h-[32px] cursor-pointer items-center gap-0.5 rounded-lg px-1.5 text-[13.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <ChevronLeft className="h-[17px] w-[17px]" />
          Înapoi
        </button>
        <PageHead title="Comandă nouă" meta="Produse, termen și livrare">
          <IconAction
            icon={X}
            word="Anulează"
            label="Anulează comanda"
            title="Renunță, nimic nu se salvează"
            onClick={() => guardedNavigate(() => router.back())}
          />
          <IconAction
            icon={Save}
            word="Creează"
            tone="primary"
            label="Creează comandă"
            title={submitHint}
            onClick={() => formRef.current?.requestSubmit()}
            disabled={!canSubmit}
            spinning={saving}
          />
        </PageHead>
      </div>
      {dialog}

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Mod de predare</Label>
              <div
                role="group"
                aria-label="Mod de predare"
                className="flex max-w-xs rounded-[10px] bg-muted p-0.5"
              >
                {FULFILLMENT_OPTIONS.map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={fulfillmentType === m}
                    onClick={() => setFulfillmentType(m)}
                    className={`min-h-[36px] flex-1 cursor-pointer rounded-lg text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
                      fulfillmentType === m
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isPickup && (
              <div className="space-y-2">
                <Label>Locație de ridicare</Label>
                {locationList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nicio locație activă.</p>
                ) : (
                  <ChoiceChips
                    label="Locație de ridicare"
                    value={pickupLocationId || null}
                    onChange={(v) => setPickupLocationId(v ?? '')}
                    options={locationList.map((l) => ({
                      value: l.id,
                      label: l.name,
                      hint: l.address,
                    }))}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Clientul ridică produsele din locația aleasă.
                </p>
              </div>
            )}

            <TutorialAnchor id="orders.create.open">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="order-delivery-point">
                    {isPickup ? 'Client / nume la ridicare' : 'Punct livrare'}
                  </Label>
                  <Input
                    id="order-delivery-point"
                    value={deliveryPoint}
                    onChange={(e) => setDeliveryPoint(e.target.value)}
                    placeholder={isPickup ? 'Opțional' : 'ex: Magazin Centru'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isPickup ? 'Termen ridicare' : 'Termen'}</Label>
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    aria-label="Termen de livrare"
                    className="h-[42px]"
                  />
                </div>
              </div>
            </TutorialAnchor>

            {!isPickup && (
              <div className="space-y-2">
                <Label htmlFor="order-delivery-address">Adresă livrare</Label>
                <Input
                  id="order-delivery-address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Adresa completă"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Asignare</Label>
              <ChoiceChips
                label="Asignare"
                value={assignedToId}
                onChange={(v) => setAssignedToId(v ?? '')}
                options={[
                  { value: '', label: 'Neasignat' },
                  ...userList.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
                ]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-notes">Note</Label>
              <Textarea id="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="my-4 border-t" />

            <TutorialAnchor id="orders.create.items">
              <div className="space-y-3">
                <Label className="font-medium">Produse</Label>
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ChoiceListField
                        title="Alege produsul"
                        placeholder="Produs"
                        searchPlaceholder="Caută produs…"
                        emptyText="Niciun produs găsit."
                        aria-label={`Produsul ${i + 1}`}
                        value={item.recipeId}
                        options={recipeOptions}
                        onChange={(v) => {
                          const recipe = recipeList.find((r) => r.id === v);
                          const next = [...items];
                          next[i] = { ...next[i], recipeId: v, unit: recipe?.unit ?? next[i].unit };
                          setItems(next);
                        }}
                      />
                    </div>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="w-24"
                      placeholder="Cantitate"
                      aria-label={`Cantitatea produsului ${i + 1}`}
                      value={item.quantity || ''}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = { ...next[i], quantity: parseFloat(e.target.value) || 0 };
                        setItems(next);
                      }}
                    />
                    <span className="w-12 text-sm text-muted-foreground">
                      {unitTypeLabels[item.unit] || item.unit}
                    </span>
                    <IconAction
                      row
                      icon={Trash2}
                      label="Șterge produsul din comandă"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
                <IconAction
                  icon={Plus}
                  word="Produs"
                  label="Adaugă produs"
                  title="Adaugă încă un rând de produs în comandă"
                  onClick={() =>
                    setItems([...items, { recipeId: '', quantity: 0, unit: UnitType.BUCATI }])
                  }
                />
              </div>
            </TutorialAnchor>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
