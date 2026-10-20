// Scorul unui antrenament, calculat determinist din patru măsurători: durată, timp în zona-țintă,
// RPE față de așteptări, durere. Aceleași praguri pentru toți sportivii.
//
// verde:      durată 90–115% din plan; timp în zonă ≥ 75%; RPE în ±1; durere < 3
// galben:     durată 75–90% sau > 115%; zona-țintă respectată sub 75% (făcut, dar mai puțin eficient); RPE +2; un interval abandonat; derivație cardiacă > 8%
// portocaliu: durată 50–75%; RPE ≥ +3; durere 3–4 (≥ 5 = portocaliu + escaladare); set principal abandonat
// rosu:       nicio activitate până la finalul zilei următoare (nefăcut: nu e o greșeală, doar nu se pune la progres), sau durată < 50%
//
// Pe lângă culoare, fiecare ședință are un scor intern de eficiență (0–100): cât din efectul planificat a obținut.
// Ieșitul din zonă scade eficiența, nu face ședința „greșită”. În zilele cu mai multe sporturi, o ședință mai ușoară
// compensată de una mai tare în aceeași zi (sau invers) nu e penalizată pe zonă.
// gri:        anulat de sistem
// asteptare:  încă în fereastră (azi sau mâine), fără activitate
//
// Auditul v93 (A69–A72):
//  - durata: totală (elapsed) față de plan, fiindcă planul include pauzele; „peste plan” doar pe timpul activ (A70);
//  - zona: pe blocul de lucru când există telemetrie aliniată pe blocuri; la intervale fără ea, neevaluată, nu
//    procentul pe toată ședința cu încălzire și revenire (A69);
//  - fără puls/zone: culoarea poate rămâne verde (decizia proprietarului), dar evaluarea e „parțial — intensitate
//    necunoscută”, separat de „făcut”, „conform scopului” și „bine tolerat” (A72);
//  - scurtată pentru timp: neutru pentru culoare, dar doza efectivă rămâne cea reală (A71).

import type { Activity, ActivityBlock, BlockKind, Color, EveningQuestionnaire, PlannedWorkout, WorkoutType, Zone } from '../types.js';
import type { EveningForm } from '../collector/types.js';
import type { Match } from './match.js';
import { addDays, diffDays } from '../util/dates.js';
import { fadePct } from '../collector/details.js';
import { easyWarmCool } from '../calendar/session-steps.js';

export const EXPECTED_RPE: Record<WorkoutType, number> = {
  odihna: 0,
  tehnica: 3,
  z2: 4,
  lung: 5,
  brick: 6,
  forta: 6,
  calitate: 7,
};

/** Eticheta fixă a evaluării parțiale (auditul v93, A72): culoarea poate rămâne verde, dar intensitatea nu e dovedită. */
export const INTENSITY_UNKNOWN = 'parțial — intensitate necunoscută';

export interface ScoreInput {
  planned: PlannedWorkout;
  activity: Activity | null;
  extraActivity?: Activity | null;
  questionnaire?: EveningQuestionnaire | null;
  /** Head coach-ul a dat roșu (readiness, boală, durere): antrenamentul devine gri. */
  systemCancelled?: boolean;
  /** Celelalte ședințe planificate și făcute în aceeași zi, cu direcția lor față de plan (pentru compensare). */
  sameDay?: { sport: string; directie: Direction }[];
  today: string;
}

export type Direction = 'mai_tare' | 'mai_usor' | 'conform' | null;

export interface ScoreMetrics {
  /** Scor intern de eficiență 0–100; null = nefăcut / încă în fereastră / anulat. */
  eficienta?: number | null;
  /** Intensitatea față de zona-țintă: mai tare, mai ușor sau conform. */
  directie?: Direction;
  /** Compensat de altă ședință din aceeași zi (text scurt) sau null. */
  compensat?: string | null;
  /** Durata totală (elapsed, cu opririle) față de plan, care include și pauzele. Aceeași convenție la orice furnizor. */
  durationPct: number | null;
  zonePct: number | null;
  /** Pe ce s-a calculat zona: blocul de lucru (telemetrie aliniată), intervalele sau toată ședința (ședințe constante). */
  zoneBasis?: 'blocuri' | 'intervale' | 'sedinta' | null;
  rpeDelta: number | null;
  pain: number | null;
  cardiacDriftPct: number | null;
  /** Minutele totale (cu opririle). */
  elapsedMin?: number | null;
  /** Minutele active (în mișcare), doar când sursa le dă separat; altfel null. */
  activeMin?: number | null;
  /** Doza efectiv făcută (minute active): la scurtare nu se inventează volumul lipsă. */
  dozaEfectivaMin?: number | null;
}

