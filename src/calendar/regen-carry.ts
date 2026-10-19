// Refacerea planului păstrează ce a ales sportivul (auditul de simulări live, L-SIM-01/02).
//
// Planul nou se construiește ca un candidat complet: ședințele generate, apoi plecările anunțate, apoi ajustările
// făcute de sportiv pe planul vechi (Fă-o ușoară, Mută, varianta aleasă din sugestie). O ajustare se reaplică doar
// pe aceeași ședință (aceeași zi, același sport, același tip ca forma ei din plan); dacă planul nou nu mai are ședința
// sau regula nu se mai poate aplica, ajustarea cade cu motivul scris, care apare în previzualizare înainte de
// confirmare. Previzualizarea și activarea folosesc același candidat; amprenta lui (`planSignature`) arată dacă între
// timp s-a schimbat ceva și face ca a doua confirmare identică să nu mai creeze încă o versiune.

import type { PlannedWorkout } from '../types.js';
import { weekday } from '../util/dates.js';
import { easyWorkout, moveOptions, moveWorkout, withOriginal } from './actions.js';

const DAY = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const SPORT = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță', mers: 'mers' } as const;
const active = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}`;

export type AdjustKind = 'usor' | 'muta' | 'varianta';

/** Ajustarea făcută de sportiv pe o ședință (din nota pusă de acțiune), sau null. */
export function userAdjustment(w: PlannedWorkout): AdjustKind | null {
  const n = w.note ?? '';
  if (/^ușoară la cererea ta/.test(n)) return 'usor';
  if (/^mutată de tine/.test(n)) return 'muta';
  if (/^varianta aleasă de tine/.test(n) || w.suggestion?.accepted === true) return 'varianta';
  return null;
}

export interface CarryResult {
  workouts: PlannedWorkout[];
  /** Ajustări păstrate, în cuvinte. */
  kept: string[];
  /** Ajustări care nu se mai aplică, cu motivul. */
  dropped: string[];
}

/** Reaplică pe candidat ajustările sportivului din planul vechi (doar pentru zilele de la `from`). */
export function carryAdjustments(candidate: PlannedWorkout[], oldPlan: PlannedWorkout[], from: string, today: string, at: string): CarryResult {
  let plan = candidate.map((w) => ({ ...w }));
  const kept: string[] = [];
  const dropped: string[] = [];
  const olds = oldPlan.filter((w) => active(w) && userAdjustment(w) && (w.original?.date ?? w.date) >= from).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const w of olds) {
    const kind = userAdjustment(w)!;
    const sOrig = w.suggestion?.original;
    const o = {
      date: w.original?.date ?? w.date,
      sport: (w.original?.sport ?? sOrig?.sport ?? w.sport) as PlannedWorkout['sport'],
      type: (w.original?.type ?? sOrig?.type ?? w.type) as PlannedWorkout['type'],
    };
    const label = `${DAY[weekday(o.date)]} ${dm(o.date)}, ${SPORT[o.sport]}`;
    const i = plan.findIndex((c) => active(c) && c.date === o.date && c.sport === o.sport && c.type === o.type);
    if (i < 0) {
      dropped.push(`${label} (${kind === 'usor' ? 'făcută ușoară' : kind === 'muta' ? `mutată pe ${DAY[weekday(w.date)]}` : 'varianta aleasă de tine'}): planul nou nu mai are ședința asta în ziua aceea`);
      continue;
    }
    const c = plan[i]!;
    try {
      if (kind === 'usor') {
        plan[i] = easyWorkout(c, at);
        kept.push(`${label}: rămâne ușoară (${plan[i]!.plannedMinutes} min)`);
      } else if (kind === 'muta') {
        const ok = moveOptions(plan, c.id, today).find((x) => x.date === w.date);
        if (!ok?.ok) {
          dropped.push(`${label}: mutarea pe ${DAY[weekday(w.date)]} nu mai e posibilă (${ok?.reason ?? 'altă săptămână'}); rămâne ${DAY[weekday(o.date)]}`);
          continue;
        }
        plan[i] = moveWorkout(plan, c.id, w.date, today, at);
        kept.push(`${label}: rămâne mutată pe ${DAY[weekday(w.date)]}`);
      } else {
        const next: PlannedWorkout = { ...c, sport: w.sport, type: w.type, key: w.key, plannedMinutes: w.plannedMinutes, targetZones: [...w.targetZones], structure: w.structure, intervals: undefined, note: w.note, ...(w.suggestion ? { suggestion: w.suggestion } : {}) };
        plan[i] = withOriginal(c, next, at);
        kept.push(`${label}: rămâne varianta aleasă de tine (${w.plannedMinutes} min)`);
      }
    } catch (e) {
      // Ex. „Fă-o ușoară” pe o ședință care în planul nou e deja ușoară: efectul e păstrat, nu e nimic de schimbat.
      const msg = e instanceof Error ? e.message : String(e);
      if (kind === 'usor' && /deja ușoară/.test(msg)) kept.push(`${label}: în planul nou e deja ușoară`);
      else dropped.push(`${label}: ${msg}`);
    }
  }
  plan = plan.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { workouts: plan, kept, dropped };
}

/** Amprenta unui plan (fără id-uri): aceeași pentru aceleași ședințe, durate, intensități, statusuri și structuri. */
export function planSignature(ws: PlannedWorkout[]): string {
  const rows = ws
    .filter((w) => w.status !== 'sters')
    .map((w) => [w.date, w.sport, w.type, w.plannedMinutes, w.targetZones.join(''), w.status, w.key ? 1 : 0, w.structure ?? ''].join('|'))
    .sort();
  let h = 5381;
  const s = rows.join('\n');
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return `${rows.length}-${(h >>> 0).toString(36)}`;
}

/** Totalurile din ce se activează: doar ședințele active (anulatele nu contează). */
export function weekTotals(ws: PlannedWorkout[], from: string, to: string): { sessions: number; hours: number } {
  const wk = ws.filter((w) => active(w) && w.date >= from && w.date < to && w.type !== 'odihna');
  return { sessions: wk.length, hours: Math.round((wk.reduce((n, w) => n + w.plannedMinutes, 0) / 60) * 10) / 10 };
}
