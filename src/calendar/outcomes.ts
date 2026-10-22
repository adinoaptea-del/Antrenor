// „Nu am făcut ședința” / „am făcut doar o parte”, cu motiv (auditul de simulări live, secțiunea 02).
//
// Anulată (decizia sistemului sau plecarea anunțată) ≠ ratată (declarată de sportiv, cu motiv) ≠ parțială ≠ fără date
// (nimic declarat, nimic înregistrat). Ședința ratată nu se recuperează prin dublare. Motivul contează:
//  - lipsa de timp nu e incapacitate: nu schimbă nimic;
//  - oboseala, durerea, boala: o dată = se păstrează planul și se urmărește; de două ori în 7 zile = următoarea ședință
//    grea din 7 zile devine ușoară (doza se reevaluează), cu dovezile scrise. Pragul e o regulă de produs, explicabilă.
// Obiectivul nu se declară pierdut sau garantat dintr-o săptămână.

import { isEasedBySystem, makeFlags } from './flags.js';
import type { PlannedWorkout, Sport } from '../types.js';
import { addDays, diffDays, weekday } from '../util/dates.js';
import { withOriginal } from './actions.js';
import { fitStructure } from './validate.js';

export type OutcomeStatus = 'ratat' | 'partial';
export type OutcomeMotiv = 'timp' | 'oboseala' | 'durere' | 'boala' | 'altul';
export interface Outcome {
  workoutId: string;
  date: string;
  status: OutcomeStatus;
  motiv: OutcomeMotiv;
  minutes?: number | null;
  reportedAt?: string;
}

