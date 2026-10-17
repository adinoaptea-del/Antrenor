// Calendarul viu: regulile de adaptare din protocol, aplicate determinist pe antrenamentele viitoare.
// Agentul poate doar să scadă, să mute sau să înlocuiască; nu crește peste plan și nu anulează un roșu.

import { fitStructure } from './validate.js';
import { isActiveWorkout, type Activity, type Color, type FreeBlock, type PlannedWorkout, type Sport } from '../types.js';
import { addDays, diffDays, weekday } from '../util/dates.js';

export type AdaptEvent =
  | { kind: 'scor'; workoutId: string; color: Color }
  | { kind: 'readiness'; date: string; verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason?: string }
  | { kind: 'durere'; date: string; score: number; loc: string }
  | { kind: 'febra'; date: string }
  | {
      kind: 'neplanificat';
      activity: Activity;
      rpe?: number | null;
      /** Ce a fost, din răspunsul sportivului în aplicație: cursă, antrenament liber sau altceva (plimbare, joacă). */
      tip?: 'cursa' | 'antrenament' | 'altceva' | null;
    }
  /** Creșterea controlată: +10% volum săptămâna viitoare, doar pe ședințele ușoare (Z1–Z2), fără intensitate în plus. */
  | { kind: 'progres'; date: string; restricted?: Sport[] };

export interface AdaptContext {
  today: string;
  freeBlocks: FreeBlock[];
  /** Scorurile antrenamentelor-cheie din ultimele 14 zile (inclusiv cel curent, dacă e cazul). */
  recentKeyScores: { date: string; color: Color }[];
  /** Antrenamentele-cheie repetate în ultimele 28 de zile (treaptă repetată), pe tip+sport. */
  recentRepeats?: Record<string, number>;
}

export interface AdaptResult {
  plan: PlannedWorkout[];
  changes: string[];
}

const CHANGE_MIN = 10;
const FEVER_HALF_NOTE = 'prima săptămână după febră: volum −50%, fără cheie';

/**
 * Cheia stabilă a unui eveniment. Serverul o salvează înainte să aplice evenimentul (unică pe sportiv):
 * același eveniment reluat (reîncercare, două rulări în paralel) nu mai schimbă planul a doua oară.
 */
export function eventKey(ev: AdaptEvent): string {
  switch (ev.kind) {
    case 'scor':
      return `scor:${ev.workoutId}:${ev.color}`;
    case 'readiness':
      return `readiness:${ev.date}:${ev.verdict}`;
    case 'durere':
      return `durere:${ev.date}:${ev.loc}:${ev.score}`;
    case 'febra':
      return `febra:${ev.date}`;
    case 'neplanificat':
      return `neplanificat:${ev.activity.id}:${ev.activity.minutes}`;
    case 'progres':
      return `progres:${ev.date}`;
  }
}

export function adapt(plan: PlannedWorkout[], event: AdaptEvent, ctx: AdaptContext): AdaptResult {
  const next = plan.map((w) => ({ ...w, targetZones: [...w.targetZones] }));
  const changes: string[] = [];

  switch (event.kind) {
    case 'scor':
      applyScore(next, event, ctx, changes);
      break;
    case 'readiness':
      applyReadiness(next, event, ctx, changes);
      break;
    case 'durere':
      applyPain(next, event, ctx, changes);
      break;
    case 'febra':
      applyFever(next, event, changes);
      break;
    case 'neplanificat':
      applyUnplanned(next, event, changes);
      break;
    case 'progres':
      applyProgress(next, event, ctx, changes);
      break;
  }

  // Trecutul nu se rescrie: ce era înainte de azi rămâne prescripția valabilă atunci (o febră raportată târziu
  // protejează viitorul, nu ședințele deja trecute). Iar o ședință scurtată nu păstrează repetări care nu mai încap.
  const byId = new Map(plan.map((w) => [w.id, w]));
  const out = next.map((w) => {
    const orig = byId.get(w.id);
    if (orig && w.date < ctx.today) return orig;
    return orig && orig.plannedMinutes !== w.plannedMinutes ? fitStructure(w) : w;
  });
  const kept = changes.filter((c) => !plan.some((w) => w.date < ctx.today && c.startsWith(`${w.id}:`)));
  return { plan: out, changes: kept };
}