/**
 * Trei întrebări diferite, ținute separat (auditul v93, A72): „făcut” (există execuția), „conform scopului” (durata și
 * intensitatea blocului principal) și „bine tolerat” (RPE și durere din formularul de seară). null = nu se poate spune
 * din date; lipsa feedbackului nu e toleranță, lipsa pulsului nu e „zonă respectată”.
 */
export interface Evaluation {
  facut: boolean;
  conformScop: boolean | null;
  /** Scurtată din motive logistice: varianta disponibilă respectată (fără să dovedească doza întreagă). */
  conformVarianta?: boolean;
  tolerat: boolean | null;
  /** Lipsește cel puțin un criteriu: evaluarea e parțială. */
  partial: boolean;
  /** Ce lipsește, pe înțeles. */
  lipsa: string[];
}

export interface ScoreFlags {
  noQuestionnaire: boolean;
  noZoneData: boolean;
  cardiacDrift: boolean;
  escalate: boolean;
  missed?: boolean;
  /** Scurtată din motive logistice (timp, vreme, traseu), nu din oboseală. */
  logistic?: boolean;
  /** Ședința avea zone-țintă, dar intensitatea blocului principal nu se poate evalua (fără puls/zone/blocuri). */
  intensityUnknown?: boolean;
  /** Oprită din cauza durerii: decizie de siguranță, nu eșec. */
  stoppedForPain?: boolean;
}

export interface ScoreResult {
  color: Color;
  reasons: string[];
  metrics: ScoreMetrics;
  flags: ScoreFlags;
  /** Făcut / conform scopului / bine tolerat; lipsește doar când nu există execuție (nefăcut, așteptare, anulat). */
  evaluare?: Evaluation;
  /** false = se mai poate schimba o dată (chestionarul poate veni în 24 h sau fereastra nu s-a închis). */
  final: boolean;
}

/**
 * Durata unei activități în convenția scorului. Planul include pauzele/recuperările, deci numitorul corect e durata
 * totală (elapsed); durata activă (moving) se păstrează separat. Strava dă la alergare/bicicletă moving_time în
 * `minutes` și elapsed în detalii; Whoop/Oura dau direct start–stop. Aceeași ședință → aceeași durată (auditul v93, A70).
 */
export function sessionDurations(a: Activity): { elapsed: number; active: number; activeKnown: boolean } {
  const det = (a as Activity & { details?: { movingMin?: number | null; elapsedMin?: number | null } | null }).details;
  const elapsed = det?.elapsedMin != null && det.elapsedMin > 0 ? Math.max(det.elapsedMin, a.minutes) : a.minutes;
  const activeKnown = det?.movingMin != null && det.movingMin > 0;
  const active = activeKnown ? Math.min(det!.movingMin!, elapsed) : Math.min(a.minutes, elapsed);
  return { elapsed, active, activeKnown };
}