export const MOTIV_LABEL: Record<OutcomeMotiv, string> = { timp: 'lipsă de timp', oboseala: 'oboseală', durere: 'durere', boala: 'boală', altul: 'alt motiv' };
const NOT_TOLERATED: OutcomeMotiv[] = ['oboseala', 'durere', 'boala'];
const DAY = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const SPORT: Record<Sport, string> = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță', mers: 'mers' };
const active = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}`;
const hard = (w: PlannedWorkout) => w.key || w.type === 'calitate' || w.type === 'brick' || w.targetZones.some((z) => z >= 3);

/** Ce înseamnă declarația pentru plan și mesajul pentru sportiv. `outcomes` include deja declarația nouă. */
export function outcomeFeedback(plan: PlannedWorkout[], outcomes: Outcome[], now: Outcome, today: string, at: string): { changed: PlannedWorkout[]; message: string; decision: 'pastrat' | 'modificat' } {
  const w = plan.find((x) => x.id === now.workoutId);
  const label = w ? `${SPORT[w.sport]} de ${DAY[weekday(w.date)]} ${dm(w.date)}` : `ședința din ${dm(now.date)}`;
  const what = now.status === 'ratat' ? 'nefăcută' : `făcută parțial${now.minutes ? ` (${now.minutes} min)` : ''}`;
  const recent = outcomes.filter((o) => NOT_TOLERATED.includes(o.motiv) && diffDays(o.date, today) <= 7 && o.date <= today);
  const changed: PlannedWorkout[] = [];
  let nextLine: string;
  let decision: 'pastrat' | 'modificat' = 'pastrat';
  if (recent.length >= 2) {
    const target = plan.filter((x) => active(x) && x.date >= today && x.date <= addDays(today, 7) && hard(x)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (target) {
      const swim = target.sport === 'inot';
      const minutes = target.type === 'lung' ? Math.max(30, Math.round((target.plannedMinutes * 0.75) / 5) * 5) : target.plannedMinutes;
      const easy: PlannedWorkout = fitStructure({
        ...target,
        type: target.type === 'lung' ? 'lung' : swim ? 'tehnica' : 'z2',
        key: false,
        targetZones: swim ? [1, 2] : target.type === 'lung' ? [1, 2] : [2],
        intervals: undefined,
        plannedMinutes: minutes,
        structure: target.type === 'lung' ? `${minutes} min constant, Z1–Z2` : swim ? 'tehnică și bucăți ușoare' : `${minutes} min ușor, să poți vorbi`,
        note: `ușurată: ${recent.length} ședințe nefăcute sau parțiale din ${[...new Set(recent.map((o) => MOTIV_LABEL[o.motiv]))].join('/')} în ultimele 7 zile (declarat de tine); revine la plan după o ședință bine tolerată`,
      });
      const eased = withOriginal(target, easy, at);
      changed.push({ ...eased, flags: makeFlags('usurare', eased, eased.note ?? null) });
      decision = 'modificat';
      nextLine = `Următoarea ședință grea (${SPORT[target.sport]}, ${DAY[weekday(target.date)]} ${dm(target.date)}) devine ușoară, deoarece ai declarat ${recent.length} ședințe nefăcute din ${[...new Set(recent.map((o) => MOTIV_LABEL[o.motiv]))].join('/')} în ultimele 7 zile.`;
    } else nextLine = `În următoarele 7 zile nu ai nicio ședință grea: planul rămâne; ai declarat ${recent.length} ședințe nefăcute din oboseală/durere/boală, iar la bilanțul săptămânal se reevaluează doza.`;
  } else {
    const next = w ? plan.filter((x) => active(x) && x.date > now.date && x.date >= today && x.sport === w.sport).sort((a, b) => (a.date < b.date ? -1 : 1))[0] : undefined;
    const where = next ? ` (${DAY[weekday(next.date)]} ${dm(next.date)})` : '';
    nextLine =
      now.motiv === 'timp'
        ? `Următoarea ședință${where} rămâne cum e: lipsa de timp nu înseamnă că nu poți.`
        : now.motiv === 'altul'
          ? `Următoarea ședință${where} rămâne cum e.`
          : `Următoarea ședință${where} rămâne cum e: e prima din ultimele 7 zile; dacă se repetă, se ușurează.`;
  }
  // Auditul v93, A66: lipsa de timp repetată e o problemă de program, nu de capacitate. Doar propunere (planul și doza
  // rămân): mută ziua, scurtează fereastra sau scade frecvența — alegi tu.
  if (now.motiv === 'timp') {
    const timp = outcomes.filter((o) => o.motiv === 'timp' && o.date <= today && diffDays(o.date, today) <= 21);
    const sameDay = timp.filter((o) => weekday(o.date) === weekday(now.date));
    if (sameDay.length >= 3) nextLine += ` E a ${sameDay.length}-a oară în 3 săptămâni când ${DAY[weekday(now.date)]} nu ajunge timpul: propun să mutăm ședința de ${DAY[weekday(now.date)]} pe altă zi sau să scurtăm fereastra din program (Profil → Program). Capacitatea ta nu se schimbă.`;
    else if (timp.length >= 3) nextLine += ` Ai ${timp.length} ședințe nefăcute din lipsă de timp în 3 săptămâni: propun să revedem programul (zilele sau orele libere) ori să scădem cu o ședință pe săptămână. Capacitatea ta nu se schimbă.`;
  }
  const extra = now.motiv === 'durere' ? ' Spune și cât de tare doare (formularul de seară), ca restricția să fie corectă.' : now.motiv === 'boala' ? ' Dacă ai febră, bifeaz-o dimineața: atunci ziua e stop.' : '';
  const goal = recent.length >= 2 ? 'Despre obiectiv: neschimbat deocamdată; dacă oboseala continuă, se reevaluează la bilanțul săptămânal.' : 'Despre obiectiv: neschimbat; o ședință nu schimbă ce se poate.';
  return { changed, decision, message: `Am înregistrat: ${label}, ${what} (${MOTIV_LABEL[now.motiv]}). Nu o recuperăm prin dublare. ${nextLine}${extra} ${goal}` };
}

/**
 * Auditul v93, A62: nota „revine la plan după o ședință bine tolerată” are acum mecanism. O ședință viitoare ușurată
 * din oboseală/durere/boală revine la forma din plan după o execuție verde, fără durere (sub 3), a aceluiași sport,
 * făcută după ușurare. Fără execuție tolerată = rămâne ușoară (lipsa datelor nu e toleranță).
 */
export function restoreEased(plan: PlannedWorkout[], executions: { workoutId: string; color: string | null; pain?: number | null }[], today: string, at: string): PlannedWorkout[] {
  const byId = new Map(plan.map((w) => [w.id, w]));
  const out: PlannedWorkout[] = [];
  for (const w of plan) {
    if (!active(w) || w.date < today || !w.original || !isEasedBySystem(w)) continue;
    const since = (w.changedAt ?? '').slice(0, 10);
    const ok = executions.some((e) => {
      const p = byId.get(e.workoutId);
      return !!p && p.sport === w.sport && p.date < today && (!since || p.date >= since) && e.color === 'verde' && (e.pain == null || e.pain < 3);
    });
    if (!ok) continue;
    const o = w.original;
    out.push({ ...w, sport: o.sport ?? w.sport, type: o.type, plannedMinutes: o.plannedMinutes, targetZones: [...o.targetZones], structure: o.structure ?? undefined, key: o.key, intervals: o.intervals ?? undefined, note: undefined, original: null, flags: null, changedAt: at });
  }
  return out;
}
