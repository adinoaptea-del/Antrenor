// Ședințele de calitate la bicicletă și la înot, cu progresie săptămânală în fază și variație între familii,
// în locul aceleiași ședințe repetate toată faza. Fiecare familie păstrează repere repetabile (aceeași structură
// revine), ca progresul să fie comparabil.
//
// Surse: Coggan / Allen („sweet spot” 88–94% FTP, pragul); practica „over-under”; Rønnestad și colab. 2020/2021
// (intervale scurte 30 s / 15 s, 3 serii × 10–13 repetări: adaptări mai mari decât 4–6 × 5 min la același efort
// perceput, la cicliști antrenați — la amatori se începe cu 2 serii); Swim Smooth / USMS (seturile pe CSS: 100 m cu
// pauză scurtă, crescute treptat; repetări mai lungi spre cursă). Zonele și FTP/CSS vin din testele sportivului; fără
// test, efortul se dă în cuvinte (RPE).

import type { Phase, Zone } from '../types.js';

export interface QualityModule {
  structure: string;
  zones: Zone[];
  minutes: number;
  /** Pentru pașii ședinței: repetări × minute în zonă, cu pauza din structură. */
  intervals?: { count: number; minutes: number; zone: Zone };
}

const round5 = (m: number) => Math.round(m / 5) * 5;
const total = (work: number, rest: number) => round5(15 + work + rest + 10);

/** Bicicleta: baza2 sweet spot în progresie; build alternează pragul cu over-under; peak alternează 30/15 cu ritmul de obiectiv. */
export function bikeQuality(phase: Phase, weekInPhase: number, opts: { raceKm?: number | null; capZ4?: boolean; experienced?: boolean } = {}): QualityModule | null {
  const w = Math.max(0, weekInPhase);
  if (phase === 'baza2') {
    const steps = [
      [3, 10],
      [3, 12],
      [2, 20],
      [3, 15],
    ] as const;
    const [n, m] = steps[w % steps.length]!;
    return { structure: `${n} × ${m} min sweet spot (Z3, „greu dar stabil”, 88–94% FTP), 5 min ușor între`, zones: [3], minutes: total(n * m, (n - 1) * 5), intervals: { count: n, minutes: m, zone: 3 } };
  }
  if (phase === 'build') {
    if (w % 2 === 1) return { structure: '3 × 9 min over-under: alternezi 2 min la 95% FTP cu 1 min la 105% FTP (Z4), 5 min ușor între', zones: [4], minutes: total(27, 10), intervals: { count: 3, minutes: 9, zone: 4 } };
    const steps = [
      [2, 12],
      [2, 15],
      [2, 20],
    ] as const;
    const [n, m] = steps[Math.floor(w / 2) % steps.length]!;
    return { structure: `${n} × ${m} min la prag (Z4, 95–100% FTP), 5 min ușor între`, zones: [4], minutes: total(n * m, (n - 1) * 5), intervals: { count: n, minutes: m, zone: 4 } };
  }
  if (phase === 'peak') {
    // 30/15 e o opțiune, nu regula fazei: studiul (Rønnestad 2020) e pe 18 cicliști de elită. Doar pentru cine are
    // istoric de antrenament consistent (≥ 6 h/săpt. sau test de bicicletă făcut) și fără plafon Z4 (vârstă, restricție).
    // Altfel, ritmul de obiectiv, care e specific distanței.
    if (w % 2 === 0 && !opts.capZ4 && opts.experienced) {
      const reps = w === 0 ? 10 : 12;
      return { structure: `3 serii × ${reps} × (30 s tare / 15 s ușor), 3 min ușor între serii — intervale scurte 30/15`, zones: [4, 5], minutes: total(3 * reps * 0.75, 6) };
    }
    return { structure: `3 × 15 min la ritmul pe care-l ții în ${opts.raceKm ? `tura de ${opts.raceKm} km` : 'cursă'}, 5 min ușor între`, zones: [3, 4], minutes: total(45, 10), intervals: { count: 3, minutes: 15, zone: 3 } };
  }
  if (phase === 'taper') return { structure: '3 × 5 min la ritm de obiectiv, 3 min ușor între', zones: [3, 4], minutes: 45, intervals: { count: 3, minutes: 5, zone: 3 } };
  return null;
}

/** Pașii pentru intervalele scurte 30/15 (structura nu se potrivește formei „N × M min”). */
export function shortIntervalSteps(structure: string | null | undefined, minutes: number): { label: string; text: string }[] | null {
  const m = /(\d+) serii × (\d+) × \(30 s tare \/ 15 s ușor\)/.exec(structure ?? '');
  if (!m) return null;
  const series = Number(m[1]);
  const reps = Number(m[2]);
  const work = Math.ceil(series * reps * 0.75 + (series - 1) * 3);
  const warm = 15;
  const cool = Math.max(5, minutes - warm - work);
  return [
    { label: 'Încălzire', text: `${warm} min ușor, crescând; la final 2 accelerări de 10 s` },
    { label: 'Principal', text: `${series} serii × ${reps} repetări: 30 s tare (efort 8–9 din 10, cadență ridicată), 15 s pedalat foarte ușor; 3 min ușor între serii. Dacă puterea scade mult în ultima serie, te oprești.` },
    { label: 'Revenire', text: `${cool} min foarte ușor` },
  ];
}

/** Înotul: seturile pe CSS cresc din săptămână în săptămână; spre cursă, repetări mai lungi. */
export function swimQuality(phase: Phase, weekInPhase: number): string | null {
  const w = Math.max(0, weekInPhase);
  if (phase === 'baza2' || phase === 'build') {
    const sets = ['8 × 100 m la ritmul CSS, 15 s pauză', '10 × 100 m la ritmul CSS, 15 s pauză', '5 × 200 m la ritmul CSS, 20 s pauză', '4 × 300 m la ritmul CSS, 30 s pauză'];
    return `${sets[w % sets.length]} (set CSS)`;
  }
  if (phase === 'peak') return w % 2 === 0 ? '6 × 200 m la ritm de obiectiv, 20 s pauză (set CSS)' : '3 × 400 m la ritm de obiectiv, 30 s pauză (set CSS)';
  if (phase === 'taper') return '6 × 100 m la ritm de obiectiv, 20 s pauză (set CSS)';
  return null;
}

/** Înotul aerob variat: piramidă la două săptămâni, ca ședința lungă să nu fie mereu la fel (doar cu 400 m legat). */
export const SWIM_PYRAMID = 'piramidă 100-200-300-200-100 m ușor-moderat, 20–30 s pauză';