export function scoreWorkout(input: ScoreInput): ScoreResult {
  const { planned, activity, extraActivity, questionnaire, systemCancelled, today } = input;
  const reasons: string[] = [];
  const empty: ScoreMetrics = { durationPct: null, zonePct: null, rpeDelta: null, pain: null, cardiacDriftPct: null };
  const flags: ScoreFlags = { noQuestionnaire: !questionnaire, noZoneData: false, cardiacDrift: false, escalate: false };

  if (systemCancelled) {
    return { color: 'gri', reasons: ['anulat de sistem'], metrics: empty, flags, final: true };
  }

  if (!activity) {
    // Fereastra e ziua ședinței: de mâine, fără activitate în ziua ei, e nefăcută (o activitate sincronizată târziu,
    // cu data zilei, o recolorează la următorul calcul).
    const windowClosed = diffDays(planned.date, today) > 0;
    if (windowClosed) {
      return { color: 'rosu', reasons: ['nefăcut: nu se pune la progres (nu schimbă planul)'], metrics: empty, flags: { ...flags, missed: true }, final: true };
    }
    return { color: 'asteptare', reasons: ['fereastra se închide la finalul zilei'], metrics: empty, flags, final: false };
  }

  // Durata: totală față de plan (sub plan), activă pentru „peste plan” (opririle nu sunt muncă în plus).
  const durs = [activity, extraActivity].filter((a): a is Activity => !!a).map(sessionDurations);
  const elapsed = durs.reduce((n, d) => n + d.elapsed, 0);
  const active = durs.reduce((n, d) => n + d.active, 0);
  const durationPct = planned.plannedMinutes > 0 ? round1((elapsed / planned.plannedMinutes) * 100) : null;
  const activePct = planned.plannedMinutes > 0 ? round1((active / planned.plannedMinutes) * 100) : null;

  const zone = computeZone(planned, activity, extraActivity ?? null);
  const zonePct = zone.pct;
  if (zonePct == null) flags.noZoneData = true;
  // Zone-țintă cerute, dar fără date pe blocul principal: evaluarea e parțială (nu „zonă respectată”).
  const needsIntensity = planned.targetZones.length > 0 && planned.type !== 'forta' && planned.type !== 'odihna';
  if (zonePct == null && needsIntensity) flags.intensityUnknown = true;

  const rpe = questionnaire?.rpe ?? null;
  const rpeDelta = rpe == null ? null : rpe - EXPECTED_RPE[planned.type];
  const pain = questionnaire?.painScore ?? null;

  const cardiacDriftPct = computeDrift(activity);
  if (cardiacDriftPct != null && cardiacDriftPct > 8) flags.cardiacDrift = true;

  const directie = zoneDirection(planned, activity, extraActivity ?? null);
  const other = (input.sameDay ?? []).find((o) => (directie === 'mai_usor' && o.directie === 'mai_tare') || (directie === 'mai_tare' && o.directie === 'mai_usor'));
  const compensat = other ? `${directie === 'mai_usor' ? 'mai ușor' : 'mai tare'} aici, ${other.directie === 'mai_tare' ? 'mai tare' : 'mai ușor'} la ${other.sport} în aceeași zi` : null;
  const metrics: ScoreMetrics = {
    durationPct,
    zonePct,
    zoneBasis: zone.basis,
    rpeDelta,
    pain,
    cardiacDriftPct,
    directie,
    compensat,
    elapsedMin: elapsed,
    activeMin: durs.some((d) => d.activeKnown) ? active : null,
    dozaEfectivaMin: active,
  };

  // Siguranța înaintea oricărui scor: durerea mare se escaladează și când ședința a fost oprită devreme (des, chiar din cauza ei).
  if (pain != null && pain >= 5) flags.escalate = true;

  const intensityReason = `${INTENSITY_UNKNOWN}: ${zone.why ?? 'fără puls pe zone suficient pentru blocul principal (intensitate neevaluată)'}`;
  const isStrength = planned.type === 'forta' || planned.sport === 'forta';
  const evaluation = (conformScop: boolean | null, extra: Partial<Evaluation> = {}): Evaluation => {
    const lipsa: string[] = [];
    if (flags.intensityUnknown) lipsa.push('intensitatea blocului principal (puls pe zone)');
    if (isStrength) lipsa.push('seriile notate (la forță, durata ceasului nu dovedește seriile)');
    // Bine tolerat: doar din feedback. Lipsa lui nu e toleranță (regula 7).
    const tolerat = pain == null && rpeDelta == null ? null : (pain ?? 0) < 3 && (rpeDelta == null || rpeDelta < 2);
    if (tolerat == null) lipsa.push('feedbackul de seară (RPE, durere): lipsa lui nu înseamnă toleranță');
    return { facut: true, conformScop, tolerat, partial: lipsa.length > 0, lipsa, ...extra };
  };
  // Eticheta parțială stă printre primele două motive (ecranele arată două).
  const placeIntensity = () => {
    if (flags.intensityUnknown) reasons.splice(Math.min(1, reasons.length), 0, intensityReason);
  };

  // Motivul abaterii: scurtată din cauza timpului, vremii sau traseului nu e oboseală și nu e eșec. Fără durere,
  // durata nu mai coboară culoarea sub galben și nu se pune la „nereușite” (regula treptei repetate). Dar doza nu se
  // inventează: eficiența e pe doza reală, iar „conform variantei” e separat de „conform scopului” (auditul v93, A71).
  const LOGISTIC: Record<string, string> = { timp: 'timpul', vreme: 'vremea', traseu: 'traseul' };
  const logistic = questionnaire?.whatInterfered ? LOGISTIC[questionnaire.whatInterfered] : undefined;
  if (logistic && durationPct != null && durationPct < 90 && !(pain != null && pain >= 3)) {
    reasons.push(`scurtată din cauza: ${logistic}, nu oboseală: varianta disponibilă respectată`);
    reasons.push(`doza efectivă ${Math.round(active)} din ${planned.plannedMinutes} min: nu dovedește capacitatea pentru ședința întreagă și nu schimbă treapta`);
    placeIntensity();
    metrics.eficienta = efficiency(metrics, activity, false);
    return { color: 'galben', reasons, metrics, flags: { ...flags, logistic: true }, evaluare: evaluation(null, { conformVarianta: true }), final: isFinal(flags, planned, today) };
  }

  // Roșu: executat sub jumătate. Oprită din cauza durerii = decizie corectă de siguranță, nu eșec (culoarea e a
  // proprietarului; textul nu o prezintă ca nereușită).
  if (durationPct != null && durationPct < 50) {
    if (pain != null && pain >= 3) {
      flags.stoppedForPain = true;
      reasons.push(`oprită din cauza durerii (${pain}/10): decizie corectă de siguranță, nu eșec`);
    }
    if (flags.escalate) reasons.push(`durere ${pain}/10: escaladare la fizioterapeut`);
    reasons.push(`durată ${durationPct}% din plan (sub 50%)`);
    return { color: 'rosu', reasons, metrics, flags, evaluare: evaluation(false), final: isFinal(flags, planned, today) };
  }

  let level: 0 | 1 | 2 = 0; // 0 verde, 1 galben, 2 portocaliu
  const bump = (to: 1 | 2, why: string) => {
    reasons.push(why);
    if (to > level) level = to;
  };

  let durationOk = true;
  if (durationPct != null) {
    if (durationPct < 75) bump(2, `durată ${durationPct}% din plan (50–75%)`);
    else if (durationPct < 90) bump(1, `durată ${durationPct}% din plan (75–90%)`);
    else if (activePct != null && activePct > 115) bump(1, `durată ${activePct}% din plan (peste 115%)`);
    durationOk = durationPct >= 90 && (activePct == null || activePct <= 115);
  }
  if (metrics.activeMin != null && elapsed - active >= Math.max(5, 0.1 * elapsed)) reasons.push(`opriri ${Math.round(elapsed - active)} min (activ ${Math.round(active)} din ${Math.round(elapsed)} min)`);

  if (zonePct != null) {
    const dir = directie === 'mai_tare' ? ', mai tare decât planul' : directie === 'mai_usor' ? ', mai ușor decât planul' : '';
    // O alergare prea intensă nu e „reparată” de o bicicletă prea ușoară: celelalte ședințe ale zilei sunt doar observație.
    if (zonePct < 75) bump(1, `timp în zona-țintă ${zonePct}%${zone.basis === 'blocuri' ? ' (blocul de lucru)' : ''}${dir}: făcut, dar diferit de plan${compensat ? ` (${compensat}; încărcarea zilei e de urmărit)` : ''}`);
  }
  if (zone.warmupNote) reasons.push(zone.warmupNote);

  if (rpeDelta != null) {
    if (rpeDelta >= 3) bump(2, `RPE cu +${rpeDelta} peste așteptat`);
    else if (rpeDelta === 2) bump(1, 'RPE cu +2 peste așteptat');
  }

  if (pain != null) {
    if (pain >= 5) {
      bump(2, `durere ${pain}/10: escaladare la fizioterapeut`);
    } else if (pain >= 3) bump(2, `durere ${pain}/10`);
  }

  if (activity.mainSetAbandoned) bump(2, 'set principal abandonat');
  else if ((activity.intervalsAbandoned ?? 0) >= 1) bump(1, `${activity.intervalsAbandoned} interval(e) abandonat(e)`);

  if (flags.cardiacDrift) bump(1, `derivație cardiacă ${cardiacDriftPct}% (peste 8%)`);

  // Ieșirea lungă: o a doua jumătate mult mai lentă e un SEMNAL, nu automat un eșec (auditul v2, V2-15). Contează doar
  // pe teren fără mult urcuș și când pulsul NU a coborât (adică efortul s-a menținut și viteza a scăzut = oboseală);
  // dacă pulsul a scăzut, sportivul a încetinit intenționat (sau a mers): se notează, fără penalizare. Vremea și
  // alimentarea pot explica și ele; textul o spune.
  const det = (activity as Activity & { details?: { splitsSecPerKm?: number[] | null; elevGainM?: number | null } | null }).details;
  const hilly = det?.elevGainM != null && activity.distanceKm ? det.elevGainM / activity.distanceKm > 15 : false;
  const fade = planned.type === 'lung' && planned.sport === 'alergare' && !hilly ? fadePct(det?.splitsSecPerKm) : null;
  const hrHeld = activity.firstThirdHr != null && activity.lastThirdHr != null ? activity.lastThirdHr >= activity.firstThirdHr : null;
  if (fade != null && fade > 5 && hrHeld === true) bump(1, `a doua jumătate cu ${fade}% mai lentă la același puls: posibil oboseală (sau căldură, alimentare); data viitoare pornește puțin mai ușor`);
  else if (fade != null && fade > 5) reasons.push(`a doua jumătate cu ${fade}% mai lentă${hrHeld === false ? ', cu pulsul mai mic (ai încetinit tu)' : ''}: de urmărit, nu e automat o problemă`);
  else if (fade != null && fade <= -2) reasons.push(`final mai rapid cu ${Math.abs(fade)}%, cum era planificat`);

  metrics.eficienta = efficiency(metrics, activity, false);
  const color: Color = level === 0 ? 'verde' : level === 1 ? 'galben' : 'portocaliu';
  if (color === 'verde') reasons.unshift(['durată în țintă', zonePct != null ? 'zone în țintă' : null, rpeDelta != null ? 'RPE în țintă' : null].filter(Boolean).join(', '));
  placeIntensity();
  if (isStrength) reasons.push('la forță, durata ceasului nu dovedește seriile: execuția se vede în jurnalul de forță');
  if (flags.noQuestionnaire) reasons.push('fără chestionar: RPE și durerea lipsesc');

  const conformScop = !durationOk || activity.mainSetAbandoned ? false : zonePct != null ? zonePct >= 75 : needsIntensity || isStrength ? null : true;
  return { color, reasons, metrics, flags, evaluare: evaluation(conformScop), final: isFinal(flags, planned, today) };
}

