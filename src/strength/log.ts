// Jurnalul de forță: ce s-a făcut efectiv la fiecare exercițiu (kilograme, repetări, rezervă) și sugestia pentru
// data următoare, din regula documentată (progresia dublă, FITNESS_RULES): întâi repetări, apoi cel mai mic pas de
// greutate, după ce toate seriile au atins capătul de sus al intervalului cu rezerva cerută, de două ori la rând.
//
// Ce NU face: nu inventează kilograme. Fără o valoare înregistrată, sugestia e în cuvinte („alegi greutatea după
// rezervă”), iar un „am făcut cum scrie” fără kilograme nu creează o greutate.
//
// Proveniența (auditul v93, A57/A58): „declarat_conform” = sportivul confirmă că a făcut prescripția (repetările sunt
// ținta, NU o măsurătoare; rezerva rămâne necunoscută, null); „ajustat” = valorile scrise de el. Înregistrarea e pe
// serie (greutatea fiecărei serii din piramidă), pe ședință (workoutId) și pe apariția exercițiului în ședință
// (instance = poziția în prescripție), ca două ședințe în aceeași zi să nu se suprascrie.

export interface LoggedSet {
  kg: number | null;
  reps: number | null;
  /** Rezerva la seria asta, doar dacă a scris-o sportivul. */
  rir?: number | null;
}

/** „confirmat” e numele vechi (rândurile salvate înainte de 20.10.2026) pentru „declarat_conform”. */
export type LogSource = 'declarat_conform' | 'ajustat' | 'confirmat';
/** Cum se citesc kilogramele: total (bară, aparat cu cifre), pe mână (gantere), treapta aparatului. Necunoscut = null. */
export type LoadConvention = 'total' | 'per_mana' | 'aparat_treapta';

export interface StrengthLogEntry {
  date: string;
  /** Id-ul exercițiului din catalog (src/strength/ppl.ts). */
  exercise: string;
  sets: LoggedSet[];
  /** Repetări în rezervă la ultima serie (cât simțea că mai poate); null = nescris (nu „rezerva minimă”). */
  rir: number | null;
  source: LogSource;
  /** Ședința din plan (id-ul din calendar); lipsă la rândurile vechi. */
  workoutId?: string | null;
  /** Poziția exercițiului în prescripția ședinței (de la 0). */
  instance?: number;
  unit?: 'kg';
  loadConvention?: LoadConvention | null;
}

/** Valorile au fost scrise de sportiv (nu doar confirmarea prescripției). */
export const isMeasured = (e: Pick<StrengthLogEntry, 'source'>) => e.source === 'ajustat';

