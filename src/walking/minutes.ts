// Mers pe jos: bula săptămânii (specificația „AIRON Mers pe jos / Bula 200 de minute”, 19.10.2026).
//
// Codul calculează tot (modelul AI nu calculează și nu inventează progresul):
//   minute_rămase = max(0, ținta_săptămânii − minute_eligibile_realizate)
// Intern totul e în secunde; rotunjirea e doar la afișare.
//
// Ce consumă bula: doar timpul de MERS — importuri identificate ca mers, înregistrări din aplicație și plimbări
// adăugate manual (etichetate „declarat”). Pașii nu se transformă în minute. Alergarea, bicicleta și restul nu consumă.
// Aceeași plimbare din două surse se numără o dată; o plimbare manuală suprapusă cu un import e înlocuită de import.
// Pauzele se scad doar când sursa le dă (timp în mișcare); altfel se spune că nu pot fi separate.
// Săptămâna: luni 00:00 – luni 00:00, în fusul sportivului; o plimbare peste miezul nopții se împarte după timp real.
// Minutele neefectuate nu devin datorie.

import { addDays, localDayStartUtc, weekStart } from '../util/dates.js';

export type WalkSource = 'strava' | 'garmin' | 'apple' | 'android' | 'samsung' | 'whoop' | 'aplicatie' | 'manual';
export type Provenance = 'masurat' | 'declarat';

export interface WalkRecord {
  /** Identitatea înregistrării (activitatea importată sau plimbarea manuală). */
  id: string;
  source: WalkSource;
  provenance: Provenance;
  /** Începutul real (ISO, cu fus); null = doar ziua e cunoscută (atunci nu se poate împărți peste miezul nopții). */
  startUtc: string | null;
  /** Ziua locală (YYYY-MM-DD), folosită când nu se știe ora. */
  date: string;
  /** Durata totală, secunde (de la start la stop). */
  elapsedSec: number;
  /** Timpul în mișcare, secunde, când sursa îl dă (pauzele scoase); null = pauzele nu pot fi separate. */
  movingSec: number | null;
  /** Mers alert confirmat (de sportiv sau de sursă), nu dedus din viteză sau pași. */
  brisk?: boolean;
  /** Numele de la sursă, pentru listă. */
  name?: string | null;
  /** Ștearsă de sportiv (nu se numără, rămâne în istoric). */
  deleted?: boolean;
  /** Plimbarea manuală reconciliată cu un import (id-ul importului): se numără importul, nu ea. */
  reconciledWith?: string | null;
}

/** Ținta pe săptămână, cu jurnalul schimbărilor (nimic nu se micșorează în tăcere). */
export interface TargetChange {
  /** Momentul schimbării (ISO). */
  at: string;
  from: number | null;
  to: number;
  reason: string;
  /** Luni din săptămâna de la care se aplică (implicit săptămâna următoare). */
  effectiveWeek: string;
}

export const DEFAULT_TARGET_MIN = 200;
const MIN_TARGET = 30;
const MAX_TARGET = 1000;

/** Prioritatea surselor când aceeași plimbare vine din două locuri: măsurat înaintea declaratului, apoi detaliul. */
const SOURCE_RANK: Record<WalkSource, number> = { garmin: 0, apple: 1, android: 2, samsung: 3, strava: 4, whoop: 5, aplicatie: 6, manual: 9 };

const startMs = (w: WalkRecord): number | null => (w.startUtc ? Date.parse(w.startUtc) : null);
const effectiveSec = (w: WalkRecord): number => Math.max(0, Math.round(w.movingSec ?? w.elapsedSec));

/** Două înregistrări sunt aceeași plimbare dacă se suprapun în timp cel puțin jumătate din cea mai scurtă. */
function samesWalk(a: WalkRecord, b: WalkRecord): boolean {
  const sa = startMs(a);
  const sb = startMs(b);
  if (sa == null || sb == null) {
    // Fără ore: aceeași zi și durate apropiate (±15%) doar când una e manuală (altfel două plimbări reale rămân două).
    if (a.date !== b.date || (a.source !== 'manual' && b.source !== 'manual')) return false;
    const da = a.elapsedSec;
    const db = b.elapsedSec;
    return Math.abs(da - db) <= 0.15 * Math.max(da, db);
  }
  const ea = sa + a.elapsedSec * 1000;
  const eb = sb + b.elapsedSec * 1000;
  const overlap = Math.min(ea, eb) - Math.max(sa, sb);
  return overlap > 0 && overlap >= 0.5 * Math.min(a.elapsedSec, b.elapsedSec) * 1000;
}