/** Eticheta evaluării pentru ecrane: „făcut · conform scopului: … · tolerat: …”, cu „parțial” când lipsește un criteriu. */
export function evaluationLabel(e: Evaluation | null | undefined): string | null {
  if (!e) return null;
  const yn = (x: boolean | null, unknown: string) => (x == null ? unknown : x ? 'da' : 'nu');
  const scop = e.conformVarianta ? 'varianta scurtă respectată' : `conform scopului: ${yn(e.conformScop, 'necunoscut')}`;
  return `${e.facut ? 'făcut' : 'nefăcut'} · ${scop} · bine tolerat: ${yn(e.tolerat, 'fără feedback')}${e.partial ? ' (evaluare parțială)' : ''}`;
}

/** Răspunsurile de seară în forma scorului: o singură traducere, folosită de server (tabelul `scores`) și de pachetul AI. */
export function questionnaireFromEvening(e: EveningForm | null | undefined): EveningQuestionnaire | null {
  if (!e) return null;
  return { rpe: e.rpe, vsExpected: e.fata_de_asteptari, painScore: e.durere?.scor ?? null, painLoc: e.durere?.loc ?? null, whatInterfered: e.ce_a_incurcat, fuelingOk: e.fueling_conform, comment: e.comentariu };
}

/**
 * Formularul de seară al unei ședințe: întâi cel legat de activitate (id intern sau extern), apoi cel legat de ședința
 * din plan (`plan-<id>`), apoi unul din ziua ședinței — fără activitate legată întâi, apoi oricare care nu e al altei
 * activități potrivite (`taken`): formularul altei ședințe din aceeași zi nu se lipește aici.
 */
