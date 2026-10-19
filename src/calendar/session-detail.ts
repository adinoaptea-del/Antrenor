// Ședința detaliată, pas cu pas: aceeași funcție pentru aplicație (fereastra ședinței) și pentru simularea de audit.
// Suma minutelor pașilor = durata din plan (excepție: înotul, unde metrii sunt exacți și durata e estimată, etichetat).
//
// Pulsul: din zonele testate (test de efort / teren) când există; altfel ESTIMAT din vârstă (FCmax ≈ 208 − 0,7 × vârsta,
// Tanaka 2001; ±10 bpm la o persoană) și etichetat ca estimare până la test. Fără vârstă și fără test: doar efortul
// (RPE 0–10) și testul vorbirii. Zonele estimate (% din FCmax): Z1 < 70, Z2 70–80, Z3 80–87, Z4 87–93, Z5 > 93.
//
// Școala alergării (5–6 min, în încălzire, la ședințele de calitate și la cele cu accelerări): genunchi la piept,
// călcâie la șezut, pas săltat, pendularea gambei, alergare laterală; 20 m fiecare, întoarcerea la pas = pauza.
// Pauza dintre repetări: până pulsul coboară în zona 1 (sub ~70% FCmax), dar nu mai puțin decât pauza din plan.
// Plafonul de puls: limita de sus a zonei-țintă; peste el încetinești, iar la intervale oprești repetarea.

import type { PlannedWorkout, Zone } from '../types.js';
import { RUN_MODULES, moduleMinutes, parseModule } from './run-modules.js';
import { parseStrides, stridesMinutes, swimSet, type Step } from './session-steps.js';
import { shortIntervalSteps } from './bike-swim-modules.js';

export interface DetailContext {
  /** Limitele superioare Z1..Z5 (bpm), din test, pe sportul ședinței. */
  zonesRun?: (number | null)[] | null;
  zonesBike?: (number | null)[] | null;
  fcmaxTest?: number | null;
  css?: number | null;
  age?: number | null;
}

interface Hr {
  /** Limita de sus a fiecărei zone, Z1..Z5. */
  up: number[];
  estimated: boolean;
  fcmax: number | null;
}

const PCT = [0.7, 0.8, 0.87, 0.93, 1];

export function hrFor(sport: string, ctx: DetailContext): Hr | null {
  const z = sport === 'alergare' ? ctx.zonesRun : sport === 'bicicleta' ? ctx.zonesBike : null;
  if (z && z.slice(0, 4).every((v) => v != null)) return { up: z.map((v, i) => v ?? Math.round((ctx.fcmaxTest ?? z[3]! / 0.93) * PCT[i]!)) as number[], estimated: false, fcmax: ctx.fcmaxTest ?? null };
  if (ctx.fcmaxTest) return { up: PCT.map((p) => Math.round(ctx.fcmaxTest! * p)), estimated: false, fcmax: ctx.fcmaxTest };
  if (ctx.age && ctx.age >= 14 && ctx.age <= 90) {
    const max = Math.round(208 - 0.7 * ctx.age);
    // Pe bicicletă pulsul la același efort e de obicei puțin mai mic decât la alergare.
    const adj = sport === 'bicicleta' ? 5 : 0;
    return { up: PCT.map((p) => Math.round(max * p) - adj), estimated: true, fcmax: max };
  }
  return null;
}

function zoneText(hr: Hr | null, n: Zone): string {
  if (!hr) return `Z${n}`;
  const up = hr.up[n - 1]!;
  const lo = n > 1 ? hr.up[n - 2]! + 1 : null;
  return lo != null ? `Z${n} (${lo}–${up} bpm)` : `Z${n} (sub ${up} bpm)`;
}

