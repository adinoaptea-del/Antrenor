// Construiește pachetul de date al agenților din datele normalizate. Deterministic, fără model.
// Regula de aur se aplică și aici: un câmp pe care nu-l putem calcula e null, nu estimat.

import type { PlannedWorkout, Sport } from '../types.js';
import { addDays, diffDays, weekday } from '../util/dates.js';
import type { CollectorInput, EveningForm, SourceActivity, SourceDaily, SportHours } from './types.js';

const SPORTS: Sport[] = ['inot', 'bicicleta', 'alergare', 'forta'];
const DAY_NAMES = ['luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata', 'duminica'];

export interface Packet {
  meta: {
    data: string;
    zi_saptamana: string;
    eveniment: CollectorInput['event'];
    faza: string;
    obiectiv: string;
    zile_pana_la_cursa: number;
    /** Duminica ultimei săptămâni din lună: mesajul săptămânal include bilanțul lunii. */
    bilant_lunar: boolean;
    surse: Record<string, string | null>;
    /** Când sunt 2+ brățări: valorile fiecăreia azi și dezacordurile mari. null = o singură sursă. */
    dispozitive: { azi: MergedDaily['perDevice']; dezacord: string[] } | null;
  };
  somn: { durata: string | null; durata_min: number | null; ora_culcare: string | null; scor: number | null; media7_durata: string | null; media7_durata_min: number | null };
  hrv: { azi: number | null; media7: number | null; baseline60: number | null; sd60: number | null; zile_sub_prag: number };
  puls_repaus: { azi: number | null; media7: number | null; baseline60: number | null };
  readiness: {
    scor_producator: number | null;
    hooper: { somn: number | null; oboseala: number | null; stres: number | null; dureri: number | null; suma: number | null };
  };
  incarcare: {
    acwr: number | null;
    acwr_sport: Record<Sport, number | null>;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    ore_7z: SportHours;
    ore_28z_medie_saptamanala: SportHours;
    sedinte_7z: number;
  };
  antrenament_ultim: {
    sport: Sport;
    data: string;
    durata: number;
    distanta: number | null;
    fc_medie: number | null;
    fc_max: number | null;
    timp_zone: Record<string, number> | null;
    putere_medie: number | null;
    pace_mediu: number | null;
    cadenta: number | null;
    rpe: number | null;
    fata_de_asteptari: EveningForm['fata_de_asteptari'];
    durere: { scor: number | null; loc: string | null };
    ce_a_incurcat: EveningForm['ce_a_incurcat'];
    fueling_conform: EveningForm['fueling_conform'];
    comentariu: string | null;
    in_plan: boolean;
    tip_neplanificat: EveningForm['tip_neplanificat'];
  } | null;
  /** Celelalte ședințe din ziua ultimei ședințe și din ziua dinainte: pulsul se judecă în contextul oboselii acumulate. */
  sedinte_48h: { sport: Sport; data: string; ora: string | null; durata: number; fc_medie: number | null; z4_z5_min: number | null }[];
  plan_azi: { sport: Sport; tip: string; durata_planificata: number; zone_tinta: number[]; structura: string | null; cheie: boolean } | null;
  /** Prima ședință de mâine: nutriționistul răspunde seara doar dacă urmează ceva în sub 24 h. */
  plan_maine: { sport: Sport; tip: string; durata_planificata: number; cheie: boolean } | null;
  plan_saptamana: { interval: string; zile: Record<string, string> };
  /** Ultimele 14 zile (fără azi): ședințe planificate vs făcute (activitate pe același sport, ±1 zi). null fără activități de la brățări în 28 de zile: nu putem ști dacă s-a sărit sau doar nu s-a sincronizat. */
  vreme: CollectorInput['weather'] | null;
  /** Creșterea controlată (+10% volum săptămâna viitoare): eligibil doar cu 7 zile verzi la rând, încărcare sub 1,3 (total și pe fiecare sport), aderență >= 80% și fără creștere în ultimele 13 zile. */
  progres: { zile_verzi_la_rand: number | null; ultima_crestere: string | null; eligibil: boolean; motiv: string };
  totaluri_de_la_start: CollectorInput['totals'] | null;
  aderenta_14z: { planificate: number; facute: number; sarite: { data: string; sport: Sport; cheie: boolean }[] } | null;
  /** Pus de runner după ce Fiziologul a răspuns; antrenorii și nutriționistul îl citesc. */
  verdict_fiziolog: 'verde' | 'galben' | 'rosu' | 'stop' | null;
  zone: CollectorInput['zones'];
  corp: { greutate_azi: number | null; greutate_media7: number | null; cantariri_7z: number; grasime_pct: number | null; data_masurare: string | null };
  nutritie_ieri: { kcal: number | null; carbohidrati_g: number | null; proteine_g: number | null; apa_l: number | null } | null;
  semnale: { boala: boolean | null; febra: boolean | null; deplasare: boolean | null; simptom_cardiac: boolean | null };
  analize: CollectorInput['labs'] | null;
  aviz: CollectorInput['aviz'];
}