/**
 * Plimbările care se numără, fără dubluri: aceeași plimbare din două surse rămâne o dată (cea măsurată, cu timpul în
 * mișcare dacă există); o plimbare manuală suprapusă cu un import e reconciliată cu importul; cele șterse nu se numără.
 * Întoarce și ce s-a contopit, ca lista să poată arăta sursele.
 */
export function dedupeWalks(records: WalkRecord[]): { kept: WalkRecord[]; merged: { kept: string; dropped: string }[] } {
  const live = records.filter((r) => !r.deleted && r.elapsedSec > 0);
  const byId = new Set(live.map((r) => r.id));
  const sorted = [...live].sort((a, b) => (a.provenance === b.provenance ? 0 : a.provenance === 'masurat' ? -1 : 1) || (a.movingSec != null ? 0 : 1) - (b.movingSec != null ? 0 : 1) || SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.id.localeCompare(b.id));
  const kept: WalkRecord[] = [];
  const merged: { kept: string; dropped: string }[] = [];
  for (const r of sorted) {
    // Reconcilierea explicită: plimbarea manuală legată de un import existent nu se mai numără.
    if (r.reconciledWith && byId.has(r.reconciledWith)) {
      merged.push({ kept: r.reconciledWith, dropped: r.id });
      continue;
    }
    const twin = kept.find((k) => samesWalk(k, r));
    if (twin) {
      merged.push({ kept: twin.id, dropped: r.id });
      // Mers alert confirmat pe oricare dintre ele rămâne confirmat.
      if (r.brisk && !twin.brisk) twin.brisk = true;
      continue;
    }
    kept.push({ ...r });
  }
  return { kept, merged };
}

/** Secundele plimbării pe zile locale (o plimbare peste miezul nopții se împarte după timpul real). */
export function splitByDay(w: WalkRecord, tz: string): { date: string; sec: number; approx: boolean }[] {
  const total = effectiveSec(w);
  const s = startMs(w);
  if (s == null) return [{ date: w.date, sec: total, approx: false }];
  const e = s + w.elapsedSec * 1000;
  const out: { date: string; sec: number; approx: boolean }[] = [];
  let day = localDate(s, tz);
  let cursor = s;
  // Pauzele nu se știu pe bucăți: timpul în mișcare se împarte proporțional cu durata din fiecare zi (aproximare spusă).
  const ratio = w.elapsedSec > 0 ? total / w.elapsedSec : 0;
  for (let guard = 0; cursor < e && guard < 10; guard++) {
    const next = Date.parse(localDayStartUtc(addDays(day, 1), tz));
    const end = Math.min(e, next);
    out.push({ date: day, sec: Math.round(((end - cursor) / 1000) * ratio), approx: false });
    cursor = end;
    day = addDays(day, 1);
  }
  // Împărțirea e exactă după ceas; doar pauzele (când există) sunt repartizate proporțional: asta e aproximarea.
  if (out.length > 1 && w.movingSec != null && w.movingSec < w.elapsedSec) for (const p of out) p.approx = true;
  // Rotunjirea pe bucăți nu are voie să schimbe totalul.
  const diff = total - out.reduce((n, x) => n + x.sec, 0);
  if (out.length) out[out.length - 1]!.sec += diff;
  return out;
}

/** Ziua locală a unui moment, în fusul dat. */
export function localDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Ținta săptămânii (luni = weekStart), din jurnalul schimbărilor; fără schimbări, ținta inițială. */
export function targetForWeek(week: string, changes: TargetChange[], initial = DEFAULT_TARGET_MIN): number {
  const applied = changes.filter((c) => c.effectiveWeek <= week).sort((a, b) => (a.effectiveWeek === b.effectiveWeek ? (a.at < b.at ? -1 : 1) : a.effectiveWeek < b.effectiveWeek ? -1 : 1));
  return applied.at(-1)?.to ?? initial;
}