/** „8–12” → [8, 12]; „10” → [10, 10]; „30–45 s” → null (timp, nu repetări). */
export function repRange(reps: string): [number, number] | null {
  // Doar o durată („30–45 s”, „2 min”) nu are repetări; „3 s ținut sus” e un tempo, nu o durată.
  if (/^\s*\d+\s*(?:[–-]\s*\d+\s*)?(s|sec|min)\b/.test(reps)) return null;
  const m = /(\d+)(?:\s*[–-]\s*(\d+))?/.exec(reps);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** Repetările-țintă pe fiecare serie: la piramidă (20 / 15 / 12 / 8) ținta seriei; altfel capătul de jos, la toate. */
export function repTargets(reps: string, sets: number): number[] {
  if (/\d+\s*\/\s*\d+\s*\/\s*\d+/.test(reps)) {
    const t = (reps.split('—')[0] ?? reps).match(/\d+/g)!.map(Number);
    return Array.from({ length: sets }, (_, i) => t[Math.min(i, t.length - 1)]!);
  }
  const r = repRange(reps);
  return r ? Array(sets).fill(r[0]) : [];
}

/** Rezerva minimă cerută: „2–3” → 2, „3–4” → 3. */
export const minRir = (rir: string) => Number(/(\d+)/.exec(rir)?.[1] ?? 2);

const topKg = (e: StrengthLogEntry) => Math.max(...e.sets.map((s) => s.kg ?? -1));
const fmtKg = (kg: number) => `${kg.toLocaleString('ro-RO')} kg`;

export interface SuggestOpts {
  /** Durere / simptom raportat recent (≥ 3/10 sau „durere” la bilanț): progresia se oprește. */
  pain?: boolean;
  /** Menținere / stabilizare: fără escaladare obligatorie. */
  maintain?: boolean;
}

export type SuggestKind = 'prima' | 'fara-kg' | 'creste' | 'repetari' | 'ramai' | 'stop-durere' | 'mentine' | 'scade' | 'stagnare';

const totalReps = (e: StrengthLogEntry) => e.sets.reduce((n, x) => n + (x.reps ?? 0), 0);

/**
 * Sugestia pentru azi, din ultimele înregistrări ale aceluiași exercițiu (cele mai noi la final):
 *  - prima dată sau fără kg: calibrare, în cuvinte;
 *  - simptome raportate: fără creștere;
 *  - menținere: aceeași greutate și aceleași repetări, fără escaladare;
 *  - capătul de sus în toate seriile la două expuneri la rând, la aceeași greutate, cu rezerva cerută: cel mai mic pas;
 *  - performanță în scădere la două expuneri la rând (mai puține repetări la aceeași greutate): greutate puțin mai mică și
 *    rezervă mai mare, temporar (revizuire), nu „mai tare”;
 *  - altfel: aceeași greutate, o repetare în plus la o serie.
 */
export function suggest(exercise: string, reps: string, rir: string, history: StrengthLogEntry[], opts: SuggestOpts = {}): { kind: SuggestKind; last: string | null; today: string } {
  const own = history.filter((h) => h.exercise === exercise).sort((a, b) => (a.date < b.date ? -1 : 1));
  const range = repRange(reps);
  const last = own.at(-1);
  if (!last) return { kind: 'prima', last: null, today: 'Prima dată: alegi o greutate cu care faci repetările cerute și simți că mai puteai câteva; după ședință o notezi.' };
  const kg = topKg(last);
  const kgs = [...new Set(last.sets.map((s) => s.kg).filter((x): x is number => x != null))];
  const kgText = kgs.length > 1 ? ` la ${last.sets.map((s) => (s.kg != null ? s.kg.toLocaleString('ro-RO') : '?')).join(' / ')} kg` : kg >= 0 ? ` la ${fmtKg(kg)}` : '';
  const lastText = `${last.sets.length} × ${last.sets.map((s) => s.reps ?? '?').join('/')}${kgText}${last.rir != null ? `, mai puteai ${last.rir}` : ''}${isMeasured(last) ? '' : ' (cum scria)'}`;
  if (opts.pain) return { kind: 'stop-durere', last: lastText, today: 'Ai raportat durere recent: fără creștere azi. Aceeași greutate sau mai puțin, în amplitudinea fără durere; dacă exercițiul doare, îl oprești.' };
  // Piramida (20 / 15 / 12 / 8): fiecare serie are ținta ei; nu e un interval. Greutatea de pornire crește doar după
  // DOUĂ ședințe la rând cu toate seriile în țintă, la aceleași greutăți și cu cel puțin o repetare în rezervă, iar cel
  // puțin una din ele e scrisă de sportiv (auditul v93, A54/A58). O serie ratată nu crește niciodată greutatea.
  if (/\d+\s*\/\s*\d+\s*\/\s*\d+/.test(reps)) {
    const targets = (reps.split('—')[0] ?? reps).match(/\d+/g)!.map(Number);
    const hit = (e: StrengthLogEntry) => e.sets.length >= targets.length && targets.every((t, i) => (e.sets[i]?.reps ?? 0) >= t);
    const reserve = (e: StrengthLogEntry) => (e.rir == null || e.rir >= 1) && e.sets.every((x) => x.rir == null || x.rir >= 1);
    const sameKg = (a: StrengthLogEntry, b: StrengthLogEntry) => a.sets.map((x) => x.kg).join('/') === b.sets.map((x) => x.kg).join('/');
    const prev = own.at(-2);
    if (kg < 0) return { kind: 'fara-kg', last: lastText, today: `Piramidă (${targets.join(' / ')} repetări): notează greutatea de la fiecare serie, ca data viitoare să ai de unde porni.` };
    if (opts.maintain) return { kind: 'mentine', last: lastText, today: 'Menținere: aceleași greutăți pe serii ca data trecută; nu e nevoie să crești.' };
    if (!hit(last)) return { kind: 'ramai', last: lastText, today: `Piramidă (${targets.join(' / ')}): data trecută o serie n-a ieșit — aceleași greutăți pe serii (sau mai puțin la seria aceea) până ies toate repetările; nu crești.` };
    if (!reserve(last)) return { kind: 'ramai', last: lastText, today: `Piramidă (${targets.join(' / ')}): ai mers până la limită — aceleași greutăți, te oprești când mai ai cel puțin o repetare; nu crești.` };
    if (prev && hit(prev) && reserve(prev) && sameKg(prev, last) && (isMeasured(last) || isMeasured(prev)))
      return { kind: 'creste', last: lastText, today: `Toate seriile piramidei (${targets.join(' / ')}) au ieșit de două ori la rând, cu rezervă: pornești cu greutatea imediat următoare; de la o serie la alta crești doar dacă seria de dinainte a ieșit curat.` };
    if (prev && hit(prev) && sameKg(prev, last) && !isMeasured(last) && !isMeasured(prev)) return { kind: 'ramai', last: lastText, today: `Piramidă (${targets.join(' / ')}): „am făcut cum scrie” confirmă ședința, dar nu e o măsurătoare — scrie o dată greutățile și repetările reale, apoi crești.` };
    return { kind: 'ramai', last: lastText, today: `Piramidă (${targets.join(' / ')}): a ieșit o dată la greutățile astea; încă o ședință la fel, cu cel puțin o repetare în rezervă, și abia apoi crești.` };
  }
  if (!range) return { kind: 'ramai', last: lastText, today: 'Aceeași durată; crești doar dacă ai ținut-o ușor și corect.' };
  const [lo, hi] = range;
  if (kg < 0) return { kind: 'fara-kg', last: lastText, today: `Greutatea nu e notată: alegi una cu care faci ${lo}–${hi} repetări și mai puteai ${rir}; scrie-o după ședință, ca data viitoare să ai de unde porni.` };
  if (opts.maintain) return { kind: 'mentine', last: lastText, today: `Menținere: aceeași greutate (${fmtKg(kg)}) și aceleași repetări; nu e nevoie să crești.` };
  const prev = own.at(-2);
  const prev2 = own.at(-3);
  const atTop = (e: StrengthLogEntry) => e.sets.length > 0 && e.sets.every((s) => (s.reps ?? 0) >= hi) && (e.rir == null || e.rir >= minRir(rir));
  if (prev && prev2 && topKg(prev) === kg && topKg(prev2) === kg && totalReps(last) < totalReps(prev) && totalReps(prev) < totalReps(prev2))
    return { kind: 'scade', last: lastText, today: `Repetările scad de două ori la rând la ${fmtKg(kg)}: azi aceleași serii cu greutatea cu ~5–10% mai mică și te oprești mai departe de limită (mai puteai 3–4). Uită-te la somn, mâncare și stres; nu compensezi cu mai mult.` };
  if (prev && prev2 && !atTop(last) && topKg(prev) === kg && topKg(prev2) === kg && totalReps(last) === totalReps(prev) && totalReps(prev) === totalReps(prev2))
    return { kind: 'stagnare', last: lastText, today: `Trei ședințe la fel la ${fmtKg(kg)}: e stagnare, nu eșec. Păstrezi greutatea; verifici somnul, mâncarea și execuția. Dacă nu se mișcă nici data viitoare, scazi ~5–10% și reconstruiești repetările.` };
  // Confirmarea „cum scrie” nu e dovadă de capăt de sus: cel puțin una din cele două expuneri e scrisă de sportiv (A58).
  if (atTop(last) && prev && atTop(prev) && topKg(prev) === kg && (isMeasured(last) || isMeasured(prev))) return { kind: 'creste', last: lastText, today: `Ai atins ${hi} repetări în toate seriile de două ori la ${fmtKg(kg)}: pune greutatea imediat următoare și revii la ${lo}–${Math.min(hi, lo + 2)} repetări.` };
  if (last.rir != null && last.rir < minRir(rir)) return { kind: 'ramai', last: lastText, today: `Data trecută ai mers prea aproape de limită: rămâi la ${fmtKg(kg)}, fără repetări în plus, și te oprești când mai poți ${minRir(rir)}.` };
  if (last.sets.some((x) => (x.reps ?? 0) < lo)) return { kind: 'ramai', last: lastText, today: `Data trecută o serie a fost sub ${lo} repetări: rămâi la ${fmtKg(kg)} până le atingi pe toate; dacă nu, scazi puțin greutatea.` };
  return { kind: 'repetari', last: lastText, today: `Rămâi la ${fmtKg(kg)} și încearcă o repetare în plus la o serie (până la ${hi}).` };
}

/** Compatibilitate: sugestia fără opțiuni. */
export function nextSuggestion(exercise: string, reps: string, rir: string, history: StrengthLogEntry[], opts: SuggestOpts = {}): { last: string | null; today: string } {
  const r = suggest(exercise, reps, rir, history, opts);
  return { last: r.last, today: r.today };
}

/** „12/12/11” sau „12” → repetările pe serie (pentru `n` serii). */
export function parseRepsInput(text: string, n: number): (number | null)[] {
  const parts = text.split(/[\/,; ]+/).map((x) => x.trim()).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
  if (!parts.length) return Array(n).fill(null);
  return Array.from({ length: n }, (_, i) => parts[Math.min(i, parts.length - 1)]!);
}

/** „20/22,5/25” sau „20” → kilogramele pe serie (pentru `n` serii); gol = necunoscut (null), nu zero. */
export function parseKgInput(text: string, n: number): (number | null)[] {
  const parts = text
    .split(/[\/;]+|\s+/)
    .map((x) => x.trim().replace(',', '.'))
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isFinite(x) && x >= 0);
  if (!parts.length) return Array(n).fill(null);
  return Array.from({ length: n }, (_, i) => parts[Math.min(i, parts.length - 1)]!);
}

