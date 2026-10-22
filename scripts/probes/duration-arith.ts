// Proba T04/T05 (auditul consolidat): pentru toate profilurile sintetice (obiective × vârste × niveluri × intensitate),
// toate ședințele generate pe tot planul: suma pașilor afișați vs durata din calendar; apoi scurtarea 40 → 30 min.
// Rulare: npx tsx scripts/probes/duration-arith.ts
import { generatePlan } from '../../src/calendar/generate.js';
import { ALL_GOALS, isFitnessGoal } from '../../src/calendar/phases.js';
import { detailSteps } from '../../src/calendar/session-detail.js';
import { durationMismatch, stepsTotal } from '../../src/calendar/duration-check.js';
import { shortenWorkout } from '../../src/calendar/validate.js';
import { AGES, INTENS, LEVELS, SEXES, input } from '../audit-profiles.js';

let checked = 0;
let skipped = 0;
const bad: string[] = [];
const shortBad: string[] = [];
let shortChecked = 0;
for (const goal of ALL_GOALS) {
  if (isFitnessGoal(goal)) continue;
  for (const age of AGES) for (const level of LEVELS) for (const sex of SEXES) for (const intens of INTENS) {
    const r = generatePlan(input({ goal, sex, age, level, intens }));
    if (!r.ok) continue;
    for (const w of r.weeks.flatMap((x) => x.workouts)) {
      const steps = detailSteps(w, { age });
      const d = durationMismatch(w, steps);
      if (d == null) { skipped++; continue; }
      checked++;
      if (d !== 0) bad.push(`${goal}/${age}/${level}/${sex}/${intens} ${w.date} ${w.sport}/${w.type} ${w.plannedMinutes} min, pași ${stepsTotal(steps)} | ${w.structure ?? ''}`);
      // T04: cererea „am doar 30 min” pe o ședință de 40+ (aceeași funcție ca butonul din aplicație).
      if (w.plannedMinutes >= 40 && w.sport !== 'inot' && w.type !== 'forta' && w.type !== 'odihna') {
        const s = shortenWorkout(w, 30);
        if (s) {
          shortChecked++;
          const d2 = durationMismatch(s, detailSteps(s, { age }));
          if (d2 != null && d2 !== 0) shortBad.push(`${w.sport}/${w.type} ${w.plannedMinutes}→${s.plannedMinutes} min, pași ${stepsTotal(detailSteps(s, { age }))} | ${s.structure ?? ''}`);
        }
      }
    }
  }
}
console.log(`ședințe verificate: ${checked} (în afara verificării exacte: ${skipped} — înot estimat, forță, odihnă)`);
console.log(`nepotriviri pași ≠ calendar: ${bad.length}`);
for (const b of [...new Set(bad.map((x) => x.replace(/^\S+ \S+ /, '')))].slice(0, 25)) console.log('  ' + b);
console.log(`scurtări la 30 min verificate: ${shortChecked}; nepotriviri: ${shortBad.length}`);
for (const b of [...new Set(shortBad)].slice(0, 25)) console.log('  ' + b);
process.exitCode = bad.length || shortBad.length ? 1 : 0;

// Înotul: durata e estimată din metri și ritm; raportăm cât se depărtează estimarea de minutele din calendar.
import { swimSet } from '../../src/calendar/session-steps.js';
const gaps: number[] = [];
const gapEx: string[] = [];
for (const goal of ['70.3', 'olimpic', 'sprint', 'inot-1500', 'inot-1900'] as const) for (const level of LEVELS) for (const age of [35, 60]) {
  const inp = input({ goal, sex: 'm', age, level, intens: 'toate' });
  const r = generatePlan(inp);
  if (!r.ok) continue;
  for (const w of r.weeks.flatMap((x) => x.workouts).filter((x) => x.sport === 'inot' && !/^TEST/.test(x.structure ?? ''))) {
    const s = swimSet({ type: w.type, minutes: w.plannedMinutes, css: null, date: w.date, structure: w.structure, continuousM: inp.swim?.continuousM ?? null });
    const g = (s.estMin - w.plannedMinutes) / w.plannedMinutes;
    gaps.push(g);
    if (Math.abs(g) > 0.25 && gapEx.length < 6) gapEx.push(`${goal}/${level}/${age} ${w.type} calendar ${w.plannedMinutes} min, estimat ${s.estMin} min (${s.meters} m)`);
  }
}
const far = gaps.filter((g) => Math.abs(g) > 0.25).length;
console.log(`înot (fără CSS): ${gaps.length} ședințe; estimarea diferă cu peste 25% de calendar la ${far} (${Math.round((far / Math.max(1, gaps.length)) * 100)}%)`);
for (const e of gapEx) console.log('  ' + e);
