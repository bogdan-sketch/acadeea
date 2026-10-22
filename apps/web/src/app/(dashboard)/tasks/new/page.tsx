'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  tasks as tasksApi,
  recipes as recipesApi,
  users as usersApi,
  locations as locationsApi,
  organization as orgApi,
} from '@/lib/api';
import { pickDefaultLocation } from '@/lib/default-location';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import type {
  Recipe,
  User,
  CreateTaskRequest,
  TaskMaterialRequirement,
  Location,
} from '@/lib/types';
import { taskVisibilityLabels, unitTypeLabels } from '@/lib/constants';
import { TaskVisibility, UnitType } from '@horae/shared-types';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField, type ChoiceListOption } from '@/components/choice-list';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Save,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUnitQty } from '@/lib/utils';

const PRIORITY_OPTIONS = [
  { value: '1', label: '1 — Normal', hint: 'Se face în ordinea obișnuită' },
  { value: '2', label: '2 — Important', hint: 'Trece înaintea taskurilor normale' },
  { value: '3', label: '3 — Urgent', hint: 'Primul pe listă' },
];

/** One product row in the "Mai multe produse" mode. */
interface MultiRow {
  recipeId: string;
  targetQuantity: number;
  unit: UnitType;
}

const emptyRow = (): MultiRow => ({
  recipeId: '',
  targetQuantity: 0,
  unit: UnitType.KILOGRAME,
});

