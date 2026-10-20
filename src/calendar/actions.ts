// Ce poate face sportivul direct pe o ședință, determinist și după aceleași reguli ca planul:
//  - „Actualizat”: fiecare ședință schimbată își păstrează forma din plan (original), ca să vezi ce s-a schimbat și de ce;
//  - Mută: altă zi din aceeași săptămână, fără două ședințe grele în aceeași zi sau în zile alăturate;
//  - Fă-o ușoară: intensitatea iese, ședința rămâne;
//  - Plecat: zile de deplasare cu ce ai la dispoziție (fără bazin, fără bicicletă, doar alergare, nimic); la anulare revine planul;
//  - Întâlniri fixe (alergarea cu grupul): generatorul pune ședința potrivită în ziua aceea.

import type { PlannedWorkout, Sport, WorkoutSnapshot } from '../types.js';
import { sportsBlockedByPain } from './safety.js';
import { addDays, weekStart, weekday } from '../util/dates.js';
import { fitStructure, isHard } from './validate.js';

export function snapshot(w: PlannedWorkout): WorkoutSnapshot {
  return { date: w.date, sport: w.sport, type: w.type, plannedMinutes: w.plannedMinutes, targetZones: [...w.targetZones], structure: w.structure ?? null, key: w.key, status: w.status, intervals: w.intervals ?? null };
}

const sameShape = (a: WorkoutSnapshot, b: WorkoutSnapshot) =>
  a.date === b.date && (a.sport ?? '') === (b.sport ?? '') && a.type === b.type && a.plannedMinutes === b.plannedMinutes && a.targetZones.join() === b.targetZones.join() && (a.structure ?? '') === (b.structure ?? '') && a.status === b.status;

/**
 * Marchează schimbarea: dacă ședința arată altfel decât înainte, păstrează forma de dinainte de PRIMA schimbare.
 * Dacă după schimbare a revenit exact la forma din plan, eticheta dispare.
 */
export function withOriginal(prev: PlannedWorkout, next: PlannedWorkout, at: string): PlannedWorkout {
  const before = snapshot(prev);
  const after = snapshot(next);
  if (sameShape(before, after)) return next;
  const original = prev.original ?? before;
  if (sameShape(original, after)) return { ...next, original: null, changedAt: at };
  return { ...next, original, changedAt: at };
}

const DAY = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const TYPE = { z2: 'ușor', tehnica: 'tehnică', calitate: 'intensitate', lung: 'lungă', brick: 'brick', forta: 'forță', odihna: 'odihnă' } as const;
const zones = (z: readonly number[]) => (z.length ? `Z${z.join('–')}` : '');

/** Ce s-a schimbat, în cuvinte: „60 → 40 min · Z3–Z4 → Z2 · joi → vineri”. null = nimic. */
export function changeSummary(w: PlannedWorkout): string[] | null {
  const o = w.original;
  if (!o) return null;
  const out: string[] = [];
  if (w.status === 'anulat_sistem' && o.status !== 'anulat_sistem') return [`anulată (era ${o.plannedMinutes} min ${TYPE[o.type]})`];
  if (o.sport && o.sport !== w.sport) out.push(`${SPORT_WORD[o.sport]} → ${SPORT_WORD[w.sport]}`);
  if (o.date !== w.date) out.push(`${DAY[weekday(o.date)]} → ${DAY[weekday(w.date)]}`);
  if (o.plannedMinutes !== w.plannedMinutes) out.push(`${o.plannedMinutes} → ${w.plannedMinutes} min`);
  if (o.type !== w.type) out.push(`${TYPE[o.type]} → ${TYPE[w.type]}`);
  if (zones(o.targetZones) !== zones(w.targetZones)) out.push(`${zones(o.targetZones) || '–'} → ${zones(w.targetZones) || '–'}`);
  if (!out.length && (o.structure ?? '') !== (w.structure ?? '')) out.push('structura ședinței');
  return out.length ? out : null;
}

const active = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';

export interface MoveOption {
  date: string;
  ok: boolean;
  reason?: string;
}

