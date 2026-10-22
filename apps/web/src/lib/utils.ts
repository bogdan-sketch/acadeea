import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Cantitate pentru afișare: întregii fără zecimale ("2"), fracțiile cu virgulă
 * românească și maximum două zecimale ("1,5", "0,95"; `maxDecimals` pentru kg / l). Fără separator de mii —
 * "1.250 g" s-ar citi ca o zecimală.
 */
export function formatQty(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null) return '';
  let s = value.toLocaleString('ro-RO', {
    maximumFractionDigits: maxDecimals,
    useGrouping: false,
  });
  // Cantitățile mici dar reale (0,004 kg = 4 g) nu trebuie să apară ca "0";
  // le afișăm cu precizie mărită în loc să le rotunjim la zero.
  if ((s === '0' || s === '-0') && value !== 0) {
    s = value.toLocaleString('ro-RO', { maximumFractionDigits: 6, useGrouping: false });
  }
  // -0 (sau ce rămâne sub precizia maximă) se afișează ca zero simplu.
  return s === '-0' ? '0' : s;
}

/** Etichete scurte de unitate pentru formatUnitQty (dublate din constants.ts
 *  ca să nu creăm un ciclu utils ↔ constants). */
const QTY_UNIT_LABELS: Record<string, string> = {
  MILIGRAME: 'mg',
  GRAME: 'g',
  KILOGRAME: 'kg',
  MILILITRI: 'ml',
  LITRI: 'l',
  BUCATI: 'buc',
};

/** Scările de unități pe fel de mărime, de la mică la mare, cu factorul spre
 *  unitatea de bază (mg respectiv ml). */
const UNIT_SCALES: Record<string, [unit: string, factor: number][]> = {
  MILIGRAME: [
    ['MILIGRAME', 1],
    ['GRAME', 1000],
    ['KILOGRAME', 1_000_000],
  ],
  MILILITRI: [
    ['MILILITRI', 1],
    ['LITRI', 1000],
  ],
};
UNIT_SCALES.GRAME = UNIT_SCALES.MILIGRAME;
UNIT_SCALES.KILOGRAME = UNIT_SCALES.MILIGRAME;
UNIT_SCALES.LITRI = UNIT_SCALES.MILILITRI;

/**
 * Miezul numeric al formatUnitQty: scalează valoarea la unitatea în care
 * numărul se citește natural și întoarce și valoarea NUMERICĂ scalată —
 * pentru layouturile care mai au nevoie de aritmetică pe valoarea afișată
 * (ex. avizul recalculează prețul unitar ca Cantitate × Preț = Valoare să
 * rămână adevărat pe hârtie). `unit` = enumul ales (ex. "KILOGRAME"),
 * `unitLabel` = eticheta scurtă ("kg").
 */
export function scaleUnitQty(
  value: number,
  unit: string | null | undefined,
): { value: number; unit: string; unitLabel: string } {
  if (!unit) return { value, unit: '', unitLabel: '' };
  const scale = UNIT_SCALES[unit];
  if (!scale || value === 0) {
    return { value, unit, unitLabel: QTY_UNIT_LABELS[unit] ?? unit.toLowerCase() };
  }
  const factorOf = Object.fromEntries(scale);
  const base = value * factorOf[unit]; // în mg / ml
  // Cea mai mare unitate în care valoarea rămâne ≥ 1; sub 1 în toate → cea mică.
  let chosen = scale[0];
  for (const step of scale) {
    if (Math.abs(base) / step[1] >= 1) chosen = step;
  }
  return { value: base / chosen[1], unit: chosen[0], unitLabel: QTY_UNIT_LABELS[chosen[0]] };
}

/**
 * Cantitate + unitate pentru AFIȘARE, mereu în unitatea ARTICOLULUI (cea
 * primită): 0,596 kg rămâne „0,596 kg”, nu devine „596 g”. Regula
 * proprietarului: tot ce se afișează și se salvează pentru un articol (stoc,
 * loturi, jurnalul de mișcări, recepție, ajustare) folosește O SINGURĂ
 * unitate — altfel „+600 kg” din jurnal și „598 g” din stoc par două lucruri
 * diferite. kg / l păstrează 3 zecimale (precizie de gram / ml), restul 2;
 * cantitățile mici dar reale nu se rotunjesc la 0 (vezi formatQty).
 * Inputurile pot accepta altă unitate, dar convertesc explicit înainte de
 * salvare (vezi recepția). Avizul pe hârtie își alege singur unitatea
 * (scaleUnitQty).
 */
