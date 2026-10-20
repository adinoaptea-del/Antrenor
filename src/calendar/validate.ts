import { moduleStructure, parseModule } from './run-modules.js';
import { normalizeWorkout } from './coherence.js';
import { parseStrength, MIN_STRENGTH_MINUTES, prescribe, strengthStructure, type StrengthSpec } from '../strength/ppl.js';
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
        if (textHard || tooHard) w.structure = w.type === 'brick' ? w.structure?.replace(INTENSE_TEXT, 'Z2') : 'ușor în Z2, fără intervale (intensitatea e limitată: restricție de la medic sau din analize)';
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

/**
 * Durata și conținutul din aceleași cifre: o ședință scurtată nu păstrează repetări care nu mai încap.
 * „3 × 10 min …, 3 min ușor între” cere 36 min + minimum 10 min încălzire/revenire; la 30 min rămân 1 × 10 sau 2 × 10
 * (după pauză), iar dacă nu încape nicio repetare, devine ședință ușoară.
 */
export function fitStructure(w: PlannedWorkout): PlannedWorkout {
  // Modulele de alergare (V5, T1, H …): se rescriu întregi pentru minutele finale, cu încălzirea și revenirea incluse.
  const mod = parseModule(w.structure);
  if (mod) {
    const b = moduleStructure(mod.id, w.plannedMinutes, mod.paceSecKm);
    const tail = (w.structure ?? '').includes('deschidere, nu antrenament') ? ' · deschidere, nu antrenament' : '';
    return { ...w, structure: b.text + tail, intervals: w.intervals ? { ...w.intervals, count: b.count } : undefined };
  }
  const m = /(\d+)\s*×\s*(\d+)\s*min/.exec(w.structure ?? '');
  if (!m || w.type === 'brick') return w;
  const count = Number(m[1]);
  const reps = Number(m[2]);
  const restM = /(\d+)\s*min ușor între/.exec(w.structure ?? '');
  const rest = restM ? Number(restM[1]) : 0;
  const need = (n: number) => n * reps + (n - 1) * rest + 10;
  if (need(count) <= w.plannedMinutes) return w;
  let n = count;
  while (n > 0 && need(n) > w.plannedMinutes) n -= 1;
  if (n === 0) {
    return { ...w, type: w.type === 'calitate' ? 'z2' : w.type, key: w.type === 'calitate' ? false : w.key, intervals: undefined, targetZones: w.targetZones.filter((z) => z <= 2).length ? w.targetZones.filter((z) => z <= 2) : [2], structure: `${w.plannedMinutes} min ușor (prea scurt pentru repetări)` };
  }
  return { ...w, structure: w.structure!.replace(m[0], `${n} × ${reps} min`), intervals: w.intervals ? { ...w.intervals, count: n } : undefined };
}

/** Ședință grea: intensitate (inclusiv teste) sau brick. Ieșirile lungi ușoare nu sunt „grele” aici. */
export function isHard(w: PlannedWorkout): boolean {
  return w.status !== 'anulat_sistem' && w.status !== 'sters' && (w.type === 'calitate' || w.type === 'brick');
}

const EASY_NOTE = 'ușor: lângă altă ședință grea (zi tare, zi ușoară)';
function soften(w: PlannedWorkout, why: string): PlannedWorkout {
  return { ...w, type: w.sport === 'inot' ? 'tehnica' : 'z2', key: false, targetZones: w.sport === 'inot' ? [1, 2] : [2], intervals: undefined, structure: w.sport === 'inot' ? 'tehnică și bucăți ușoare' : undefined, note: why };
}
/** Ce se înmoaie primul când sunt prea multe ședințe grele: înotul, apoi bicicleta, apoi restul (cheile la urmă). */
const SOFTEN_ORDER = (w: PlannedWorkout) => (w.key ? 10 : 0) + (w.sport === 'inot' ? 0 : w.sport === 'bicicleta' ? 1 : 2) + ((w.structure ?? '').startsWith('TEST') ? 5 : 0);

