// Calendarul viu: regulile de adaptare din protocol, aplicate determinist pe antrenamentele viitoare.
// Agentul poate doar să scadă, să mute sau să înlocuiască; nu crește peste plan și nu anulează un roșu.

import { fitStructure, resizeWorkout, shortenWorkout } from './validate.js';
import { brickSplit, normalizeWorkout } from './coherence.js';
import { applyProgression, type Execution } from './progression.js';
import { MIN_STRENGTH_MINUTES, SESSIONS, isFitnessSession, isMaintenanceSession, parseStrength, prescribe, rotationGroup, sessionKind, strengthStructure, type StrengthSpec } from '../strength/ppl.js';
import { painRegion } from './safety.js';
import type { CoverOption } from './load.js';
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
  | { kind: 'progres'; date: string; restricted?: Sport[] }
  /**
   * Efort mare făcut (≥ 90 min sau RPE ≥ 7), planificat sau nu: restul zilei se închide, zilele următoare se ușurează.
   * `planned` = activitatea a acoperit o ședință din plan (atunci partea „în afara planului” n-a mai aplicat nimic).
   */
  | { kind: 'efort'; activity: Activity; rpe?: number | null; planned: boolean }
  /**
   * Revenire după pauză: ultimele zile au avut mult mai puțin antrenament decât de obicei (boală, concediu, viață).
   * Calendarul nu continuă faza ca și cum nimic nu s-ar fi întâmplat: 7 zile fără intensitate, la 60%, apoi 7 zile la 80%.
   */
  | { kind: 'revenire'; date: string; zile: number; /** ultima activitate dinainte de pauză: cheia evenimentului */ dela: string }
  /** Bilanțul de duminică: obosit (sau efort 9–10 la ședințele grele) = săptămâna viitoare fără creștere, o intensitate mai puțin. */
  | { kind: 'bilant'; date: string; obosit: boolean; motiv: string }
  /** Ce ai făcut azi a acoperit efortul planificat al zilei (TRIMP): restul zilei odihnă. */
  | { kind: 'acoperit'; date: string; facut: number; planificat: number }
  /** Ziua e acoperită parțial: varianta aleasă (de agenți sau implicit) dintre cele calculate de cod. */
  | { kind: 'acoperire'; date: string; optiune: CoverOption; facut: number; planificat: number }
  /**
   * Fitness: ședință de sală ratată. Rotația continuă de unde ai rămas (ședința ratată trece în următorul slot al
   * săptămânii, restul se decalează); nimic nu se dublează și nu se adaugă o zi în plus.
   */
  | { kind: 'forta-ratat'; workoutId: string }
  /** Dimineața: treptele modulelor (T1→T2, V10a→V10, sweet spot, seturi CSS) din execuții, nu din calendar. */
  | { kind: 'trepte'; date: string }
  /** Propunerea validată a antrenorului AI: devine sugestie pe ședință; o activează doar sportivul. */
  | { kind: 'propunere'; date: string; workoutId: string; actiune: 'usureaza' | 'scurteaza'; minutes: number | null; motiv: string };

export interface AdaptContext {
  today: string;
  freeBlocks: FreeBlock[];
  /** Scorurile antrenamentelor-cheie din ultimele 14 zile (inclusiv cel curent, dacă e cazul). */
  recentKeyScores: { date: string; color: Color }[];
  /** Antrenamentele-cheie repetate în ultimele 28 de zile (treaptă repetată), pe tip+sport. */
  recentRepeats?: Record<string, number>;
  /** Ședințele deja executate (au activitate asociată): nicio adaptare nu le mai anulează sau schimbă. */
  done?: string[];
  /** Execuțiile cunoscute (scor, efort, durere, scurtare pentru timp), pentru treptele modulelor. */
  executions?: Execution[];
}

export interface AdaptResult {
  plan: PlannedWorkout[];
  changes: string[];
}

