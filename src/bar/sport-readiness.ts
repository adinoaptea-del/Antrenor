// Cât din fiecare probă a cursei ai DEMONSTRAT, din ce au înregistrat brățările în ultimele 6 săptămâni.
// Toate ședințele contează (și cele din afara planului). Nu prezice timpul de cursă și nu estimează nimic:
// o capacitate nemăsurată contează 0. Fiecare procent are piesele lui la vedere.

import type { Sport } from '../types.js';
import type { SourceActivity } from '../collector/types.js';
import { diffDays } from '../util/dates.js';
import type { Goal } from '../calendar/phases.js';

export interface ReadyPart {
  label: string;
  /** Ce ai demonstrat, scris pentru om („14,2 km”, „5 în 4 săpt.”). */
  have: string;
  target: string;
  /** 0–100 */
  pct: number;
  weight: number;
}

export interface SportReady {
  sport: Exclude<Sport, 'forta'>;
  /** Proba din cursă: „1,9 km înot”. */
  leg: string;
  /** 0–100; null = nicio ședință cu distanță în fereastră. */
  value: number | null;
  parts: ReadyPart[];
  /** Capacitatea demonstrată: metri fără oprire la înot, km la celelalte. null = nemăsurat. */
  best?: number | null;
}

/** Distanțele probelor. */
const LEGS: Record<Goal, Partial<Record<'inot' | 'bicicleta' | 'alergare', number>>> = {
  '70.3': { inot: 1.9, bicicleta: 90, alergare: 21.1 },
  olimpic: { inot: 1.5, bicicleta: 40, alergare: 10 },
  sprint: { inot: 0.75, bicicleta: 20, alergare: 5 },
  semimaraton: { alergare: 21.1 },
  maraton: { alergare: 42.2 },
};

/** Timpul-limită uzual pe înot la Ironman 70.3 (70 min la 1,9 km). */
const SWIM_CUTOFF_MIN: Partial<Record<Goal, number>> = { '70.3': 70 };
/** Alergarea după bicicletă pe care o cere pregătirea de triatlon (regula de antrenor folosită și în bara veche). */
const BRICK_TARGET_KM: Partial<Record<Goal, number>> = { '70.3': 8, olimpic: 4, sprint: 2 };

const WINDOW = 42;
const BRICK_GAP_MIN = 30;

const ro = (x: number, d = 1) => x.toLocaleString('ro-RO', { maximumFractionDigits: d });
const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);
const hm = (s: string | null | undefined) => (s && /^\d{2}:\d{2}/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);

/** Alergare pornită la cel mult 30 min după o tură de bicicletă în aceeași zi. */
export function isBrickRun(run: SourceActivity, all: SourceActivity[]): boolean {
  const start = hm(run.startLocal);
  if (run.sport !== 'alergare' || start == null) return false;
  return all.some((b) => {
    if (b.sport !== 'bicicleta' || b.date !== run.date) return false;
    const bs = hm(b.startLocal);
    if (bs == null) return false;
    const gap = start - (bs + b.minutes);
    return gap >= -5 && gap <= BRICK_GAP_MIN;
  });
}

/**
 * Regula: contează doar ce ai demonstrat, la fel cum o cere proba.
 * - Înot: cea mai lungă porțiune FĂRĂ OPRIRE (din turele ceasului), nu totalul ședinței cu pauze. Fără ture măsurate: nedemonstrat.
 *   Abia când porțiunea continuă acoperă proba, ritmul ei e comparat cu timpul-limită.
 * - Bicicletă: cea mai lungă tură.
 * - Alergare (triatlon): 70% cea mai lungă alergare, 30% alergarea după bicicletă; la alergare simplă, doar cea mai lungă alergare.
 * Frecvența nu dă puncte: zece ședințe scurte nu te fac în stare de proba lungă.
 */