// ---------- arbitraj între surse ----------

/** O zi, cu valorile din toate sursele combinate: somn, HRV și puls = media brățărilor (aduse la aceeași scală); scorurile producătorilor = cea mai bună sursă. */
export interface MergedDaily {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleepMin: number | null;
  bedtime: string | null;
  sleepScore: number | null;
  recoveryScore: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  sources: Record<string, string | null>;
  /** Valorile brute ale fiecărei brățări, doar în zilele cu 2+ surse. */
  perDevice: Record<string, { hrv: number | null; puls_repaus: number | null; somn_min: number | null; recuperare: number | null }>;
  /** Dezacorduri mari între brățări în ziua respectivă. */
  disagreements: string[];
}

// Apple dă HRV ca SDNN (alt calcul decât rMSSD-ul Whoop/Oura/Garmin): ultima opțiune pentru HRV.
const PRIORITY: Record<string, number> = { whoop: 0, oura: 1, garmin: 2, athletedata: 3, apple: 4, manual: 5, strava: 9 };

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
function round(x: number | null, d = 1): number | null {
  if (x == null) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Offsetul HRV Garmin → Whoop pe zilele în care există amândouă (medie a diferențelor). */
export function garminHrvOffset(rows: SourceDaily[]): number | null {
  return sourceOffsets(rows, 'hrv').get('garmin') ?? null;
}

type Metric = 'hrv' | 'rhr';
// Pentru HRV, Apple dă SDNN (alt calcul): nu intră în medie decât dacă e singura sursă.
const HRV_EXCLUDED = new Set(['apple', 'manual', 'strava']);
const RHR_EXCLUDED = new Set(['manual', 'strava']);
const MIN_OVERLAP = 7;

/** Sursa de referință = cea mai bună sursă care are date pe metrica respectivă. */
function referenceSource(rows: SourceDaily[], metric: Metric): string | null {
  const excluded = metric === 'hrv' ? HRV_EXCLUDED : RHR_EXCLUDED;
  const srcs = [...new Set(rows.filter((r) => r[metric] != null && !excluded.has(r.source)).map((r) => r.source))];
  srcs.sort((a, b) => (PRIORITY[a] ?? 5) - (PRIORITY[b] ?? 5));
  return srcs[0] ?? null;
}

/**
 * Fiecare brățară măsoară puțin altfel (ex. Garmin dă HRV sistematic mai mare decât Whoop).
 * Offsetul unei surse = media diferențelor față de referință pe zilele comune (minim 7 zile).
 */
export function sourceOffsets(rows: SourceDaily[], metric: Metric): Map<string, number> {
  const ref = referenceSource(rows, metric);
  const out = new Map<string, number>();
  if (!ref) return out;
  out.set(ref, 0);
  const refByDate = new Map(rows.filter((r) => r.source === ref && r[metric] != null).map((r) => [r.date, r[metric]!]));
  const diffs = new Map<string, number[]>();
  for (const r of rows) {
    if (r.source === ref || r[metric] == null) continue;
    const rv = refByDate.get(r.date);
    if (rv == null) continue;
    diffs.set(r.source, [...(diffs.get(r.source) ?? []), rv - r[metric]!]);
  }
  for (const [src, d] of diffs) if (d.length >= MIN_OVERLAP) out.set(src, mean(d)!);
  return out;
}

/**
 * Media între brățări pentru o metrică, pe o zi. Valorile sunt aduse la scala referinței (offset) înainte de medie,
 * ca să nu sară cifra în zilele în care o brățară lipsește. O sursă fără offset calibrat intră doar dacă referința lipsește.
 */
function averaged(list: SourceDaily[], metric: Metric, offsets: Map<string, number>): { v: number | null; src: string | null } {
  const excluded = metric === 'hrv' ? HRV_EXCLUDED : RHR_EXCLUDED;
  const withVal = list.filter((r) => r[metric] != null);
  const usable = withVal.filter((r) => !excluded.has(r.source));
  if (usable.length === 0) {
    // Doar Apple / manual: ultima variantă, nemediată.
    const r = [...withVal].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5))[0];
    return r ? { v: r[metric]!, src: r.source } : { v: null, src: null };
  }
  const calibrated = usable.filter((r) => offsets.has(r.source));
  const chosen = calibrated.length > 0 ? calibrated : [usable.sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5))[0]!];
  const vals = chosen.map((r) => r[metric]! + (offsets.get(r.source) ?? 0));
  return { v: mean(vals), src: chosen.map((r) => r.source).join('+') };
}