export function eveningFor(evenings: EveningForm[], activity: { id: string; externalId?: string } | null, planned: Pick<PlannedWorkout, 'id' | 'date'>, taken: Set<string> = new Set()): EveningForm | null {
  const byAct = activity ? evenings.find((e) => e.activityId && (e.activityId === activity.id || e.activityId === activity.externalId)) : undefined;
  return (
    byAct ??
    evenings.find((e) => e.activityId === `plan-${planned.id}`) ??
    evenings.find((e) => e.date === planned.date && !e.activityId) ??
    evenings.find((e) => e.date === planned.date && !!e.activityId && !taken.has(e.activityId) && !e.activityId.startsWith('plan-')) ??
    null
  );
}

export interface ScoredMatch extends Match {
  evening: EveningForm | null;
  result: ScoreResult;
}

/**
 * Scorul tuturor ședințelor potrivite — o singură funcție pentru tabelul `scores` (server/_lib/score.ts) și pentru
 * pachetul AI (src/collector/packet.ts): aceeași potrivire, același formular de seară (cu motivul scurtării), aceeași
 * compensare în aceeași zi. Același antrenament nu poate avea două culori (auditul v93, T51).
 */
export function scoreMatches(matches: Match[], evenings: EveningForm[], today: string): ScoredMatch[] {
  const dirs = new Map<string, Direction>();
  for (const m of matches) if (m.activity) dirs.set(m.planned.id, zoneDirection(m.planned, m.activity, m.extraActivity ?? null));
  const idsOf = (a: Activity | null) => (a ? [a.id, (a as Activity & { externalId?: string }).externalId].filter((x): x is string => !!x) : []);
  return matches.map((m) => {
    const sameDay = matches.filter((o) => o !== m && o.activity && o.planned.date === m.planned.date).map((o) => ({ sport: o.planned.sport, directie: dirs.get(o.planned.id) ?? null }));
    const taken = new Set(matches.filter((o) => o !== m).flatMap((o) => [...idsOf(o.activity), ...idsOf(o.extraActivity)]));
    const evening = eveningFor(evenings, m.activity as (Activity & { externalId?: string }) | null, m.planned, taken);
    const result = scoreWorkout({ planned: m.planned, activity: m.activity, extraActivity: m.extraActivity, questionnaire: questionnaireFromEvening(evening), systemCancelled: m.planned.status === 'anulat_sistem', today, sameDay });
    return { ...m, evening, result };
  });
}

