'use client';

import { useEffect, useState } from 'react';
import {
  organization as orgApi,
  rawMaterials as rawMaterialsApi,
  recipes as recipesApi,
} from '@/lib/api';
import type { NutritionValues, RecipeNutrition } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconAction, Pill } from '@/app/(dashboard)/stock/_ui/parts';
import { Apple, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Allergen, ALLERGEN_LABELS } from '@horae/shared-types';
import { formatUnitQty } from '@/lib/utils';

/**
 * Feature switch: nutrition UI is hidden everywhere until an admin enables
 * Organization.nutritionEnabled in Settings.
 */
export function useNutritionEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    orgApi
      .get()
      .then((o) => setEnabled(!!o.nutritionEnabled))
      .catch(() => {});
  }, []);
  return enabled;
}

// Standard nutrition-label order: energy, fat (+saturates), carbs (+sugars),
// protein, fibre, salt. `sub` rows render indented under their parent.
const NUTRITION_FIELDS: {
  key: keyof NutritionValues;
  label: string;
  unit: string;
  sub?: boolean;
}[] = [
  { key: 'calories', label: 'Valoare energetică', unit: 'kcal' },
  { key: 'fat', label: 'Grăsimi', unit: 'g' },
  { key: 'saturatedFat', label: 'din care acizi grași saturați', unit: 'g', sub: true },
  { key: 'carbs', label: 'Glucide', unit: 'g' },
  { key: 'sugars', label: 'din care zaharuri', unit: 'g', sub: true },
  { key: 'protein', label: 'Proteine', unit: 'g' },
  { key: 'fiber', label: 'Fibre', unit: 'g' },
  { key: 'salt', label: 'Sare', unit: 'g' },
];

/** kcal → kJ (1 kcal = 4.184 kJ) for the energy row's dual display. */
const kj = (kcal: number) => kcal * 4.184;

