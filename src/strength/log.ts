// Jurnalul de forță: ce s-a făcut efectiv la fiecare exercițiu (kilograme, repetări, rezervă) și sugestia pentru
// data următoare, din regula documentată (progresia dublă, FITNESS_RULES): întâi repetări, apoi cel mai mic pas de
// greutate, după ce toate seriile au atins capătul de sus al intervalului cu rezerva cerută, de două ori la rând.
//
// Ce NU face: nu inventează kilograme. Fără o valoare înregistrată, sugestia e în cuvinte („alegi greutatea după
// rezervă”), iar un „am făcut cum scrie” fără kilograme nu creează o greutate.

export interface LoggedSet {
  kg: number | null;
  reps: number | null;
}

export interface StrengthLogEntry {
  date: string;
  /** Id-ul exercițiului din catalog (src/strength/ppl.ts). */
  exercise: string;
  sets: LoggedSet[];
  /** Repetări în rezervă la ultima serie (cât simțea că mai poate). */
  rir: number | null;
  /** „confirmat” = a preluat valorile propuse; „ajustat” = a scris valorile reale. */
  source: 'confirmat' | 'ajustat';
}

/** „8–12” → [8, 12]; „10” → [10, 10]; „30–45 s” → null (timp, nu repetări). */
export function repRange(reps: string): [number, number] | null {
  if (/s\b|sec|min/.test(reps)) return null;
  const m = /(\d+)(?:\s*[–-]\s*(\d+))?/.exec(reps);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** Rezerva minimă cerută: „2–3” → 2, „3–4” → 3. */
export const minRir = (rir: string) => Number(/(\d+)/.exec(rir)?.[1] ?? 2);

const topKg = (e: StrengthLogEntry) => Math.max(...e.sets.map((s) => s.kg ?? -1));
const fmtKg = (kg: number) => `${kg.toLocaleString('ro-RO')} kg`;

/** Sugestia pentru azi, din ultimele înregistrări ale aceluiași exercițiu (cele mai noi la final). */
export function nextSuggestion(exercise: string, reps: string, rir: string, history: StrengthLogEntry[]): { last: string | null; today: string } {
  const own = history.filter((h) => h.exercise === exercise).sort((a, b) => (a.date < b.date ? -1 : 1));
  const range = repRange(reps);
  const last = own.at(-1);
  if (!last) return { last: null, today: 'Prima dată: alegi greutatea cu care faci repetările cerute păstrând rezerva; după ședință o notezi.' };
  const kg = topKg(last);
  const lastText = `${last.sets.length} × ${last.sets.map((s) => s.reps ?? '?').join('/')}${kg >= 0 ? ` la ${fmtKg(kg)}` : ''}${last.rir != null ? `, rezervă ${last.rir}` : ''}`;
  if (!range) return { last: lastText, today: 'Aceeași durată; crești doar dacă ai ținut-o ușor și corect.' };
  const [lo, hi] = range;
  const atTop = (e: StrengthLogEntry) => e.sets.length > 0 && e.sets.every((s) => (s.reps ?? 0) >= hi) && (e.rir == null || e.rir >= minRir(rir));
  const prev = own.at(-2);
  if (kg < 0) return { last: lastText, today: `Greutatea nu e notată: alegi una cu care faci ${lo}–${hi} repetări cu rezervă ${rir}; scrie-o după ședință, ca data viitoare să ai reper.` };
  if (atTop(last) && prev && atTop(prev) && topKg(prev) === kg) return { last: lastText, today: `Ai atins ${hi} repetări de două ori la ${fmtKg(kg)}: încearcă cel mai mic pas de greutate disponibil și revii spre ${lo}–${Math.min(hi, lo + 2)} repetări.` };
  if (last.rir != null && last.rir < minRir(rir)) return { last: lastText, today: `Data trecută rezerva a fost sub ${minRir(rir)}: rămâi la ${fmtKg(kg)} și ții rezerva, fără repetări în plus.` };
  return { last: lastText, today: `Rămâi la ${fmtKg(kg)} și încearcă o repetare în plus la o serie (spre ${hi}), cu aceeași rezervă.` };
}

/** Validarea unei înregistrări primite de server: valori plauzibile, fără kilograme inventate. */
export function cleanEntry(e: unknown, date: string): StrengthLogEntry | null {
  const x = e as Partial<StrengthLogEntry>;
  if (!x || typeof x.exercise !== 'string' || !/^[a-z0-9-]{2,40}$/.test(x.exercise)) return null;
  const sets = (Array.isArray(x.sets) ? x.sets : []).slice(0, 10).map((s) => ({
    kg: typeof s?.kg === 'number' && s.kg >= 0 && s.kg <= 500 ? Math.round(s.kg * 4) / 4 : null,
    reps: typeof s?.reps === 'number' && s.reps >= 0 && s.reps <= 100 ? Math.round(s.reps) : null,
  }));
  if (!sets.length) return null;
  const rir = typeof x.rir === 'number' && x.rir >= 0 && x.rir <= 10 ? Math.round(x.rir) : null;
  return { date, exercise: x.exercise, sets, rir, source: x.source === 'ajustat' ? 'ajustat' : 'confirmat' };
}