const fmtMin = (m: number) => (Number.isInteger(m) ? `${m} min` : m < 1 ? `${Math.round(m * 60)} s` : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} min`);
const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;

export const RUN_DRILLS = 'școala alergării: 2 × 20 m genunchi la piept, 2 × 20 m călcâie la șezut, 2 × 20 m pas săltat (skip A), 2 × 20 m pendularea gambei (skip B), 2 × 20 m alergare laterală; întoarcerea la pas e pauza';
const BIKE_PRIMER = '3 × 1 min cadență crescută (100–110 rpm), 1 min ușor între';
const STRETCH = '5 min întinderi ușoare: gambe, coapse (față și spate), flexorii șoldului, fesieri — 30 s fiecare, fără arcuire';

function hrNote(hr: Hr | null): Step | null {
  if (!hr) return { label: 'Puls', text: 'fără test și fără vârstă în profil: mergi după efort (scala 0–10) și testul vorbirii; zonele în bpm apar după test.' };
  if (hr.estimated) return { label: 'Puls', text: `zonele sunt ESTIMATE din vârstă (puls maxim ≈ ${hr.fcmax} bpm, ±10 bpm de la om la om). Dacă efortul pare mult mai ușor sau mai greu decât spune pulsul, crede efortul; testul de teren le înlocuiește cu ale tale.` };
  return null;
}

/** Pașii detaliați ai ședinței. `ctx` vine din profil (vârstă) și din teste (zone, FCmax, CSS). */
export function detailSteps(w: PlannedWorkout, ctx: DetailContext = {}): Step[] {
  const m = Math.max(0, w.plannedMinutes);
  if (w.type === 'odihna') return [{ label: 'Odihnă', text: 'Fără antrenament azi. Corpul se adaptează acum: somn, mâncare, plimbare ușoară dacă ai chef.' }];
  if (w.type === 'forta') {
    const warm = Math.min(8, Math.max(5, Math.floor(m / 6)));
    return [
      { label: 'Încălzire', text: `${warm} min: 3 min cardio ușor, apoi mobilitate dinamică (șolduri, umeri, glezne) și 1–2 serii ușoare la primul exercițiu` },
      { label: 'Principal', text: 'exercițiile zilei, în ordine, cu seriile, repetările, rezerva și pauza din listă' },
      { label: 'Revenire', text: '3–5 min mers ușor și respirație, opțional întinderi ușoare' },
    ];
  }
  const hr = hrFor(w.sport, ctx);
  const z = (n: Zone) => zoneText(hr, n);
  const recover = hr ? `până pulsul coboară sub ~${hr.up[0]} bpm` : 'până respiri liniștit și poți vorbi';
  const capFor = (n: Zone) => (hr ? `pulsul nu trece de ${hr.up[Math.min(4, n) - 1]} bpm${n >= 5 ? ' (aproape de maxim: doar în repetări)' : ''}; dacă trece, încetinești${n >= 3 ? ', iar dacă nu coboară, oprești repetarea' : ''}.` : `efortul nu trece de ${n <= 2 ? '3–4 din 10 (poți vorbi în propoziții)' : n === 3 ? '6 din 10' : n === 4 ? '7–8 din 10' : '9 din 10, doar în repetări'}.`);
  const note = hrNote(hr);
  const withNote = (steps: Step[]) => (note && (w.sport === 'alergare' || w.sport === 'bicicleta') ? [...steps, note] : steps);

  // Alergare: modulele de calitate (V5, T1, H, M …), cu școala alergării și pauză după puls.
  const p = parseModule(w.structure);
  if (p) {
    const mm = { ...RUN_MODULES[p.id] };
    while (moduleMinutes(mm) > m && mm.count > 2) mm.count -= 1;
    while (moduleMinutes(mm) > m && mm.warm > 8) mm.warm -= 1;
    while (moduleMinutes(mm) > m && mm.cool > 5) mm.cool -= 1;
    const extra = m - moduleMinutes(mm);
    if (extra > 0) mm.cool += Math.min(10, Math.floor(extra));
    const pace = mm.paceRef === 'cursa' && p.paceSecKm ? `, orientativ ${fmtPace(p.paceSecKm)}` : '';
    // Zona din plan are prioritate (ex. plafonată la Z4 de la 55 de ani).
    const zUse = (w.targetZones.length && !w.targetZones.includes(mm.zone) ? Math.max(...w.targetZones) : mm.zone) as Zone;
    const drills = p.id !== 'D1' && mm.warm >= 10;
    const jog = drills ? mm.warm - 6 : mm.warm;
    const stretch = mm.cool >= 8;
    return withNote([
      { label: 'Încălzire', text: p.id === 'D1' ? `${mm.warm} min ușor în ${z(2)}` : `${jog} min alergare ușoară în ${z(1)}–${z(2)}, crescând` },
      ...(drills ? [{ label: 'Școala alergării', text: `6 min — ${RUN_DRILLS}; la final 3 accelerări de 60–80 m` }] : []),
      { label: 'Principal', text: `${mm.count} × ${fmtMin(mm.work)} ${mm.effort} în ${z(zUse)} (efort ${mm.rpe} din 10${pace}); între repetări ${fmtMin(mm.rest)} trap ușor sau mers ${recover}. Prima repetare puțin mai ușor.` },
      { label: 'Revenire', text: stretch ? `${mm.cool - 5} min alergare foarte ușoară în ${z(1)}, apoi ${STRETCH}` : `${mm.cool} min alergare foarte ușoară în ${z(1)}` },
      { label: 'Plafon', text: capFor(zUse) },
    ]);
  }
  if (/^mers-alergare/.test(w.structure ?? '')) {
    return withNote([
      { label: 'Ședința', text: w.structure! },
      { label: 'Plafon', text: hr ? `pe alergare, pulsul sub ${hr.up[1]} bpm; dacă trece, mergi până coboară sub ${hr.up[0]}.` : 'pe alergare, să poți vorbi în propoziții; dacă nu, mergi.' },
    ]);
  }
  if (/TEST/i.test(w.structure ?? '')) return withNote([{ label: 'Testul', text: w.structure!.replace(/^TEST:?\s*/i, '') }, { label: 'Important', text: 'odihnit, fără efort greu în ultimele 48 h; notezi pulsul mediu și maxim. Din test ies zonele tale și ele înlocuiesc estimările.' }]);

  if (w.sport === 'inot') return swimSet({ type: w.type, minutes: m, css: ctx.css ?? null, date: w.date, structure: w.structure }).steps;
  const si = shortIntervalSteps(w.structure, m);
  if (si) return withNote([...si, { label: 'Plafon', text: hr ? `în repetări poate ajunge spre ${hr.up[4]} bpm; între serii coboară sub ${hr.up[0]} înainte de seria următoare.` : 'între serii, până respiri liniștit.' }]);

  if (w.type === 'brick') {
    const parsed = /tură (\d+) min.*alergare (\d+) min/.exec(w.structure ?? '');
    const bike = parsed && Number(parsed[1]) + Number(parsed[2]) === m ? Number(parsed[1]) : Math.round((m * 0.7) / 5) * 5;
    const hrRun = hrFor('alergare', ctx);
    return withNote([
      { label: 'Bicicletă', text: `${bike} min în ${zoneText(hrFor('bicicleta', ctx), 2)}, constant; bei și mănânci ca în cursă (după prima oră, 60–90 g carbohidrați pe oră)` },
      { label: 'Tranziție', text: 'schimbi echipamentul cât mai repede, fără pauză lungă' },
      { label: 'Alergare', text: `${m - bike} min în ${zoneText(hrRun, 2)}; primele 5 min mai ușor, pași scurți și cadență mare, până se „așază” picioarele` },
      { label: 'Plafon', text: hrRun ? `alergarea sub ${hrRun.up[1]} bpm.` : 'alergarea să rămână conversațională.' },
    ]);
  }
  if (w.type === 'calitate' && w.intervals) {
    const iv = w.intervals;
    const restMatch = /(\d+)\s*min ușor între/.exec(w.structure ?? '');
    const rest = restMatch ? Number(restMatch[1]) : Math.max(1, Math.round(iv.minutes / 2));
    let count = iv.count;
    while (count > 1 && count * iv.minutes + (count - 1) * rest + 10 > m) count -= 1;
    const work = count * iv.minutes + (count - 1) * rest;
    const left = Math.max(0, m - work);
    const warm = Math.min(15, Math.max(0, left - Math.min(5, Math.floor(left / 3))));
    const cool = left - warm;
    const bike = w.sport === 'bicicleta';
    return withNote([
      { label: 'Încălzire', text: bike ? `${warm} min crescând din ${z(1)} în ${z(2)}${warm >= 10 ? `; în ultimele minute ${BIKE_PRIMER}` : ''}` : `${Math.max(0, warm - (warm >= 12 ? 6 : 0))} min ușor în ${z(1)}–${z(2)}${warm >= 12 ? `; apoi 6 min ${RUN_DRILLS}` : ''}` },
      { label: 'Principal', text: `${count} × ${iv.minutes} min în ${z(iv.zone)}${count > 1 ? `; între ele ${rest} min ${bike ? 'pedalat ușor' : 'trap ușor'} ${recover}` : ''}. ${w.structure ? `(${w.structure})` : ''}`.trim() },
      { label: 'Revenire', text: !bike && cool >= 8 ? `${cool - 5} min foarte ușor, apoi ${STRETCH}` : `${cool} min foarte ușor în ${z(1)}` },
      { label: 'Plafon', text: capFor(iv.zone) },
    ]);
  }

  // Ușor / lung (alergare, bicicletă), cu accelerări dacă sunt în plan.
  const warm = m >= 30 ? 10 : Math.floor(m / 3);
  const cool = m >= 30 ? 5 : Math.floor(m / 6);
  const strides = w.sport === 'alergare' ? parseStrides(w.structure) : null;
  const sMin = strides ? Math.min(stridesMinutes(strides), Math.max(0, m - warm - cool - 5)) : 0;
  const main = m - warm - cool - sMin;
  const target: Zone = (w.targetZones.length ? Math.max(...w.targetZones) : 2) as Zone;
  const talk = target <= 2 ? ' — poți vorbi în propoziții întregi' : '';
  const run = w.sport === 'alergare';
  return withNote([
    { label: 'Încălzire', text: run ? `${warm} min alergare foarte ușoară în ${z(1)}${strides ? '; opțional 3 min mobilitate dinamică' : ''}` : `${warm} min pedalat ușor în ${z(1)}, cadență 85–95` },
    { label: 'Principal', text: `${main} min în ${z(target)}${w.type === 'lung' ? ', constant; la peste 75 min, apă și 30–60 g carbohidrați pe oră' : ''}${talk}` },
    ...(strides && sMin ? [{ label: 'Accelerări', text: `${strides.n} × ${strides.sec} s rapid dar relaxat (nu sprint), pe teren drept, cu ~1 min mers sau trap ${recover} (${sMin} min)` }] : []),
    { label: 'Revenire', text: run && cool >= 5 ? `${cool} min mers și întinderi ușoare (gambe, coapse, fesieri)` : `${cool} min foarte ușor` },
    { label: 'Plafon', text: capFor(target) },
  ]);
}
