import type { Goal } from '../../src/calendar/phases.js';
import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { select } from '../_lib/db.js';
import { morningFor } from '../_lib/morning.js';
import { jobFinished, jobStarted, loadJobs } from '../_lib/jobs.js';
import { fanOut, stalestFirst } from '../../src/util/fanout.js';

/**
 * Dimineața (05:30 ora României): sincronizare, scor, apoi piramida pentru fiecare sportiv cu plan și consimțământ.
 * Auditul consolidat, E1: cel mult 3 sportivi deodată, sportivi noi porniți doar în primele 150 s (funcția are 300 s);
 * starea fiecăruia în athlete_jobs. Cine nu apucă e recuperat de cronul de 15 minute (server/cron/sync.ts).
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; goal: Goal | 'full' | null; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,goal,consents(health_data,withdrawn_at)' });
    const jobs = await loadJobs('dimineata');
    const out: Record<string, unknown> = {};
    const eligible = stalestFirst(users.filter((u) => consentActive(u.consents)), (u) => jobs.get(u.id));
    const r = await fanOut(eligible, { limit: 3, budgetMs: 150_000 }, async (u) => {
      await jobStarted(u.id, 'dimineata');
      try {
        out[u.id] = await morningFor(u, todayIn(u.tz));
        await jobFinished(u.id, 'dimineata', jobs.get(u.id), null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out[u.id] = { eroare: msg };
        await jobFinished(u.id, 'dimineata', jobs.get(u.id), msg);
      }
    });
    json(res, 200, { ok: true, out, neprocesati: r.notStarted.map((u) => u.id) });
  } catch (e) {
    fail(res, e);
  }
}