/** Dezacord mare între brățări în aceeași zi (valori brute): îl vede fiziologul, nu îl ascunde media. */
function disagreements(list: SourceDaily[], offsets: { hrv: Map<string, number>; rhr: Map<string, number> }): string[] {
  const out: string[] = [];
  const spread = (xs: number[]) => (xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs));
  const fmt = (k: 'hrv' | 'rhr' | 'sleepMin') => list.filter((r) => r[k] != null).map((r) => `${r.source} ${Math.round(r[k]!)}`).join(', ');
  const hrv = list.filter((r) => r.hrv != null && !HRV_EXCLUDED.has(r.source)).map((r) => r.hrv! + (offsets.hrv.get(r.source) ?? 0));
  const m = mean(hrv);
  if (m != null && hrv.length >= 2 && spread(hrv) / m > 0.2) out.push(`HRV diferă cu peste 20% între brățări (${fmt('hrv')})`);
  const rhr = list.filter((r) => r.rhr != null && !RHR_EXCLUDED.has(r.source)).map((r) => r.rhr! + (offsets.rhr.get(r.source) ?? 0));
  if (spread(rhr) > 5) out.push(`pulsul de repaus diferă cu peste 5 bpm (${fmt('rhr')})`);
  const sl = list.filter((r) => r.sleepMin != null).map((r) => r.sleepMin!);
  if (spread(sl) > 60) out.push(`somnul diferă cu peste o oră (${fmt('sleepMin')} min)`);
  return out;
}

export function mergeWellness(rows: SourceDaily[]): MergedDaily[] {
  // O singură valoare pe sursă și zi (dacă un furnizor a trimis aceeași zi de două ori, ultima câștigă).
  const unique = new Map<string, SourceDaily>();
  for (const r of rows) unique.set(`${r.date}|${r.source}`, { ...unique.get(`${r.date}|${r.source}`), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) } as SourceDaily);
  const clean = [...unique.values()];
  const offsets = { hrv: sourceOffsets(clean, 'hrv'), rhr: sourceOffsets(clean, 'rhr') };
  const byDate = new Map<string, SourceDaily[]>();
  for (const r of clean) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const out: MergedDaily[] = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5));
    const pick = <K extends keyof SourceDaily>(k: K) => {
      for (const r of sorted) {
        const v = r[k] as number | null | undefined;
        if (v != null) return { v, src: r.source };
      }
      return { v: null, src: null };
    };
    const hrv = averaged(sorted, 'hrv', offsets.hrv);
    const rhr = averaged(sorted, 'rhr', offsets.rhr);
    const sleeps = sorted.filter((r) => r.sleepMin != null).map((r) => r.sleepMin!);
    const sleepSources = sorted.filter((r) => r.sleepMin != null).map((r) => r.source);
    const bedtime = sorted.find((r) => r.bedtime)?.bedtime ?? null;
    // Scorurile de somn/recuperare sunt scale proprii fiecărui producător: nu se mediază, se ia cea mai bună sursă.
    const sleepScore = pick('sleepScore');
    const recovery = pick('recoveryScore');
    const weight = pick('weightKg');
    const fat = pick('bodyFatPct');
    const perDevice: MergedDaily['perDevice'] = {};
    if (sorted.length > 1)
      for (const r of sorted) perDevice[r.source] = { hrv: r.hrv ?? null, puls_repaus: r.rhr ?? null, somn_min: r.sleepMin ?? null, recuperare: r.recoveryScore ?? null };
    out.push({
      date,
      hrv: round(hrv.v, 1),
      rhr: rhr.v == null ? null : Math.round(rhr.v),
      sleepMin: sleeps.length ? Math.round(mean(sleeps)!) : null,
      bedtime,
      sleepScore: sleepScore.v,
      recoveryScore: recovery.v,
      weightKg: weight.v,
      bodyFatPct: fat.v,
      sources: { hrv: hrv.src, puls_repaus: rhr.src, somn: sleepSources.length ? sleepSources.join('+') : null, recuperare: recovery.src },
      perDevice,
      disagreements: sorted.length > 1 ? disagreements(sorted, offsets) : [],
    });
  }
  // Cea mai nouă zi prima.
  return out.sort((a, b) => diffDays(a.date, b.date));
}

