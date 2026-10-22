// Aritmetica duratei (auditul consolidat 22.10.2026, T04/T05): suma pașilor afișați = durata din calendar.
// Verificatorul citește minutele din pașii generați (aceleași texte pe care le vede sportivul) și le adună după
// convenția explicită a aplicației: N repetări au N − 1 pauze între ele („între ele R min”); încălzirea poate avea o
// a doua parte („apoi 6 min școala alergării”); revenirea poate avea întinderi („apoi 5 min întinderi”); accelerările
// își scriu minutele în paranteză; brick = bicicletă + tranziție + alergare.
// Înotul nu intră aici: durata lui e ESTIMATĂ din metri și ritm și e etichetată așa (Total: … durata ≈ N min, estimată).
// Forța nu intră aici: minutele ei vin din serii × repetări × pauze (src/strength), nu din pașii generici.

import type { Step } from './session-steps.js';

const num = (s: string | undefined) => (s == null ? null : Number(s));
/** „1:30” → 1,5; „7” → 7. */
const mmss = (s: string) => (s.includes(':') ? Number(s.split(':')[0]) + Number(s.split(':')[1]) / 60 : Number(s));

/** Minutele unui pas, sau null dacă pasul nu are durată (plafon, puls, notă). */
export function stepMinutes(s: Step): number | null {
  const t = s.text;
  switch (s.label) {
    case 'Plafon':
    case 'Puls':
    case 'Durata':
    case 'Important':
    case 'Oprește-te':
    case 'Notă':
      return null;
  }
  // Intervale scurte 30/15: „S serii × R repetări: 30 s …, 15 s …; 3 min ușor între serii”.
  const si = /^(\d+) serii × (\d+) repetări: 30 s.*15 s/.exec(t);
  if (si) return Math.ceil(Number(si[1]) * Number(si[2]) * 0.75 + (Number(si[1]) - 1) * 3);
  // Repetări: „N × M min …; între ele/între repetări R min” (N − 1 pauze); pauza poate fi „1:30 min”.
  const reps = /^(\d+)\s*×\s*(\d+(?::\d{2})?)\s*min/.exec(t);
  if (reps) {
    const n = Number(reps[1]);
    const m = mmss(reps[2]!);
    const r = /între (?:ele|repetări) (\d+(?::\d{2})?) min/.exec(t)?.[1];
    const rest = r ? mmss(r) : 0;
    return n * m + Math.max(0, n - 1) * rest;
  }
  // Accelerări: minutele în paranteză, la final („(4 min)”).
  if (s.label === 'Accelerări') return num(/\((\d+) min\)\s*$/.exec(t)?.[1]);
  const f = /^(\d+(?::\d{2})?)\s*min/.exec(t)?.[1];
  if (f == null) return null;
  const first = mmss(f);
  // A doua parte a aceluiași pas: „…; apoi 6 min școala alergării” / „…, apoi 5 min întinderi ușoare”.
  const then = num(/apoi (\d+) min/.exec(t)?.[1]) ?? 0;
  return first + then;
}

/** Suma pașilor cu durată; null dacă niciun pas nu are minute (ex. înot, forță). */
export function stepsTotal(steps: Step[]): number | null {
  const parts = steps.map(stepMinutes).filter((x): x is number => x != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

/** Diferența pași − calendar pentru sporturile cu durată exactă (alergare, bicicletă, brick, mers); null = nu se aplică. */
export function durationMismatch(w: { sport: string; type: string; plannedMinutes: number; structure?: string | null }, steps: Step[]): number | null {
  if (w.sport === 'inot' || w.type === 'forta' || w.type === 'odihna') return null;
  const total = stepsTotal(steps);
  if (total == null) return null;
  return total - w.plannedMinutes;
}
