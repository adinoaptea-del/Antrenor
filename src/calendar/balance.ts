// Echilibrul pregătirii: nu doar cât, ci CE. Un sportiv care aleargă cu plăcere poate încărca alergarea și neglija
// înotul și bicicleta (sau poate face doar Z2 și sări peste fartlek/4×4) și ajunge la start nepregătit pentru obiectiv.
// Totul din date: minutele planificate față de cele făcute pe sport, și ședințele de intensitate față de ce au avut
// cu adevărat (minute în Z3+ măsurate de ceas). Fără date de zone, intensitatea nu se judecă.

import type { Activity, PlannedWorkout, Sport } from '../types.js';
import { matchActivities } from '../scoring/match.js';
import { addDays } from '../util/dates.js';

export interface SportBalance {
  sport: Sport;
  planificat_min: number;
  facut_min: number;
  /** facut / planificat, %. */
  procent: number;
}
export interface QualityBalance {
  sport: Sport;
  /** Ședințe de intensitate planificate și trecute. */
  planificate: number;
  /** Câte au avut cu adevărat intensitate (cel puțin 40% din repetări în Z3+). */
  cu_intensitate: number;
  /** Câte nu se pot judeca (fără puls în zone). */
  fara_date: number;
}
export interface Balance {
  zile: number;
  pe_sport: SportBalance[];
  calitate: QualityBalance[];
  /** Sporturile rămase în urmă (sub 60% din plan): ele au prioritate când se alege ce mai faci. */
  in_urma: Sport[];
  avertismente: { titlu: string; text: string; ce_faci: string }[];
}

const NAME: Record<Sport, string> = { inot: 'înotul', bicicleta: 'bicicleta', alergare: 'alergarea', forta: 'forța', mers: 'mersul' };
const CAP: Record<Sport, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', forta: 'Forță', mers: 'Mers' };
const WINDOW = 21;

export function balanceCheck(today: string, plan: PlannedWorkout[], acts: Activity[], goalLabel: string): Balance {
  // Fereastra începe cel mai devreme la începutul planului (înainte nu exista „planificat” cu care să compari).
  const first = plan.reduce((m, w) => (w.date < m ? w.date : m), today);
  const from = addDays(today, -WINDOW) > first ? addDays(today, -WINDOW) : first;
  const inWin = (d: string) => d >= from && d < today;
  const planned = plan.filter((w) => inWin(w.date) && w.type !== 'odihna' && w.status !== 'sters' && w.status !== 'anulat_sistem');
  const done = acts.filter((a) => inWin(a.date));
  const sports = [...new Set(planned.map((w) => w.sport))];

  const pe_sport: SportBalance[] = sports.map((sport) => {
    const p = planned.filter((w) => w.sport === sport).reduce((n, w) => n + w.plannedMinutes, 0);
    const f = done.filter((a) => a.sport === sport).reduce((n, a) => n + a.minutes, 0);
    return { sport, planificat_min: p, facut_min: f, procent: p ? Math.round((f / p) * 100) : 0 };
  });

  // Intensitatea: ședințele de calitate trecute și ce a măsurat ceasul la activitatea legată de ele.
  const m = matchActivities(planned.filter((w) => w.type === 'calitate'), done, addDays(today, -1));
  const calitate: QualityBalance[] = [];
  for (const sport of sports) {
    const q = m.matches.filter((x) => x.planned.sport === sport);
    if (!q.length) continue;
    let cu = 0;
    let fara = 0;
    for (const x of q) {
      const a = x.activity;
      if (!a) continue; // nefăcută: se vede la volum, nu aici
      const tiz = a.timeInZonesMin;
      if (!tiz) {
        fara += 1;
        continue;
      }
      const hard = (tiz[3] ?? 0) + (tiz[4] ?? 0) + (tiz[5] ?? 0);
      const work = x.planned.intervals ? x.planned.intervals.count * x.planned.intervals.minutes : x.planned.plannedMinutes * 0.3;
      if (hard >= work * 0.4) cu += 1;
    }
    calitate.push({ sport, planificate: q.length, cu_intensitate: cu, fara_date: fara });
  }

  const real = pe_sport.filter((s) => s.planificat_min >= 60 && s.sport !== 'forta');
  const in_urma = real.filter((s) => s.procent < 60).map((s) => s.sport);
  const peste = real.filter((s) => s.procent > 120);
  const avertismente: Balance['avertismente'] = [];
  for (const s of real.filter((x) => x.procent < 60)) {
    const over = peste.filter((o) => o.sport !== s.sport).sort((a, b) => b.procent - a.procent)[0];
    avertismente.push({
      titlu: `${CAP[s.sport]} rămâne în urmă`,
      text: over
        ? `În ultimele ${WINDOW} de zile: ${NAME[over.sport]} ${over.procent}% din plan, ${NAME[s.sport]} doar ${s.procent}% (${s.facut_min} din ${s.planificat_min} min). Pentru ${goalLabel} contează toate probele: riști să ajungi la start nepregătit la ${NAME[s.sport]}.`
        : `În ultimele ${WINDOW} de zile: ${NAME[s.sport]} ${s.procent}% din plan (${s.facut_min} din ${s.planificat_min} min). Pentru ${goalLabel} riști să ajungi la start nepregătit la ${NAME[s.sport]}.`,
      ce_faci: `Ședințele de ${NAME[s.sport]} din săptămâna asta au prioritate${over ? `; ${NAME[over.sport]} în plus nu le înlocuiește` : ''}.`,
    });
  }
  for (const q of calitate) {
    const judged = q.planificate - q.fara_date;
    if (judged >= 2 && q.cu_intensitate * 3 <= judged) {
      avertismente.push({
        titlu: `${CAP[q.sport]}: intensitatea lipsește`,
        text: `Din ${judged} ședințe de intensitate la ${NAME[q.sport]} (tempo, fartlek, 4×4) din ultimele ${WINDOW} de zile, ${q.cu_intensitate} au avut cu adevărat minute în Z3+; restul au ieșit ușoare. Volumul în Z2 e baza, dar pragul și ritmul de cursă nu se construiesc doar din el.`,
        ce_faci: `Următoarea ședință de intensitate la ${NAME[q.sport]}: fă repetările în zona din plan.`,
      });
    }
  }
  return { zile: WINDOW, pe_sport, calitate, in_urma, avertismente };
}
