// Validatorul de acoperire (auditul consolidat): pe toate profilurile sintetice și toate săptămânile, minimul pe sport
// cerut de șablon (triatlon 2 înot / 2 bicicletă / 2 alergare / 1 forță; alergare 3 + 1 forță; …) trebuie să fie
// plasat SAU absența lui să fie spusă explicit în notele săptămânii. „Tăcut” = lipsește fără notă.
// Rulare: npx tsx scripts/probes/coverage.ts
import { generatePlan } from '../../src/calendar/generate.js';
import { ALL_GOALS, isFitnessGoal, isRunGoal, isSwimGoal, isBikeGoal } from '../../src/calendar/phases.js';
import { AGES, LEVELS, SEXES, input } from '../audit-profiles.js';
import { weekStart } from '../../src/util/dates.js';
import type { Sport } from '../../src/types.js';

const WORD: Record<string, RegExp> = { inot: /înot|inot/, bicicleta: /bicicl/, alergare: /alergare/, forta: /forț|forta/ };
let weeks = 0;
let short = 0;
let silent = 0;
const ex: string[] = [];
for (const goal of ALL_GOALS) {
  if (isFitnessGoal(goal) || goal.startsWith('mers')) continue;
  const min: Partial<Record<Sport, number>> = isRunGoal(goal) ? { alergare: 3, forta: 1 } : isSwimGoal(goal) ? { inot: 2, forta: 1 } : isBikeGoal(goal) ? { bicicleta: 2, forta: 1 } : { inot: 2, bicicleta: 2, alergare: 2, forta: 1 };
  for (const age of AGES) for (const level of LEVELS) for (const sex of SEXES) for (const hours of [undefined, 4]) {
    const inp = input({ goal, sex, age, level, intens: 'toate', hours });
    const r = generatePlan(inp);
    if (!r.ok) continue;
    for (const w of r.weeks) {
      if (w.weekStart === weekStart(inp.raceDate) || w.phase === 'taper') continue; // săptămâna cursei și taper-ul au reguli proprii
      weeks++;
      for (const [sp, n] of Object.entries(min) as [Sport, number][]) {
        const got = w.workouts.filter((x) => x.sport === sp && x.status !== 'anulat_sistem').length + (sp === 'alergare' ? w.workouts.filter((x) => x.type === 'brick').length : 0);
        if (got >= n) continue;
        short++;
        const said = w.notes.some((t) => WORD[sp]!.test(t) && /nu încape|căzut|fără|nu există|scurt|minimul/.test(t));
        if (!said) {
          silent++;
          if (ex.length < 12) ex.push(`${goal}/${age}/${level}/${sex}/${hours ?? 'implicit'} h ${w.weekStart} (${w.phase}${w.recovery ? ', descărcare' : ''}): ${sp} ${got}/${n}; note: ${w.notes.join(' / ').slice(0, 160) || '—'}`);
        }
      }
    }
  }
}
console.log(`săptămâni verificate: ${weeks}; sub minimul pe sport: ${short}; dintre ele fără explicație: ${silent}`);
for (const e of ex) console.log('  ' + e);
process.exitCode = silent ? 1 : 0;