const CHANGE_MIN = 10;
// Formulat condiționat (auditul F55, F03): recuperarea nu e presupusă; ziua o decide chestionarul de dimineață.
const FEVER_HALF_NOTE = 'după febră, doar dacă dimineața nu mai ai febră: volum −50%, fără cheie; altfel pauză și reevaluare';
/**
 * Regula proprietarului (20.10.2026): un efort făcut în plus NU taie și nu scurtează o ședință propusă. Ședința rămâne
 * în plan; primește cel mult o SUGESTIE mai ușoară (anti-suprasolicitare), iar sportivul alege. Anularea rămâne doar la
 * semnale de sănătate (roșu/stop la recuperare, febră, durere) — nu la „ai făcut deja ceva azi”.
 */
export const EXTRA_CANCEL_NOTE = /^(acoperită|gata pe azi|efort mare azi|zi de cursă neplanificată)/;
export const EXTRA_SHORT_NOTE = /^scurtat la \d+ min: a mai rămas atât din efortul zilei/;
export function suggestLighter(x: PlannedWorkout, reason: string, minutes?: number, opts: { safety?: boolean } = {}): boolean {
  if (x.type === 'odihna' || x.suggestion?.accepted != null) return false;
  if (x.sport === 'forta') {
    const sp = parseStrength(x.structure);
    if (!sp) return false;
    // Forța, efort în plus (regula 29): aceleași exerciții și serii, greutăți mai mici, cel puțin 45 de minute.
    // Recuperare la jumătate / restricție de siguranță (excepția din 20.10.2026, A49): varianta scurtă — 2 serii pe
    // exercițiu, ~60% din durată (cel puțin 20 min), cu motivul scris în ședință.
    const light: StrengthSpec = opts.safety ? { ...sp, recovery: true, reduced: { why: 'siguranta', minutes: Math.max(20, Math.min(30, Math.round((x.plannedMinutes * 0.6) / 5) * 5)) } } : { ...sp, recovery: true };
    const m = opts.safety ? prescribe(light, light.reduced!.minutes).minutes : Math.max(MIN_STRENGTH_MINUTES, prescribe(light, MIN_STRENGTH_MINUTES).minutes);
    x.suggestion = { minutes: m, zones: [], structure: strengthStructure(light), reason, accepted: null };
    return true;
  }
  const hard = x.type === 'calitate' || x.type === 'lung' || x.type === 'brick' || x.targetZones.some((z) => z >= 3);
  const m = Math.max(20, Math.min(x.plannedMinutes, minutes ?? Math.round((x.plannedMinutes * 0.7) / 5) * 5));
  x.suggestion = { minutes: m, zones: [1, 2], structure: hard ? `${m} min ușor în Z1–Z2, fără intervale` : `${m} min ușor, pe vorbit`, reason, accepted: null };
  return true;
}

/**
 * Ședințele de azi și din viitor anulate sau scurtate de regulile vechi „efort în plus” revin în plan, cu sugestia ușoară.
 * Întoarce doar ședințele schimbate.
 */
export function restoreExtraCuts(plan: PlannedWorkout[], today: string): PlannedWorkout[] {
  const out: PlannedWorkout[] = [];
  for (const w of plan) {
    if (w.date < today) continue;
    const note = w.note ?? '';
    if (w.status === 'anulat_sistem' && EXTRA_CANCEL_NOTE.test(note)) {
      const x: PlannedWorkout = { ...w, status: w.original?.status === 'mutat' ? 'mutat' : 'planificat', note: undefined };
      suggestLighter(x, 'ai făcut deja efort azi: varianta ușoară previne suprasolicitarea; alegi tu');
      out.push(x);
    } else if (EXTRA_SHORT_NOTE.test(note) && w.original && w.original.plannedMinutes > w.plannedMinutes) {
      const o = w.original;
      const x: PlannedWorkout = { ...w, plannedMinutes: o.plannedMinutes, targetZones: o.targetZones, structure: o.structure ?? undefined, intervals: o.intervals ?? undefined, type: o.type, key: o.key, note: undefined };
      suggestLighter(x, 'ai făcut deja efort azi: varianta scurtă previne suprasolicitarea; alegi tu', w.plannedMinutes);
      out.push(x);
    }
  }
  return out;
}

