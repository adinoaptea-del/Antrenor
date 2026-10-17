import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { select } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { rescore } from '../_lib/score.js';

/** La 15 minute: toți sportivii cu brățări conectate și consimțământ. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; goal: '70.3' | 'olimpic' | 'sprint' | 'semimaraton' | 'maraton' | 'full' | null; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,goal,consents(health_data,withdrawn_at)' });
    const done: Record<string, unknown> = {};
    for (const u of users) {
      if (!consentActive(u.consents)) continue;
      // Un sportiv cu eroare nu oprește ceilalți; eroarea rămâne vizibilă în răspuns.
      try {
        const reports = await syncUser(u.id, 3);
        if (reports.length) await rescore(u.id, todayIn(u.tz), u.goal && u.goal !== 'full' ? u.goal : '70.3');
        done[u.id] = reports.map((r) => `${r.provider}:${r.ok ? r.rows : 'eroare'}`);
      } catch (e) {
        done[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, done });
  } catch (e) {
    fail(res, e);
  }
}