/** Zilele în care poate fi mutată ședința: aceeași săptămână, de azi încolo, după regulile planului. */
export function moveOptions(plan: PlannedWorkout[], id: string, today: string, doneIds: string[] = []): MoveOption[] {
  const w = plan.find((x) => x.id === id);
  if (!w || !active(w) || w.date < today || doneIds.includes(id)) return [];
  const ws = weekStart(w.date);
  const others = plan.filter((x) => x.id !== id && active(x));
  const on = (d: string) => others.filter((x) => x.date === d);
  const hardOn = (d: string) => on(d).some(isHard);
  const out: MoveOption[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    if (d === w.date) continue;
    if (d < today) continue;
    const day = on(d);
    let reason: string | undefined;
    if (day.length >= 2) reason = 'are deja două ședințe';
    else if (w.sport !== 'forta' && day.some((x) => x.sport === w.sport)) reason = `are deja ${SPORT_WORD[w.sport]}`;
    else if ((w.type === 'lung' || w.type === 'brick') && day.some((x) => x.type === 'lung' || x.type === 'brick')) reason = 'are deja o ședință lungă';
    else if (isHard(w) && hardOn(d)) reason = 'are deja o ședință grea';
    else if (isHard(w) && (hardOn(addDays(d, -1)) || hardOn(addDays(d, 1)))) reason = 'e lângă o zi grea (zi tare, zi ușoară)';
    else if (w.sport === 'alergare' && w.type === 'calitate' && (on(addDays(d, -1)).concat(on(addDays(d, 1))).some((x) => x.sport === 'alergare' && x.type === 'lung'))) reason = 'e lângă alergarea lungă';
    out.push(reason ? { date: d, ok: false, reason } : { date: d, ok: true });
  }
  return out;
}

const SPORT_WORD: Record<Sport, string> = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță', mers: 'mers' };

export function moveWorkout(plan: PlannedWorkout[], id: string, date: string, today: string, at: string, doneIds: string[] = []): PlannedWorkout {
  const w = plan.find((x) => x.id === id);
  if (!w) throw new Error('ședință inexistentă');
  const opt = moveOptions(plan, id, today, doneIds).find((o) => o.date === date);
  if (!opt) throw new Error('se poate muta doar o ședință care urmează, pe altă zi din aceeași săptămână');
  if (!opt.ok) throw new Error(`ziua aleasă ${opt.reason}`);
  return withOriginal(w, { ...w, date, note: `mutată de tine de ${DAY[weekday(w.date)]} pe ${DAY[weekday(date)]}` }, at);
}

/** „Fă-o ușoară”: intensitatea iese (ușor, să poți vorbi); ieșirea lungă rămâne lungă, dar mai scurtă și doar Z1–Z2. */
export function easyWorkout(w: PlannedWorkout, at: string): PlannedWorkout {
  const intense = w.type === 'calitate' || w.type === 'brick' || w.targetZones.some((z) => z >= 3);
  if (!active(w)) throw new Error('ședința nu mai e activă');
  if (w.type === 'lung') {
    const minutes = Math.max(30, Math.round((w.plannedMinutes * 0.75) / 5) * 5);
    return withOriginal(w, { ...w, plannedMinutes: minutes, targetZones: [1, 2], intervals: undefined, key: false, structure: `${minutes} min constant, Z1–Z2`, note: 'ușoară la cererea ta: −25%, fără final rapid' }, at);
  }
  if (!intense) throw new Error('ședința e deja ușoară');
  const swim = w.sport === 'inot';
  const next: PlannedWorkout = {
    ...w,
    type: swim ? 'tehnica' : 'z2',
    key: false,
    targetZones: swim ? [1, 2] : [2],
    intervals: undefined,
    structure: swim ? 'tehnică și bucăți ușoare' : `${w.plannedMinutes} min ușor, să poți vorbi`,
    note: 'ușoară la cererea ta: fără intensitate azi; progresia așteaptă',
  };
  return withOriginal(w, fitStructure(next), at);
}

// ——— Alt sport ———