/** Aceeași ședință venită pe două căi (Garmin direct și prin Strava): păstrează una, cea cu mai multe câmpuri. */
export function dedupeActivities(acts: SourceActivity[]): SourceActivity[] {
  const kept: SourceActivity[] = [];
  const sorted = [...acts].sort((a, b) => diffDays(b.date, a.date));
  for (const a of sorted) {
    const dup = kept.find((k) => k.date === a.date && k.sport === a.sport && Math.abs(k.minutes - a.minutes) <= 3 && (k.distanceKm == null || a.distanceKm == null || Math.abs(k.distanceKm - a.distanceKm) < 0.3));
    if (!dup) {
      kept.push(a);
      continue;
    }
    const fields = (x: SourceActivity) => Object.values(x).filter((v) => v != null).length;
    if (fields(a) > fields(dup)) kept[kept.indexOf(dup)] = a;
  }
  return kept;
}

// ---------- calcule ----------

function minutesToHm(min: number | null): string | null {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function hoursBySport(acts: SourceActivity[], from: string, to: string): SportHours {
  const h: SportHours = { inot: 0, bicicleta: 0, alergare: 0, forta: 0 };
  for (const a of acts) {
    if (diffDays(from, a.date) < 0 || diffDays(a.date, to) < 0) continue;
    h[a.sport] += a.minutes / 60;
  }
  for (const s of SPORTS) h[s] = Math.round(h[s] * 10) / 10;
  return h;
}

/** ACWR pe minute: ultimele 7 zile împărțite la media săptămânală a ultimelor 28 de zile. null sub 4 săptămâni de istoric. */
export function acwr(acts: SourceActivity[], today: string, sport?: Sport): number | null {
  const sel = sport ? acts.filter((a) => a.sport === sport) : acts;
  const firstDate = sel.reduce<string | null>((m, a) => (m == null || diffDays(a.date, m) > 0 ? a.date : m), null);
  if (firstDate == null || diffDays(firstDate, today) < 28) return null;
  const sum = (from: string, to: string) => sel.filter((a) => diffDays(from, a.date) >= 0 && diffDays(a.date, to) >= 0).reduce((acc, a) => acc + a.minutes, 0);
  const yesterday = addDays(today, -1);
  const acute = sum(addDays(today, -7), yesterday);
  const chronic = sum(addDays(today, -28), yesterday) / 4;
  if (chronic < 30) return null; // sub 30 min pe săptămână în medie raportul nu înseamnă nimic
  return Math.round((acute / chronic) * 100) / 100;
}

function planLabel(w: PlannedWorkout): string {
  const sport = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță' }[w.sport];
  const tip = w.type === 'forta' ? '' : ` ${w.type === 'z2' ? 'Z2' : w.type}`;
  return `${sport}${tip} ${w.plannedMinutes}${w.key ? ' (cheie)' : ''}`;
}

export function buildPacket(input: CollectorInput): Packet {
  const { today } = input;
  const merged = mergeWellness(input.wellness);
  const todayRow = merged.find((r) => r.date === today) ?? null;
  const last = (n: number, from = 1) => merged.filter((r) => diffDays(r.date, today) >= from && diffDays(r.date, today) <= from + n - 1);
  const prev7 = last(7);
  const prev60 = last(60);

  const hrv7 = prev7.map((r) => r.hrv).filter((x): x is number => x != null);
  const hrv60 = prev60.map((r) => r.hrv).filter((x): x is number => x != null);
  const rhr7 = prev7.map((r) => r.rhr).filter((x): x is number => x != null);
  const rhr60 = prev60.map((r) => r.rhr).filter((x): x is number => x != null);
  const sleep7 = prev7.map((r) => r.sleepMin).filter((x): x is number => x != null);
  const baseline60 = hrv60.length >= 14 ? round(mean(hrv60), 1) : null;
  const sd60 = hrv60.length >= 14 ? round(sd(hrv60), 2) : null;

  // Zile consecutive (azi inclusiv) cu HRV sub baseline − sd.
  let zileSubPrag = 0;
  if (baseline60 != null && sd60 != null) {
    const prag = baseline60 - sd60;
    for (const r of [todayRow, ...prev7].filter((x): x is MergedDaily => x != null)) {
      if (r.hrv != null && r.hrv < prag) zileSubPrag += 1;
      else break;
    }
  }

  const acts = dedupeActivities(input.activities).filter((a) => diffDays(a.date, today) >= 0);
  const yesterday = addDays(today, -1);
  const ore7 = hoursBySport(acts, addDays(today, -7), yesterday);
  const ore28 = hoursBySport(acts, addDays(today, -28), yesterday);
  for (const s of SPORTS) ore28[s] = Math.round((ore28[s] / 4) * 10) / 10;
  const sedinte7 = acts.filter((a) => diffDays(addDays(today, -7), a.date) >= 0 && diffDays(a.date, yesterday) >= 0).length;

  // Dimineața, ultima ședință e cea de dinainte de azi; după antrenament, cea de azi.
  const lastAct =
    [...acts]
      .filter((a) => (input.event === 'dimineata' ? diffDays(a.date, today) >= 1 : true))
      .sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? '').localeCompare(a.startLocal ?? ''))[0] ?? null;
  const evening = lastAct ? (input.evenings.find((e) => e.activityId === lastAct.externalId) ?? input.evenings.find((e) => e.date === lastAct.date) ?? null) : null;
  const inPlan = lastAct ? input.plan.some((w) => w.sport === lastAct.sport && Math.abs(diffDays(w.date, lastAct.date)) <= 1 && w.status !== 'sters') : false;

  const planToday = input.plan.filter((w) => w.date === today && w.status === 'planificat').sort((a, b) => Number(b.key) - Number(a.key))[0] ?? null;
  const tomorrow = addDays(today, 1);
  const planTomorrow = input.plan.filter((w) => w.date === tomorrow && w.status === 'planificat').sort((a, b) => Number(b.key) - Number(a.key))[0] ?? null;
  const monday = addDays(today, -weekday(today));
  const zile: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const ws = input.plan.filter((w) => w.date === d && w.status !== 'sters');
    zile[DAY_NAMES[i]!] = ws.length ? ws.map((w) => `${planLabel(w)}${w.status !== 'planificat' ? ` [${w.status}]` : ''}`).join(' + ') : 'odihnă';
  }

  const acwrTotal = acwr(acts, today);
  const acwrBySport: Record<Sport, number | null> = { inot: acwr(acts, today, 'inot'), bicicleta: acwr(acts, today, 'bicicleta'), alergare: acwr(acts, today, 'alergare'), forta: acwr(acts, today, 'forta') };
  const recentActs = acts.filter((a) => diffDays(a.date, today) >= 0 && diffDays(a.date, today) <= 28);
  const pastPlanned = input.plan.filter((w) => w.status === 'planificat' && diffDays(w.date, today) >= 1 && diffDays(w.date, today) <= 14);
  const doneW = pastPlanned.filter((w) => acts.some((a) => a.sport === w.sport && Math.abs(diffDays(w.date, a.date)) <= 1));
  const aderenta = recentActs.length
    ? { planificate: pastPlanned.length, facute: doneW.length, sarite: pastPlanned.filter((w) => !doneW.includes(w)).map((w) => ({ data: w.date, sport: w.sport, cheie: w.key })) }
    : null;

  const weights = merged.filter((r) => r.weightKg != null && diffDays(r.date, today) >= 0 && diffDays(r.date, today) <= 6);
  const lastWeight = merged.find((r) => r.weightKg != null) ?? null;
  const nutYesterday = input.nutrition?.find((n) => n.date === yesterday) ?? null;

  return {
    meta: {
      data: today,
      zi_saptamana: DAY_NAMES[weekday(today)]!,
      eveniment: input.event,
      faza: input.athlete.phase,
      obiectiv: input.athlete.obiectiv,
      zile_pana_la_cursa: diffDays(today, input.athlete.raceDate),
      bilant_lunar: input.event === 'saptamanal' && addDays(today, 7).slice(0, 7) !== today.slice(0, 7),
      surse: { ...(todayRow?.sources ?? { hrv: null, puls_repaus: null, somn: null, recuperare: null }), activitati: [...new Set(acts.map((a) => a.source))].join('+') || null, incarcare: input.load?.source ?? null },
      dispozitive: todayRow && Object.keys(todayRow.perDevice).length > 1 ? { azi: todayRow.perDevice, dezacord: todayRow.disagreements } : null,
    },
    somn: {
      durata: minutesToHm(todayRow?.sleepMin ?? null),
      durata_min: todayRow?.sleepMin ?? null,
      ora_culcare: todayRow?.bedtime ?? null,
      scor: todayRow?.sleepScore ?? null,
      media7_durata: minutesToHm(sleep7.length ? Math.round(mean(sleep7)!) : null),
      media7_durata_min: sleep7.length ? Math.round(mean(sleep7)!) : null,
    },
    hrv: { azi: todayRow?.hrv ?? null, media7: round(mean(hrv7), 1), baseline60, sd60, zile_sub_prag: zileSubPrag },
    puls_repaus: { azi: todayRow?.rhr ?? null, media7: round(mean(rhr7), 0), baseline60: rhr60.length >= 14 ? round(mean(rhr60), 1) : null },
    readiness: {
      scor_producator: todayRow?.recoveryScore ?? null,
      hooper: {
        somn: input.morning?.hooper.somn ?? null,
        oboseala: input.morning?.hooper.oboseala ?? null,
        stres: input.morning?.hooper.stres ?? null,
        dureri: input.morning?.hooper.dureri ?? null,
        suma: input.morning && [input.morning.hooper.somn, input.morning.hooper.oboseala, input.morning.hooper.stres, input.morning.hooper.dureri].every((x) => x != null)
          ? input.morning.hooper.somn! + input.morning.hooper.oboseala! + input.morning.hooper.stres! + input.morning.hooper.dureri!
          : null,
      },
    },
    incarcare: {
      acwr: acwrTotal,
      acwr_sport: acwrBySport,
      ctl: input.load?.ctl ?? null,
      atl: input.load?.atl ?? null,
      tsb: input.load?.tsb ?? null,
      ore_7z: ore7,
      ore_28z_medie_saptamanala: ore28,
      sedinte_7z: sedinte7,
    },
    antrenament_ultim: lastAct
      ? {
          sport: lastAct.sport,
          data: lastAct.date,
          durata: lastAct.minutes,
          distanta: lastAct.distanceKm ?? null,
          fc_medie: lastAct.avgHr ?? null,
          fc_max: lastAct.maxHr ?? null,
          timp_zone: lastAct.timeInZonesMin ? Object.fromEntries(Object.entries(lastAct.timeInZonesMin).map(([z, m]) => [`Z${z}`, m as number])) : null,
          putere_medie: lastAct.avgWatts ?? null,
          pace_mediu: lastAct.avgPaceMinKm ?? null,
          cadenta: lastAct.avgCadence ?? null,
          rpe: evening?.rpe ?? null,
          fata_de_asteptari: evening?.fata_de_asteptari ?? null,
          durere: { scor: evening?.durere.scor ?? null, loc: evening?.durere.loc ?? null },
          ce_a_incurcat: evening?.ce_a_incurcat ?? null,
          fueling_conform: evening?.fueling_conform ?? null,
          comentariu: evening?.comentariu ?? null,
          in_plan: inPlan,
          tip_neplanificat: inPlan ? null : (evening?.tip_neplanificat ?? null),
        }
      : null,
    sedinte_48h: lastAct
      ? acts
          .filter((a) => a !== lastAct && diffDays(a.date, lastAct.date) >= 0 && diffDays(a.date, lastAct.date) <= 1)
          .sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? '').localeCompare(a.startLocal ?? ''))
          .map((a) => ({
            sport: a.sport,
            data: a.date,
            ora: a.startLocal ?? null,
            durata: a.minutes,
            fc_medie: a.avgHr ?? null,
            z4_z5_min: a.timeInZonesMin ? (a.timeInZonesMin[4] ?? 0) + (a.timeInZonesMin[5] ?? 0) : null,
          }))
      : [],
    plan_azi: planToday
      ? { sport: planToday.sport, tip: planToday.type === 'z2' ? 'Z2' : planToday.type, durata_planificata: planToday.plannedMinutes, zone_tinta: planToday.targetZones, structura: planToday.structure ?? null, cheie: planToday.key }
      : null,
    plan_maine: planTomorrow ? { sport: planTomorrow.sport, tip: planTomorrow.type === 'z2' ? 'Z2' : planTomorrow.type, durata_planificata: planTomorrow.plannedMinutes, cheie: planTomorrow.key } : null,
    plan_saptamana: { interval: `${monday} – ${addDays(monday, 6)}${input.athlete.weekLabel ? `, ${input.athlete.weekLabel}` : ''}`, zile },
    vreme: input.weather ?? null,
    progres: progresStatus(input, acwrTotal, acwrBySport, aderenta),
    totaluri_de_la_start: input.totals ?? null,
    aderenta_14z: aderenta,
    verdict_fiziolog: null,
    zone: input.zones,
    corp: {
      greutate_azi: todayRow?.weightKg ?? null,
      greutate_media7: weights.length ? round(mean(weights.map((r) => r.weightKg!)), 1) : null,
      cantariri_7z: weights.length,
      grasime_pct: lastWeight?.bodyFatPct ?? null,
      data_masurare: lastWeight?.date ?? null,
    },
    nutritie_ieri: nutYesterday ? { kcal: nutYesterday.kcal, carbohidrati_g: nutYesterday.carbohidrati_g, proteine_g: nutYesterday.proteine_g, apa_l: nutYesterday.apa_l } : null,
    semnale: {
      boala: input.morning?.semnale.boala ?? null,
      febra: input.morning?.semnale.febra ?? null,
      deplasare: input.morning?.semnale.deplasare ?? null,
      simptom_cardiac: input.morning?.semnale.simptom_cardiac ?? null,
    },
    analize: input.labs ?? null,
    aviz: input.aviz,
  };
}

