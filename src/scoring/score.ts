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

import type { Activity, Color, EveningQuestionnaire, PlannedWorkout, WorkoutType, Zone } from '../types.js';
import { addDays, diffDays } from '../util/dates.js';

export const EXPECTED_RPE: Record<WorkoutType, number> = {
  odihna: 0,
  tehnica: 3,
  z2: 4,
  lung: 5,
  brick: 6,
  forta: 6,
  calitate: 7,
};

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
  durationPct: number | null;
  zonePct: number | null;
  rpeDelta: number | null;
  pain: number | null;
  cardiacDriftPct: number | null;
}

export interface ScoreResult {
  color: Color;
  reasons: string[];
  metrics: ScoreMetrics;
  flags: { noQuestionnaire: boolean; noZoneData: boolean; cardiacDrift: boolean; escalate: boolean; missed?: boolean };
  /** false = se mai poate schimba o dată (chestionarul poate veni în 24 h sau fereastra nu s-a închis). */
  final: boolean;
}

export function scoreWorkout(input: ScoreInput): ScoreResult {
  const { planned, activity, extraActivity, questionnaire, systemCancelled, today } = input;
  const reasons: string[] = [];
  const empty: ScoreMetrics = { durationPct: null, zonePct: null, rpeDelta: null, pain: null, cardiacDriftPct: null };
  const flags = { noQuestionnaire: !questionnaire, noZoneData: false, cardiacDrift: false, escalate: false };

  if (systemCancelled) {
    return { color: 'gri', reasons: ['anulat de sistem'], metrics: empty, flags, final: true };
  }

  if (!activity) {
    const windowClosed = diffDays(addDays(planned.date, 1), today) > 0;
    if (windowClosed) {
      return { color: 'rosu', reasons: ['nefăcut: nu se pune la progres (nu schimbă planul)'], metrics: empty, flags: { ...flags, missed: true }, final: true };
    }
    return { color: 'asteptare', reasons: [`fereastra se închide la finalul zilei de ${addDays(planned.date, 1)}`], metrics: empty, flags, final: false };
  }

  const minutes = activity.minutes + (extraActivity?.minutes ?? 0);
  const durationPct = planned.plannedMinutes > 0 ? round1((minutes / planned.plannedMinutes) * 100) : null;

  const zonePct = computeZonePct(planned, activity, extraActivity ?? null);
  if (zonePct == null) flags.noZoneData = true;

  const rpe = questionnaire?.rpe ?? null;
  const rpeDelta = rpe == null ? null : rpe - EXPECTED_RPE[planned.type];
  const pain = questionnaire?.painScore ?? null;

  const cardiacDriftPct = computeDrift(activity);
  if (cardiacDriftPct != null && cardiacDriftPct > 8) flags.cardiacDrift = true;

  const directie = zoneDirection(planned, activity, extraActivity ?? null);
  const other = (input.sameDay ?? []).find((o) => (directie === 'mai_usor' && o.directie === 'mai_tare') || (directie === 'mai_tare' && o.directie === 'mai_usor'));
  const compensat = other ? `${directie === 'mai_usor' ? 'mai ușor' : 'mai tare'} aici, ${other.directie === 'mai_tare' ? 'mai tare' : 'mai ușor'} la ${other.sport} în aceeași zi` : null;
  const metrics: ScoreMetrics = { durationPct, zonePct, rpeDelta, pain, cardiacDriftPct, directie, compensat };

  // Siguranța înaintea oricărui scor: durerea mare se escaladează și când ședința a fost oprită devreme (des, chiar din cauza ei).
  if (pain != null && pain >= 5) flags.escalate = true;

  // Roșu: executat sub jumătate.
  if (durationPct != null && durationPct < 50) {
    if (flags.escalate) reasons.push(`durere ${pain}/10: escaladare la fizioterapeut`);
    reasons.push(`durată ${durationPct}% din plan (sub 50%)`);
    return { color: 'rosu', reasons, metrics, flags, final: isFinal(flags, planned, today) };
  }

  let level: 0 | 1 | 2 = 0; // 0 verde, 1 galben, 2 portocaliu
  const bump = (to: 1 | 2, why: string) => {
    reasons.push(why);
    if (to > level) level = to;
  };

  if (durationPct != null) {
    if (durationPct < 75) bump(2, `durată ${durationPct}% din plan (50–75%)`);
    else if (durationPct < 90) bump(1, `durată ${durationPct}% din plan (75–90%)`);
    else if (durationPct > 115) bump(1, `durată ${durationPct}% din plan (peste 115%)`);
  }

  if (zonePct != null) {
    const dir = directie === 'mai_tare' ? ', mai tare decât planul' : directie === 'mai_usor' ? ', mai ușor decât planul' : '';
    if (compensat && zonePct < 75) reasons.push(`timp în zona-țintă ${zonePct}%${dir}: compensat (${compensat})`);
    else if (zonePct < 75) bump(1, `timp în zona-țintă ${zonePct}%${dir}: făcut, dar mai puțin eficient`);
  } else {
    reasons.push('fără date de zone: criteriul de zonă nu s-a aplicat');
  }

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

  metrics.eficienta = efficiency(metrics, activity, !!compensat);
  const color: Color = level === 0 ? 'verde' : level === 1 ? 'galben' : 'portocaliu';
  if (color === 'verde') reasons.unshift('durată, zone și RPE în țintă');
  if (flags.noQuestionnaire) reasons.push('fără chestionar: RPE și durerea lipsesc');

  return { color, reasons, metrics, flags, final: isFinal(flags, planned, today) };
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

/** Direcția intensității: minutele peste zona-țintă față de cele sub ea (prag 15% din timp). */
export function zoneDirection(planned: PlannedWorkout, activity: Activity, extra: Activity | null = null): Direction {
  if (!planned.targetZones.length) return null;
  const parts = [activity, extra].filter((a): a is Activity => !!a && !!a.timeInZonesMin);
  if (parts.length === 0) return null;
  const lo = Math.min(...planned.targetZones);
  const hi = Math.max(...planned.targetZones);
  let above = 0;
  let below = 0;
  let total = 0;
  for (const a of parts) {
    const zones = a.timeInZonesMin as Partial<Record<Zone, number>>;
    for (const z of [1, 2, 3, 4, 5] as Zone[]) {
      const m = zones[z] ?? 0;
      total += m;
      if (z > hi) above += m;
      if (z < lo) below += m;
    }
  }
  if (total === 0) return null;
  if (above / total >= 0.15 && above >= below) return 'mai_tare';
  if (below / total >= 0.15) return 'mai_usor';
  return 'conform';
}

/** Culoarea e definitivă după 24 h de la ziua antrenamentului, sau imediat dacă a venit chestionarul. */
function isFinal(flags: ScoreResult['flags'], planned: PlannedWorkout, today: string): boolean {
  if (!flags.noQuestionnaire) return true;
  return diffDays(addDays(planned.date, 1), today) > 0;
}

function computeZonePct(planned: PlannedWorkout, activity: Activity, extra: Activity | null): number | null {
  if (planned.type === 'calitate' && activity.intervalsHitPct != null) return round1(activity.intervalsHitPct);
  const parts = [activity, extra].filter((a): a is Activity => !!a && !!a.timeInZonesMin);
  if (parts.length === 0) return null;
  let inTarget = 0;
  let total = 0;
  for (const a of parts) {
    const zones = a.timeInZonesMin as Partial<Record<Zone, number>>;
    for (const z of [1, 2, 3, 4, 5] as Zone[]) {
      const m = zones[z] ?? 0;
      total += m;
      if (planned.targetZones.includes(z)) inTarget += m;
    }
  }
  if (total === 0) return null;
  return round1((inTarget / total) * 100);
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
