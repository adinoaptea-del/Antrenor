import { swimPace100, swimPaceOk } from '../collector/details.js';
// PREGĂTIREA PE PROBĂ — algoritmul (același pentru toți sportivii, aceleași date de intrare dau același rezultat).
//
// Fereastra: ultimele 6 săptămâni, toate ședințele de pe brățări (și cele din afara planului).
// Pe fiecare probă, trei componente, fiecare 0–100%, cu sursa la vedere (măsurat / declarat):
//
//   1. REZISTENȚĂ (60%) — poți acoperi distanța probei?
//        alergare, bicicletă: cea mai lungă ședință / distanța probei (GPS, măsurat).
//        înot: cea mai lungă porțiune FĂRĂ OPRIRE / 1.900 m. Din turele ceasului (măsurat); fără ture
//        (Apple Health nu le trimite), din ce a declarat sportivul în chestionar (declarat), până apare o măsurătoare.
//        Maraton: ținta e ieșirea lungă de referință, 32 km.
//   2. VOLUM (25%) — antrenamentul susține proba?
//        media săptămânală pe ultimele 4 săptămâni / 1,5 × distanța probei
//        (regula: la vârful pregătirii, volumul săptămânal pe o probă ≈ 1,5 × distanța ei).
//   3. SPECIFIC (15%) — condițiile cursei:
//        înot: ritmul față de timpul-limită de 70 min, înmulțit cu rezistența (doar la 70.3; la celelalte, trece în rezistență);
//        bicicletă: cel puțin o tură urmată imediat de alergare (brick);
//        alergare: cea mai lungă alergare imediat după bicicletă / 8 km (70.3), 4 km (olimpic), 2 km (sprint).
//        La semimaraton/maraton nu există componentă specifică: ponderea trece în rezistență.
//
// Total pe probă = suma ponderată. Total cursă = media probelor (fiecare probă trebuie terminată), doar cu toate probele.
// Componentele secundare (volum, specific) nemăsurate contează 0; rezistența nemăsurată și nedeclarată face indicele
// probei necunoscut (null), nu 0 (auditul v93, A74). Nu prezice timpul de cursă. În registrul indicatorilor
// (src/bar/metrics.ts) e „pregatire_proba”, alt nume decât indicele de pregătire pentru cursă.

import type { Sport } from '../types.js';
import type { SourceActivity } from '../collector/types.js';
import { diffDays } from '../util/dates.js';
import { GOAL_LABEL, goalKind, type Goal } from '../calendar/phases.js';

export interface ReadyPart {
  label: string;
  /** Ce ai demonstrat, scris pentru om („14,2 km”, „5 în 4 săpt.”). */
  have: string;
  target: string;
  /** 0–100 */
  pct: number;
  weight: number;
  /** De unde vine cifra: măsurat de brățări, declarat în chestionar sau lipsă. */
  source?: 'masurat' | 'declarat' | 'lipsa';
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
  '5k': { alergare: 5 },
  '10k': { alergare: 10 },
  'inot-1500': { inot: 1.5 },
  'inot-1900': { inot: 1.9 },
  'inot-3800': { inot: 3.8 },
  'bike-50': { bicicleta: 50 },
  'bike-100': { bicicleta: 100 },
  'bike-160': { bicicleta: 160 },
  'fit-slabire': {},
  'fit-tonifiere': {},
  'fit-intretinere': {},
  'fit-masa': {},
  mers: {},
};

/** Timpul-limită uzual pe înot la Ironman 70.3 (70 min la 1,9 km). */
const SWIM_CUTOFF_MIN: Partial<Record<Goal, number>> = { '70.3': 70 };
/** Alergarea după bicicletă pe care o cere pregătirea de triatlon. */
const BRICK_TARGET_KM: Partial<Record<Goal, number>> = { '70.3': 8, olimpic: 4, sprint: 2 };
/** Ieșirea lungă de referință acolo unde în antrenament nu se aleargă toată distanța (maraton: 32 km) sau se aleargă mai mult (5 km: 8; 10 km: 12). */
const LONG_TARGET_KM: Partial<Record<Goal, number>> = { maraton: 32, '5k': 8, '10k': 12 };
const VOLUME_FACTOR = 1.5;
const W = { rezistenta: 0.6, volum: 0.25, specific: 0.15 };

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