/** Regula de creștere, deterministă: modelul nu decide singur să crească volumul. */
export function progresStatus(
  input: CollectorInput,
  acwrTotal: number | null,
  bySport: Record<Sport, number | null>,
  aderenta: { planificate: number; facute: number } | null,
): Packet['progres'] {
  const h = input.history ?? null;
  const base = { zile_verzi_la_rand: h ? h.greenStreak : null, ultima_crestere: h?.lastIncrease ?? null };
  const no = (motiv: string) => ({ ...base, eligibil: false, motiv });
  if (!h) return no('fără istoric de readiness');
  if (h.greenStreak < 7) return no(`${h.greenStreak} zile verzi la rând (trebuie 7)`);
  if (acwrTotal == null) return no('încărcare necunoscută (sub 4 săptămâni de istoric)');
  if (acwrTotal >= 1.3) return no('încărcare totală peste 1,3');
  const hot = (Object.entries(bySport) as [Sport, number | null][]).filter(([, v]) => v != null && v >= 1.3).map(([k]) => k);
  if (hot.length) return no(`încărcare peste 1,3 la ${hot.join(', ')}`);
  if (!aderenta || aderenta.planificate === 0 || aderenta.facute / aderenta.planificate < 0.8) return no('aderență sub 80% în 14 zile');
  if (h.lastIncrease && diffDays(h.lastIncrease, input.today) < 13) return no(`creștere deja pe ${h.lastIncrease}`);
  return { ...base, eligibil: true, motiv: '7 zile verzi, încărcare sub 1,3, aderență bună' };
}