const SPORT_NAME: Record<Sport, string> = { alergare: 'alergare', bicicleta: 'bicicletă', inot: 'înot', forta: 'forță', mers: 'mers' };
export const SWAP_SPORTS: Sport[] = ['alergare', 'bicicleta', 'inot'];

/** Se poate schimba sportul ședinței? Motivul, când nu. */
export function sportSwapBlock(w: PlannedWorkout): string | null {
  if (!active(w)) return 'ședința nu mai e activă';
  if (w.sport === 'forta') return 'forța nu se schimbă cu alt sport (alt scop și alt echipament); o poți muta în altă zi';
  if (w.sport === 'mers') return 'mersul e obiectivul tău: ședința o poți muta sau scurta, nu schimba cu alt sport';
  if (w.type === 'brick') return 'brick-ul are deja două sporturi; îl poți muta sau face ușor';
  if (/^TEST/i.test(w.structure ?? '')) return 'un test se face în sportul lui; îl poți muta în altă zi';
  return null;
}

/**
 * „Azi fac alt sport”: aceeași zi și aceeași durată, ușor (zona 2; la înot tehnică, 20–60 min). Intensitatea și ieșirea
 * lungă nu se transferă în alt sport (încărcarea nu e echivalentă), progresia sportului inițial așteaptă. Înapoi la
 * sportul din plan = ședința din plan, exact cum era.
 */
export function changeSport(w: PlannedWorkout, sport: Sport, at: string, pain?: { loc: string | null; scor: number } | null): PlannedWorkout {
  const block = sportSwapBlock(w);
  if (block) throw new Error(block);
  // Auditul v93, A07: o durere activă nu se ocolește schimbând sportul pe unul care încarcă aceeași zonă.
  if (pain && pain.scor >= 3 && sportsBlockedByPain(pain.loc).includes(sport)) throw new Error(`ai o durere activă (${pain.scor}/10${pain.loc ? ` la ${pain.loc}` : ''}): ${SPORT_NAME[sport]} încarcă zona; alege alt sport sau o zi de pauză`);
  if (pain && pain.scor >= 5) throw new Error(`ai o durere ${pain.scor}/10${pain.loc ? ` la ${pain.loc}` : ''}: până la reevaluare nu se înlocuiește ședința cu alt sport`);
  if (!SWAP_SPORTS.includes(sport)) throw new Error('sport necunoscut');
  if (sport === w.sport) throw new Error(`ședința e deja ${SPORT_NAME[sport]}`);
  const o = w.original;
  if (o && o.sport === sport && o.date === w.date) {
    return withOriginal(w, { ...w, sport, type: o.type, plannedMinutes: o.plannedMinutes, targetZones: [...o.targetZones] as PlannedWorkout['targetZones'], structure: o.structure ?? undefined, key: o.key, intervals: o.intervals ?? undefined, note: undefined }, at);
  }
  const swim = sport === 'inot';
  const minutes = swim ? Math.min(60, Math.max(20, w.plannedMinutes)) : w.plannedMinutes;
  const lost = w.key || w.type === 'calitate' || w.type === 'lung' || w.targetZones.some((z) => z >= 3);
  const next: PlannedWorkout = {
    ...w,
    sport,
    type: swim ? 'tehnica' : 'z2',
    key: false,
    plannedMinutes: minutes,
    targetZones: swim ? [1, 2] : [2],
    intervals: undefined,
    structure: swim ? 'tehnică și bucăți ușoare' : `${minutes} min ușor, să poți vorbi`,
    note: `alt sport la cererea ta: ${SPORT_NAME[w.sport]} → ${SPORT_NAME[sport]}, ușor${minutes !== w.plannedMinutes ? `, ${minutes} min` : ', aceeași durată'}${lost ? '; intensitatea sau ieșirea lungă nu se mută în alt sport, progresia așteaptă' : ''}`,
  };
  return withOriginal(w, fitStructure(next), at);
}

// ——— Plecat ———