/** Ce a declarat sportivul în chestionar (folosit doar până apare o măsurătoare). */
export interface Declared {
  /** Metri înotați fără oprire, din chestionar. */
  swimContinuousM?: number | null;
}

/** Răspunsul din chestionar → metri fără oprire (limita de jos a variantei alese). */
export function declaredSwimM(nivel: string | null | undefined, has400Time = false): number | null {
  if (has400Time) return 400;
  // „Nu știu” = necunoscut (null), nu 0 m și nu o valoare implicită (auditul v2, V2-04).
  return nivel === 'peste_1500' ? 1500 : nivel === 'continuu_400' ? 400 : nivel === 'bazin_scurt' ? 50 : null;
}

/** Cât a declarat sportivul că înoată fără oprire (chestionarul de intrare). */
export function swimDeclared(intake: Record<string, unknown> | null | undefined): number | null {
  const i = intake as { inot?: { nivel?: string | null }; evaluare?: { inot400?: string | null } } | null | undefined;
  return declaredSwimM(i?.inot?.nivel ?? null, !!i?.evaluare?.inot400);
}

export function sportReadiness(goal: Goal, activities: SourceActivity[], today: string, declared: Declared = {}): SportReady[] {
  // Obiectiv nesuportat (ex. „full”, salvat de o versiune veche): fără bară, nu o eroare.
  const legs = LEGS[goal];
  if (!legs) return [];
  const recent = activities.filter((a) => {
    const d = diffDays(a.date, today);
    return d >= 0 && d < WINDOW;
  });
  const last4w = recent.filter((a) => diffDays(a.date, today) < 28);
  const out: SportReady[] = [];
  const name = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare' } as const;
  // Un singur sport (alergare, înot sau bicicletă): nu există componentă „specifică” de triatlon; ponderea trece în rezistență.
  const runOnly = goalKind(goal) !== 'tri';

  for (const sport of ['inot', 'bicicleta', 'alergare'] as const) {
    const leg = legs[sport];
    if (!leg) continue;
    const fmtD = (km: number) => (sport === 'inot' ? `${Math.round(km * 1000).toLocaleString('ro-RO')} m` : `${ro(km)} km`);
    const legLabel = `${fmtD(leg)} ${name[sport]}`;
    const mine = recent.filter((a) => a.sport === sport);
    const parts: ReadyPart[] = [];

    // 1. Rezistență
    let best: number | null = null;
    if (sport === 'inot') {
      const measured = mine.filter((a) => a.details?.continuousM != null);
      const m = measured.reduce((mx, a) => Math.max(mx, a.details!.continuousM!), -1);
      const dec = declared.swimContinuousM ?? null;
      if (m >= 0) {
        best = m;
        parts.push({ label: 'Cel mai lung înot fără oprire', have: `${m.toLocaleString('ro-RO')} m`, target: fmtD(leg), pct: pct(m / (leg * 1000)), weight: W.rezistenta, source: 'masurat' });
      } else if (dec != null) {
        best = dec;
        parts.push({ label: 'Înot fără oprire (declarat, fără ture de la ceas)', have: `${dec.toLocaleString('ro-RO')} m`, target: fmtD(leg), pct: pct(dec / (leg * 1000)), weight: W.rezistenta, source: 'declarat' });
      } else {
        parts.push({ label: 'Înot fără oprire', have: 'nemăsurat', target: fmtD(leg), pct: 0, weight: W.rezistenta, source: 'lipsa' });
      }
    } else {
      const longest = mine.reduce((mx, a) => Math.max(mx, a.distanceKm ?? 0), 0);
      const target = LONG_TARGET_KM[goal] ?? leg;
      best = longest || null;
      parts.push({ label: sport === 'bicicleta' ? 'Cea mai lungă tură' : 'Cea mai lungă alergare', have: longest ? fmtD(longest) : 'niciuna', target: fmtD(target), pct: pct(longest / target), weight: W.rezistenta, source: longest ? 'masurat' : 'lipsa' });
    }

    // 2. Volum: media săptămânală pe 4 săptămâni
    const weekly = last4w.filter((a) => a.sport === sport).reduce((s2, a) => s2 + (a.distanceKm ?? 0), 0) / 4;
    const volTarget = VOLUME_FACTOR * leg;
    parts.push({ label: 'Volum pe săptămână (media pe 4 săpt.)', have: fmtD(weekly), target: fmtD(volTarget), pct: pct(weekly / volTarget), weight: W.volum, source: weekly > 0 ? 'masurat' : 'lipsa' });

    // 3. Specific
    if (runOnly) {
      parts[0]!.weight += W.specific;
    } else if (sport === 'inot') {
      const cutoff = SWIM_CUTOFF_MIN[goal];
      // Ritmul: din porțiunea continuă dacă există ture; altfel ritmul ședinței cea mai lungă, cu pauze (mai sever, dar măsurat).
      const withLaps = mine.filter((a) => swimPaceOk(a.details?.continuousPace100mSec) && (a.details?.continuousM ?? 0) >= 100);
      const longestSwim = mine.reduce<SourceActivity | null>((m, a) => ((a.distanceKm ?? 0) > (m?.distanceKm ?? 0) ? a : m), null);
      const pace = withLaps.length ? Math.min(...withLaps.map((a) => a.details!.continuousPace100mSec!)) : longestSwim?.distanceKm ? swimPace100(longestSwim.minutes * 60, longestSwim.distanceKm * 1000) : null;
      if (cutoff) {
        const need = (cutoff * 60) / (leg * 10);
        parts.push({ label: withLaps.length ? 'Ritm față de timpul-limită' : 'Ritm (cu pauze) față de timpul-limită', have: pace ? `${fmtPace(pace)}/100 m` : 'nemăsurat', target: `${fmtPace(need)}/100 m`, // Ritmul contează doar pe distanța pe care o poți acoperi: se scalează cu rezistența (ritm bun pe 50 m nu înseamnă ritm bun pe 1.900 m).
        pct: pace ? Math.round(pct(need / pace) * Math.min(1, parts[0]!.pct / 100)) : 0, weight: W.specific, source: pace ? 'masurat' : 'lipsa' });
      } else {
        parts[0]!.weight += W.specific;
      }
    } else if (sport === 'bicicleta') {
      const hasBrick = recent.some((a) => isBrickRun(a, recent));
      parts.push({ label: 'Tură urmată de alergare (brick)', have: hasBrick ? 'da' : 'nu', target: 'cel puțin una', pct: hasBrick ? 100 : 0, weight: W.specific, source: 'masurat' });
    } else {
      const brickTarget = BRICK_TARGET_KM[goal] ?? 0;
      const brick = recent.filter((a) => isBrickRun(a, recent)).reduce((mx, a) => Math.max(mx, a.distanceKm ?? 0), 0);
      parts.push({ label: 'Alergare imediat după bicicletă', have: brick ? `${ro(brick)} km` : 'niciuna', target: `${ro(brickTarget)} km`, pct: brickTarget ? pct(brick / brickTarget) : 0, weight: W.specific, source: 'masurat' });
    }

    const anyData = mine.length > 0 || (sport === 'inot' && declared.swimContinuousM != null);
    // Capacitatea necunoscută rămâne necunoscută (auditul v93, A74): fără rezistență măsurată sau declarată (ex. înot
    // fără ture și fără declarație), indicele nu se calculează doar din volum cu rezistența pusă 0.
    const value = anyData && parts[0]!.source !== 'lipsa' ? Math.round(parts.reduce((s2, p) => s2 + p.pct * p.weight, 0)) : null;
    out.push({ sport, leg: legLabel, value, parts, best });
  }
  return out;
}

function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Pregătirea pentru toată cursa: media probelor, cu pondere egală — doar când toate probele au indice. O probă fără
 * date e necunoscută, nu 0 fiziologic (auditul v93, A74): media e null până o măsurăm.
 */
export function overallReady(rs: SportReady[]): number | null {
  if (!rs.length || rs.some((r) => r.value == null)) return null;
  return Math.round(rs.reduce((s, r) => s + r.value!, 0) / rs.length);
}

export const GOAL_NAME: Record<Goal, string> = GOAL_LABEL;