export function sportReadiness(goal: Goal, activities: SourceActivity[], today: string): SportReady[] {
  const legs = LEGS[goal];
  const recent = activities.filter((a) => {
    const d = diffDays(a.date, today);
    return d >= 0 && d < WINDOW;
  });
  const out: SportReady[] = [];
  const name = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare' } as const;

  for (const sport of ['inot', 'bicicleta', 'alergare'] as const) {
    const leg = legs[sport];
    if (!leg) continue;
    const fmtD = (km: number) => (sport === 'inot' ? `${Math.round(km * 1000).toLocaleString('ro-RO')} m` : `${ro(km)} km`);
    const legLabel = `${fmtD(leg)} ${name[sport]}`;
    const mine = recent.filter((a) => a.sport === sport);

    if (sport === 'inot') {
      const measured = mine.filter((a) => a.details?.continuousM != null);
      const best = measured.reduce<SourceActivity | null>((m, a) => (!m || a.details!.continuousM! > m.details!.continuousM! ? a : m), null);
      if (!best) {
        out.push({ sport, leg: legLabel, value: mine.length ? 0 : null, parts: mine.length ? [{ label: 'Înot fără oprire', have: 'nemăsurat', target: fmtD(leg), pct: 0, weight: 1 }] : [] });
        continue;
      }
      const m = best.details!.continuousM!;
      const parts: ReadyPart[] = [{ label: 'Cel mai lung înot fără oprire', have: `${m.toLocaleString('ro-RO')} m`, target: fmtD(leg), pct: pct(m / (leg * 1000)), weight: 1 }];
      let value = parts[0]!.pct;
      const cutoff = SWIM_CUTOFF_MIN[goal];
      const pace = best.details!.continuousPace100mSec;
      if (cutoff && m >= leg * 1000 && pace) {
        const need = (cutoff * 60) / (leg * 10);
        parts.push({ label: 'Ritm față de timpul-limită', have: `${fmtPace(pace)}/100 m`, target: `${fmtPace(need)}/100 m`, pct: pct(need / pace), weight: 0 });
        if (pace > need) value = Math.min(value, 90); // distanța o ai, timpul-limită încă nu
      }
      out.push({ sport, leg: legLabel, value, parts, best: m });
      continue;
    }

    const withDist = mine.filter((a) => (a.distanceKm ?? 0) > 0);
    const longest = withDist.reduce((mx, a) => Math.max(mx, a.distanceKm!), 0);
    if (!longest) {
      out.push({ sport, leg: legLabel, value: null, parts: [] });
      continue;
    }
    const parts: ReadyPart[] = [{ label: sport === 'bicicleta' ? 'Cea mai lungă tură' : 'Cea mai lungă alergare', have: fmtD(longest), target: fmtD(leg), pct: pct(longest / leg), weight: 1 }];
    const brickTarget = BRICK_TARGET_KM[goal];
    if (sport === 'alergare' && brickTarget) {
      const brick = recent.filter((a) => isBrickRun(a, recent) && (a.distanceKm ?? 0) > 0).reduce((mx, a) => Math.max(mx, a.distanceKm!), 0);
      parts[0]!.weight = 0.7;
      parts.push({ label: 'Alergare imediat după bicicletă', have: brick ? `${ro(brick)} km` : 'niciuna', target: `${ro(brickTarget)} km`, pct: pct(brick / brickTarget), weight: 0.3 });
    }
    out.push({ sport, leg: legLabel, value: Math.round(parts.reduce((s2, p) => s2 + p.pct * p.weight, 0)), parts, best: longest });
  }
  return out;
}

function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pregătirea pentru toată cursa: media probelor, cu pondere egală. O probă fără nicio ședință contează 0 (nedemonstrată). */
export function overallReady(rs: SportReady[]): number | null {
  if (!rs.length || rs.every((r) => r.value == null)) return rs.length ? 0 : null;
  return Math.round(rs.reduce((s, r) => s + (r.value ?? 0), 0) / rs.length);
}

export const GOAL_NAME: Record<Goal, string> = { '70.3': 'Ironman 70.3', olimpic: 'triatlon olimpic', sprint: 'triatlon sprint', semimaraton: 'semimaraton', maraton: 'maraton' };
