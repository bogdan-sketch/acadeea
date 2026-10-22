'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recipes as recipesApi, rawMaterials as rawMaterialsApi } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { RECIPE_PHOTOS_ENABLED } from '@/lib/features';
import { usePermissions } from '@/contexts/auth-context';
import type {
  CreateRecipeRequest,
  CreateRecipeIngredient,
  PaginatedResponse,
  RawMaterial,
  Recipe,
} from '@/lib/types';
import { RecipeType, UnitType } from '@horae/shared-types';
import { decimalInputText, parseDecimal } from '@/lib/ro-number';
import { recipeTypeLabels, unitChoices, unitTypeLabels, unitsForMeasure } from '@/lib/constants';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceList, ChoiceListField, type ChoiceListOption } from '@/components/choice-list';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import { Truncate } from '@/components/truncate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  ChevronLeft,
  CirclePlus,
  Info,
  Trash2,
  Loader2,
  Search,
  Save,
  X,
  FileText,
  Send,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

type IngredientSource = 'RAW' | 'SEMI';

// Shelf-life presets offered as chips; anything else = "Personalizat".
const SHELF_LIFE_PRESETS = [1, 2, 3, 6, 12] as const;
const SHELF_LIFE_OPTIONS = [
  { value: 'none', label: 'Fără urmărire', hint: 'Loturile produse nu primesc dată de expirare' },
  { value: '1', label: '1 lună' },
  { value: '2', label: '2 luni' },
  { value: '3', label: '3 luni' },
  { value: '6', label: '6 luni' },
  { value: '12', label: '12 luni' },
  { value: 'custom', label: 'Personalizat…', hint: 'Introdu numărul de luni' },
];

// Unit chips for a free choice; an old recipe's legacy unit (cană, oz) stays
// offered (and selected) so editing never drops it.
const unitOptions = (current: UnitType) =>
  unitChoices(current).map((u) => ({
    value: u,
    label: unitTypeLabels[u],
  }));

// Full explanation lives in the info-icon tooltip; the visible helper is a one-liner.
const FINISHED_WEIGHT_HELP =
  'Greutatea întregii șarje după preparare (ex. pierderea de apă la coacere). Se folosește pentru valorile nutriționale la 100 g. Lasă gol dacă nu știi.';

interface IngredientForm {
  _id: string;
  source: IngredientSource;
  rawMaterialId: string;
  semipreparatRecipeId: string;
  name: string;
  /** Typed text, Romanian comma ("1,5"); parsed with parseDecimal on save. */
  quantity: string;
  unit: UnitType;
  /** Detalii de preparare (ex: cuburi, cernut) — același `prepMethod` ca pe iOS. */
  prepMethod: string;
}

interface ComponentForm {
  _id: string;
  name: string;
  ingredients: IngredientForm[];
}

// Stable client-side ids so React keys survive add/remove — array-index keys
// make base-ui Selects keep a removed row's value (looks like it can't delete).
const newIngredient = (): IngredientForm => ({
  _id: crypto.randomUUID(),
  source: 'RAW',
  rawMaterialId: '',
  semipreparatRecipeId: '',
  name: '',
  quantity: '',
  unit: UnitType.GRAME,
  prepMethod: '',
});

const newComponent = (name = ''): ComponentForm => ({
  _id: crypto.randomUUID(),
  name,
  ingredients: [newIngredient()],
});

// DS field label (12.5px semibold muted) shared by every field in "Informații generale".
const fieldLabelClass = 'gap-1 text-[12.5px] font-semibold text-muted-foreground';

// DS form card (prototype panel): 16px radius, border, warm shadow.
const formCardClass =
  'overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)';
// DS panel-head: 15px/700 section title.
const formCardHeadClass = 'px-6 pb-4 pt-5 text-[15px] font-bold tracking-[-.1px]';

// Serialize the editable fields for dirty-tracking (excludes the client-only
// `_id`s). Compared against a snapshot captured at mount (create) / prefill (edit).
interface SnapshotFields {
  name: string;
  type: RecipeType;
  unit: UnitType;
  yieldQuantity: string;
  finishedWeightGrams: string;
  pieceEquivalentQty: string;
  pieceEquivalentUnit: UnitType;
  category: string;
  estimatedLossPercent: string;
  shelfLifeMode: string;
  shelfLifeCustom: string;
  components: ComponentForm[];
  pendingByproduct: PendingByproduct | null;
}

/** Byproduct semipreparat collected in the mini-form, created after save. */
interface PendingByproduct {
  name: string;
  unit: UnitType;
  yieldQuantity: number;
}
function serializeRecipeFields(f: SnapshotFields): string {
  return JSON.stringify({
    name: f.name,
    type: f.type,
    unit: f.unit,
    yieldQuantity: f.yieldQuantity,
    finishedWeightGrams: f.finishedWeightGrams,
    pieceEquivalentQty: f.pieceEquivalentQty,
    pieceEquivalentUnit: f.pieceEquivalentUnit,
    category: f.category,
    estimatedLossPercent: f.estimatedLossPercent,
    shelfLifeMode: f.shelfLifeMode,
    shelfLifeCustom: f.shelfLifeCustom,
    components: f.components.map((c) => ({
      name: c.name,
      ingredients: c.ingredients.map((i) => ({
        source: i.source,
        rawMaterialId: i.rawMaterialId,
        semipreparatRecipeId: i.semipreparatRecipeId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        prepMethod: i.prepMethod,
      })),
    })),
    pendingByproduct: f.pendingByproduct,
  });
}

