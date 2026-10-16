// Cât de pregătit ești pe fiecare probă a cursei, din ce au înregistrat brățările în ultimele 6 săptămâni.
// Toate ședințele contează (și cele din afara planului). Nu prezice timpul de cursă; spune doar cât din cerințele probei ai demonstrat.
// Fiecare procent are piesele lui la vedere: ce ai făcut, față de ce, cu ce pondere.

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
}

/** Distanțele probelor. */
const LEGS: Record<Goal, Partial<Record<'inot' | 'bicicleta' | 'alergare', number>>> = {
  '70.3': { inot: 1.9, bicicleta: 90, alergare: 21.1 },
  olimpic: { inot: 1.5, bicicleta: 40, alergare: 10 },
  sprint: { inot: 0.75, bicicleta: 20, alergare: 5 },
  semimaraton: { alergare: 21.1 },
  maraton: { alergare: 42.2 },
};

/** Timpul-limită uzual pe înot la Ironman 70.3 / full (70 min la 1,9 km): ritmul care îl atinge. */
const SWIM_CUTOFF_MIN: Partial<Record<Goal, number>> = { '70.3': 70 };

const WINDOW = 42;
const PER_WEEK = 2; // ședințe pe săptămână pe sport: frecvența minimă la care un sport progresează
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

export function sportReadiness(goal: Goal, activities: SourceActivity[], today: string): SportReady[] {
  const legs = LEGS[goal];
  const recent = activities.filter((a) => {
    const d = diffDays(a.date, today);
    return d >= 0 && d < WINDOW;
  });
  const last4w = (s: Sport) => recent.filter((a) => a.sport === s && diffDays(a.date, today) < 28).length;
  const out: SportReady[] = [];

  for (const sport of ['inot', 'bicicleta', 'alergare'] as const) {
    const leg = legs[sport];
    if (!leg) continue;
    const unit = sport === 'inot' ? 'm' : 'km';
    const fmtD = (km: number) => (sport === 'inot' ? `${Math.round(km * 1000).toLocaleString('ro-RO')} m` : `${ro(km)} km`);
    const withDist = recent.filter((a) => a.sport === sport && (a.distanceKm ?? 0) > 0);
    const longest = withDist.reduce<SourceActivity | null>((m, a) => (!m || a.distanceKm! > m.distanceKm! ? a : m), null);
    const legLabel = `${fmtD(leg)} ${{ inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare' }[sport]}`;
    void unit;
    if (!longest) {
      out.push({ sport, leg: legLabel, value: null, parts: [] });
      continue;
    }

    const n = last4w(sport);
    const parts: ReadyPart[] = [
      { label: 'Cea mai lungă ședință', have: fmtD(longest.distanceKm!), target: fmtD(leg), pct: pct(longest.distanceKm! / leg), weight: 0.6 },
      { label: 'Constanță (ultimele 4 săpt.)', have: `${n} ședințe`, target: `${PER_WEEK * 4}`, pct: pct(n / (PER_WEEK * 4)), weight: sport === 'bicicleta' ? 0.4 : 0.2 },
    ];

    if (sport === 'inot') {
      const cutoff = SWIM_CUTOFF_MIN[goal];
      // Ritmul pe 100 m al celei mai lungi ședințe (ședințele scurte au ritm nerelevant pentru 1,9 km).
      const paceSec = longest.details?.pace100mSec ?? (longest.minutes * 60) / (longest.distanceKm! * 10);
      if (cutoff) {
        const needSec = (cutoff * 60) / (leg * 10);
        parts.push({ label: 'Ritm față de timpul-limită', have: `${fmtPace(paceSec)}/100 m`, target: `${fmtPace(needSec)}/100 m`, pct: pct(needSec / paceSec), weight: 0.2 });
      } else {
        parts[0]!.weight = 0.8;
      }
    } else if (sport === 'alergare' && legs.bicicleta) {
      const bricks = recent.filter((a) => isBrickRun(a, recent) && (a.distanceKm ?? 0) > 0);
      const best = bricks.reduce((m, a) => Math.max(m, a.distanceKm!), 0);
      const target = Math.min(5, leg / 2);
      parts.push({ label: 'Alergare după bicicletă', have: best ? `${ro(best)} km` : 'niciuna', target: `${ro(target)} km`, pct: pct(best / target), weight: 0.2 });
    } else if (sport === 'alergare') {
      parts[0]!.weight = 0.8;
    }

    const value = Math.round(parts.reduce((s, p) => s + p.pct * p.weight, 0));
    out.push({ sport, leg: legLabel, value, parts });
  }
  return out;
}

function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