export function formatUnitQty(
  value: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (value == null) return '';
  // Unele răspunsuri (ex. dashboard lowStockMaterials) nu poartă unitatea —
  // afișăm doar numărul, nu crăpăm.
  if (!unit) return formatQty(value);
  const label = QTY_UNIT_LABELS[unit] ?? unit.toLowerCase();
  return `${formatQty(value, unit === 'KILOGRAME' || unit === 'LITRI' ? 3 : 2)} ${label}`;
}

/**
 * Varianta „despicată" a formatUnitQty pentru layouturile care stilizează
 * numărul și unitatea separat (ex. statistica mare „În stoc"): întoarce
 * [număr, unitate] în unitatea articolului ("3000", "GRAME" → ["3000", "g"]).
 */
export function splitUnitQty(value: number | null | undefined, unit: string): [string, string] {
  const s = formatUnitQty(value, unit);
  const i = s.lastIndexOf(' ');
  return i === -1 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

/**
 * Cheie de sortare pentru coloane de cantitate cu unități (posibil) mixte:
 * grupează după felul unității (masă / volum / bucăți) și normalizează în
 * unitatea de bază (g, ml, buc), ca "2 kg" să fie mai mare decât "500 g" dar
 * bucățile să nu se amestece cu kilogramele. Valoarea e un șir comparat cu
 * localeCompare {numeric:true} în DataTable — offsetul + zecimalele fixe fac
 * comparația numerică corectă (inclusiv pentru fracții și negative).
 */
export function unitQtySortKey(value: number | null | undefined, unit: string): string | null {
  if (value == null) return null;
  const MASS: Record<string, number> = { MILIGRAME: 0.001, GRAME: 1, KILOGRAME: 1000 };
  const VOLUME: Record<string, number> = { MILILITRI: 1, LITRI: 1000 };
  let kind: string;
  let v: number;
  if (unit in MASS) {
    kind = 'masa';
    v = value * MASS[unit];
  } else if (unit in VOLUME) {
    kind = 'volum';
    v = value * VOLUME[unit];
  } else if (unit === 'BUCATI') {
    kind = 'bucati';
    v = value;
  } else {
    kind = unit.toLowerCase();
    v = value;
  }
  return `${kind} ${(v + 1_000_000_000).toFixed(3)}`;
}

/** Fusul orar al cofetăriei: zilele de livrare se numără în ora României. */
export const APP_TIME_ZONE = 'Europe/Bucharest';

/** Ziua calendaristică (YYYY-MM-DD) a unui moment, în ora României — nu în UTC
 *  și nici în fusul browserului. */
export function bucharestDayKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  // en-CA formatează exact YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const MONEY_FMT = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Sumă cu virgula românească și două zecimale, fără monedă: 1234.5 → "1.234,50". */
export function formatAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  return MONEY_FMT.format(value);
}

/**
 * Bani pentru AFIȘARE: "41,32 RON"; cu `perUnit` devine preț unitar
 * ("41,32 RON/kg"). Valoare lipsă → "—".
 */
export function formatMoney(value: number | null | undefined, perUnit?: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${MONEY_FMT.format(value)} RON${perUnit ? `/${perUnit}` : ''}`;
}

/** Procent cu virgula românească: 12.34 → "12,3%" (`digits` zecimale, implicit 1). */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('ro-RO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  })}%`;
}

/** Factorii metrici exacți spre unitatea de bază a familiei (g / ml). */
const METRIC_FAMILY: Record<string, { family: 'masa' | 'volum'; factor: number }> = {
  MILIGRAME: { family: 'masa', factor: 0.001 },
  GRAME: { family: 'masa', factor: 1 },
  KILOGRAME: { family: 'masa', factor: 1000 },
  MILILITRI: { family: 'volum', factor: 1 },
  LITRI: { family: 'volum', factor: 1000 },
};

/**
 * Unitățile în care se poate introduce o cantitate pentru un articol ținut în
 * `unit`: aceeași familie metrică (g / kg / mg, ml / l) — conversie exactă.
 * Bucățile și restul rămân doar în unitatea lor.
 */
export function inputUnitsFor<U extends string>(unit: U): U[] {
  const own = METRIC_FAMILY[unit];
  if (!own) return [unit];
  return (Object.keys(METRIC_FAMILY) as U[]).filter((u) => METRIC_FAMILY[u].family === own.family);
}

/**
 * Conversie exactă între două unități din aceeași familie metrică
 * (600 GRAME → 0,6 KILOGRAME). null când nu există factor fix.
 */
export function convertMetric(value: number, from: string, to: string): number | null {
  if (from === to) return value;
  const a = METRIC_FAMILY[from];
  const b = METRIC_FAMILY[to];
  if (!a || !b || a.family !== b.family) return null;
  // Rotunjire la 9 zecimale: 0,1 × 1000 / 1 = 100,00000000000001 altfel.
  return Math.round(((value * a.factor) / b.factor) * 1e9) / 1e9;
}