const FEVER_STRENGTH_NOTE = 'după febră, doar dacă dimineața nu mai ai febră: forță scurtă — 2 serii pe exercițiu, greutăți mai mici; altfel pauză și reevaluare';
const isFeverHalf = (n: string | null | undefined) => n === FEVER_HALF_NOTE || n === FEVER_STRENGTH_NOTE || n === 'prima săptămână după febră: volum −50%, fără cheie';

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
    // Identitatea ședinței, nu id-ul unei înregistrări: aceeași ședință poate sosi de pe două brățări (alt id), dar două
    // ședințe reale din același sport în aceeași zi (dimineața și seara) rămân două (auditul v2, V2-03).
    case 'neplanificat':
      return `neplanificat:${activitySlot(ev.activity)}`;
    case 'progres':
      return `progres:${ev.date}`;
    case 'efort':
      return `efort:${activitySlot(ev.activity)}`;
    case 'revenire':
      return `revenire:${ev.dela}`;
    case 'bilant':
      return `bilant:${ev.date}`;
    case 'acoperit':
      return `acoperit:${ev.date}`;
    case 'acoperire':
      return `acoperire:${ev.date}`;
    case 'forta-ratat':
      return `forta-ratat:${ev.workoutId}`;
    case 'trepte':
      return `trepte:${ev.date}`;
    case 'propunere':
      return `propunere:${ev.date}:${ev.workoutId}`;
  }
}

/**
 * Cheia ședinței pentru evenimente: zi + sport + fereastra de start de 2 h (aceeași ședință văzută de două brățări
 * pornește la câteva minute distanță). Fără oră de start: id-ul înregistrării (prudent: nu contopește ședințe).
 * Limită: două ședințe reale din același sport începute în aceeași fereastră de 2 h sunt tratate ca una.
 */
/**
 * Cheia evenimentului unei activități (auditul v93, A21): identitatea ședinței după unirea brățărilor — cel mai mic id
 * dintre înregistrările unite —, nu o fereastră fixă de 2 ore (două ședințe reale în aceeași fereastră rămân două; aceeași
 * ședință văzută la 07:58 și 08:02 rămâne una).
 */
