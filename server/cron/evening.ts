import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { one, select } from '../_lib/db.js';
import { runAgents } from '../_lib/agents.js';
import { reevaluateFitnessDays } from '../_lib/plan.js';
import { weekday } from '../../src/util/dates.js';
import { weatherSwapFor } from '../_lib/weather-swap.js';
import { reassessGoal } from '../_lib/feasibility.js';
import { jobFinished, jobStarted, loadJobs } from '../_lib/jobs.js';
import { fanOut, stalestFirst } from '../../src/util/fanout.js';

/** Seara (21:00): „după antrenament” pentru cine a avut o ședință azi; duminica, review-ul săptămânal. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,consents(health_data,withdrawn_at)' });
    const jobs = await loadJobs('seara');
    const out: Record<string, unknown> = {};
    const eligible = stalestFirst(users.filter((u) => consentActive(u.consents)), (u) => jobs.get(u.id));
    // Auditul consolidat, E1: cel mult 3 sportivi deodată, sportivi noi porniți doar în primele 150 s; starea în athlete_jobs.
    const r = await fanOut(eligible, { limit: 3, budgetMs: 150_000 }, async (u) => {
      const today = todayIn(u.tz);
      await jobStarted(u.id, 'seara');
      try {
        const activity = await one('activities', { user_id: `eq.${u.id}`, date: `eq.${today}` });
        const evening = activity ? await runAgents(u.id, today, 'dupa_antrenament') : null;
        // Duminica: fezabilitatea obiectivului, explicit, în jurnal, ÎNAINTEA bilanțului AI (ca să o poată cita).
        if (weekday(today) === 6) await reassessGoal(u.id, today, 'bilant').catch(() => null);
        const weekly = weekday(today) === 6 ? await runAgents(u.id, today, 'saptamanal') : null;
        // Fitness: zilele de sală urcă doar după prezență reală (3 săptămâni bune la rând); reevaluat duminica.
        const freq = weekday(today) === 6 ? await reevaluateFitnessDays(u.id, today).catch(() => null) : null;
        // Vremea: mâine frumos și poimâine ploaie (sau invers) → afară în ziua bună, bazin/sală în ziua cu ploaie.
        const vreme = await weatherSwapFor(u.id, today, 'maine').catch(() => null);
        out[u.id] = { vreme, frecventa: freq, seara: evening ? evening.decision : activity ? 'deja rulat' : 'fără ședință', saptamanal: weekly ? weekly.decision : weekday(today) === 6 ? 'deja rulat' : '-' };
        await jobFinished(u.id, 'seara', jobs.get(u.id), null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out[u.id] = { eroare: msg };
        await jobFinished(u.id, 'seara', jobs.get(u.id), msg);
      }
    });
    json(res, 200, { ok: true, out, neprocesati: r.notStarted.map((u) => u.id) });
  } catch (e) {
    fail(res, e);
  }
}