/**
 * One searchable modal over EVERY pickable ingredient — materii prime,
 * semipreparate and byproducts as three groups (no per-row source switcher).
 */
function IngredientPickerDialog({
  open,
  onOpenChange,
  materials,
  semipreparate,
  byproducts,
  onPickMaterial,
  onPickRecipe,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: RawMaterial[];
  semipreparate: Recipe[];
  byproducts: Recipe[];
  onPickMaterial: (m: RawMaterial) => void;
  onPickRecipe: (r: Recipe) => void;
}) {
  // Values are prefixed so a material and a recipe can never share an id.
  const options: ChoiceListOption[] = [
    ...materials.map((m) => ({
      value: `m:${m.id}`,
      label: m.title,
      keywords: m.producer ?? undefined,
      meta: unitTypeLabels[m.unit] ?? m.unit,
      group: 'Materii prime',
    })),
    ...semipreparate.map((r) => ({
      value: `r:${r.id}`,
      label: r.name,
      meta: unitTypeLabels[r.unit] ?? r.unit,
      group: 'Semipreparate',
    })),
    ...byproducts.map((r) => ({
      value: `r:${r.id}`,
      label: r.name,
      meta: unitTypeLabels[r.unit] ?? r.unit,
      group: 'Byproduct',
    })),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alege ingredient</DialogTitle>
          <DialogDescription>
            Caută în materii prime, semipreparate și byproducturi.
          </DialogDescription>
        </DialogHeader>
        <ChoiceList
          autoFocus
          value={null}
          options={options}
          placeholder="Caută ingredient…"
          emptyText="Niciun ingredient găsit."
          listClassName="max-h-[50vh]"
          onChange={(v) => {
            if (v.startsWith('m:')) {
              const m = materials.find((x) => x.id === v.slice(2));
              if (m) onPickMaterial(m);
            } else {
              const r = [...semipreparate, ...byproducts].find((x) => x.id === v.slice(2));
              if (r) onPickRecipe(r);
            }
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function RecipeForm({ recipeId }: { recipeId?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!recipeId;
  const { can } = usePermissions();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [semipreparate, setSemipreparate] = useState<Recipe[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [name, setName] = useState('');
  const [type, setType] = useState<RecipeType>(RecipeType.FINAL);
  // Default to pieces; most products are counted (e.g. 100 buc), and the picker
  // still allows grams/ml/litres for bulk recipes.
  const [unit, setUnit] = useState<UnitType>(UnitType.BUCATI);
  const [yieldQuantity, setYieldQuantity] = useState('');
  const [finishedWeightGrams, setFinishedWeightGrams] = useState('');
  // Semipreparat "1 bucată = N unit" bridge (only meaningful when yield is BUCATI).
  const [pieceEquivalentQty, setPieceEquivalentQty] = useState('');
  const [pieceEquivalentUnit, setPieceEquivalentUnit] = useState<UnitType>(UnitType.KILOGRAME);
  const [category, setCategory] = useState('');
  const [estimatedLossPercent, setEstimatedLossPercent] = useState('');
  // Shelf life: mode is 'none' | one of the presets | 'custom'; custom holds the free value.
  const [shelfLifeMode, setShelfLifeMode] = useState<string>('none');
  const [shelfLifeCustom, setShelfLifeCustom] = useState('');
  const [components, setComponents] = useState<ComponentForm[]>([newComponent('Principal')]);
  const [isDraft, setIsDraft] = useState(false);

  // Ingredient picker modal: which row it is filling (null = closed).
  const [pickerTarget, setPickerTarget] = useState<{ ci: number; ii: number } | null>(null);

  // Byproduct: existing ones (edit mode, from the API) + one pending new one
  // collected in the mini-form and created right after the recipe saves.
  const [existingByproducts, setExistingByproducts] = useState<{ id: string; name: string }[]>([]);
  const [pendingByproduct, setPendingByproduct] = useState<PendingByproduct | null>(null);
  const [byproductDialogOpen, setByproductDialogOpen] = useState(false);
  const [bpName, setBpName] = useState('');
  const [bpUnit, setBpUnit] = useState<UnitType>(UnitType.GRAME);
  const [bpQty, setBpQty] = useState('');

  // Dirty tracking: snapshot the initial field values, compare to current.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const currentSnapshot = serializeRecipeFields({
    name,
    type,
    unit,
    yieldQuantity,
    finishedWeightGrams,
    pieceEquivalentQty,
    pieceEquivalentUnit,
    category,
    estimatedLossPercent,
    shelfLifeMode,
    shelfLifeCustom,
    components,
    pendingByproduct,
  });
  // Create: capture the initial baseline once after mount. Edit: captured in the
  // prefill .then() below (snapshot stays null → not dirty while loading).
  useEffect(() => {
    if (!isEdit) setSnapshot(currentSnapshot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- baseline captured once from first render
  const isDirty = snapshot !== null && currentSnapshot !== snapshot;
  const { guardedNavigate, dialog } = useUnsavedChanges(isDirty);

  useEffect(() => {
    // The picker searches CLIENT-SIDE over the fetched list, so fetch EVERY
    // page — a single capped page would silently hide materials past the cap.
    const fetchAllPages = async <T,>(
      list: (q: { page: number; limit: number }) => Promise<PaginatedResponse<T>>,
    ): Promise<T[]> => {
      const first = await list({ page: 1, limit: 500 });
      const all = [...first.data];
      for (let page = 2; page <= first.totalPages; page++) {
        all.push(...(await list({ page, limit: 500 })).data);
      }
      return all;
    };
    // Discontinued materials must not be offered as new-recipe ingredients.
    fetchAllPages((q) => rawMaterialsApi.list(q))
      .then((mats) => setMaterials(mats.filter((m) => m.status !== 'DISCONTINUED')))
      .catch(() => {});
    // Semipreparat recipes are selectable as sub-recipe ingredients (XOR raw material).
    fetchAllPages((q) => recipesApi.list({ type: RecipeType.SEMIPREPARAT, ...q }))
      .then((recs) => setSemipreparate(recs.filter((rec) => rec.id !== recipeId)))
      .catch(() => {});
  }, [recipeId]);

  // Prefill in edit mode.
  useEffect(() => {
    if (!recipeId) return;
    recipesApi
      .get(recipeId)
      .then((r) => {
        setName(r.name);
        setPhotoUrl((r as { photoUrl?: string | null }).photoUrl ?? null);
        setType(r.type);
        setUnit(r.unit);
        setYieldQuantity(decimalInputText(r.yieldQuantity));
        setFinishedWeightGrams(decimalInputText(r.finishedWeightGrams));
        setPieceEquivalentQty(decimalInputText(r.pieceEquivalentQuantity));
        if (r.pieceEquivalentUnit) setPieceEquivalentUnit(r.pieceEquivalentUnit);
        setCategory(r.category ?? '');
        setEstimatedLossPercent(decimalInputText(r.estimatedLossPercent));
        setIsDraft(!!r.isDraft);
        setExistingByproducts(r.byproducts ?? []);
        const sl = r.shelfLifeMonths;
        let slMode = 'none';
        let slCustom = '';
        if (sl == null) {
          setShelfLifeMode('none');
        } else if ((SHELF_LIFE_PRESETS as readonly number[]).includes(sl)) {
          slMode = String(sl);
          setShelfLifeMode(slMode);
        } else {
          slMode = 'custom';
          slCustom = String(sl);
          setShelfLifeMode('custom');
          setShelfLifeCustom(slCustom);
        }
        const comps = (r.components ?? []).map<ComponentForm>((c) => ({
          _id: crypto.randomUUID(),
          name: c.name,
          ingredients: (c.ingredients ?? []).map<IngredientForm>((ing) => ({
            _id: crypto.randomUUID(),
            source: ing.semipreparatRecipeId ? 'SEMI' : 'RAW',
            rawMaterialId: ing.rawMaterialId ?? '',
            semipreparatRecipeId: ing.semipreparatRecipeId ?? '',
            name: ing.name ?? '',
            quantity: ing.quantity ? decimalInputText(ing.quantity) : '',
            unit: ing.unit,
            prepMethod: ing.prepMethod ?? '',
          })),
        }));
        const initialComponents = comps.length ? comps : [newComponent('Principal')];
        setComponents(initialComponents);
        // Capture the dirty-tracking baseline from the prefilled values.
        setSnapshot(
          serializeRecipeFields({
            name: r.name,
            type: r.type,
            unit: r.unit,
            yieldQuantity: decimalInputText(r.yieldQuantity),
            finishedWeightGrams: decimalInputText(r.finishedWeightGrams),
            pieceEquivalentQty: decimalInputText(r.pieceEquivalentQuantity),
            pieceEquivalentUnit: r.pieceEquivalentUnit ?? UnitType.KILOGRAME,
            category: r.category ?? '',
            estimatedLossPercent: decimalInputText(r.estimatedLossPercent),
            shelfLifeMode: slMode,
            shelfLifeCustom: slCustom,
            components: initialComponents,
            pendingByproduct: null,
          }),
        );
      })
      .catch(() => toast.error('Nu s-a putut încărca rețeta'))
      .finally(() => setLoading(false));
  }, [recipeId]);

  // Final vs semipreparat recipes use separate category lists.
  useEffect(() => {
    const kind = type === RecipeType.SEMIPREPARAT ? 'SEMIPREPARAT' : 'PRODUS_FINIT';
    recipesApi
      .categories(kind)
      .then((cats) => {
        setAvailableCategories(cats);
        setCategory((c) => (cats.includes(c) ? c : ''));
      })
      .catch(() => {});
  }, [type]);

  const patchComponents = (fn: (draft: ComponentForm[]) => void) => {
    setComponents((prev) => {
      const next = prev.map((c) => ({ ...c, ingredients: c.ingredients.map((i) => ({ ...i })) }));
      fn(next);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSave('save');
  };

  // mode: 'save' = normal create/update; 'draft' = create as a draft (create only);
  // 'publish' = update then publish the draft (edit only).
  const doSave = async (mode: 'save' | 'draft' | 'publish') => {
    // A real (non-draft) recipe needs a positive yield and at least one
    // ingredient — otherwise it saves as "0 buc, cost 0" and breaks production.
    if (mode !== 'draft') {
      const y = parseDecimal(yieldQuantity);
      if (y == null || y <= 0) {
        toast.error('Introdu randamentul rețetei (mai mare decât 0)');
        return;
      }
      const hasIngredient = components.some((c) =>
        c.ingredients.some((ing) =>
          ing.source === 'RAW' ? !!ing.rawMaterialId : !!ing.semipreparatRecipeId,
        ),
      );
      if (!hasIngredient) {
        toast.error('Adaugă cel puțin un ingredient', {
          description: 'Poți salva ca schiță dacă rețeta nu e gata.',
        });
        return;
      }
      const zeroQty = components.some((c) =>
        c.ingredients.some((ing) => {
          const picked = ing.source === 'RAW' ? !!ing.rawMaterialId : !!ing.semipreparatRecipeId;
          const q = parseDecimal(ing.quantity);
          return picked && (q == null || q <= 0);
        }),
      );
      if (zeroQty) {
        toast.error('Fiecare ingredient are nevoie de o cantitate mai mare decât 0');
        return;
      }
    }
    // Resolve the shelf life to a number or null. Sending `null` explicitly
    // clears it on the backend (@IsOptional skips validation for null; the
    // update service writes NULL because the field is !== undefined).
    let shelfLifeMonths: number | null = null;
    if (shelfLifeMode === 'custom') {
      // Reject invalid custom input instead of silently coercing to null —
      // must be an integer in 1..120 months.
      const n = parseInt(shelfLifeCustom, 10);
      if (!Number.isInteger(n) || n < 1 || n > 120) {
        toast.error('Introdu un termen de valabilitate valid (1–120 luni)');
        return;
      }
      shelfLifeMonths = n;
    } else if (shelfLifeMode !== 'none') {
      shelfLifeMonths = parseInt(shelfLifeMode, 10);
    }

    // Finished batch weight: send the number when provided, null to clear it.
    // Reject negatives instead of silently coercing.
    let finishedWeight: number | null = null;
    if (finishedWeightGrams.trim() !== '') {
      const w = parseDecimal(finishedWeightGrams);
      if (w == null || w < 0) {
        toast.error('Introdu o greutate a produsului finit validă (≥ 0 g)');
        return;
      }
      finishedWeight = w;
    }

    // Piece equivalent — only meaningful for a semipreparat yielded in bucăți.
    // Send the value when yield is BUCATI + a positive number is entered, else null.
    let pieceEquivalentQuantity: number | null = null;
    let pieceEquivQtyUnit: UnitType | null = null;
    if (unit === UnitType.BUCATI && pieceEquivalentQty.trim() !== '') {
      const pe = parseDecimal(pieceEquivalentQty);
      if (pe == null || pe <= 0) {
        toast.error('Introdu o valoare validă pentru „O bucată reprezintă” (> 0)');
        return;
      }
      pieceEquivalentQuantity = pe;
      pieceEquivQtyUnit = pieceEquivalentUnit;
    }

    setSaving(true);
    try {
      const data: CreateRecipeRequest = {
        name,
        type,
        unit,
        yieldQuantity: parseDecimal(yieldQuantity) ?? 0,
        finishedWeightGrams: finishedWeight,
        pieceEquivalentQuantity,
        pieceEquivalentUnit: pieceEquivQtyUnit,
        category: category || undefined,
        estimatedLossPercent: parseDecimal(estimatedLossPercent) ?? undefined,
        shelfLifeMonths,
        components: components.map((c, i) => ({
          name: c.name || 'Principal',
          sortOrder: i,
          ingredients: c.ingredients
            .filter((ing) =>
              ing.source === 'RAW' ? !!ing.rawMaterialId : !!ing.semipreparatRecipeId,
            )
            .map<CreateRecipeIngredient>((ing, j) =>
              ing.source === 'RAW'
                ? {
                    rawMaterialId: ing.rawMaterialId,
                    name: ing.name || 'Ingredient',
                    quantity: parseDecimal(ing.quantity) ?? 0,
                    unit: ing.unit,
                    prepMethod: ing.prepMethod.trim() || undefined,
                    sortOrder: j,
                  }
                : {
                    semipreparatRecipeId: ing.semipreparatRecipeId,
                    name: ing.name || 'Semipreparat',
                    quantity: parseDecimal(ing.quantity) ?? 0,
                    unit: ing.unit,
                    prepMethod: ing.prepMethod.trim() || undefined,
                    sortOrder: j,
                  },
            ),
        })),
      };
      if (isEdit && recipeId) {
        await recipesApi.update(recipeId, data);
        if (mode === 'publish') await recipesApi.setDraft(recipeId, false);
        await createPendingByproduct(recipeId);
        // Saved — clear the dirty baseline so the guard doesn't fire on navigate.
        setSnapshot(currentSnapshot);
        toast.success(mode === 'publish' ? 'Rețetă publicată' : 'Rețetă actualizată');
        router.push(`/recipes/${recipeId}`);
      } else {
        const created = await recipesApi.create({ ...data, isDraft: mode === 'draft' });
        await createPendingByproduct(created.id);
        setSnapshot(currentSnapshot);
        toast.success(mode === 'draft' ? 'Schiță salvată' : 'Rețetă creată cu succes');
        // Drafts are hidden from the default list — land on the detail page instead.
        router.push(mode === 'draft' ? `/recipes/${created.id}` : '/recipes');
      }
    } catch (err: unknown) {
      toast.error(isEdit ? 'Eroare la actualizarea rețetei' : 'Eroare la crearea rețetei', {
        description: (err as { message?: string }).message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Create the collected byproduct as a SEMIPREPARAT linked to the saved
  // recipe. A failure here must not fail the whole save — the recipe is
  // already persisted; surface it and let the user retry from the form.
  const createPendingByproduct = async (sourceId: string) => {
    if (!pendingByproduct) return;
    try {
      const bp = await recipesApi.create({
        name: pendingByproduct.name,
        type: RecipeType.SEMIPREPARAT,
        unit: pendingByproduct.unit,
        yieldQuantity: pendingByproduct.yieldQuantity,
        isByproduct: true,
        sourceRecipeId: sourceId,
      });
      setExistingByproducts((prev) => [...prev, { id: bp.id, name: bp.name }]);
      setPendingByproduct(null);
    } catch {
      toast.error('Rețeta a fost salvată, dar byproductul nu a putut fi creat');
    }
  };

  // Unified picker → write the chosen item into the targeted row.
  const handlePickMaterial = (m: RawMaterial) => {
    if (!pickerTarget) return;
    const { ci, ii } = pickerTarget;
    patchComponents((next) => {
      const target = next[ci].ingredients[ii];
      target.source = 'RAW';
      target.rawMaterialId = m.id;
      target.semipreparatRecipeId = '';
      // Prefill the unit with the material's stock unit; the user can still
      // switch to a sub-unit in the same family.
      target.name = m.title;
      target.unit = m.unit;
    });
  };
  const handlePickRecipe = (r: Recipe) => {
    if (!pickerTarget) return;
    const { ci, ii } = pickerTarget;
    patchComponents((next) => {
      const target = next[ci].ingredients[ii];
      target.source = 'SEMI';
      target.semipreparatRecipeId = r.id;
      target.rawMaterialId = '';
      target.name = r.name;
      // Semipreparate/byproducts keep the sub-recipe's yield unit.
      target.unit = r.unit;
    });
  };

  const byproductChecked = existingByproducts.length > 0 || !!pendingByproduct;
  const handleByproductToggle = (checked: boolean) => {
    if (checked) {
      if (!pendingByproduct) {
        setBpName('');
        setBpUnit(UnitType.GRAME);
        setBpQty('');
        setByproductDialogOpen(true);
      }
    } else {
      setPendingByproduct(null);
      if (existingByproducts.length > 0) {
        toast.info('Byproducturile existente se gestionează din lista de rețete');
      }
    }
  };

  const confirmByproduct = () => {
    const qty = parseDecimal(bpQty);
    if (!bpName.trim()) {
      toast.error('Introdu numele byproductului');
      return;
    }
    if (qty == null || qty <= 0) {
      toast.error('Introdu o cantitate rezultată validă (> 0)');
      return;
    }
    setPendingByproduct({ name: bpName.trim(), unit: bpUnit, yieldQuantity: qty });
    setByproductDialogOpen(false);
  };

  const addIngredient = (compIdx: number) => {
    patchComponents((next) => {
      next[compIdx].ingredients.push(newIngredient());
    });
  };

  const removeIngredient = (compIdx: number, ingIdx: number) => {
    patchComponents((next) => {
      next[compIdx].ingredients.splice(ingIdx, 1);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă...
      </div>
    );
  }

  const canSave = !saving && !!name;

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => guardedNavigate(() => router.back())}
          className="-ml-1.5 mb-1.5 inline-flex min-h-[32px] cursor-pointer items-center gap-0.5 rounded-lg px-1.5 text-[13.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <ChevronLeft className="h-[17px] w-[17px]" />
          Înapoi
        </button>
        <PageHead
          title={isEdit ? 'Editează rețetă' : 'Rețetă nouă'}
          meta={
            isEdit ? 'Modifică ingredientele și detaliile' : 'Ingrediente, randament și detalii'
          }
        >
          <IconAction
            icon={X}
            word="Anulează"
            label="Anulează"
            title="Renunță, nimic nu se salvează"
            onClick={() => guardedNavigate(() => router.back())}
          />
          {/* Create: save as a draft. Edit a draft: publish it. */}
          {!isEdit && (
            <IconAction
              icon={FileText}
              word="Schiță"
              label="Salvează ca schiță"
              title="Salvează rețeta ca schiță — nu apare încă în listă"
              onClick={() => void doSave('draft')}
              disabled={!canSave}
            />
          )}
          {isEdit && isDraft && (
            <IconAction
              icon={Send}
              word="Publică"
              label="Publică rețeta"
              title="Salvează și scoate rețeta din schiță"
              onClick={() => void doSave('publish')}
              disabled={!canSave}
            />
          )}
          <TutorialAnchor id="recipes.create.save">
            <span className="inline-flex">
              <IconAction
                icon={Save}
                word={isEdit ? 'Salvează' : 'Creează'}
                tone="primary"
                label={isEdit ? 'Salvează modificările' : 'Creează rețetă'}
                title={
                  canSave
                    ? isEdit
                      ? 'Salvează modificările rețetei'
                      : 'Salvează rețeta nouă'
                    : 'Dă-i un nume rețetei ca să o poți salva'
                }
                onClick={() => formRef.current?.requestSubmit()}
                disabled={!canSave}
                spinning={saving}
              />
            </span>
          </TutorialAnchor>
        </PageHead>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="max-w-3xl space-y-5">
        {/* ——— Informații generale ——— */}
        <div className={formCardClass}>
          <div className={formCardHeadClass}>Informații generale</div>
          <div className="space-y-5 border-t border-border px-6 pt-5 pb-6">
            {RECIPE_PHOTOS_ENABLED && isEdit && recipeId && can('update', 'Recipe') && (
              <ImageUpload
                shape="square"
                size={112}
                label="Poză rețetă"
                value={photoUrl}
                onUpload={async (file) => {
                  const r = await recipesApi.uploadPhoto(recipeId, file);
                  setPhotoUrl((r as { photoUrl?: string | null }).photoUrl ?? null);
                }}
                onRemove={async () => {
                  await recipesApi.deletePhoto(recipeId);
                  setPhotoUrl(null);
                }}
                fallback={
                  <span className="flex h-full w-full items-center justify-center bg-muted font-serif text-[40px] font-semibold text-muted-foreground">
                    {(name || '?').slice(0, 1).toUpperCase()}
                  </span>
                }
              />
            )}
            <TutorialAnchor id="recipes.create.open">
              <div className="space-y-1.5">
                <Label className={fieldLabelClass} htmlFor="recipe-name">
                  Nume *
                </Label>
                <Input
                  id="recipe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Tort Diplomat"
                  required
                />
              </div>
            </TutorialAnchor>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className={fieldLabelClass}>Tip</Label>
                <ChoiceChips
                  label="Tip rețetă"
                  value={type}
                  onChange={(v) => v && setType(v)}
                  options={(Object.values(RecipeType) as RecipeType[]).map((t) => ({
                    value: t,
                    label: recipeTypeLabels[t],
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClass}>Categorie</Label>
                <ChoiceChips
                  label="Categorie"
                  allowClear
                  value={category}
                  onChange={(v) => setCategory(v ?? '')}
                  options={availableCategories.map((c) => ({ value: c, label: c }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className={fieldLabelClass}>Unitate</Label>
                <ChoiceChips
                  label="Unitate"
                  value={unit}
                  onChange={(v) => v && setUnit(v)}
                  options={unitOptions(unit)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClass} htmlFor="recipe-yield">
                  Randament
                </Label>
                {/* Unit suffix mirrors the selected "Unitate" so the number reads unambiguously. */}
                <div className="relative">
                  <Input
                    id="recipe-yield"
                    type="text"
                    inputMode="decimal"
                    className="w-full pr-16 text-right"
                    placeholder="Cantitate rezultat"
                    value={yieldQuantity}
                    onChange={(e) => setYieldQuantity(e.target.value)}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] font-semibold text-muted-foreground">
                    {unitTypeLabels[unit] ?? unit}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className={fieldLabelClass} htmlFor="recipe-loss">
                  Pierderi estimate (%)
                </Label>
                <Input
                  id="recipe-loss"
                  type="text"
                  inputMode="decimal"
                  placeholder="ex: 5"
                  value={estimatedLossPercent}
                  onChange={(e) => setEstimatedLossPercent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClass}>Termen de valabilitate</Label>
                <ChoiceChips
                  label="Termen de valabilitate"
                  value={shelfLifeMode}
                  onChange={(v) => v && setShelfLifeMode(v)}
                  options={SHELF_LIFE_OPTIONS}
                />
                {shelfLifeMode === 'custom' && (
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    placeholder="Luni (1–120), ex: 4"
                    aria-label="Luni (1-120)"
                    value={shelfLifeCustom}
                    onChange={(e) => setShelfLifeCustom(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label className={fieldLabelClass} htmlFor="recipe-weight">
                  Greutate produs finit (g)
                  <span title={FINISHED_WEIGHT_HELP} className="inline-flex cursor-help">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
                  </span>
                </Label>
                <Input
                  id="recipe-weight"
                  type="text"
                  inputMode="decimal"
                  placeholder="ex: 850"
                  value={finishedWeightGrams}
                  onChange={(e) => setFinishedWeightGrams(e.target.value)}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Greutatea șarjei după preparare — pentru valorile nutriționale la 100 g.
                </p>
              </div>

              {/* Piece equivalent — only when this recipe yields BUCATI, so it can
                  be used as an ingredient in a mass/volume unit (1 bucată = N unit). */}
              {unit === UnitType.BUCATI && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className={fieldLabelClass} htmlFor="recipe-piece-eq">
                    O bucată reprezintă
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="recipe-piece-eq"
                      type="text"
                      inputMode="decimal"
                      className="w-full max-w-[200px] text-right"
                      placeholder="ex: 2"
                      value={pieceEquivalentQty}
                      onChange={(e) => setPieceEquivalentQty(e.target.value)}
                    />
                  </div>
                  <ChoiceChips
                    label="Unitatea echivalentului"
                    value={pieceEquivalentUnit}
                    onChange={(v) => v && setPieceEquivalentUnit(v)}
                    options={unitOptions(pieceEquivalentUnit).filter(
                      (o) => o.value !== UnitType.BUCATI,
                    )}
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Cât cântărește / conține o bucată (ex: 1 bucată = 2 kg). Permite folosirea
                    semipreparatului la gramaj în alte rețete. Lasă gol dacă nu e cazul.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ——— Componente și ingrediente ——— */}
        <div className={formCardClass}>
          <div className={formCardHeadClass}>Componente și ingrediente</div>

          {components.map((comp, ci) => (
            <div key={comp._id} className="border-t border-border">
              {/* Component header: subtle inline name field + delete (hidden on the last one). */}
              <div className="flex items-center gap-2 px-6 pt-3">
                <Input
                  className="h-8 flex-1 border-transparent bg-transparent px-1.5 text-[13.5px] font-semibold shadow-none placeholder:font-normal focus-visible:border-ring dark:bg-transparent"
                  value={comp.name}
                  onChange={(e) =>
                    patchComponents((next) => {
                      next[ci].name = e.target.value;
                    })
                  }
                  placeholder="Numele componentei (ex. Blat, Cremă, Glazură)"
                  aria-label="Numele componentei"
                />
                {components.length > 1 && (
                  <IconAction
                    row
                    icon={Trash2}
                    label="Șterge componenta"
                    onClick={() => setComponents(components.filter((_, i) => i !== ci))}
                  />
                )}
              </div>

              {/* Ingredients: fixed aligned columns; scrolls horizontally on narrow screens. */}
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div className="grid grid-cols-[1fr_110px_104px_36px] items-center gap-2 px-6 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-[.5px] text-muted-foreground uppercase">
                    <span>Ingredient</span>
                    <span className="text-right">Cantitate</span>
                    <span>U.M.</span>
                    <span aria-hidden="true" />
                  </div>

                  {comp.ingredients.map((ing, ii) => (
                    <div
                      key={ing._id}
                      className="grid grid-cols-[1fr_110px_104px_36px] items-center gap-2 px-6 py-1"
                    >
                      {/* One button per row — opens the unified searchable modal
                          (materii prime / semipreparate / byproduct). */}
                      <button
                        type="button"
                        onClick={() => setPickerTarget({ ci, ii })}
                        aria-label={ing.name ? `Ingredient: ${ing.name}` : 'Alege ingredient'}
                        aria-haspopup="dialog"
                        className="flex h-[42px] w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-[var(--radius-ctl)] border border-input bg-transparent py-1 pr-2.5 pl-[13px] text-left text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
                      >
                        {ing.name ? (
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <Truncate text={ing.name} className="flex-1 font-medium" />
                            {ing.source === 'SEMI' && (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                {semipreparate.find((r) => r.id === ing.semipreparatRecipeId)
                                  ?.isByproduct
                                  ? 'byproduct'
                                  : 'semipreparat'}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="truncate text-muted-foreground">Selectează…</span>
                        )}
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>

                      <Input
                        type="text"
                        inputMode="decimal"
                        className="w-full text-right"
                        placeholder="0"
                        aria-label="Cantitate"
                        value={ing.quantity}
                        onChange={(e) =>
                          patchComponents((next) => {
                            next[ci].ingredients[ii].quantity = e.target.value;
                          })
                        }
                      />

                      {ing.source === 'SEMI' ? (
                        // Semipreparate keep the sub-recipe's yield unit (same rule
                        // as iOS) — a free unit here breaks cost/stock conversion.
                        <span className="text-center text-[13px] text-muted-foreground">
                          {unitTypeLabels[ing.unit] ?? ing.unit}
                        </span>
                      ) : (
                        <ChoiceListField
                          title="Unitate de măsură"
                          aria-label="Unitate de măsură"
                          searchPlaceholder="Caută unitate…"
                          value={ing.unit}
                          options={unitsForMeasure(ing.unit).map((u) => ({
                            value: u,
                            label: unitTypeLabels[u],
                          }))}
                          onChange={(v) =>
                            patchComponents((next) => {
                              next[ci].ingredients[ii].unit = v as UnitType;
                            })
                          }
                        />
                      )}

                      <IconAction
                        row
                        icon={Trash2}
                        label="Șterge ingredientul"
                        onClick={() => removeIngredient(ci, ii)}
                      />

                      {/* Detalii de preparare per ingredient (prepMethod) —
                          același câmp opțional pe care îl trimite și iOS. */}
                      <Input
                        className="col-span-3 -mt-0.5 h-8 border-transparent bg-transparent px-1.5 text-[12.5px] shadow-none placeholder:font-normal focus-visible:border-ring dark:bg-transparent"
                        value={ing.prepMethod}
                        onChange={(e) =>
                          patchComponents((next) => {
                            next[ci].ingredients[ii].prepMethod = e.target.value;
                          })
                        }
                        placeholder="Detalii preparare (opțional, ex: cuburi, cernut)"
                        aria-label="Detalii preparare"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <TutorialAnchor id="recipes.create.ingredients">
                <button
                  type="button"
                  onClick={() => addIngredient(ci)}
                  className="flex w-full cursor-pointer items-center gap-1.5 px-6 py-[11px] text-[13px] font-semibold text-primary transition-colors hover:bg-muted/50"
                >
                  <CirclePlus className="h-4 w-4" />
                  Adaugă ingredient
                </button>
              </TutorialAnchor>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setComponents([...components, newComponent()])}
            className="flex w-full cursor-pointer items-center gap-1.5 border-t border-border px-6 py-3 text-[13px] font-semibold text-primary transition-colors hover:bg-muted/50"
          >
            <CirclePlus className="h-4 w-4" />
            Adaugă componentă
          </button>
        </div>

        {/* ——— Byproduct ——— */}
        <TutorialAnchor id="recipes.create.byproduct">
          <div className={`space-y-3 px-6 py-5 ${formCardClass}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-bold tracking-[-.1px]">Byproduct</div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Rețeta lasă în urmă un semipreparat refolosibil (ex. resturi de blat). Se salvează
                  ca semipreparat marcat byproduct, odată cu rețeta.
                </p>
              </div>
              <Switch
                checked={byproductChecked}
                onCheckedChange={handleByproductToggle}
                aria-label="Rețeta lasă un byproduct"
              />
            </div>
            {existingByproducts.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-[13px]"
              >
                <span className="truncate">{b.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  byproduct existent
                </span>
              </div>
            ))}
            {pendingByproduct && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
                <span className="truncate">
                  {pendingByproduct.name}{' '}
                  <span className="text-muted-foreground">
                    — {decimalInputText(pendingByproduct.yieldQuantity)}{' '}
                    {unitTypeLabels[pendingByproduct.unit]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBpName(pendingByproduct.name);
                    setBpUnit(pendingByproduct.unit);
                    setBpQty(decimalInputText(pendingByproduct.yieldQuantity));
                    setByproductDialogOpen(true);
                  }}
                  className="shrink-0 text-[12px] font-semibold text-primary hover:underline"
                >
                  Modifică
                </button>
              </div>
            )}
          </div>
        </TutorialAnchor>
      </form>
      {dialog}

      {/* Unified ingredient picker modal (materii prime / semipreparate / byproduct). */}
      <IngredientPickerDialog
        open={pickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPickerTarget(null);
        }}
        materials={materials}
        semipreparate={semipreparate.filter((r) => !r.isByproduct)}
        byproducts={semipreparate.filter((r) => !!r.isByproduct)}
        onPickMaterial={handlePickMaterial}
        onPickRecipe={handlePickRecipe}
      />

      {/* Byproduct mini-form: collected now, created as a SEMIPREPARAT
          (isByproduct) right after the recipe saves. */}
      <Dialog
        open={byproductDialogOpen}
        onOpenChange={(open) => {
          setByproductDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Byproduct nou</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bp-name" className={fieldLabelClass}>
                Nume
              </Label>
              <Input
                id="bp-name"
                value={bpName}
                onChange={(e) => setBpName(e.target.value)}
                placeholder="ex. Resturi de blat"
              />
            </div>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bp-qty" className={fieldLabelClass}>
                  Cantitate rezultată
                </Label>
                <Input
                  id="bp-qty"
                  type="text"
                  inputMode="decimal"
                  value={bpQty}
                  onChange={(e) => setBpQty(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClass}>Unitate</Label>
                <ChoiceChips
                  label="Unitatea byproductului"
                  value={bpUnit}
                  onChange={(v) => v && setBpUnit(v)}
                  options={unitOptions(bpUnit)}
                />
              </div>
            </div>
          </div>
          <DialogFooter showCloseButton={false}>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Închide fără să adaugi byproductul"
              onClick={() => setByproductDialogOpen(false)}
            />
            <IconAction
              icon={Plus}
              word="Adaugă"
              tone="primary"
              label="Adaugă byproduct"
              title="Byproductul se creează odată cu rețeta"
              onClick={confirmByproduct}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