export function activitySlot(a: { date: string; sport: string; id: string; mergedIds?: string[] | null }): string {
  const ids = [...new Set([a.id, ...(a.mergedIds ?? [])])].sort();
  return `${a.date}:${a.sport}:${ids[0]}`;
}
/** Cheia veche (fereastră de 2 ore), doar ca să nu se repete o analiză deja trimisă înainte de schimbare. */
export function legacySlot(a: { date: string; sport: string; id: string; startLocal?: string | null }): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(a.startLocal ?? '');
  return m ? `${a.date}:${a.sport}:h${Math.floor((Number(m[1]) * 60 + Number(m[2])) / 120)}` : `${a.date}:${a.sport}:id-${a.id}`;
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
    case 'efort':
      applyBigEffort(next, event, ctx, changes);
      break;
    case 'revenire':
      applyReturn(next, event, ctx, changes);
      break;
    case 'bilant':
      applyReview(next, event, ctx, changes);
      break;
    case 'acoperit':
      applyCovered(next, event, ctx, changes);
      break;
    case 'acoperire':
      applyCoverChoice(next, event, ctx, changes);
      break;
    case 'forta-ratat':
      applyMissedStrength(next, event, ctx, changes);
      break;
    case 'propunere': {
      const x = next.find((w) => w.id === event.workoutId);
      if (!x || !isActiveWorkout(x) || (ctx.done ?? []).includes(x.id) || x.suggestion?.accepted != null) break;
      const minutes = event.actiune === 'scurteaza' && event.minutes ? event.minutes : Math.max(20, Math.round((x.plannedMinutes * 0.8) / 5) * 5);
      x.suggestion = { minutes, zones: event.actiune === 'usureaza' ? [1, 2] : x.targetZones, structure: event.actiune === 'usureaza' ? `${minutes} min ușor în Z1–Z2, fără intervale` : `aceeași ședință, scurtată la ${minutes} min`, reason: `propunerea antrenorului: ${event.motiv}`, accepted: null };
      changes.push(`${x.id}: propunere validată (${event.actiune}) pusă ca sugestie; o activează sportivul`);
      break;
    }
    case 'trepte': {
      const r = applyProgression(next, ctx.executions ?? [], event.date);
      for (let i = 0; i < next.length; i++) next[i] = r.plan[i]!;
      // Și „keep” își păstrează dovezile (auditul v2, V2-16).
      for (const d of r.decisions) changes.push(`${d.workoutId}: ${d.family} ${d.from === d.stepName ? `rămâne la ${d.stepName} [${d.decision}]` : `${d.from} → ${d.stepName} [${d.decision}]`} — ${d.evidence}`);
      break;
    }
  }

  // Trecutul nu se rescrie: ce era înainte de azi rămâne prescripția valabilă atunci (o febră raportată târziu
  // protejează viitorul, nu ședințele deja trecute). Iar o ședință scurtată nu păstrează repetări care nu mai încap.
  const byId = new Map(plan.map((w) => [w.id, w]));
  const done = new Set(ctx.done ?? []);
  const out = next.map((w) => {
    const orig = byId.get(w.id);
    if (orig && (w.date < ctx.today || done.has(w.id))) return orig;
    return orig && orig.plannedMinutes !== w.plannedMinutes ? normalizeWorkout(fitStructure(w)) : w;
  });
  const kept = changes.filter((c) => !plan.some((w) => (w.date < ctx.today || done.has(w.id)) && c.startsWith(`${w.id}:`)));
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
      // Repetarea treptei nu crește durata ședinței următoare (o poate doar păstra sau scădea).
      nextKey.plannedMinutes = Math.min(nextKey.plannedMinutes, w.plannedMinutes);
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
  const today = plan.filter((x) => x.date === ev.date && isActiveWorkout(x) && !(ctx.done ?? []).includes(x.id));

  // Galben / portocaliu: planul rămâne; fiecare ședință primește o SUGESTIE mai ușoară, iar sportivul alege.
  if (ev.verdict === 'galben') {
    for (const x of today) {
      // Forța primește și ea varianta ușoară (aceleași serii, greutăți mai mici), nu rămâne neatinsă (auditul v93, A05).
      if (x.type === 'forta') {
        if (suggestLighter(x, ev.reason ?? 'recuperarea de azi e la jumătate', undefined, { safety: true })) changes.push(`${x.id}: sugestie forță scurtă (2 serii, greutăți mai mici); sportivul alege`);
        continue;
      }
      if (x.type === 'odihna' || x.suggestion?.accepted != null) continue;
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

function applyPain(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'durere' }>, ctx: AdaptContext, changes: string[]): void {
  if (ev.score < 3) return;
  const done = new Set(ctx.done ?? []);
  // ≥ 5: roșu — fără antrenament azi și mâine; zilele următoare le decide restricția activă (rămâne până la o
  // raportare mai mică). Nicio alternativă activată automat.
  if (ev.score >= 5) {
    const until = addDays(ev.date, 1);
    for (const x of plan) {
      if (!isActiveWorkout(x) || done.has(x.id) || x.date < ev.date || x.date > until) continue;
      x.status = 'anulat_sistem';
      x.note = `durere ${ev.score}/10 la ${ev.loc}: pauză până la reevaluare (fizioterapeut / medic)`;
      changes.push(`${x.id}: anulat (durere ${ev.score}/10, roșu)`);
    }
    changes.push(`durere ${ev.score}/10 la ${ev.loc}: restricție roșie activă până la o raportare mai mică; escaladare la fizioterapeut`);
    return;
  }
  // 3–4: galben — planul nu se schimbă singur. Ședințele cu impact primesc o SUGESTIE fără impact, cu condiția scrisă
  // (încerci 5 min; dacă doare, te oprești); sportivul o confirmă sau nu.
  const until = addDays(ev.date, 5);
  // Zona contează (auditul v93, A07): umăr → înotul și sala primesc varianta ușoară, alergarea rămâne; spate → sala;
  // picioare / necunoscut → alergarea primește alternativa condiționată pe bicicletă.
  const region = painRegion(ev.loc);
  for (const x of plan) {
    if (!isActiveWorkout(x) || done.has(x.id) || x.date < ev.date || x.date > until || x.suggestion?.accepted != null) continue;
    if (region === 'sus' || region === 'spate') {
      const hit = region === 'sus' ? x.sport === 'inot' || x.sport === 'forta' : x.sport === 'forta' || x.type === 'lung';
      if (hit && suggestLighter(x, `durere ${ev.score}/10 la ${ev.loc}: doar dacă nu doare; dacă apare durerea, te oprești`, undefined, { safety: true })) changes.push(`${x.id}: sugestie ușoară (durere la ${ev.loc}), sportivul alege`);
      continue;
    }
    if (x.sport === 'alergare') {
      const minutes = Math.max(20, Math.round((x.plannedMinutes * 0.8) / 5) * 5);
      x.suggestion = {
        minutes,
        zones: [1, 2],
        sport: 'bicicleta',
        structure: `${minutes} min bicicletă ușoară (Z1–Z2), DOAR dacă pedalatul nu doare: încerci 5 min; dacă apare durerea la ${ev.loc}, te oprești și azi e pauză`,
        reason: `durere ${ev.score}/10 la ${ev.loc}; alternativa nu e presupusă potrivită, o confirmi tu`,
        accepted: null,
      };
      changes.push(`${x.id}: sugestie fără impact (bicicletă ușoară, condiționată), alergarea rămâne în plan până confirmi`);
    } else if (x.type === 'brick') {
      const { bike } = brickSplit(x.structure, x.plannedMinutes);
      x.suggestion = { minutes: bike, zones: [1, 2], structure: `${bike} min bicicletă ușoară, fără alergarea de după; doar dacă pedalatul nu doare`, reason: `durere ${ev.score}/10 la ${ev.loc}`, accepted: null };
      changes.push(`${x.id}: sugestie brick fără alergare (condiționată)`);
    }
  }
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
      if (isFeverHalf(x.note)) continue;
      x.key = false;
      if (x.type === 'calitate') {
        x.type = 'z2';
        x.intervals = undefined;
      }
      x.targetZones = x.sport === 'forta' ? [] : [1, 2];
      const sp = x.sport === 'forta' ? parseStrength(x.structure) : null;
      if (sp) {
        // Revenirea după boală e o excepție de la regula 20 (decizia proprietarului, 20.10.2026, A49): forța devine
        // varianta scurtă — 2 serii pe exercițiu, greutăți mai mici, ~jumătate din durată (cel puțin 20 min), cu motivul
        // scris în ședință (refacerea planului sau deschiderea aplicației nu o readuc la 45 de minute).
        const light: StrengthSpec = { ...sp, recovery: true, reduced: { why: 'boala', minutes: Math.max(20, Math.round((x.plannedMinutes * 0.5) / 5) * 5) } };
        x.structure = strengthStructure(light);
        x.plannedMinutes = prescribe(light, light.reduced!.minutes).minutes;
        x.note = FEVER_STRENGTH_NOTE;
        changes.push(`${x.id}: forță scurtă după febră (2 serii, greutăți mai mici, ${x.plannedMinutes} min)`);
        continue;
      }
      // Durata și conținutul din aceleași cifre (structura rescrisă).
      Object.assign(x, resizeWorkout(x, Math.max(15, Math.round((x.plannedMinutes * 0.5) / 5) * 5)));
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
  const longRace = isRace && a.minutes >= 60;
  const monday = addDays(a.date, -weekday(a.date));
  const sunday = addDays(monday, 6);
  const inWeek = (d: string) => diffDays(monday, d) >= 0 && diffDays(d, sunday) >= 0;
  void ev.rpe;

  // 1. Ziua cursei: restul ședințelor planificate se anulează (sportivul a făcut cursa în locul lor).
  if (isRace) {
    for (const x of plan) {
      if (isActiveWorkout(x) && x.date === a.date && suggestLighter(x, `ai făcut azi o cursă (${a.sport} ${a.minutes} min): varianta ușoară previne suprasolicitarea; alegi tu`)) {
        changes.push(`${x.id}: rămâne în plan, cu sugestie ușoară (zi de cursă)`);
      }
    }
  }

  // Volumul nu mai înlocuiește automat ședințe din săptămână, iar zilele următoare nu se ușurează din prima:
  // ziua o echivalează regula „acoperit/acoperire” (efort, nu minute), iar ziua de mâine o decid datele de dimineață.
  // 3. Cursă lungă: săptămâna următoare nu progresează.
  if (!longRace) {
    // Și „păstrează” își scrie dovezile (auditul v2, V2-16): ce s-a contabilizat, fereastra verificată, de ce rămâne planul.
    const weekMin = plan.filter((x) => isActiveWorkout(x) && inWeek(x.date) && x.sport === a.sport).reduce((n, x) => n + x.plannedMinutes, 0);
    const next48 = plan.filter((x) => isActiveWorkout(x) && x.date > a.date && diffDays(a.date, x.date) <= 2);
    const hard48 = next48.filter((x) => x.type === 'calitate' || x.type === 'brick' || x.key);
    changes.push(`activitate neplanificată contabilizată: ${a.sport} ${a.minutes} min pe ${a.date}${ev.rpe != null ? `, efort ${ev.rpe}/10` : ''} (planul săptămânii la ${a.sport}: ${weekMin} min). Verificat: următoarele 48 h (${next48.length ? next48.map((x) => `${x.date} ${x.sport} ${x.type}`).join(', ') : 'nimic planificat'}). Planul rămâne: ${hard48.length ? 'ziua de mâine o decid datele de dimineață (recuperarea), nu minutele în plus' : 'nicio ședință grea în 48 h, efortul nu cere schimbări'}; ce s-a făcut în plus nu se scade și nu se dublează din alte ședințe.`);
    return;
  }
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
  // Bilanțul de duminică a spus „obosit”: săptămâna viitoare nu crește.
  if (week.some((w) => (w.note ?? '').startsWith('bilanț de duminică'))) return;
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

/**
 * Organismul a primit azi un efort mare (≥ 90 min sau RPE ≥ 7): ce mai era de făcut azi rămâne, cu sugestie ușoară; zilele
 * următoare se ușurează. Peste 3 ore (ca o cursă): 2 zile ușoare și cheile din 72 h la Z1–Z2, −25%.
 * Dacă activitatea a fost în afara planului, zilele următoare le-a ajustat deja regula „neplanificat”; aici doar ziua.
 */
function applyBigEffort(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'efort' }>, ctx: AdaptContext, changes: string[]): void {
  const a = ev.activity;
  const done = new Set(ctx.done ?? []);
  const what = `${a.sport} ${a.minutes} min`;
  for (const x of plan) {
    if (!isActiveWorkout(x) || x.date !== a.date || done.has(x.id)) continue;
    if (suggestLighter(x, `ai făcut deja azi un efort mare (${what}): varianta ușoară previne suprasolicitarea; alegi tu`)) changes.push(`${x.id}: rămâne în plan, cu sugestie ușoară (efort mare azi: ${what})`);
  }
}

const HARD = (x: PlannedWorkout) => x.type === 'calitate' || x.type === 'brick' || x.targetZones.some((z) => z >= 4);

function applyReturn(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'revenire' }>, ctx: AdaptContext, changes: string[]): void {
  const done = new Set(ctx.done ?? []);
  for (const x of plan) {
    if (!isActiveWorkout(x) || done.has(x.id) || x.type === 'odihna') continue;
    const d = diffDays(ev.date, x.date);
    if (d < 0 || d > 13) continue;
    const factor = d <= 6 ? 0.6 : 0.8;
    const before = x.plannedMinutes;
    x.plannedMinutes = Math.max(20, Math.round((x.plannedMinutes * factor) / 5) * 5);
    if (d <= 6) {
      x.key = false;
      if (HARD(x) && x.sport !== 'forta') {
        if (x.type === 'calitate') x.type = 'z2';
        if (x.type === 'brick') {
          x.type = 'lung';
          x.structure = 'tură ușoară, fără alergarea de după';
        }
        x.targetZones = [1, 2];
        x.intervals = undefined;
        if (x.type === 'z2') x.structure = undefined;
      }
    }
    x.note = `revenire după ${ev.zile} zile de pauză: ${d <= 6 ? 'prima săptămână ușor, 60%' : 'a doua săptămână 80%'}; se reevaluează pe ${addDays(ev.date, 14)}`;
    changes.push(`${x.id}: ${x.sport} ${before} → ${x.plannedMinutes} min (revenire după pauză)`);
  }
}