/** Editable nutrition (per 100g/100ml) card for a raw material detail page. */
export function NutritionEditorCard({
  rawMaterialId,
  initial,
  initialAllergens,
  canEdit,
}: {
  rawMaterialId: string;
  initial: NutritionValues | null | undefined;
  initialAllergens?: string[];
  canEdit: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [allergens, setAllergens] = useState<string[]>(initialAllergens ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAllergens(initialAllergens ?? []);
  }, [initialAllergens]);

  useEffect(() => {
    const v: Record<string, string> = {};
    for (const f of NUTRITION_FIELDS) {
      const n = initial?.[f.key];
      v[f.key] = n != null ? String(n) : '';
    }
    setValues(v);
  }, [initial]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const nutrition: NutritionValues = {};
      let any = false;
      for (const f of NUTRITION_FIELDS) {
        const raw = values[f.key];
        if (raw !== '' && raw != null) {
          const n = parseFloat(raw);
          if (!isNaN(n)) {
            nutrition[f.key] = n;
            any = true;
          }
        }
      }
      await rawMaterialsApi.update(rawMaterialId, {
        nutrition: any ? nutrition : null,
        allergens,
      } as Parameters<typeof rawMaterialsApi.update>[1]);
      toast.success('Valori nutriționale salvate');
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  // Nutrition-label layout: label left (sub-rows indented), compact input with
  // its unit on the right; two columns on wide screens. Save lives in the
  // card header as a worded button.
  const half = Math.ceil(NUTRITION_FIELDS.length / 2);
  const columns = [NUTRITION_FIELDS.slice(0, half), NUTRITION_FIELDS.slice(half)];
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4 pt-5">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <Apple className="h-4 w-4" aria-hidden />
            Valori nutriționale
          </span>
          <span className="text-[12.5px] text-muted-foreground">per 100 g / 100 ml</span>
        </div>
        {canEdit && (
          <IconAction
            icon={saving ? Loader2 : Save}
            spinning={saving}
            disabled={saving}
            tone="primary"
            word="Salvează"
            label="Salvează valorile nutriționale"
            title="Salvează valorile și alergenii"
            onClick={handleSave}
          />
        )}
      </div>
      <div className="grid gap-x-8 border-t border-border px-6 py-2 md:grid-cols-2">
        {columns.map((col, ci) => (
          <dl key={ci} className="m-0 flex flex-col">
            {col.map((f) => (
              <div
                key={f.key}
                className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
              >
                <dt
                  className={`text-[13.5px] ${f.sub ? 'pl-4 text-muted-foreground' : 'font-semibold'}`}
                >
                  <Label htmlFor={`nut-${f.key}`} className="font-[inherit] text-[inherit]">
                    {f.label}
                  </Label>
                </dt>
                <dd className="m-0 flex flex-none items-center gap-1.5">
                  <Input
                    id={`nut-${f.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    placeholder="—"
                    value={values[f.key] ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className="h-9 w-24 text-right tabular-nums"
                  />
                  <span className="w-8 text-[12px] text-muted-foreground">{f.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-border px-6 pb-5 pt-4">
        <span className="text-[13px] font-semibold">
          Alergeni
          <span className="font-normal text-muted-foreground">
            {' '}
            · Reg. UE 1169/2011, se propagă în produsele care folosesc materia
          </span>
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Alergeni">
          {Object.values(Allergen).map((a) => (
            <Pill
              key={a}
              on={allergens.includes(a)}
              onClick={() =>
                canEdit &&
                setAllergens((prev) =>
                  prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
                )
              }
            >
              {ALLERGEN_LABELS[a]}
            </Pill>
          ))}
        </div>
      </div>
    </Card>
  );
}

const fmt = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 1 });

/** "Conține: soia (Ciocolată), lapte (Unt)" line — propagated from the tree. */
function AllergenLine({ data }: { data: RecipeNutrition }) {
  if (!data.allergens?.length) return null;
  return (
    <p className="text-xs">
      <span className="font-medium">Conține alergeni: </span>
      {data.allergens
        .map(
          (a) =>
            `${ALLERGEN_LABELS[a.allergen as Allergen] ?? a.allergen} (${a.sources.join(', ')})`,
        )
        .join(', ')}
    </p>
  );
}

/** Aggregated nutrition card for a recipe detail page. */
export function RecipeNutritionCard({ recipeId }: { recipeId: string }) {
  const [data, setData] = useState<RecipeNutrition | null>(null);

  useEffect(() => {
    recipesApi
      .nutrition(recipeId)
      .then(setData)
      .catch(() => {});
  }, [recipeId]);

  if (!data) return null;

  // Explicit empty state — a silently missing card reads as a bug.
  if (data.coveredCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Apple className="h-4 w-4" />
            Valori nutriționale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Nicio materie primă din rețetă nu are valori nutriționale completate. Adaugă valorile
            (per 100 g) pe paginile materiilor prime
            {data.missing.length > 0 ? `: ${data.missing.map((m) => m.title).join(', ')}.` : '.'}
          </p>
          <AllergenLine data={data} />
        </CardContent>
      </Card>
    );
  }

  const cols: { label: string; values: Required<NutritionValues> }[] = [
    { label: `Total (${formatUnitQty(data.yieldQuantity, data.yieldUnit)})`, values: data.total },
    { label: 'Per bucată', values: data.perPiece },
    ...(data.per100g ? [{ label: 'Per 100g', values: data.per100g }] : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Apple className="h-4 w-4" />
          Valori nutriționale
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-4 font-medium"></th>
                {cols.map((c) => (
                  <th key={c.label} className="py-1.5 pr-4 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NUTRITION_FIELDS.map((f) => (
                <tr key={f.key} className="border-b last:border-0">
                  <td className={`py-1.5 pr-4 ${f.sub ? 'pl-4 text-muted-foreground' : ''}`}>
                    {f.label}
                  </td>
                  {cols.map((c) => (
                    <td key={c.label} className="py-1.5 pr-4 text-right">
                      {f.key === 'calories'
                        ? `${fmt(kj(c.values.calories ?? 0))} kJ / ${fmt(c.values.calories ?? 0)} kcal`
                        : `${fmt(c.values[f.key] ?? 0)} ${f.unit}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Calcul parțial ({data.coveredCount}/{data.ingredientCount} ingrediente) — fără date
            pentru: {data.missing.map((m) => m.title).join(', ')}.
          </p>
        )}
        {data.per100g &&
          (data.per100Basis === 'finished' ? (
            <p className="text-xs text-muted-foreground">
              Valorile la 100 g sunt calculate pe greutatea produsului finit (
              {fmt(data.finishedWeightGrams ?? 0)} g).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Valorile la 100 g sunt calculate pe greutatea ingredientelor. Adaugă greutatea
              produsului finit în rețetă pentru valori corecte după coacere.
            </p>
          ))}
        <AllergenLine data={data} />
        <p className="text-xs text-muted-foreground">Valorile sunt cu scop informativ.</p>
      </CardContent>
    </Card>
  );
}