function applyScore(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'scor' }>, ctx: AdaptContext, changes: string[]): void {
  const w = plan.find((x) => x.id === ev.workoutId);
  if (!w || !w.key) return;
  if (ev.color !== 'rosu' && ev.color !== 'portocaliu') return;

  // Treapta se repetă la următorul antrenament-cheie de același tip; a treia oară coboară.
  const sameType = plan
    .filter((x) => x.key && x.type === w.type && x.sport === w.sport && diffDays(w.date, x.date) > 0 && isActiveWorkout(x))
    .sort((a, b) => diffDays(b.date, a.date));
  const nextKey = sameType[0];
  if (nextKey) {
    const repeats = ctx.recentRepeats?.[`${w.sport}:${w.type}`] ?? 0;
    if (repeats >= 2) {
      nextKey.plannedMinutes = Math.round((w.plannedMinutes * 0.9) / 5) * 5;
      nextKey.note = 'treaptă coborâtă (−10%) după trei nereușite';
      changes.push(`${nextKey.id}: ${nextKey.sport} ${nextKey.type} coborât la ${nextKey.plannedMinutes} min`);
    } else {
      nextKey.plannedMinutes = w.plannedMinutes;
      nextKey.step = w.step;
      nextKey.note = 'treaptă repetată';
      changes.push(`${nextKey.id}: ${nextKey.sport} ${nextKey.type} repetă treapta (${w.plannedMinutes} min)`);
    }
  }

  // Două antrenamente-cheie slabe în 14 zile → săptămâna următoare −20%, progresia oprită.
  const bad = ctx.recentKeyScores.filter((s) => (s.color === 'rosu' || s.color === 'portocaliu') && Math.abs(diffDays(s.date, w.date)) <= 14).length;
  if (bad >= 2) {
    const nextMonday = addDays(w.date, 7 - weekday(w.date));
    const nextSunday = addDays(nextMonday, 6);
    for (const x of plan) {
      if (!isActiveWorkout(x)) continue;
      if (diffDays(nextMonday, x.date) < 0 || diffDays(x.date, nextSunday) < 0) continue;
      if (!x.key) {
        x.plannedMinutes = Math.round((x.plannedMinutes * 0.8) / 5) * 5;
      }
      x.note = [x.note, 'săptămână −20%, progresie oprită'].filter(Boolean).join('; ');
    }
    changes.push(`săptămâna din ${nextMonday}: volum −20%, progresia oprită (${bad} antrenamente-cheie slabe în 14 zile)`);
  }
}