export type AwayKind = 'fara_bazin' | 'fara_bicicleta' | 'doar_alergare' | 'nimic';
export interface Away {
  dela: string;
  panala: string;
  ce: AwayKind;
}
export const AWAY_LABEL: Record<AwayKind, string> = { fara_bazin: 'fără bazin', fara_bicicleta: 'fără bicicletă', doar_alergare: 'doar alergare', nimic: 'fără antrenament' };
export const AWAY_NOTE = 'plecat';

/**
 * Zilele de deplasare: ce nu se poate face devine alergare ușoară (cel mult una pe zi) sau se anulează;
 * „nimic” anulează tot. Ședințele făcute deja și trecutul nu se ating.
 */
export function applyAway(plan: PlannedWorkout[], away: Away, today: string, at: string, doneIds: string[] = []): PlannedWorkout[] {
  const from = away.dela < today ? today : away.dela;
  const changed: PlannedWorkout[] = [];
  const byDay = new Map<string, PlannedWorkout[]>();
  for (const w of plan) if (active(w) && w.date >= from && w.date <= away.panala && !doneIds.includes(w.id)) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
  for (const [, ws] of byDay) {
    let hasRun = ws.some((w) => w.sport === 'alergare' && keeps(w, away.ce));
    for (const w of ws) {
      if (keeps(w, away.ce)) continue;
      const label = `${AWAY_NOTE} (${AWAY_LABEL[away.ce]})`;
      if (away.ce !== 'nimic' && !hasRun && w.sport !== 'forta') {
        const minutes = Math.min(w.plannedMinutes, w.sport === 'bicicleta' ? 45 : 40);
        hasRun = true;
        changed.push(withOriginal(w, { ...w, sport: 'alergare', type: 'z2', key: false, plannedMinutes: minutes, targetZones: [2], intervals: undefined, structure: `${minutes} min ușor, să poți vorbi`, note: `${label}: alergare ușoară în loc de ${SPORT_WORD[w.sport]}` }, at));
      } else {
        changed.push(withOriginal(w, { ...w, status: 'anulat_sistem', note: `${label}: ${SPORT_WORD[w.sport]} anulat` }, at));
      }
    }
  }
  return changed;
}

function keeps(w: PlannedWorkout, ce: AwayKind): boolean {
  if (ce === 'nimic') return false;
  if (ce === 'fara_bazin') return w.sport !== 'inot';
  if (ce === 'fara_bicicleta') return w.sport !== 'bicicleta' && w.type !== 'brick';
  return w.sport === 'alergare' || w.sport === 'forta';
}

/** Anularea plecării: ședințele schimbate de ea (de azi încolo) revin la forma din plan. */
export function restoreAway(plan: PlannedWorkout[], away: Away, today: string, at: string): PlannedWorkout[] {
  const from = away.dela < today ? today : away.dela;
  return plan
    .filter((w) => w.original && (w.note ?? '').startsWith(AWAY_NOTE) && w.original.date >= from && w.original.date <= away.panala && w.date >= today)
    .map((w) => {
      const o = w.original!;
      return { ...w, sport: o.sport ?? w.sport, date: o.date, type: o.type, plannedMinutes: o.plannedMinutes, targetZones: [...o.targetZones], structure: o.structure ?? undefined, key: o.key, status: o.status, intervals: o.intervals ?? undefined, note: undefined, original: null, changedAt: at };
    });
}

// ——— Întâlniri fixe ———

export interface FixedMeet {
  /** 0 = luni … 6 = duminică */
  zi: number;
  sport: Exclude<Sport, 'forta' | 'mers'>;
  tip: 'lung' | 'calitate' | 'usor';
  eticheta?: string;
}

/** Cât de bine se potrivește o ședință cu o întâlnire fixă din ziua respectivă (pentru plasare). */
export function fixedBonus(fixed: FixedMeet[] | undefined, day: number, sport: Sport, type: PlannedWorkout['type']): number {
  if (!fixed?.length) return 0;
  const f = fixed.find((x) => x.zi === day && x.sport === sport);
  if (!f) return 0;
  const match = f.tip === 'lung' ? type === 'lung' : f.tip === 'calitate' ? type === 'calitate' : type === 'z2' || type === 'tehnica';
  return match ? 3000 : 0;
}
