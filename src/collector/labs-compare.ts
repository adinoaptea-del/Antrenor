// Comparația dintre ultimul buletin de analize și cel dinainte. Calculată de cod, nu de model.

export interface LabSnapshot {
  data: string;
  feritina: number | null;
  vitamina_d: number | null;
  hemoglobina: number | null;
  ck: number | null;
  crp: number | null;
  alte: { nume: string; valoare: number | null; unitate: string | null; ref_min: number | null; ref_max: number | null }[];
}

export interface LabChange {
  nume: string;
  inainte: number;
  acum: number;
  unitate: string | null;
  schimbare_pct: number;
  /** mai_bine / mai_rau față de interval (laborator sau pragul aplicației); null = nu există interval de comparat. */
  directie: 'mai_bine' | 'mai_rau' | 'stabil' | null;
}

export interface LabsComparison {
  data_anterioare: string;
  schimbari: LabChange[];
}

/** Pragurile aplicației pentru cele cinci valori (unitățile aplicației). Hemoglobina depinde de laborator și sex: fără prag fix. */
const APP_RANGE: Record<string, { min: number | null; max: number | null; unit: string }> = {
  feritina: { min: 30, max: null, unit: 'µg/L' },
  vitamina_d: { min: 30, max: null, unit: 'ng/mL' },
  hemoglobina: { min: null, max: null, unit: 'g/dL' },
  ck: { min: null, max: null, unit: 'U/L' },
  crp: { min: null, max: 5, unit: 'mg/L' },
};

const LABEL: Record<string, string> = { feritina: 'Feritină', vitamina_d: 'Vitamina D', hemoglobina: 'Hemoglobină', ck: 'CK', crp: 'CRP' };

/** Cât de departe e o valoare de interval (0 = în interval). */
function distance(v: number, min: number | null, max: number | null): number {
  if (min != null && v < min) return min - v;
  if (max != null && v > max) return v - max;
  return 0;
}

function direction(before: number, now: number, min: number | null, max: number | null): LabChange['directie'] {
  const pct = before === 0 ? (now === 0 ? 0 : 100) : ((now - before) / Math.abs(before)) * 100;
  if (Math.abs(pct) < 5) return 'stabil';
  if (min == null && max == null) return null;
  const d0 = distance(before, min, max);
  const d1 = distance(now, min, max);
  if (d1 < d0) return 'mai_bine';
  if (d1 > d0) return 'mai_rau';
  // Amândouă în interval: pentru praguri cu o singură margine contează sensul (feritina, vitamina D mai sus = rezervă mai mare).
  if (d0 === 0 && d1 === 0) {
    if (min != null && max == null) return now > before ? 'mai_bine' : 'mai_rau';
    if (max != null && min == null) return now < before ? 'mai_bine' : 'mai_rau';
    return 'stabil';
  }
  return 'stabil';
}

const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export function compareLabs(now: LabSnapshot, before: LabSnapshot | null): LabsComparison | null {
  if (!before || before.data >= now.data) return null;
  const out: LabChange[] = [];
  const r1 = (x: number) => Math.round(x * 10) / 10;
  for (const k of ['feritina', 'vitamina_d', 'hemoglobina', 'ck', 'crp'] as const) {
    const a = before[k];
    const b = now[k];
    if (a == null || b == null) continue;
    const range = APP_RANGE[k]!;
    // Intervalul de pe buletin, dacă există, are prioritate față de pragul aplicației.
    const lab = now.alte.find((x) => key(x.nume).includes(key(LABEL[k]!)) && (x.ref_min != null || x.ref_max != null));
    const min = lab?.ref_min ?? range.min;
    const max = lab?.ref_max ?? range.max;
    out.push({ nume: LABEL[k]!, inainte: a, acum: b, unitate: range.unit, schimbare_pct: r1(a === 0 ? 0 : ((b - a) / Math.abs(a)) * 100), directie: direction(a, b, min, max) });
  }
  const seen = new Set(out.map((c) => key(c.nume)));
  for (const v of now.alte) {
    if (v.valoare == null || seen.has(key(v.nume))) continue;
    const prev = before.alte.find((x) => key(x.nume) === key(v.nume) && x.valoare != null && (x.unitate ?? '') === (v.unitate ?? ''));
    if (!prev) continue;
    seen.add(key(v.nume));
    out.push({
      nume: v.nume,
      inainte: prev.valoare!,
      acum: v.valoare,
      unitate: v.unitate,
      schimbare_pct: r1(prev.valoare === 0 ? 0 : ((v.valoare - prev.valoare!) / Math.abs(prev.valoare!)) * 100),
      directie: direction(prev.valoare!, v.valoare, v.ref_min, v.ref_max),
    });
  }
  return { data_anterioare: before.data, schimbari: out };
}