function applyReadiness(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'readiness' }>, ctx: AdaptContext, changes: string[]): void {
  if (ev.verdict === 'verde') return;
  const today = plan.filter((x) => x.date === ev.date && isActiveWorkout(x));

  // Galben / portocaliu: planul rămâne; fiecare ședință primește o SUGESTIE mai ușoară, iar sportivul alege.
  if (ev.verdict === 'galben') {
    for (const x of today) {
      if (x.type === 'forta' || x.type === 'odihna' || x.suggestion?.accepted != null) continue;
      const hard = x.type === 'calitate' || x.type === 'lung' || x.type === 'brick';
      const minutes = Math.max(20, Math.round((x.plannedMinutes * (hard ? 0.75 : 0.8)) / 5) * 5);
      x.suggestion = {
        minutes,
        zones: [1, 2],
        structure: hard ? `${minutes} min ușor în Z1–Z2, fără intervale` : `${minutes} min ușor, pe vorbit`,
        reason: ev.reason ?? 'recuperarea de azi e la jumătate',
        accepted: null,
      };
      changes.push(`${x.id}: sugestie mai ușoară (${minutes} min Z1–Z2); sportivul alege`);
    }
    return;
  }

  // Roșu sau stop: ziua devine gri; un antrenament-cheie se mută cu maximum o zi dacă are loc.
  for (const x of today) {
    x.status = 'anulat_sistem';
    x.note = ev.verdict === 'stop' ? `stop: ${ev.reason ?? 'escaladare la om'}` : `roșu la readiness${ev.reason ? `: ${ev.reason}` : ''}`;
    changes.push(`${x.id}: anulat de sistem (${ev.verdict})`);

    if (x.key && ev.verdict === 'rosu') {
      const tomorrow = addDays(ev.date, 1);
      const dayAfter = addDays(ev.date, 2);
      const keyNearby = plan.some((y) => y.key && isActiveWorkout(y) && y.id !== x.id && (y.date === tomorrow || y.date === dayAfter));
      const longest = ctx.freeBlocks.filter((b) => b.day === weekday(tomorrow)).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
      const countTomorrow = plan.filter((y) => y.date === tomorrow && isActiveWorkout(y)).length;
      if (!keyNearby && longest >= x.plannedMinutes + CHANGE_MIN && countTomorrow < 2) {
        plan.push({ ...x, id: `${x.id}-mutat`, date: tomorrow, status: 'mutat', note: `mutat de pe ${ev.date} (readiness roșu)` });
        changes.push(`${x.id}: antrenament-cheie mutat pe ${tomorrow}`);
      } else {
        changes.push(`${x.id}: antrenament-cheie pierdut (fără bloc liber sau altă cheie în 48 h)`);
      }
    }
  }
}

function applyPain(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'durere' }>, _ctx: AdaptContext, changes: string[]): void {
  if (ev.score < 3) return;
  const until = addDays(ev.date, 5);
  for (const x of plan) {
    if (!isActiveWorkout(x)) continue;
    if (diffDays(ev.date, x.date) < 0 || diffDays(x.date, until) < 0) continue;
    if (x.sport === 'alergare') {
      x.sport = 'bicicleta';
      x.type = 'z2';
      x.targetZones = [2];
      x.key = false;
      x.intervals = undefined;
      x.structure = undefined;
      x.note = `fără impact: durere ${ev.score}/10 la ${ev.loc}`;
      changes.push(`${x.id}: alergarea devine bicicletă Z2 (${x.plannedMinutes} min)`);
    } else if (x.type === 'brick') {
      x.type = 'lung';
      x.structure = 'tura lungă fără alergarea de după';
      x.note = `brick fără alergare: durere ${ev.score}/10 la ${ev.loc}`;
      changes.push(`${x.id}: brick fără alergare`);
    }
  }
  if (ev.score >= 5) changes.push(`durere ${ev.score}/10 la ${ev.loc}: escaladare la fizioterapeut în aceeași zi`);
}

function applyFever(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'febra' }>, changes: string[]): void {
  const stopUntil = addDays(ev.date, 2);
  const halfUntil = addDays(ev.date, 9);
  for (const x of plan) {
    if (!isActiveWorkout(x)) continue;
    const d = diffDays(ev.date, x.date);
    if (d < 0) continue;
    if (diffDays(x.date, stopUntil) >= 0) {
      x.status = 'anulat_sistem';
      x.note = 'febră: odihnă';
      changes.push(`${x.id}: anulat (febră)`);
    } else if (diffDays(x.date, halfUntil) >= 0) {
      // Febră și a doua zi: ședința deja înjumătățită nu se mai înjumătățește o dată.
      if (x.note === FEVER_HALF_NOTE) continue;
      x.plannedMinutes = Math.round((x.plannedMinutes * 0.5) / 5) * 5;
      x.key = false;
      if (x.type === 'calitate') {
        x.type = 'z2';
        x.intervals = undefined;
      }
      x.targetZones = x.sport === 'forta' ? [] : [1, 2];
      x.note = FEVER_HALF_NOTE;
      changes.push(`${x.id}: −50%, fără intensitate (după febră)`);
    }
  }
}

