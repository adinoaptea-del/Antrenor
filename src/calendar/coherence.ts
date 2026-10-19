// O ședință, o singură sursă: titlul (durata din calendar), rezumatul (structura) și pașii detaliați se calculează din
// aceleași cifre. Orice schimbare de durată (potrivirea la ore, descărcare, mutare, „am mai puțin timp”) trece prin
// `normalizeWorkout`, care rescrie structura pentru minutele finale. `coherenceIssues` verifică rezultatul și e folosit
// de teste și de simulare: un plan cu probleme nu trebuie activat.
//
// Reguli (decizii de produs AIRON, nu standarde fiziologice):
//  - brick: bicicleta și alergarea se scurtează proporțional; alergarea nu crește niciodată ca să umple timpul;
//  - testele de teren: partea testată rămâne întreagă (30 min alergare, 20 min bicicletă); se scurtează încălzirea,
//    iar sub minimul testului ședința devine varianta scurtă (alergare 20 min), etichetată;
//  - ținta de puls a unui segment nu poate depăși plafonul ședinței.

import type { PlannedWorkout } from '../types.js';
import type { Step } from './session-steps.js';

const round5 = (m: number) => Math.round(m / 5) * 5;

/** Împărțirea brick-ului pentru minutele date. Alergarea: cel mult cea din plan; bicicleta ia restul. */
export function brickSplit(structure: string | null | undefined, minutes: number): { bike: number; run: number } {
  const m = /tură (\d+) min.*alergare (\d+) min/.exec(structure ?? '');
  const B = m ? Number(m[1]) : Math.round(minutes * 0.8);
  const R = m ? Number(m[2]) : Math.max(10, minutes - B);
  if (B + R === minutes) return { bike: B, run: R };
  const run = Math.max(10, Math.min(R, round5((minutes * R) / (B + R))));
  return { bike: minutes - run, run };
}

export const RUN_TEST = (warm: number, main: number, cool: number) =>
  `TEST: ${warm} min ușor, ${main} min cât de tare poți constant (${main >= 30 ? 'pulsul mediu din ultimele 20 min ≈ pragul' : 'pulsul mediu × 0,95 ≈ pragul, estimare mai grosieră'}), ${cool} min ușor`;
export const BIKE_TEST = (warm: number, cool: number) => `TEST: ${warm} min încălzire, 20 min cât de tare poți constant (FTP ≈ 95% din puterea medie, ESTIMARE; fără putere: pulsul mediu), ${cool} min ușor`;

/** Minutele scrise în structura unui test: „15 min …, 30 min …, 5 min …”. */
export function testParts(structure: string | null | undefined): number[] {
  return [...(structure ?? '').matchAll(/(\d+) min (?:ușor|încălzire|cât de tare)/g)].map((m) => Number(m[1]));
}

/** Rescrie structura pentru durata finală (brick, teste). Celelalte ședințe le potrivește `fitStructure`. */
export function normalizeWorkout(w: PlannedWorkout): PlannedWorkout {
  const m = w.plannedMinutes;
  if (w.type === 'brick' && /tură \d+ min/.test(w.structure ?? '')) {
    const { bike, run } = brickSplit(w.structure, m);
    return { ...w, structure: (w.structure ?? '').replace(/tură \d+ min(.*?)alergare \d+ min/, `tură ${bike} min$1alergare ${run} min`) };
  }
  if (/^TEST:/.test(w.structure ?? '') && w.sport === 'alergare') {
    const parts = testParts(w.structure);
    if (parts.reduce((a, b) => a + b, 0) === m) return w;
    const main = m >= 45 ? 30 : 20;
    const cool = 5;
    return { ...w, structure: RUN_TEST(m - main - cool, main, cool) };
  }
  if (/^TEST:/.test(w.structure ?? '') && w.sport === 'bicicleta') {
    const parts = testParts(w.structure);
    if (parts.reduce((a, b) => a + b, 0) === m) return w;
    const cool = m >= 50 ? 10 : 5;
    return { ...w, structure: BIKE_TEST(Math.max(10, m - 20 - cool), cool) };
  }
  return w;
}

/** Problemele de coerență ale unei ședințe, cu pașii ei detaliați. Gol = coerentă. */
export function coherenceIssues(w: PlannedWorkout, steps: Step[], swimCap?: number | null): string[] {
  const out: string[] = [];
  const m = w.plannedMinutes;
  if (w.type === 'brick') {
    const p = /tură (\d+) min.*alergare (\d+) min/.exec(w.structure ?? '');
    if (p && Number(p[1]) + Number(p[2]) !== m) out.push(`${w.id}: brick ${p[1]} + ${p[2]} ≠ ${m} min`);
    const bike = /(\d+) min/.exec(steps.find((s) => s.label === 'Bicicletă')?.text ?? '');
    const run = /(\d+) min/.exec(steps.find((s) => s.label === 'Alergare')?.text ?? '');
    if (p && bike && Number(bike[1]) !== Number(p[1])) out.push(`${w.id}: brick, bicicleta ${bike[1]} în pași vs ${p[1]} în rezumat`);
    if (p && run && Number(run[1]) !== Number(p[2])) out.push(`${w.id}: brick, alergarea ${run[1]} în pași vs ${p[2]} în rezumat`);
  }
  if (/^TEST:/.test(w.structure ?? '') && w.sport !== 'inot') {
    const sum = testParts(w.structure).reduce((a, b) => a + b, 0);
    if (sum !== m) out.push(`${w.id}: test ${sum} min în structură ≠ ${m} min în calendar`);
  }
  // Ținta unui segment nu trece de plafon.
  const cap = /nu trece de (\d+) bpm/.exec(steps.find((s) => s.label === 'Plafon')?.text ?? '');
  if (cap) {
    const lim = Number(cap[1]);
    for (const s of steps) {
      if (s.label === 'Plafon' || s.label === 'Puls') continue;
      for (const r of s.text.matchAll(/(\d{2,3})–(\d{2,3}) bpm/g)) if (Number(r[2]) > lim) out.push(`${w.id}: ținta ${r[1]}–${r[2]} bpm peste plafonul de ${lim} bpm`);
    }
  }
  if (w.sport === 'inot' && swimCap != null) {
    for (const s of steps) {
      if (s.label === 'Total') continue;
      for (const r of s.text.matchAll(/(\d+)\s*×\s*(\d+)\s*m/g)) if (Number(r[2]) > Math.max(25, swimCap)) out.push(`${w.id}: segment de ${r[2]} m peste capacitatea de ${swimCap} m (${s.label})`);
      const cont = /(\d{3,4}) m continuu/.exec(s.text);
      if (cont && swimCap < 400) out.push(`${w.id}: înot continuu ${cont[1]} m cu capacitate ${swimCap} m`);
    }
  }
  return out;
}