/** Cât din efectul planificat s-a obținut (0–100). Zona ratată scade eficiența, nu anulează ședința. */
function efficiency(m: ScoreMetrics, a: Activity, compensated: boolean): number {
  let pen = 0;
  if (m.durationPct != null) {
    if (m.durationPct < 90) pen += Math.min(50, 90 - m.durationPct);
    else if (m.durationPct > 115) pen += Math.min(20, (m.durationPct - 115) * 0.5);
  }
  if (m.zonePct != null && !compensated) pen += Math.min(40, (100 - m.zonePct) * 0.5);
  if (a.mainSetAbandoned) pen += 30;
  else pen += Math.min(20, (a.intervalsAbandoned ?? 0) * 10);
  if (m.rpeDelta != null && m.rpeDelta >= 2) pen += 10;
  return Math.max(0, Math.min(100, Math.round(100 - pen)));
}

// ——— Zonele pe blocuri (A69) ———

/** Ședință pe intervale: zona se judecă doar pe repetări, nu pe toată durata. */
const isIntervalSession = (p: PlannedWorkout) => p.type === 'calitate' || !!p.intervals;

function addZones(into: Partial<Record<Zone, number>>, z: Partial<Record<Zone, number>>) {
  for (const k of [1, 2, 3, 4, 5] as Zone[]) into[k] = (into[k] ?? 0) + (z[k] ?? 0);
}
const sumZones = (z: Partial<Record<Zone, number>>) => ([1, 2, 3, 4, 5] as Zone[]).reduce((n, k) => n + (z[k] ?? 0), 0);

interface ZoneSource {
  zones: Partial<Record<Zone, number>> | null;
  /** Minutele pe care trebuie să le acopere pulsul (blocul de lucru sau toată ședința). */
  minutes: number;
  basis: 'blocuri' | 'sedinta' | null;
  why?: string;
  warmupNote?: string;
}

/**
 * Minutele în zone pe care se judecă ședința: blocurile de lucru când activitatea are telemetrie aliniată pe blocuri
 * (încălzirea și revenirea nu se cer în zona principală; încălzirea doar „nu peste Z2”); la intervale fără blocuri,
 * nimic (procentul pe toată ședința ar penaliza o execuție corectă, T1: 15/40 = 37,5%); la ședințele constante, toată ședința.
 */
