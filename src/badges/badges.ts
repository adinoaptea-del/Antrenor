// Insignele AIRON. Inspirate din aplicațiile mari, adaptate la un plan de triatlon:
//  - nivelul pe culori, ca la Nike Run Club (acolo pe km de alergare; la noi pe orele de antrenament din toate sporturile,
//    ca să nu răsplătim un singur sport);
//  - insigne pe trepte (bronz / argint / aur), ca la Garmin Connect;
//  - „Săptămâna perfectă” și provocarea lunii, ca la Apple Fitness — dar provocarea lunii e personală: ținta e sportul
//    rămas în urmă, nu „mai mult din ce-ți place”;
//  - zidul curselor, ca la Kotcha.
// Reguli: totul din date măsurate (ceas, plan, formulare), nimic declarat. Nimic nu răsplătește volumul cu orice preț:
// fără insigne pentru „cele mai multe ore” sau pentru zile de antrenament la rând (ar împinge peste zilele roșii).

import type { Activity, PlannedWorkout, Sport } from '../types.js';
import { matchActivities } from '../scoring/match.js';
import { addDays, weekStart } from '../util/dates.js';
import { phaseWeeks } from '../calendar/phases.js';

export type BadgeCategory = 'consecventa' | 'corp' | 'echilibru' | 'repere' | 'progres' | 'drum';
export const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  consecventa: 'Consecvență',
  corp: 'Ascultă corpul',
  echilibru: 'Echilibru',
  repere: 'Repere pe probe',
  progres: 'Progres măsurat',
  drum: 'Drumul până la cursă',
};

export interface Badge {
  /** Id stabil; pentru trepte: `${baza}-${treapta}`. */
  id: string;
  category: BadgeCategory;
  title: string;
  /** Cum se câștigă, în cuvinte. */
  how: string;
  /** 1 = bronz, 2 = argint, 3 = aur; null = insignă unică. */
  tier: 1 | 2 | 3 | null;
  /** Data (YYYY-MM-DD) la care s-a câștigat; null = încă nu. */
  earnedAt: string | null;
  progress: { have: number; target: number; unit: string };
}

export interface Level {
  name: string;
  color: string;
  hours: number;
  /** Pragul următorului nivel (ore); null la ultimul. */
  next: { name: string; hours: number } | null;
}

export interface Race {
  date: string;
  sport: Sport;
  minutes: number;
  distanceKm: number | null;
  name: string | null;
}

export interface Challenge {
  /** „2026-10” */
  month: string;
  title: string;
  have: number;
  target: number;
  done: boolean;
}

export interface BadgesResult {
  level: Level;
  badges: Badge[];
  challenge: Challenge | null;
  races: Race[];
}

export interface BadgesInput {
  today: string;
  goal: string | null;
  planStart: string | null;
  raceDate: string | null;
  /** Vârsta ≥ 40: descărcare la 3 săptămâni (ca în plan). */
  recoveryEvery?: number;
  plan: PlannedWorkout[];
  acts: Activity[];
  /** Zilele cu verdict roșu sau stop. */
  redDays: string[];
  /** Zilele cu formularul de dimineață completat. */
  morningDays: string[];
  /** Activitățile marcate de sportiv drept cursă. */
  raceActivityIds: string[];
  /** Zone din test (nu provizorii). */
  zonesTested: boolean;
  /** Eficiența la același puls: schimbarea în % (alergare / bicicletă), din cardul de eficiență. */
  efficiencyPct: number[];
}

const LEVELS: { name: string; color: string; hours: number }[] = [
  // Fără culorile semaforului (verde/galben/roșu sunt starea zilei): nume de drum și nuanțe neutre.
  { name: 'La început', color: '#7d878b', hours: 0 },
  { name: 'Pornit', color: '#a7b1b5', hours: 25 },
  { name: 'Constant', color: '#c9d3cf', hours: 100 },
  { name: 'Rezistent', color: '#e3ead9', hours: 250 },
  { name: 'Anduranță', color: '#b8d94a', hours: 450 },
  { name: 'Finisher', color: '#d4fa3a', hours: 700 },
];

const TRI = (goal: string | null) => goal === '70.3' || goal === 'olimpic' || goal === 'sprint';
const active = (w: PlannedWorkout) => (w.status === 'planificat' || w.status === 'mutat') && w.type !== 'odihna';

/** Insigne pe trepte: aceeași măsură, trei praguri. */
function tiered(base: string, category: BadgeCategory, title: string, how: (t: number) => string, unit: string, targets: [number, number, number], have: number, reachedAt: (target: number) => string | null): Badge[] {
  return targets.map((t, i) => ({
    id: `${base}-${i + 1}`,
    category,
    title,
    how: how(t),
    tier: (i + 1) as 1 | 2 | 3,
    earnedAt: have >= t ? reachedAt(t) : null,
    progress: { have: Math.min(have, t), target: t, unit },
  }));
}

