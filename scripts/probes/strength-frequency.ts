// Revizuirea regulilor rigide de forță (auditul consolidat, etapa 3): pentru fitness, la 2, 3 și 4 zile pe săptămână,
// ce ședințe primește o femeie și un bărbat cu ACELAȘI profil (singura intrare schimbată: sexul) și de câte ori pe
// săptămână e lucrat fiecare tipar (picioare / partea de sus). Date sintetice. Rulare: npx tsx scripts/probes/strength-frequency.ts
import { generatePlan } from '../../src/calendar/generate.js';
import { input } from '../audit-profiles.js';
import { fitnessProfile } from '../../src/strength/fitness.js';
import { legLoadOf, parseStrength } from '../../src/strength/ppl.js';

for (const zile of [2, 3, 4] as const) {
  for (const sex of ['f', 'm'] as const) {
    const base = input({ goal: 'fit-tonifiere', sex, age: 35, level: 'intermediar', intens: 'toate' });
    const r = generatePlan({ ...base, fitness: fitnessProfile('fit-tonifiere', { experienta: 'stabila', zile, minute: 60, acces: 'sala', miscare: 'plimbari' }) });
    if (!r.ok) {
      console.log(zile, sex, 'refuzat', r.reason);
      continue;
    }
    const w = r.weeks.find((x) => x.workouts.length === zile) ?? r.weeks[r.weeks.length - 1]!;
    const names = w.workouts.map((x) => (x.structure ?? '').split(' · ')[0]);
    const legs = w.workouts.filter((x) => legLoadOf(x.structure) != null).length;
    const sessions = w.workouts.map((x) => parseStrength(x.structure)?.session ?? '?');
    console.log(`${zile} zile, ${sex === 'f' ? 'femeie' : 'bărbat'} (săpt. ${w.weekStart}): ${names.join(' | ')}  → picioare ${legs}×/săpt.; sesiuni: ${sessions.join(',')}; minute: ${w.workouts.map((x) => x.plannedMinutes).join(',')}`);
  }
}