function applyReview(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'bilant' }>, ctx: AdaptContext, changes: string[]): void {
  if (!ev.obosit) return;
  const monday = addDays(ev.date, 7 - weekday(ev.date));
  const week = plan.filter((x) => isActiveWorkout(x) && !(ctx.done ?? []).includes(x.id) && diffDays(monday, x.date) >= 0 && diffDays(monday, x.date) < 7).sort((a, b) => diffDays(b.date, a.date));
  // Fitness: săptămâna de revizuire vine din date (oboseală), nu din calendar: mai puține serii, rezervă 3–4.
  for (const x of week.filter((w) => w.type === 'forta')) {
    const spec = parseStrength(x.structure);
    if (!spec || !isFitnessSession(spec.session) || spec.recovery) continue;
    x.structure = strengthStructure({ ...spec, recovery: true });
    x.note = `revizuire: ${ev.motiv}; mai puține serii și rezervă mai mare, temporar`;
    changes.push(`${x.id}: sală în revizuire (bilanț: ${ev.motiv})`);
  }
  // O singură intensitate se transformă în ușor: prima din săptămână (cea mai apropiată de oboseala de acum).
  const first = week.find((x) => x.type === 'calitate' && x.sport !== 'forta');
  if (first) {
    first.type = 'z2';
    first.key = false;
    first.targetZones = [1, 2];
    first.intervals = undefined;
    first.structure = undefined;
    first.note = `bilanț de duminică: ${ev.motiv}; ședință ușoară în loc de intensitate`;
    changes.push(`${first.id}: ${first.sport} ${first.date} devine ușoară (bilanț: ${ev.motiv})`);
  }
  changes.push(`săptămâna din ${monday}: fără creștere (bilanț: ${ev.motiv})`);
}