/**
 * Principiul Sang adaptat la triatlon (regulă de produs v1): cel mult 3 ședințe grele pe săptămână, adunate pe toate
 * sporturile, și niciodată două zile grele la rând. Ce depășește devine ușor (nu se mută și nu se adaugă altundeva).
 */
export function enforceSpacing(workouts: PlannedWorkout[], maxHardPerWeek = 3): { workouts: PlannedWorkout[]; notes: string[] } {
  const notes: string[] = [];
  let out = workouts.map((w) => ({ ...w }));
  // 1. Plafonul pe săptămână (luni–duminică).
  const weeks = new Map<string, PlannedWorkout[]>();
  for (const w of out) {
    const d = new Date(`${w.date}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    if (!weeks.has(monday)) weeks.set(monday, []);
    weeks.get(monday)!.push(w);
  }
  const softened = new Map<string, PlannedWorkout>();
  for (const ws of weeks.values()) {
    const hard = ws.filter(isHard);
    const softenable = hard.filter((w) => !(w.key && w.type === 'brick')).sort((a, b) => SOFTEN_ORDER(a) - SOFTEN_ORDER(b));
    for (const w of softenable.slice(0, Math.max(0, hard.length - maxHardPerWeek))) {
      softened.set(w.id, soften(w, `ușor: deja ${maxHardPerWeek} ședințe grele săptămâna asta`));
      notes.push(`${w.id}: ${w.sport} ${w.type} devine ușor (peste ${maxHardPerWeek} ședințe grele pe săptămână)`);
    }
  }
  out = out.map((w) => softened.get(w.id) ?? w);
  // 2. Zi tare, zi ușoară: două zile grele la rând → cea mai puțin importantă devine ușoară.
  const days = [...new Set(out.filter(isHard).map((w) => w.date))].sort();
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const cur = days[i]!;
    if ((new Date(`${cur}T00:00:00Z`).getTime() - new Date(`${prev}T00:00:00Z`).getTime()) / 86_400_000 !== 1) continue;
    const both = out.filter((w) => isHard(w) && (w.date === prev || w.date === cur)).sort((a, b) => SOFTEN_ORDER(a) - SOFTEN_ORDER(b));
    const victim = both.find((w) => !(w.key && w.type === 'brick') && !(w.structure ?? '').startsWith('TEST'));
    if (!victim || both.filter((w) => w.date === victim.date).length === 0) continue;
    // Întâi încercăm să o mutăm: schimbă ziua cu o ședință ușoară din aceeași săptămână, de cel puțin aceeași durată,
    // într-o zi fără ședință grea în jur. Cea ușoară ia locul ei (și durata ei, ca să încapă în fereastra de timp).
    const swap = swapTarget(out, victim);
    if (swap) {
      const vDate = victim.date;
      // Fiecare ia durata care încape sigur în fereastra zilei noi (durata celeilalte ședințe de acolo).
      const vMin = Math.min(victim.plannedMinutes, swap.plannedMinutes);
      const sMin = Math.min(swap.plannedMinutes, victim.plannedMinutes);
      out = out.map((w) => (w.id === victim.id ? fitStructure({ ...w, date: swap.date, plannedMinutes: vMin }) : w.id === swap.id ? { ...w, date: vDate, plannedMinutes: sMin } : w));
      notes.push(`${victim.id}: ${victim.sport} mutat pe ${swap.date} (zi tare, zi ușoară)`);
      i = 0;
      days.splice(0, days.length, ...[...new Set(out.filter(isHard).map((w) => w.date))].sort());
      continue;
    }
    out = out.map((w) => (w.id === victim.id ? soften(w, EASY_NOTE) : w));
    notes.push(`${victim.id}: ${victim.sport} ${victim.date} devine ușor (zi grea și ziua de dinainte/după)`);
    if (!out.some((w) => isHard(w) && w.date === cur)) days.splice(i, 1), (i -= 1);
  }
  return { workouts: out, notes };
}

function swapTarget(all: PlannedWorkout[], victim: PlannedWorkout): PlannedWorkout | null {
  const dayMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime() / 86_400_000;
  const monday = (d: string) => Math.floor((dayMs(d) + 3) / 7); // săptămâna ISO (luni)
  const hardDays = new Set(all.filter((w) => isHard(w) && w.id !== victim.id).map((w) => dayMs(w.date)));
  const okDay = (d: string) => !hardDays.has(dayMs(d)) && !hardDays.has(dayMs(d) - 1) && !hardDays.has(dayMs(d) + 1);
  const candidates = all
    .filter((w) => w.id !== victim.id && !isHard(w) && w.type !== 'lung' && w.sport !== 'forta' && w.status === 'planificat' && monday(w.date) === monday(victim.date) && w.plannedMinutes >= Math.min(45, victim.plannedMinutes) && okDay(w.date))
    .sort((a, b) => Number(b.sport === victim.sport) - Number(a.sport === victim.sport) || b.plannedMinutes - a.plannedMinutes);
  return candidates[0] ?? null;
}

/**
 * „Am doar X minute”: păstrează stimulul ședinței în timpul rămas. Repetările care nu mai încap se scot (prima
 * repetare rămâne), brick-ul își scurtează ambele părți proporțional, ieșirea lungă rămâne ușoară. Nu se mută nimic
 * în alte zile.
 */
/**
 * O singură durată pentru o ședință (auditul F55, F02): la forță, durata din calendar devine durata prescripției care
 * încape în minutele cerute (exercițiile efective), ca Home, calendarul, detaliul și totalul săptămânii să spună același
 * număr; la celelalte, structura se rescrie din aceleași minute.
 */
export function resizeWorkout(w: PlannedWorkout, minutes: number): PlannedWorkout {
  if (w.type === 'forta') {
    const spec = parseStrength(w.structure);
    // Timpul declarat sub 45 de minute e o excepție de la regula 20 (decizia proprietarului, 20.10.2026, A49): varianta
    // scurtă (minimum 2 serii), cu motivul în textul ședinței; durata = a prescripției. De la 45 în sus, regula rămâne.
    if (spec && minutes < MIN_STRENGTH_MINUTES) {
      const short: StrengthSpec = { ...spec, reduced: { why: spec.reduced?.why ?? 'timp', minutes: Math.min(minutes, spec.reduced?.minutes ?? minutes) } };
      return { ...w, structure: strengthStructure(short), plannedMinutes: prescribe(short, minutes).minutes };
    }
    // Forța nu scade sub 45 de minute (regula proprietarului): durata e a prescripției, nu a minutelor cerute.
    return { ...w, plannedMinutes: spec ? prescribe(spec, minutes).minutes : Math.max(MIN_STRENGTH_MINUTES, minutes) };
  }
  return normalizeWorkout(fitStructure({ ...w, plannedMinutes: minutes }));
}

export function shortenWorkout(w: PlannedWorkout, minutes: number): PlannedWorkout {
  const before = w.plannedMinutes;
  let out: PlannedWorkout = { ...w, plannedMinutes: minutes };
  if (w.type === 'brick') {
    const m = /tură (\d+) min(.*)alergare (\d+) min/.exec(w.structure ?? '');
    if (minutes < 30) {
      out = { ...out, type: 'z2', key: false, structure: `${minutes} min bicicletă ușor (prea puțin timp pentru brick)` };
    } else if (m) {
      // Aceeași împărțire ca peste tot: alergarea nu crește, bicicleta ia restul.
      out = normalizeWorkout(out);
    }
  } else {
    out = resizeWorkout(out, minutes);
  }
  out.note = `scurtat la cererea ta: ${minutes} min în loc de ${before}; ce nu se face azi nu se recuperează`;
  return out;
}
