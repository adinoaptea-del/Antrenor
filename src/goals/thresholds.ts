// Pragurile (zone de puls, ritm de prag, FTP, CSS, FC maximă) vin dintr-un test și le declară sportivul. Un prag nou
// care sare mult față de cel salvat (auditul de coaching, Q10: „Prag vechi, GPS corupt, sport greșit — observația nu
// este propagată ca nouă capacitate; status explicit și corectabil”) nu rescrie zonele în tăcere: se arată vechi/nou
// și sportivul confirmă. Fără prag vechi nu e nimic de comparat.

export interface ThresholdSet {
  run_threshold_pace_sec_km?: number | null;
  bike_ftp_w?: number | null;
  swim_css_sec_100m?: number | null;
  hr_max_test?: number | null;
  run_hr_zones?: number[] | null;
  bike_hr_zones?: number[] | null;
}

export interface ThresholdChange {
  field: keyof ThresholdSet;
  label: string;
  old: number;
  next: number;
  /** Schimbarea relativă (%), rotunjită; pozitivă = mai mare. */
  pct: number;
}

/** Peste atâtea procente (setare de produs) pragul nou cere confirmare explicită înainte să intre în zone. */
export const THRESHOLD_CONFIRM_PCT = 15;

const LABEL: Record<keyof ThresholdSet, string> = {
  run_threshold_pace_sec_km: 'ritmul de prag la alergare',
  bike_ftp_w: 'FTP',
  swim_css_sec_100m: 'CSS',
  hr_max_test: 'FC maximă',
  run_hr_zones: 'zonele de puls la alergare',
  bike_hr_zones: 'zonele de puls la bicicletă',
};

function pctOf(oldV: number, nextV: number): number {
  return Math.round(((nextV - oldV) / oldV) * 100);
}

/** Pragurile din `next` care diferă cu peste pragul de confirmare față de `prev` (doar câmpurile prezente în ambele). */
export function thresholdChanges(prev: ThresholdSet | null | undefined, next: ThresholdSet, limitPct = THRESHOLD_CONFIRM_PCT): ThresholdChange[] {
  if (!prev) return [];
  const out: ThresholdChange[] = [];
  for (const field of ['run_threshold_pace_sec_km', 'bike_ftp_w', 'swim_css_sec_100m', 'hr_max_test'] as const) {
    const o = prev[field];
    const n = next[field];
    if (o == null || n == null || !(o > 0)) continue;
    const pct = pctOf(o, n);
    if (Math.abs(pct) > limitPct) out.push({ field, label: LABEL[field], old: o, next: n, pct });
  }
  for (const field of ['run_hr_zones', 'bike_hr_zones'] as const) {
    const o = prev[field];
    const n = next[field];
    if (!o?.length || !n?.length) continue;
    // Zona 2 (limita de sus) e reperul: ea decide ce înseamnă „ușor” în plan.
    const oz = o[1];
    const nz = n[1];
    if (oz == null || nz == null || !(oz > 0)) continue;
    const pct = pctOf(oz, nz);
    if (Math.abs(pct) > limitPct) out.push({ field, label: LABEL[field], old: oz, next: nz, pct });
  }
  return out;
}

/** Textul pentru sportiv: „CSS 150 → 100 s/100 m (−33%)”. */
export function describeChange(c: ThresholdChange): string {
  const unit = c.field === 'run_threshold_pace_sec_km' ? 's/km' : c.field === 'bike_ftp_w' ? 'W' : c.field === 'swim_css_sec_100m' ? 's/100 m' : 'bpm';
  return `${c.label}: ${c.old} → ${c.next} ${unit} (${c.pct > 0 ? '+' : ''}${c.pct}%)`;
}