export default function NewTaskPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);
  const [userList, setUserList] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);

  // "Un produs" (default) | "Mai multe produse" — multi creates a task family
  // (grup) via POST /tasks/multi.
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [rows, setRows] = useState<MultiRow[]>([emptyRow()]);
  const [groupLabel, setGroupLabel] = useState('');
  const [includeSemipreparate, setIncludeSemipreparate] = useState(false);

  const [form, setForm] = useState<CreateTaskRequest>({
    recipeId: '',
    targetQuantity: 0,
    targetUnit: UnitType.KILOGRAME,
  });
  const [notes, setNotes] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [priority, setPriority] = useState('1');
  // Nume custom (gol = numele rețetei) + cine vede taskul în afara
  // administratorilor (ei văd tot): doar asignatul (implicit), toată lumea,
  // sau anumite persoane (+ asignatul).
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<TaskVisibility>(TaskVisibility.ASSIGNED);
  const [visibleToIds, setVisibleToIds] = useState<string[]>([]);
  const [materials, setMaterials] = useState<TaskMaterialRequirement[]>([]);
  const [checkingStock, setCheckingStock] = useState(false);
  const [locationList, setLocationList] = useState<Location[]>([]);

  // Dirty tracking: snapshot the form once the async prefill has settled, then
  // compare to current. The default production location is prefilled
  // programmatically below, so the baseline is captured AFTER it lands (via the
  // `locationsLoaded` flag) — that prefill isn't a user edit.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [baselineReady, setBaselineReady] = useState(false);
  const currentSnapshot = JSON.stringify({
    form,
    notes,
    plannedDate,
    dueDate,
    assignedToId,
    priority,
    title,
    visibility,
    visibleToIds,
    // `mode` is deliberately NOT tracked — switching the tab alone isn't an edit.
    rows,
    groupLabel,
    includeSemipreparate,
  });
  useEffect(() => {
    if (!baselineReady && locationsLoaded) {
      setSnapshot(currentSnapshot);
      setBaselineReady(true);
    }
  }, [baselineReady, locationsLoaded, currentSnapshot]);
  const isDirty = snapshot !== null && currentSnapshot !== snapshot;
  const { guardedNavigate, dialog } = useUnsavedChanges(isDirty);

  useEffect(() => {
    Promise.all([
      recipesApi.list({ limit: 100 }),
      usersApi.list({ limit: 100, isActive: true }),
    ]).then(([r, u]) => {
      // Pickerul de rețete e alfabetic (locale ro, case-insensitive).
      setRecipeList(
        [...r.data].sort((a, b) => a.name.localeCompare(b.name, 'ro', { sensitivity: 'base' })),
      );
      setUserList(u.data);
      // "Pornește rețeta" (recipe card / detail) lands here with ?recipeId=.
      const wanted = new URLSearchParams(window.location.search).get('recipeId');
      const recipe = wanted ? r.data.find((x) => x.id === wanted) : undefined;
      if (recipe) {
        setForm((f) => ({
          ...f,
          recipeId: recipe.id,
          targetUnit: recipe.unit || f.targetUnit,
          targetQuantity: recipe.yieldQuantity || f.targetQuantity,
        }));
      }
    });
    // Production locations — prefer the user's own, but fall back to all
    // locations when the user has none assigned (myLocations resolves with an
    // empty array, not an error), otherwise the picker renders no options.
    Promise.all([
      locationsApi
        .myLocations()
        .then((locs) => (locs.length > 0 ? locs : locationsApi.list()))
        .catch(() => locationsApi.list()),
      orgApi.get().catch(() => null),
    ])
      .then(([locs, org]) => {
        setLocationList(locs);
        // Prefill without touching the dirty baseline — the "ready" effect
        // captures the baseline once `locationsLoaded` flips. Default =
        // Organization.defaultLocationId (admin-configurable, ClickUp: loc
        // implicit) dacă e setat și activ, altfel "Laborator" (case-insensitive)
        // dacă există, altfel prima din listă (comportamentul vechi). Nu există
        // un default per-user salvat în web, deci regula se aplică direct.
        setForm((f) =>
          f.locationId ? f : { ...f, locationId: pickDefaultLocation(locs, org)?.id },
        );
        setLocationsLoaded(true);
      })
      .catch(() => setLocationsLoaded(true));
  }, []);

  const selectedRecipe = recipeList.find((r) => r.id === form.recipeId);

  // Live stock check — recompute scaled requirements as recipe/quantity change,
  // debounced. Best-effort: failures just clear the warning, never block.
  useEffect(() => {
    if (!form.recipeId || !form.targetQuantity || form.targetQuantity <= 0) {
      setMaterials([]);
      return;
    }
    let cancelled = false;
    setCheckingStock(true);
    const t = setTimeout(() => {
      tasksApi
        .previewRequirements(form.recipeId, form.targetQuantity, form.targetUnit, form.locationId)
        .then((reqs) => {
          if (!cancelled) setMaterials(reqs);
        })
        .catch(() => {
          if (!cancelled) setMaterials([]);
        })
        .finally(() => {
          if (!cancelled) setCheckingStock(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.recipeId, form.targetQuantity, form.targetUnit, form.locationId]);

  const insufficient = materials.filter((m) => !m.sufficient);

  const validRows = rows.filter((r) => r.recipeId && r.targetQuantity > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Inputs are date-only; the API stores DateTime — send local midnight.
    const common = {
      notes: notes || undefined,
      plannedDate: plannedDate ? new Date(`${plannedDate}T00:00:00`).toISOString() : undefined,
      dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : undefined,
      assignedToId: assignedToId || undefined,
      priority: parseInt(priority) || 1,
      locationId: form.locationId,
      visibility,
      visibleToIds: visibility === TaskVisibility.SELECTED ? visibleToIds : undefined,
    };
    try {
      if (mode === 'multi') {
        const res = await tasksApi.createMulti({
          items: validRows.map((r) => ({
            recipeId: r.recipeId,
            targetQuantity: r.targetQuantity,
            targetUnit: r.unit,
          })),
          groupLabel: groupLabel.trim() || undefined,
          includeSemipreparate,
          ...common,
        });
        setSnapshot(currentSnapshot);
        toast.success(
          res.tasks.length === 1 ? '1 task creat' : `${res.tasks.length} taskuri create`,
        );
        router.push('/tasks');
      } else {
        await tasksApi.create({ ...form, ...common, title: title.trim() || undefined });
        setSnapshot(currentSnapshot);
        toast.success('Task creat cu succes');
        router.push('/tasks');
      }
    } catch (err: unknown) {
      // Surface the API reason (which recipe/field) instead of a generic toast.
      toast.error(
        mode === 'multi' ? 'Eroare la crearea taskurilor' : 'Eroare la crearea taskului',
        {
          description: (err as { message?: string }).message,
        },
      );
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, patch: Partial<MultiRow>) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const canSubmit = !saving && (mode === 'multi' ? validRows.length > 0 : !!form.recipeId);

  const recipeOptions: ChoiceListOption[] = recipeList.map((r) => ({
    value: r.id,
    label: r.name,
    hint: r.category ?? undefined,
    meta:
      r.yieldQuantity != null
        ? `${r.yieldQuantity} ${unitTypeLabels[r.unit] ?? r.unit}`
        : undefined,
  }));

  const assigneeOptions = [
    { value: '', label: 'Neasignat' },
    ...userList.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

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
        <PageHead title="Task nou" meta="Planifică o producție">
          <IconAction
            icon={X}
            word="Anulează"
            label="Anulează taskul"
            title="Renunță, nimic nu se salvează"
            onClick={() => guardedNavigate(() => router.back())}
          />
          <IconAction
            icon={Save}
            word="Creează"
            tone="primary"
            label={mode === 'multi' ? 'Creează taskuri' : 'Creează task'}
            title={
              canSubmit
                ? mode === 'multi'
                  ? `Creează ${validRows.length} ${validRows.length === 1 ? 'task' : 'taskuri'} în grup`
                  : 'Salvează taskul și pune-l pe panoul de producție'
                : 'Alege o rețetă ca să poți crea taskul'
            }
            onClick={() => formRef.current?.requestSubmit()}
            disabled={!canSubmit}
            spinning={saving}
          />
        </PageHead>
      </div>
      {dialog}

      <div className="max-w-2xl space-y-4">
        {/* Mod: un singur produs (default) sau o familie de taskuri (grup). */}
        <TutorialAnchor id="tasks.create.mode">
          <div
            role="group"
            aria-label="Mod"
            className="inline-flex gap-0.5 rounded-[var(--radius-ctl)] border border-input bg-card p-[3px]"
          >
            {(
              [
                ['single', 'Un produs'],
                ['multi', 'Mai multe produse'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`h-[34px] cursor-pointer rounded-lg px-[15px] text-[13px] font-semibold transition-colors ${
                  mode === m
                    ? 'bg-accent text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </TutorialAnchor>

        <Card>
          <CardContent className="pt-6">
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {mode === 'single' ? (
                <>
                  {/* Primul câmp: numele taskului (gol = numele rețetei). */}
                  <div className="space-y-2">
                    <Label htmlFor="task-title">Nume task (opțional)</Label>
                    <Input
                      id="task-title"
                      placeholder="ex. Tort nuntă Popescu — gol = numele rețetei"
                      value={title}
                      maxLength={120}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <TutorialAnchor id="tasks.create.selectRecipe">
                    <div className="space-y-2">
                      <Label>Rețetă *</Label>
                      <ChoiceListField
                        title="Alege rețeta"
                        placeholder="Selectează rețeta"
                        searchPlaceholder="Caută rețetă…"
                        emptyText="Nicio rețetă găsită."
                        value={form.recipeId}
                        options={recipeOptions}
                        onChange={(v) => {
                          const recipe = recipeList.find((r) => r.id === v);
                          setForm({
                            ...form,
                            recipeId: v,
                            targetUnit: recipe?.unit || form.targetUnit,
                            // Prefill with the recipe's own yield (e.g. 100 buc) so the
                            // user starts from the real output and only edits to scale.
                            targetQuantity: recipe?.yieldQuantity || form.targetQuantity,
                          });
                        }}
                      />
                    </div>
                  </TutorialAnchor>

                  <div className="grid grid-cols-2 gap-4">
                    <TutorialAnchor id="tasks.create.quantity">
                      <div className="space-y-2">
                        <Label htmlFor="task-qty">Cantitate *</Label>
                        <Input
                          id="task-qty"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.targetQuantity || ''}
                          onChange={(e) =>
                            setForm({ ...form, targetQuantity: parseFloat(e.target.value) || 0 })
                          }
                          required
                        />
                      </div>
                    </TutorialAnchor>
                    <div className="space-y-2">
                      <Label htmlFor="task-unit">Unitate</Label>
                      <Input
                        id="task-unit"
                        value={
                          selectedRecipe
                            ? unitTypeLabels[selectedRecipe.unit] || selectedRecipe.unit
                            : unitTypeLabels[form.targetUnit] || form.targetUnit
                        }
                        disabled
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Familie de taskuri — un rând per produs. */}
                  <TutorialAnchor id="tasks.multi.rows">
                    <div className="space-y-2">
                      <Label>Produse *</Label>
                      <div className="space-y-2">
                        {rows.map((row, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[1fr_88px_72px_32px] items-center gap-2 max-sm:grid-cols-[1fr_72px_32px]"
                          >
                            <ChoiceListField
                              title="Alege rețeta"
                              placeholder="Selectează rețeta"
                              searchPlaceholder="Caută rețetă…"
                              emptyText="Nicio rețetă găsită."
                              aria-label={`Rețeta ${i + 1}`}
                              value={row.recipeId}
                              options={recipeOptions}
                              onChange={(v) => {
                                const recipe = recipeList.find((r) => r.id === v);
                                updateRow(i, {
                                  recipeId: v,
                                  // Unitatea vine din rețetă, ca în modul single.
                                  unit: recipe?.unit || row.unit,
                                  targetQuantity: recipe?.yieldQuantity || row.targetQuantity,
                                });
                              }}
                            />
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Cant."
                              aria-label="Cantitate"
                              value={row.targetQuantity || ''}
                              onChange={(e) =>
                                updateRow(i, { targetQuantity: parseFloat(e.target.value) || 0 })
                              }
                            />
                            <span className="truncate text-[13px] text-muted-foreground max-sm:hidden">
                              {row.recipeId ? unitTypeLabels[row.unit] || row.unit : '—'}
                            </span>
                            <IconAction
                              row
                              icon={Trash2}
                              label="Șterge rândul"
                              disabled={rows.length === 1}
                              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                            />
                          </div>
                        ))}
                      </div>
                      <IconAction
                        icon={Plus}
                        word="Produs"
                        label="Adaugă produs"
                        title="Adaugă încă un rând de produs în grup"
                        onClick={() => setRows((rs) => [...rs, emptyRow()])}
                      />
                    </div>
                  </TutorialAnchor>

                  <TutorialAnchor id="tasks.multi.group">
                    <div className="space-y-2">
                      <Label htmlFor="task-group">Nume grup (opțional)</Label>
                      <Input
                        id="task-group"
                        placeholder="ex. Sosuri înghețată"
                        value={groupLabel}
                        onChange={(e) => setGroupLabel(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Numele apare ca etichetă pe taskurile din grup.
                      </p>
                    </div>
                  </TutorialAnchor>

                  <TutorialAnchor id="tasks.multi.family">
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-ctl)] border border-input p-3.5">
                      <span>
                        <span className="block text-sm font-semibold">
                          Creează și taskuri pentru semipreparate
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Adaugă automat în grup taskuri pentru semipreparatele necesare.
                        </span>
                      </span>
                      <Switch
                        checked={includeSemipreparate}
                        onCheckedChange={(v) => setIncludeSemipreparate(v === true)}
                      />
                    </label>
                  </TutorialAnchor>
                </>
              )}

              <TutorialAnchor id="tasks.create.location">
                <div className="space-y-2">
                  <Label>Locație producție</Label>
                  <ChoiceChips
                    label="Locație producție"
                    value={form.locationId || ''}
                    onChange={(v) => v && setForm({ ...form, locationId: v })}
                    options={locationList.map((l) => ({ value: l.id, label: l.name }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stocul se ia din această locație, iar produsul finit intră aici.
                  </p>
                </div>
              </TutorialAnchor>

              {/* Live stock check — warns when the requested quantity exceeds stock (doar modul single). */}
              {mode === 'single' && form.recipeId && form.targetQuantity > 0 && (
                <div className="rounded-[var(--radius-ctl)] border border-input p-3.5 text-sm">
                  {checkingStock ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Verific stocul...
                    </span>
                  ) : insufficient.length > 0 ? (
                    <div className="space-y-2">
                      <span className="flex items-center gap-2 font-semibold text-destructive">
                        <AlertTriangle className="h-4 w-4" /> Stoc insuficient pentru cantitatea
                        cerută
                      </span>
                      {insufficient.map((m) => (
                        <div
                          key={m.rawMaterialId || m.recipeId}
                          className="flex justify-between text-muted-foreground"
                        >
                          <span>{m.title}</span>
                          <span className="text-destructive">
                            necesar {formatUnitQty(m.needed, m.unit)} · disponibil{' '}
                            {formatUnitQty(m.available, m.unit)}
                          </span>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Poți crea taskul, dar nu va putea porni până nu ai destul stoc.
                      </p>
                    </div>
                  ) : materials.length > 0 ? (
                    <span className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="h-4 w-4" /> Stoc suficient pentru cantitatea cerută
                    </span>
                  ) : null}
                </div>
              )}

              <div className="space-y-2">
                <Label>Prioritate</Label>
                <ChoiceChips
                  label="Prioritate"
                  value={priority}
                  onChange={(v) => v && setPriority(v)}
                  options={PRIORITY_OPTIONS}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Termen limită</Label>
                  {/* Date-only — production plans by day, the time was noise. */}
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    aria-label="Termen limită"
                    className="h-[42px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data planificare (start producție)</Label>
                  <DatePicker
                    value={plannedDate}
                    onChange={setPlannedDate}
                    aria-label="Data planificării"
                    className="h-[42px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Asignare</Label>
                <ChoiceChips
                  label="Asignare"
                  value={assignedToId}
                  onChange={(v) => setAssignedToId(v ?? '')}
                  options={assigneeOptions}
                />
              </div>

              <div className="space-y-2">
                <Label>Vizibilitate</Label>
                <ChoiceChips
                  label="Vizibilitate"
                  value={visibility}
                  onChange={(v) => v && setVisibility(v)}
                  options={(Object.keys(taskVisibilityLabels) as TaskVisibility[]).map((v) => ({
                    value: v,
                    label: taskVisibilityLabels[v],
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Administratorii văd toate taskurile indiferent de setare.
                </p>
                {visibility === TaskVisibility.SELECTED && (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-[var(--radius-ctl)] border border-input p-2">
                    {userList.map((u) => {
                      const on = visibleToIds.includes(u.id);
                      const isAssignee = u.id === assignedToId;
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={on || isAssignee}
                            disabled={isAssignee}
                            onCheckedChange={(c) =>
                              setVisibleToIds((ids) =>
                                c === true ? [...ids, u.id] : ids.filter((id) => id !== u.id),
                              )
                            }
                          />
                          <span>
                            {u.firstName} {u.lastName}
                            {isAssignee && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                (asignat)
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                    {userList.length === 0 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        Nu există utilizatori.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-notes">Note</Label>
                <Textarea
                  id="task-notes"
                  placeholder="Note opționale..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