const okRir = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 10 ? Math.round(v) : null);

/**
 * Validarea unei înregistrări primite de server: valori plauzibile, fără kilograme inventate. La „declarat_conform”
 * (și la vechiul „confirmat”) rezerva e necunoscută: null, chiar dacă un client vechi a trimis rezerva minimă.
 */
export function cleanEntry(e: unknown, date: string): StrengthLogEntry | null {
  const x = e as Partial<StrengthLogEntry>;
  if (!x || typeof x.exercise !== 'string' || !/^[a-z0-9-]{2,40}$/.test(x.exercise)) return null;
  const measured = x.source === 'ajustat';
  const sets: LoggedSet[] = (Array.isArray(x.sets) ? x.sets : []).slice(0, 10).map((s) => ({
    kg: typeof s?.kg === 'number' && s.kg >= 0 && s.kg <= 500 ? Math.round(s.kg * 4) / 4 : null,
    reps: typeof s?.reps === 'number' && s.reps >= 0 && s.reps <= 100 ? Math.round(s.reps) : null,
    ...(measured && okRir(s?.rir) != null ? { rir: okRir(s?.rir) } : {}),
  }));
  if (!sets.length) return null;
  const workoutId = typeof x.workoutId === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(x.workoutId) ? x.workoutId : null;
  const instance = typeof x.instance === 'number' && Number.isInteger(x.instance) && x.instance >= 0 && x.instance < 40 ? x.instance : 0;
  const loadConvention = x.loadConvention === 'total' || x.loadConvention === 'per_mana' || x.loadConvention === 'aparat_treapta' ? x.loadConvention : null;
  return { date, exercise: x.exercise, sets, rir: measured ? okRir(x.rir) : null, source: measured ? 'ajustat' : 'declarat_conform', workoutId, instance, unit: 'kg', loadConvention };
}

/** Rândul din baza de date (supabase/migrations/0003_strength_log_sets.sql): cheia e ședință + apariție, nu doar ziua. */
export const STRENGTH_LOG_CONFLICT = 'user_id,date,exercise,workout_id,instance';
export function strengthLogRow(userId: string, e: StrengthLogEntry) {
  return { user_id: userId, date: e.date, exercise: e.exercise, workout_id: e.workoutId ?? '', instance: e.instance ?? 0, sets: e.sets, rir: e.rir, source: e.source, unit: e.unit ?? 'kg', load_convention: e.loadConvention ?? null };
}
/** Rândul în forma veche (bază încă neactualizată la schema 11): fără coloanele noi, aceeași cheie ca înainte. */
export function strengthLogRowLegacy(userId: string, e: StrengthLogEntry) {
  return { user_id: userId, date: e.date, exercise: e.exercise, sets: e.sets, rir: e.rir, source: e.source === 'ajustat' ? 'ajustat' : 'confirmat' };
}