/** Efortul zilei e acoperit (TRIMP făcut ≥ planificat): ce mai era azi rămâne, cu sugestie ușoară; mâine decid datele de dimineață. */
function applyCovered(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'acoperit' }>, ctx: AdaptContext, changes: string[]): void {
  const done = new Set(ctx.done ?? []);
  for (const x of plan) {
    if (!isActiveWorkout(x) || x.date !== ev.date || done.has(x.id) || x.type === 'odihna') continue;
    if (suggestLighter(x, `ai făcut deja efortul zilei (${ev.facut} din ${ev.planificat} TRIMP): varianta ușoară previne suprasolicitarea; alegi tu`)) changes.push(`${x.id}: rămâne în plan, cu sugestie ușoară (ziua e deja acoperită: ${ev.facut}/${ev.planificat} TRIMP)`);
  }
}

/** Varianta aleasă pentru restul zilei: doar schimbările calculate de cod (anulează / scurtează). */
function applyCoverChoice(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'acoperire' }>, ctx: AdaptContext, changes: string[]): void {
  const done = new Set(ctx.done ?? []);
  for (const c of ev.optiune.changes) {
    const i = plan.findIndex((x) => x.id === c.workoutId);
    const x = plan[i];
    if (!x || !isActiveWorkout(x) || x.date !== ev.date || done.has(x.id)) continue;
    // Nimic nu se taie: „anulează” devine sugestie ușoară, „scurtează” devine sugestie scurtă; sportivul alege.
    const why = `ai făcut deja ${ev.facut} din ${ev.planificat} TRIMP azi: varianta ${c.action === 'scurteaza' ? 'scurtă' : 'ușoară'} previne suprasolicitarea; alegi tu`;
    if (suggestLighter(x, why, c.action === 'scurteaza' ? c.minutes : undefined)) changes.push(`${x.id}: rămâne în plan, cu sugestie ${c.action === 'scurteaza' ? `scurtă (${c.minutes} min)` : 'ușoară'}`);
  }
}

