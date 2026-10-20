import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { one, select } from '../_lib/db.js';
import { runAgents } from '../_lib/agents.js';
import { reevaluateFitnessDays } from '../_lib/plan.js';
import { weekday } from '../../src/util/dates.js';
import { weatherSwapFor } from '../_lib/weather-swap.js';
import { reassessGoal } from '../_lib/feasibility.js';

/** Seara (21:00): „după antrenament” pentru cine a avut o ședință azi; duminica, review-ul săptămânal. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,consents(health_data,withdrawn_at)' });
    const out: Record<string, unknown> = {};
    for (const u of users) {
      if (!consentActive(u.consents)) continue;
      const today = todayIn(u.tz);
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
      } catch (e) {
        out[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, out });
  } catch (e) {
    fail(res, e);
  }
}