/**
 * Activitate în afara planului (cursă benevolă, antrenament liber). Principiul: se cuantifică și se ține cont de ea,
 * nu se adaugă peste plan.
 *  1. Volumul ei înlocuiește ședințele planificate ale aceluiași sport din aceeași săptămână, până la minutele ei
 *     (întâi cele ne-cheie; cheia doar dacă a fost cursă). Celelalte ședințe din ziua cursei se anulează.
 *  2. Efort mare (cursă, ≥ 90 min sau RPE ≥ 7): zilele următoare (2 după cursă, 1 altfel) devin Z1, fără calitate;
 *     cheile din 72 h după o cursă coboară la Z1–Z2, −25%.
 *  3. Cursă de ≥ 60 min: săptămâna următoare nu progresează — cheile rămân la minutele cheilor de același tip din
 *     săptămâna cursei.
 */
function applyUnplanned(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'neplanificat' }>, changes: string[]): void {
  const a = ev.activity;
  if (a.minutes < 30) return;
  const isRace = ev.tip === 'cursa';
  const big = isRace || a.minutes >= 90 || (ev.rpe ?? 0) >= 7;
  const longRace = isRace && a.minutes >= 60;
  const monday = addDays(a.date, -weekday(a.date));
  const sunday = addDays(monday, 6);
  const inWeek = (d: string) => diffDays(monday, d) >= 0 && diffDays(d, sunday) >= 0;

  // 1. Ziua cursei: restul ședințelor planificate se anulează (sportivul a făcut cursa în locul lor).
  if (isRace) {
    for (const x of plan) {
      if (isActiveWorkout(x) && x.date === a.date) {
        x.status = 'anulat_sistem';
        x.note = `zi de cursă neplanificată (${a.sport} ${a.minutes} min)`;
        changes.push(`${x.id}: anulat, zi de cursă`);
      }
    }
  }

  // 1b. Volumul înlocuiește ședințele aceluiași sport din aceeași săptămână, de după activitate.
  let remaining = a.minutes;
  const sameSport = plan
    .filter((x) => isActiveWorkout(x) && x.sport === a.sport && inWeek(x.date) && diffDays(a.date, x.date) > 0)
    .sort((p, q) => diffDays(q.date, p.date) || Number(p.key) - Number(q.key));
  for (const x of sameSport) {
    if (remaining <= 0) break;
    if (x.key && !isRace) continue;
    if (x.plannedMinutes > remaining + CHANGE_MIN) continue;
    x.status = 'sters';
    x.note = `înlocuit: ${isRace ? 'cursă' : 'activitate'} neplanificată de ${a.minutes} min pe ${a.date}`;
    remaining -= x.plannedMinutes;
    changes.push(`${x.id}: ${x.sport} ${x.type} ${x.plannedMinutes} min scos, volumul l-a acoperit activitatea din ${a.date}`);
  }

  if (!big) return;

  // 2. Zilele următoare: Z1, fără calitate; după cursă și cheile din 72 h coboară.
  const easyDays = isRace ? 2 : 1;
  for (const x of plan) {
    if (!isActiveWorkout(x)) continue;
    const d = diffDays(a.date, x.date);
    if (d < 1) continue;
    if (d <= easyDays) {
      if (x.key && !isRace) continue;
      x.targetZones = x.sport === 'forta' ? [] : [1];
      if (x.type === 'calitate') {
        x.type = 'z2';
        x.intervals = undefined;
      }
      if (x.key) {
        x.plannedMinutes = Math.round((x.plannedMinutes * 0.75) / 5) * 5;
        x.note = `după cursă: Z1, −25% (${a.minutes} min pe ${a.date})`;
        changes.push(`${x.id}: cheie coborâtă la Z1, −25% (cursă neplanificată)`);
      } else {
        const how = x.sport === 'forta' ? 'ușor, fără încărcări mari' : 'Z1';
        x.note = `${how} după ${isRace ? 'cursă' : 'activitate'} neplanificată (${a.minutes} min)`;
        changes.push(`${x.id}: ${how} (${isRace ? 'cursă' : 'activitate'} neplanificată din ${a.date})`);
      }
    } else if (isRace && d <= 3 && x.key) {
      x.targetZones = x.sport === 'forta' ? [] : [1, 2];
      x.plannedMinutes = Math.round((x.plannedMinutes * 0.75) / 5) * 5;
      x.intervals = undefined;
      if (x.type === 'calitate') x.type = 'z2';
      x.note = `în 72 h după cursă: Z1–Z2, −25%`;
      changes.push(`${x.id}: cheie coborâtă la Z1–Z2, −25% (72 h după cursă)`);
    }
  }

  // 3. Cursă lungă: săptămâna următoare nu progresează.
  if (!longRace) return;
  const nextMonday = addDays(monday, 7);
  const nextSunday = addDays(nextMonday, 6);
  // Referința e cheia planificată a săptămânii cursei, chiar dacă a fost înlocuită de cursă.
  const thisWeekKeys = plan.filter((x) => x.key && inWeek(x.date));
  for (const x of plan) {
    if (!x.key || !isActiveWorkout(x)) continue;
    if (diffDays(nextMonday, x.date) < 0 || diffDays(x.date, nextSunday) < 0) continue;
    const ref = thisWeekKeys.find((k) => k.sport === x.sport && k.type === x.type);
    if (ref && x.plannedMinutes > ref.plannedMinutes) {
      x.plannedMinutes = ref.plannedMinutes;
      x.step = ref.step;
      x.note = [x.note, `progresie oprită după cursa din ${a.date}`].filter(Boolean).join('; ');
      changes.push(`${x.id}: ${x.sport} ${x.type} rămâne la ${x.plannedMinutes} min (progresie oprită după cursă)`);
    }
  }
}