function applyMissedStrength(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'forta-ratat' }>, ctx: AdaptContext, changes: string[]): void {
  const missed = plan.find((x) => x.id === ev.workoutId);
  const spec0 = missed ? parseStrength(missed.structure) : null;
  if (!missed || !spec0 || isMaintenanceSession(spec0.session)) return;
  const done = new Set(ctx.done ?? []);
  // Cursorul rotației urmează execuția (auditul v93, A59), pe tot planul viitor, nu doar în săptămâna asta, la fitness
  // și la PPL deopotrivă: ședința ratată trece în următorul slot de forță, iar fiecare slot ia ședința dinaintea lui.
  // Slotul își păstrează data, blocul, săptămâna și restricțiile (picioare ușoare / fără picioare, varianta scurtă);
  // se mută doar ședința și varianta. Lanțul se oprește la prima structură diferită (alt număr de ședințe pe săptămână:
  // tot corpul / sus-jos / PPL) sau la un slot „fără picioare” care ar primi picioare — acolo cade ședința purtată, nu
  // aceeași categorie în fiecare săptămână. Nimic dublat, nimic adăugat.
  const group = rotationGroup(spec0.session);
  const slots = plan
    .filter((x) => x.type === 'forta' && isActiveWorkout(x) && !done.has(x.id) && x.date > missed.date && x.date >= ctx.today)
    .map((x) => ({ x, sp: parseStrength(x.structure) }))
    .filter((o): o is { x: PlannedWorkout; sp: StrengthSpec } => !!o.sp)
    .sort((a, b) => (a.x.date < b.x.date ? -1 : 1));
  let carry: { session: StrengthSpec['session']; variant?: number } = { session: spec0.session, ...(spec0.variant != null ? { variant: spec0.variant } : {}) };
  const moved: string[] = [];
  for (const { x, sp } of slots) {
    if (rotationGroup(sp.session) !== group) break;
    if (sp.legs === 'fara' && sessionKind(carry.session) !== 'U') break;
    const next: StrengthSpec = { ...sp, session: carry.session };
    if (carry.variant != null) next.variant = carry.variant;
    else delete next.variant;
    carry = { session: sp.session, ...(sp.variant != null ? { variant: sp.variant } : {}) };
    const longest = ctx.freeBlocks.filter((b) => b.day === weekday(x.date)).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
    // Ședința mutată încape în timpul slotului ei din plan (nu crește), dar nu sub 45 de minute (în afara excepțiilor).
    const avail = Math.max(MIN_STRENGTH_MINUTES, Math.min(longest || x.plannedMinutes, x.plannedMinutes, 75));
    x.structure = strengthStructure(next);
    x.plannedMinutes = prescribe(next, avail).minutes;
    if (!x.note || /^rotația continuă după ședința ratată/.test(x.note)) x.note = `rotația continuă după ședința ratată din ${missed.date}`;
    moved.push(x.date);
  }
  if (!moved.length) {
    changes.push(`sală ratată pe ${missed.date}: nu mai e altă zi de sală cu aceeași structură; ${SESSIONS[spec0.session].name} nu se recuperează prin dublare`);
    return;
  }
  changes.push(`sală ratată pe ${missed.date}: rotația continuă de la ședința ratată (${moved.length} ședințe decalate, prima pe ${moved[0]}); ${SESSIONS[carry.session].name} cade la capătul lanțului, nu în fiecare săptămână; nimic dublat`);
}
