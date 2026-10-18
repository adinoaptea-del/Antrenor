// Eficiența aerobă: cât produci la același puls. La alergare, metri pe minut împărțit la puls (metri pe bătaie);
// la bicicletă, wați împărțit la puls (doar cu putere măsurată; viteza depinde prea mult de vânt și traseu).
// Crește în timp = progres real; scade = oboseală acumulată, căldură sau boală. Doar pe ședințe ușoare și plate,
// comparate cu ele însele: ultimele 3 săptămâni față de cele 6 dinainte. Regulă de produs v1.

import { diffDays } from '../util/dates.js';

export interface EffTrend {
  sport: 'alergare' | 'bicicleta';
  unitate: string;
  recent: number;
  inainte: number;
  schimbare_pct: number;
  sedinte: { recent: number; inainte: number };
}

interface ActLike {
  date: string;
  sport: string;
  minutes: number;
  distanceKm?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgWatts?: number | null;
  details?: { elevGainM?: number | null } | null;
}

const RECENT_DAYS = 21;
const BEFORE_DAYS = 63;
const MIN_N = 3;

export function aerobicEfficiency(acts: ActLike[], today: string): EffTrend[] {
  const window = acts.filter((a) => {
    const d = diffDays(a.date, today);
    return d >= 0 && d < BEFORE_DAYS && a.minutes >= 30 && a.avgHr != null && a.avgHr > 60;
  });
  const out: EffTrend[] = [];
  for (const sport of ['alergare', 'bicicleta'] as const) {
    const xs = window.filter((a) => a.sport === sport);
    if (!xs.length) continue;
    // „Ușor” = sub ~82% din cel mai mare puls atins pe sportul respectiv în fereastră (fără zone testate).
    const hrCap = Math.max(...xs.map((a) => a.maxHr ?? a.avgHr ?? 0)) * 0.82;
    const easy = xs.filter((a) => (a.avgHr ?? 999) <= hrCap);
    const value = (a: ActLike): number | null => {
      if (sport === 'alergare') {
        if (!a.distanceKm) return null;
        const elev = a.details?.elevGainM;
        if (elev != null && elev / a.distanceKm > 10) return null; // munte/deal: nu e comparabil
        return (a.distanceKm * 1000) / a.minutes / a.avgHr!;
      }
      return a.avgWatts ? a.avgWatts / a.avgHr! : null;
    };
    const pts = easy.map((a) => ({ d: diffDays(a.date, today), v: value(a) })).filter((p): p is { d: number; v: number } => p.v != null);
    const rec = pts.filter((p) => p.d < RECENT_DAYS);
    const bef = pts.filter((p) => p.d >= RECENT_DAYS);
    if (rec.length < MIN_N || bef.length < MIN_N) continue;
    const avg = (p: { v: number }[]) => p.reduce((s, x) => s + x.v, 0) / p.length;
    const r = avg(rec);
    const b = avg(bef);
    out.push({ sport, unitate: sport === 'alergare' ? 'metri pe bătaie de inimă' : 'wați pe bătaie de inimă', recent: Math.round(r * 1000) / 1000, inainte: Math.round(b * 1000) / 1000, schimbare_pct: Math.round((r / b - 1) * 1000) / 10, sedinte: { recent: rec.length, inainte: bef.length } });
  }
  return out;
}