function zoneSource(planned: PlannedWorkout, parts: Activity[]): ZoneSource {
  const withBlocks = parts.filter((a) => a.blocks?.some((b) => b.kind === 'lucru' && b.zonesMin));
  if (withBlocks.length) {
    const zones: Partial<Record<Zone, number>> = {};
    const warm: Partial<Record<Zone, number>> = {};
    let minutes = 0;
    for (const a of withBlocks)
      for (const b of a.blocks!) {
        if (b.kind === 'lucru') {
          minutes += b.minutes;
          if (b.zonesMin) addZones(zones, b.zonesMin);
        } else if (b.kind === 'incalzire' && b.zonesMin) addZones(warm, b.zonesMin);
      }
    const warmTotal = sumZones(warm);
    const warmHard = (warm[3] ?? 0) + (warm[4] ?? 0) + (warm[5] ?? 0);
    const warmupNote = warmTotal > 0 && warmHard / warmTotal >= 0.5 ? 'încălzirea a fost peste Z2: data viitoare pornește mai ușor (observație, nu penalizare)' : undefined;
    return { zones, minutes, basis: 'blocuri', warmupNote };
  }
  if (isIntervalSession(planned)) return { zones: null, minutes: 0, basis: null, why: 'fără date pe blocuri: procentul pe toată ședința ar număra încălzirea și revenirea ca abatere' };
  const whole = parts.filter((a) => !!a.timeInZonesMin);
  if (!whole.length) return { zones: null, minutes: 0, basis: null, why: 'fără puls pe zone (intensitate neevaluată)' };
  const zones: Partial<Record<Zone, number>> = {};
  for (const a of whole) addZones(zones, a.timeInZonesMin!);
  return { zones, minutes: whole.reduce((n, a) => n + a.minutes, 0), basis: 'sedinta' };
}

function computeZone(planned: PlannedWorkout, activity: Activity, extra: Activity | null): { pct: number | null; basis: ScoreMetrics['zoneBasis']; why?: string; warmupNote?: string } {
  const parts = [activity, extra].filter((a): a is Activity => !!a);
  const src = zoneSource(planned, parts);
  if (src.basis !== 'blocuri' && planned.type === 'calitate' && activity.intervalsHitPct != null) return { pct: round1(activity.intervalsHitPct), basis: 'intervale' };
  if (!src.zones) return { pct: null, basis: null, why: src.why };
  let inTarget = 0;
  let total = 0;
  for (const z of [1, 2, 3, 4, 5] as Zone[]) {
    const m = src.zones[z] ?? 0;
    total += m;
    if (planned.targetZones.includes(z)) inTarget += m;
  }
  // Acoperire: minutele cu puls în zone trebuie să acopere cel puțin jumătate din bucata judecată; altfel intensitatea
  // e neevaluată (un minut de puls nu dovedește o oră în zonă).
  if (total === 0 || total < 0.5 * src.minutes) return { pct: null, basis: null, why: 'puls pe zone prea puțin față de durată (intensitate neevaluată)' };
  return { pct: round1((inTarget / total) * 100), basis: src.basis, warmupNote: src.warmupNote };
}

/** Direcția intensității: minutele peste zona-țintă față de cele sub ea (prag 15% din timp), pe aceeași bucată ca zona. */
export function zoneDirection(planned: PlannedWorkout, activity: Activity, extra: Activity | null = null): Direction {
  if (!planned.targetZones.length) return null;
  const src = zoneSource(planned, [activity, extra].filter((a): a is Activity => !!a));
  if (!src.zones) return null;
  const lo = Math.min(...planned.targetZones);
  const hi = Math.max(...planned.targetZones);
  let above = 0;
  let below = 0;
  let total = 0;
  for (const z of [1, 2, 3, 4, 5] as Zone[]) {
    const m = src.zones[z] ?? 0;
    total += m;
    if (z > hi) above += m;
    if (z < lo) below += m;
  }
  if (total === 0) return null;
  if (above / total >= 0.15 && above >= below) return 'mai_tare';
  if (below / total >= 0.15) return 'mai_usor';
  return 'conform';
}

export interface PlannedBlock {
  kind: BlockKind;
  minutes: number;
}

/**
 * Blocurile planificate ale ședinței, din aceeași structură ca planul: încălzire, lucru (repetările, cu pauzele dintre
 * ele) și revenire. Încălzirea/revenirea scrise în structură („încălzire 10 min”) au prioritate; altfel regula ședinței
 * ușoare (easyWarmCool). null când repetările nu încap în durată.
 */