/**
 * O schimbare de țintă, cu valoarea de dinainte, motivul și săptămâna de la care se aplică. Implicit săptămâna
 * următoare; săptămâna curentă doar explicit (`now: true`). Motivul e obligatoriu: ținta nu se micșorează în tăcere.
 */
export function changeTarget(changes: TargetChange[], input: { to: number; reason: string; today: string; at: string; now?: boolean; initial?: number }): TargetChange[] {
  const to = Math.round(input.to);
  if (!Number.isFinite(to) || to < MIN_TARGET || to > MAX_TARGET) throw new Error(`ținta: între ${MIN_TARGET} și ${MAX_TARGET} de minute pe săptămână`);
  const reason = input.reason.trim();
  if (!reason) throw new Error('scrie motivul schimbării (rămâne în istoric)');
  const effectiveWeek = input.now ? weekStart(input.today) : addDays(weekStart(input.today), 7);
  const from = targetForWeek(effectiveWeek, changes, input.initial);
  if (from === to) throw new Error('ținta e deja aceasta');
  return [...changes, { at: input.at, from, to, reason, effectiveWeek }];
}

export interface WalkWeek {
  /** Luni (YYYY-MM-DD) și duminică, în fusul sportivului. */
  weekStart: string;
  weekEnd: string;
  targetMin: number;
  doneSec: number;
  remainingSec: number;
  /** Peste țintă (225 din 200), fără valori negative la „rămase”. */
  overSec: number;
  met: boolean;
  /** Minutele confirmate ca mers alert (afișate separat; nu se deduc din viteză). */
  briskSec: number;
  measuredSec: number;
  declaredSec: number;
  /** Cel puțin o plimbare fără timp în mișcare: pauzele nu pot fi separate (spus în pagină). */
  pausesUnknown: boolean;
  /** Cel puțin o plimbare împărțită aproximativ peste miezul nopții. */
  approxSplit: boolean;
  walks: { id: string; source: WalkSource; provenance: Provenance; date: string; sec: number; brisk: boolean; name: string | null; pausesKnown: boolean; mergedFrom: string[] }[];
}

/** Săptămâna care conține `day` (luni–duminică, în fusul `tz`): realizat, rămas, peste țintă, plimbările. */
export function walkWeek(records: WalkRecord[], day: string, tz: string, changes: TargetChange[], initial = DEFAULT_TARGET_MIN): WalkWeek {
  const ws = weekStart(day);
  const we = addDays(ws, 6);
  const targetMin = targetForWeek(ws, changes, initial);
  const { kept, merged } = dedupeWalks(records);
  let doneSec = 0;
  let briskSec = 0;
  let measuredSec = 0;
  let declaredSec = 0;
  let pausesUnknown = false;
  let approxSplit = false;
  const walks: WalkWeek['walks'] = [];
  for (const w of kept) {
    const parts = splitByDay(w, tz).filter((p) => p.date >= ws && p.date <= we);
    const sec = parts.reduce((n, p) => n + p.sec, 0);
    if (!sec) continue;
    doneSec += sec;
    if (w.brisk) briskSec += sec;
    if (w.provenance === 'masurat') measuredSec += sec;
    else declaredSec += sec;
    if (w.movingSec == null && w.provenance === 'masurat') pausesUnknown = true;
    if (parts.some((p) => p.approx)) approxSplit = true;
    walks.push({ id: w.id, source: w.source, provenance: w.provenance, date: parts[0]!.date, sec, brisk: !!w.brisk, name: w.name ?? null, pausesKnown: w.movingSec != null, mergedFrom: merged.filter((m) => m.kept === w.id).map((m) => m.dropped) });
  }
  walks.sort((a, b) => (a.date < b.date ? 1 : -1));
  const targetSec = targetMin * 60;
  return {
    weekStart: ws,
    weekEnd: we,
    targetMin,
    doneSec,
    remainingSec: Math.max(0, targetSec - doneSec),
    overSec: Math.max(0, doneSec - targetSec),
    met: doneSec >= targetSec,
    briskSec,
    measuredSec,
    declaredSec,
    pausesUnknown,
    approxSplit,
    walks,
  };
}

/** Minutele de afișat (rotunjite doar aici): realizat în jos, rămas în sus (nu arată „0 rămase” înainte de țintă). */
export const shownMin = (sec: number) => Math.floor(sec / 60);
export const shownRemainingMin = (sec: number) => Math.ceil(sec / 60);
