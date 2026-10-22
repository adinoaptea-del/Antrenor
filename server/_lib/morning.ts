// Rularea de dimineață pentru un sportiv (din cronul de 05:30 și din recuperarea la cronul de 15 minute, auditul
// consolidat E1: un sportiv neprocesat la 05:30 nu mai rămâne fără mesaj și fără ajustările zilei).
import type { Goal } from '../../src/calendar/phases.js';
import { syncUser } from './sync.js';
import { rescore } from './score.js';
import { runAgents } from './agents.js';
import { labsReminder } from './reminders.js';
import { bigEffortMorning, missedStrength, moduleProgression } from './react.js';
import { MIGRATIONS, runOnce } from './migrations.js';
import { ensureSplit } from './split.js';
import { loadPlan } from './collect.js';
import { addDays } from '../../src/util/dates.js';
import { weatherSwapFor } from './weather-swap.js';

export async function morningFor(u: { id: string; goal: Goal | 'full' | null }, today: string): Promise<unknown> {
  await syncUser(u.id, 3);
  await rescore(u.id, today, u.goal && u.goal !== 'full' ? u.goal : '70.3');
  await labsReminder(u.id, today).catch(() => false);
  // Auditul v93, A23: o singură dată pe plan (aceeași migrare ca la deschiderea aplicației).
  await (async () => {
    const p = await loadPlan(u.id, addDays(today, -28), addDays(today, 400));
    await runOnce(u.id, p.planId, today, MIGRATIONS.strengthSplit, p.workouts, async (plan) => {
      const after = await ensureSplit(u.id, today, { planId: p.planId, workouts: plan });
      return after.filter((w, i) => w !== plan[i]);
    });
  })().catch(() => undefined);
  // Fitness: sala ratată ieri → rotația continuă (fără dublare), înaintea mesajului de dimineață.
  if (u.goal && u.goal.startsWith('fit-')) await missedStrength(u.id, today).catch(() => []);
  // Treptele modulelor din execuții, nu din calendar (V2-05); și „rămâne” își scrie dovezile în jurnal.
  else await moduleProgression(u.id, today).catch(() => []);
  // A08: după un efort mare ieri, sugestie ușoară pe ședința de picioare de azi (planul rămâne).
  await bigEffortMorning(u.id, today).catch(() => []);
  // Vremea: azi ↔ mâine, înaintea mesajului de dimineață (ca mesajul să vorbească de planul inversat).
  await weatherSwapFor(u.id, today, 'azi').catch(() => null);
  const r = await runAgents(u.id, today, 'dimineata');
  return r ? { decizie: r.decision, rutati: r.routed, respinse: r.rejected, schimbari: r.changes.length } : 'deja rulat';
}