export function plannedBlocks(planned: PlannedWorkout): PlannedBlock[] | null {
  const total = planned.plannedMinutes;
  if (!(total > 0)) return null;
  const s = planned.structure ?? '';
  const wc = easyWarmCool(total);
  const warm = Number(/încălzire\D{0,12}(\d+)\s*min/.exec(s)?.[1] ?? wc.warm);
  const cool = Number(/revenire\D{0,12}(\d+)\s*min/.exec(s)?.[1] ?? wc.cool);
  const iv = planned.intervals;
  if (!iv) {
    const main = total - warm - cool;
    return main > 0 ? [{ kind: 'incalzire', minutes: warm }, { kind: 'lucru', minutes: main }, { kind: 'revenire', minutes: cool }] : null;
  }
  const work = iv.count * iv.minutes;
  const rest = total - warm - cool - work;
  if (rest < 0) return null;
  const rec = iv.count > 1 ? rest / (iv.count - 1) : 0;
  const out: PlannedBlock[] = [{ kind: 'incalzire', minutes: warm }];
  for (let i = 0; i < iv.count; i++) {
    out.push({ kind: 'lucru', minutes: iv.minutes });
    if (i < iv.count - 1 && rec > 0) out.push({ kind: 'pauza', minutes: rec });
  }
  out.push({ kind: 'revenire', minutes: cool + (iv.count > 1 ? 0 : rest) });
  return out;
}

/**
 * Aliniază stream-ul de puls pe blocurile planificate și numără minutele în zone pe fiecare bloc. Latența pulsului:
 * primele `latencySec` (cel mult un sfert din bloc) ale fiecărui bloc de lucru nu se numără — pulsul urcă după efort.
 * `zoneTop` = limita de sus a Z1–Z4 (bpm), zonele sportivului. Mostrele de după ultimul bloc intră în revenire.
 */
export function blocksFromStream(samples: { sec: number; hr: number | null }[], layout: PlannedBlock[], zoneTop: [number, number, number, number], latencySec = 60): ActivityBlock[] {
  const zoneOf = (hr: number): Zone => (hr <= zoneTop[0] ? 1 : hr <= zoneTop[1] ? 2 : hr <= zoneTop[2] ? 3 : hr <= zoneTop[3] ? 4 : 5);
  const bounds: { start: number; end: number }[] = [];
  let t = 0;
  for (const b of layout) {
    bounds.push({ start: t, end: t + b.minutes * 60 });
    t += b.minutes * 60;
  }
  const out: ActivityBlock[] = layout.map((b) => ({ kind: b.kind, minutes: b.minutes, zonesMin: null }));
  const sorted = [...samples].sort((a, b) => a.sec - b.sec);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (s.hr == null || s.hr <= 0) continue;
    const dt = Math.min(10, Math.max(0, (sorted[i + 1]?.sec ?? s.sec + 1) - s.sec));
    let idx = bounds.findIndex((b) => s.sec >= b.start && s.sec < b.end);
    if (idx < 0) idx = s.sec >= t ? out.length - 1 : 0;
    const b = out[idx]!;
    if (b.kind === 'lucru') {
      const lag = Math.min(latencySec, (bounds[idx]!.end - bounds[idx]!.start) / 4);
      if (s.sec - bounds[idx]!.start < lag) continue;
    }
    const z = zoneOf(s.hr);
    b.zonesMin = b.zonesMin ?? {};
    b.zonesMin[z] = (b.zonesMin[z] ?? 0) + dt / 60;
  }
  for (const b of out) if (b.zonesMin) for (const k of Object.keys(b.zonesMin) as unknown as Zone[]) b.zonesMin[k] = round1(b.zonesMin[k]!);
  return out;
}

/** Culoarea e definitivă după 24 h de la ziua antrenamentului, sau imediat dacă a venit chestionarul. */
function isFinal(flags: ScoreFlags, planned: PlannedWorkout, today: string): boolean {
  if (!flags.noQuestionnaire) return true;
  return diffDays(addDays(planned.date, 1), today) > 0; // chestionarul de seară poate veni până a doua zi
}

/** Derivația cardiacă: FC a crescut în ultima treime față de prima, la aceeași putere/viteză (±3%). */
function computeDrift(a: Activity): number | null {
  if (a.firstThirdHr == null || a.lastThirdHr == null || a.firstThirdHr <= 0) return null;
  if (a.firstThirdOutput != null && a.lastThirdOutput != null && a.firstThirdOutput > 0) {
    const outputChange = Math.abs(a.lastThirdOutput / a.firstThirdOutput - 1);
    if (outputChange > 0.03) return null; // efortul s-a schimbat, derivația nu e interpretabilă
  }
  return round1((a.lastThirdHr / a.firstThirdHr - 1) * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