/** Data la care un șir de evenimente (sortate) a atins al n-lea element. */
const nth = (dates: string[], n: number) => (dates.length >= n ? dates[n - 1]! : null);

export function computeBadges(i: BadgesInput): BadgesResult {
  const { today } = i;
  const acts = i.acts.filter((a) => a.date <= today);
  const past = i.plan.filter((w) => w.date < today);
  const m = matchActivities(past, acts, addDays(today, -1));
  const doneIds = new Set(m.matches.filter((x) => x.activity).map((x) => x.planned.id));
  const red = new Set(i.redDays);

  // ——— Nivelul (orele din toate sporturile, de la începutul planului) ———
  const since = i.planStart ?? acts.reduce((d, a) => (a.date < d ? a.date : d), today);
  const hours = Math.round(acts.filter((a) => a.date >= since).reduce((n, a) => n + a.minutes, 0) / 6) / 10;
  const li = LEVELS.reduce((k, l, idx) => (hours >= l.hours ? idx : k), 0);
  const level: Level = { name: LEVELS[li]!.name, color: LEVELS[li]!.color, hours, next: LEVELS[li + 1] ? { name: LEVELS[li + 1]!.name, hours: LEVELS[li + 1]!.hours } : null };

  // ——— Săptămânile încheiate ———
  const weeks: { start: string; end: string; planned: number; done: number; perfect: boolean; tri: boolean }[] = [];
  if (i.planStart) {
    for (let ws = weekStart(i.planStart); addDays(ws, 6) < today; ws = addDays(ws, 7)) {
      const end = addDays(ws, 6);
      const wk = i.plan.filter((w) => w.date >= ws && w.date <= end && active(w));
      const done = wk.filter((w) => doneIds.has(w.id)).length;
      const trainedOnRed = acts.some((a) => a.date >= ws && a.date <= end && red.has(a.date) && a.minutes >= 20);
      const sports: Sport[] = ['inot', 'bicicleta', 'alergare'];
      const tri = sports.every((s) => {
        const p = wk.filter((w) => w.sport === s).reduce((n, w) => n + w.plannedMinutes, 0);
        const f = acts.filter((a) => a.sport === s && a.date >= ws && a.date <= end).reduce((n, a) => n + a.minutes, 0);
        return p > 0 && f >= p * 0.8;
      });
      weeks.push({ start: ws, end, planned: wk.length, done, perfect: wk.length >= 3 && done === wk.length && !trainedOnRed, tri });
    }
  }
  const perfectDates = weeks.filter((w) => w.perfect).map((w) => w.end);
  let streak = 0;
  let best = 0;
  const streakReached: Record<number, string> = {};
  for (const w of weeks) {
    if (w.planned >= 3 && w.done / w.planned >= 0.8) {
      streak += 1;
      best = Math.max(best, streak);
      if (!streakReached[streak]) streakReached[streak] = w.end;
    } else streak = 0;
  }
  const triDates = weeks.filter((w) => w.tri).map((w) => w.end);

  // ——— Dimineți la rând (cea mai lungă serie) ———
  const mdays = [...new Set(i.morningDays)].sort();
  let ms = 0;
  let mbest = 0;
  const mReached: Record<number, string> = {};
  for (let k = 0; k < mdays.length; k++) {
    ms = k > 0 && addDays(mdays[k - 1]!, 1) === mdays[k] ? ms + 1 : 1;
    mbest = Math.max(mbest, ms);
    if (!mReached[ms]) mReached[ms] = mdays[k]!;
  }

  // ——— Zile roșii respectate ———
  const redKept = [...red].filter((d) => d < today && !acts.some((a) => a.date === d && a.minutes >= 20)).sort();

  // ——— Ședințe ușoare făcute chiar ușor (Z3+ sub 10% din minute, măsurat) ———
  const easyDone = m.matches
    .filter((x) => x.activity && x.planned.targetZones.length && Math.max(...x.planned.targetZones) <= 2 && x.activity.timeInZonesMin)
    .filter((x) => {
      const t = x.activity!.timeInZonesMin!;
      const hard = (t[3] ?? 0) + (t[4] ?? 0) + (t[5] ?? 0);
      return hard <= x.activity!.minutes * 0.1;
    })
    .map((x) => x.planned.date)
    .sort();

  const badges: Badge[] = [];
  badges.push(...tiered('saptamana-perfecta', 'consecventa', 'Săptămâna perfectă', (t) => `${t === 1 ? 'O săptămână' : `${t} săptămâni`} cu toate ședințele din plan făcute (minimum 3) și fără antrenament în zilele roșii`, 'săpt.', [1, 5, 15], perfectDates.length, (t) => nth(perfectDates, t)));
  badges.push(...tiered('serie', 'consecventa', 'Serie de consecvență', (t) => `${t} săptămâni la rând cu cel puțin 80% din plan făcut`, 'săpt. la rând', [4, 12, 26], best, (t) => streakReached[t] ?? null));
  badges.push(...tiered('dimineti', 'consecventa', 'Dimineți', (t) => `Formularul de dimineață ${t} zile la rând`, 'zile la rând', [7, 30, 90], mbest, (t) => mReached[t] ?? null));
  badges.push(...tiered('zi-rosie', 'corp', 'Zi roșie respectată', (t) => `${t === 1 ? 'O zi roșie' : `${t} zile roșii`} fără antrenament: și odihna e antrenament`, 'zile', [1, 5, 10], redKept.length, (t) => nth(redKept, t)));
  badges.push(...tiered('usor', 'corp', 'Ușor pe bune', (t) => `${t} ședințe ușoare făcute chiar ușor (sub 10% din timp în Z3+, după ceas)`, 'ședințe', [10, 30, 75], easyDone.length, (t) => nth(easyDone, t)));
  if (TRI(i.goal)) badges.push(...tiered('triatlonist', 'echilibru', 'Triatlonist complet', (t) => `${t === 1 ? 'O săptămână' : `${t} săptămâni`} cu toate trei sporturile la cel puțin 80% din plan`, 'săpt.', [1, 4, 12], triDates.length, (t) => nth(triDates, t)));

  // ——— Repere pe probe: distanța într-o singură ședință ———
  const firstOver = (sport: Sport, km: number) => acts.filter((a) => a.sport === sport && (a.distanceKm ?? 0) >= km).map((a) => a.date).sort()[0] ?? null;
  const bestKm = (sport: Sport) => Math.max(0, ...acts.filter((a) => a.sport === sport).map((a) => a.distanceKm ?? 0));
  const milestones: { sport: Sport; title: string; km: [number, number, number]; unit: string; scale: number }[] = TRI(i.goal) || !i.goal
    ? [
        { sport: 'inot', title: 'Înot într-o ședință', km: [1, 1.9, 2.5], unit: 'm', scale: 1000 },
        { sport: 'bicicleta', title: 'Bicicletă într-o ședință', km: [40, 60, 90], unit: 'km', scale: 1 },
        { sport: 'alergare', title: 'Alergare într-o ședință', km: [10, 15, 21.1], unit: 'km', scale: 1 },
      ]
    : [{ sport: 'alergare', title: 'Alergare într-o ședință', km: i.goal === 'maraton' ? [21.1, 30, 42.2] : [10, 15, 21.1], unit: 'km', scale: 1 }];
  for (const ms2 of milestones) {
    const have = bestKm(ms2.sport);
    ms2.km.forEach((k, idx) =>
      badges.push({
        id: `${ms2.sport}-dist-${idx + 1}`,
        category: 'repere',
        title: ms2.title,
        how: `${ms2.unit === 'm' ? `${Math.round(k * 1000)} m` : `${k} km`} într-o singură ședință${(ms2.sport === 'inot' && k === 1.9) || (ms2.sport === 'bicicleta' && k === 90) || (ms2.sport === 'alergare' && k === 21.1) ? ' (distanța cursei)' : ''}`,
        tier: (idx + 1) as 1 | 2 | 3,
        earnedAt: firstOver(ms2.sport, k),
        progress: { have: Math.round(Math.min(have, k) * ms2.scale * 10) / 10, target: Math.round(k * ms2.scale * 10) / 10, unit: ms2.unit },
      }),
    );
  }
  if (TRI(i.goal)) {
    const brick = m.matches.filter((x) => x.planned.type === 'brick' && x.activity && x.extraActivity).map((x) => x.planned.date).sort()[0] ?? null;
    badges.push({ id: 'brick', category: 'repere', title: 'Primul brick', how: 'Bicicletă urmată imediat de alergare, cum e în plan', tier: null, earnedAt: brick, progress: { have: brick ? 1 : 0, target: 1, unit: '' } });
  }

  // ——— Progres măsurat ———
  const eff = Math.max(-100, ...i.efficiencyPct);
  badges.push({ id: 'eficient', category: 'progres', title: 'Mai eficient', how: 'Cu 5% mai rapid la același puls față de acum 6 săptămâni (ședințe ușoare, pe plat)', tier: null, earnedAt: eff >= 5 ? today : null, progress: { have: Math.max(0, Math.round(eff)), target: 5, unit: '%' } });
  const fourByFour = m.matches.filter((x) => /4\s*×\s*4/.test(x.planned.structure ?? '') && x.activity?.timeInZonesMin && ((x.activity.timeInZonesMin[4] ?? 0) + (x.activity.timeInZonesMin[5] ?? 0)) >= 12).map((x) => x.planned.date).sort()[0] ?? null;
  badges.push({ id: '4x4', category: 'progres', title: 'Primul 4×4 complet', how: 'Cele patru repetări în Z4 (cel puțin 12 min în Z4+, după ceas). Doar cu avizul cardiologului', tier: null, earnedAt: fourByFour, progress: { have: fourByFour ? 1 : 0, target: 1, unit: '' } });
  badges.push({ id: 'zone', category: 'progres', title: 'Știi unde ești', how: 'Testul de teren făcut: zonele de puls sunt ale tale, nu din formulă', tier: null, earnedAt: i.zonesTested ? today : null, progress: { have: i.zonesTested ? 1 : 0, target: 1, unit: '' } });

  // ——— Drumul până la cursă: fazele încheiate cu cel puțin 75% din ședințe ———
  if (i.planStart && i.raceDate) {
    let pw: ReturnType<typeof phaseWeeks> = [];
    try {
      pw = phaseWeeks(i.planStart, i.raceDate, i.recoveryEvery ?? 4);
    } catch {
      pw = [];
    }
    const names: Record<string, string> = { baza1: 'Bază 1', baza2: 'Bază 2', build: 'Build', peak: 'Peak' };
    for (const ph of ['baza1', 'baza2', 'build', 'peak']) {
      const ws = pw.filter((w) => w.phase === ph);
      if (!ws.length) continue;
      const end = addDays(ws[ws.length - 1]!.weekStart, 6);
      const wk = i.plan.filter((w) => w.date >= ws[0]!.weekStart && w.date <= end && active(w));
      const pct = wk.length ? Math.round((wk.filter((w) => doneIds.has(w.id)).length / wk.length) * 100) : 0;
      badges.push({ id: `faza-${ph}`, category: 'drum', title: names[ph]!, how: `Faza ${names[ph]} încheiată cu cel puțin 75% din ședințe făcute`, tier: null, earnedAt: end < today && pct >= 75 ? end : null, progress: { have: end < today ? pct : Math.min(pct, 74), target: 75, unit: '%' } });
    }
    const start = i.raceDate <= today && acts.some((a) => a.date === i.raceDate) ? i.raceDate : null;
    badges.push({ id: 'start', category: 'drum', title: 'Linia de start', how: 'Ziua cursei, cu activitate înregistrată', tier: null, earnedAt: start, progress: { have: start ? 1 : 0, target: 1, unit: '' } });
    const raceDay = acts.filter((a) => a.date === i.raceDate);
    const sports = new Set(raceDay.map((a) => a.sport));
    const finisher = start && (TRI(i.goal) ? sports.has('inot') && sports.has('bicicleta') && sports.has('alergare') : sports.has('alergare')) ? i.raceDate : null;
    badges.push({ id: 'finisher', category: 'drum', title: 'Finisher', how: TRI(i.goal) ? 'Toate trei probele înregistrate în ziua cursei' : 'Alergarea înregistrată în ziua cursei', tier: null, earnedAt: finisher, progress: { have: finisher ? 1 : 0, target: 1, unit: '' } });
  }

  // ——— Provocarea lunii: sportul rămas cel mai mult în urmă luna asta ———
  const month = today.slice(0, 7);
  const monthPlan = i.plan.filter((w) => w.date.startsWith(month) && active(w) && w.sport !== 'forta');
  let challenge: Challenge | null = null;
  if (monthPlan.length) {
    const sports = [...new Set(monthPlan.map((w) => w.sport))];
    const rows = sports.map((s) => {
      const target = monthPlan.filter((w) => w.sport === s).length;
      const have = acts.filter((a) => a.sport === s && a.date.startsWith(month) && a.minutes >= 20).length;
      return { s, target, have, ratio: target ? have / target : 1 };
    });
    const pick = rows.sort((a, b) => a.ratio - b.ratio)[0]!;
    const word: Record<Sport, string> = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță' };
    challenge = { month, title: `${pick.target} ședințe de ${word[pick.s]} luna asta`, have: Math.min(pick.have, pick.target), target: pick.target, done: pick.have >= pick.target };
  }

  // ——— Zidul curselor ———
  const raceIds = new Set(i.raceActivityIds);
  const races: Race[] = acts
    .filter((a) => raceIds.has(a.id) || (i.raceDate != null && a.date === i.raceDate))
    .map((a) => ({ date: a.date, sport: a.sport, minutes: a.minutes, distanceKm: a.distanceKm ?? null, name: (a as Activity & { name?: string | null }).name ?? null }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return { level, badges, challenge, races };
}
