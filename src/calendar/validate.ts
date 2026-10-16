// Validatorul final al planului: rulează după generare (și după plasare și scurtare). Nicio fază, șablon sau
// progresie nu poate trece de limitele sportivului:
//  - intensitate permisă Z2 (fără aviz cardiologic sau cu analize care limitează): nimic peste Z2, fără intervale;
//    'pana_la_Z4': nimic în Z5;
//  - înot: cine încă nu înoată 400 m fără oprire nu primește „distanța de cursă continuu”, seturi CSS sau ritm de cursă.
// Faza din calendar nu demonstrează capacitatea: o dă chestionarul (și, mai târziu, ce arată ceasul).

import type { IntensityAllowed, PlannedWorkout, Zone } from '../types.js';

export interface PlanLimits {
  intensityAllowed: IntensityAllowed;
  swimContinuous400: boolean;
}

const INTENSE_TEXT = /Z[3-5]|prag|tempo|sweet spot|ritm de cursă|pace de cursă|CSS|TEST|accelerări|VO2/i;
const SWIM_BEYOND = /continuu|CSS|ritm de cursă|pace de cursă|TEST/i;

export function enforceLimits(workouts: PlannedWorkout[], lim: PlanLimits): { workouts: PlannedWorkout[]; notes: string[] } {
  const notes: string[] = [];
  const maxZone: Zone = lim.intensityAllowed === 'Z2' ? 2 : lim.intensityAllowed === 'pana_la_Z4' ? 4 : 5;
  const out = workouts.map((w0) => {
    const w: PlannedWorkout = { ...w0, targetZones: [...w0.targetZones] };
    if (w.sport === 'forta' || w.type === 'odihna') return w;

    if (w.sport === 'inot' && !lim.swimContinuous400 && (w.type === 'lung' || w.type === 'calitate' || SWIM_BEYOND.test(w.structure ?? ''))) {
      w.type = 'tehnica';
      w.key = false;
      w.targetZones = [1, 2];
      w.intervals = undefined;
      w.structure = 'tehnică și bucăți scurte cu pauză (încă nu înoți 400 m fără oprire)';
      notes.push(`${w.id}: înot adus la tehnică (capacitatea de 400 m continuu nu e confirmată)`);
    }

    const tooHard = w.targetZones.some((z) => z > maxZone) || (w.intervals != null && w.intervals.zone > maxZone);
    const textHard = maxZone === 2 && INTENSE_TEXT.test(w.structure ?? '');
    if (tooHard || textHard) {
      if (maxZone === 2) {
        if (w.type === 'calitate') w.type = 'z2';
        if (w.type === 'z2') w.key = false;
        w.targetZones = w.targetZones.filter((z) => z <= 2);
        if (!w.targetZones.length) w.targetZones = [2];
        w.intervals = undefined;
        if (textHard || tooHard) w.structure = w.type === 'brick' ? w.structure?.replace(INTENSE_TEXT, 'Z2') : 'ușor în Z2, fără intervale (intensitatea e blocată până la avizul cardiologic)';
      } else {
        w.targetZones = w.targetZones.filter((z) => z <= maxZone);
        if (!w.targetZones.length) w.targetZones = [maxZone];
        if (w.intervals && w.intervals.zone > maxZone) w.intervals = { ...w.intervals, zone: maxZone };
      }
      notes.push(`${w.id}: intensitatea coborâtă la limita permisă (${lim.intensityAllowed})`);
    }
    return w;
  });
  return { workouts: out, notes };
}

/** Încălcările rămase (pentru teste și pentru jurnal): goală = planul respectă limitele. */
export function limitViolations(workouts: PlannedWorkout[], lim: PlanLimits): string[] {
  const maxZone = lim.intensityAllowed === 'Z2' ? 2 : lim.intensityAllowed === 'pana_la_Z4' ? 4 : 5;
  const out: string[] = [];
  for (const w of workouts) {
    if (w.sport === 'forta' || w.type === 'odihna') continue;
    if (w.targetZones.some((z) => z > maxZone)) out.push(`${w.id}: zona ${Math.max(...w.targetZones)} peste limita ${maxZone}`);
    if (w.intervals && w.intervals.zone > maxZone) out.push(`${w.id}: intervale în Z${w.intervals.zone}`);
    if (maxZone === 2 && INTENSE_TEXT.test(w.structure ?? '')) out.push(`${w.id}: structură intensă „${w.structure}”`);
    if (w.sport === 'inot' && !lim.swimContinuous400 && (w.type === 'lung' || w.type === 'calitate' || SWIM_BEYOND.test(w.structure ?? ''))) out.push(`${w.id}: înot peste capacitatea declarată („${w.structure ?? w.type}”)`);
  }
  return out;
}