/**
 * +10% din volumul săptămânii viitoare, pus pe ședințele ușoare (z2/tehnica, fără cheie), cele mai lungi primele,
 * maximum +15 min pe ședință și fără să depășească fereastra liberă a zilei. Intensitatea nu crește niciodată aici.
 */
function applyProgress(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'progres' }>, ctx: AdaptContext, changes: string[]): void {
  const monday = addDays(ev.date, 7 - weekday(ev.date));
  const week = plan.filter((w) => isActiveWorkout(w) && diffDays(monday, w.date) >= 0 && diffDays(monday, w.date) < 7);
  const total = week.reduce((n, w) => n + w.plannedMinutes, 0);
  // Generatorul are deja progresia lui: dacă săptămâna viitoare e deja mai mare decât cea curentă (creștere planificată)
  // sau mai mică (descărcare / taper), nu se mai adaugă nimic peste. Un singur mecanism de creștere pe săptămână.
  const thisWeek = plan.filter((w) => isActiveWorkout(w) && diffDays(addDays(monday, -7), w.date) >= 0 && diffDays(addDays(monday, -7), w.date) < 7).reduce((n, w) => n + w.plannedMinutes, 0);
  if (thisWeek > 0 && (total > thisWeek * 1.02 || total < thisWeek * 0.9)) return;
  let budget = Math.floor((total * 0.1) / 5) * 5;
  if (budget < 5) return;
  const easy = week
    .filter((w) => !w.key && (w.type === 'z2' || w.type === 'tehnica') && w.sport !== 'forta' && !(ev.restricted ?? []).includes(w.sport))
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);
  for (const w of easy) {
    if (budget <= 0) break;
    const window = ctx.freeBlocks.filter((b) => b.day === weekday(w.date)).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
    const room = window ? window - w.plannedMinutes : 15;
    const add = Math.min(15, budget, Math.floor(room / 5) * 5);
    if (add <= 0) continue;
    w.plannedMinutes += add;
    w.note = `+${add} min: creștere controlată (7 zile verzi)`;
    budget -= add;
    changes.push(`${w.id}: ${w.sport} ${w.date} +${add} min (progres)`);
  }
  if (changes.length) changes.push(`progres: săptămâna ${monday}, +${Math.round(((total * 0.1 - budget) / Math.max(total, 1)) * 100)}% față de ${total} min`);
}
