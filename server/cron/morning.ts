import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { select } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { rescore } from '../_lib/score.js';
import { runAgents } from '../_lib/agents.js';
import { labsReminder } from '../_lib/reminders.js';

/** Dimineața (05:30 ora României): sincronizare, scor, apoi piramida pentru fiecare sportiv cu plan și consimțământ. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; goal: '70.3' | 'olimpic' | 'sprint' | 'semimaraton' | 'maraton' | 'full' | null; consents: { health_data: boolean } | null }>('users', {}, { select: 'id,tz,goal,consents(health_data)' });
    const out: Record<string, unknown> = {};
    for (const u of users) {
      if (!u.consents?.health_data) continue;
      const today = todayIn(u.tz);
      try {
        await syncUser(u.id, 3);
        await rescore(u.id, today, u.goal && u.goal !== 'full' ? u.goal : '70.3');
        await labsReminder(u.id, today).catch(() => false);
        const r = await runAgents(u.id, today, 'dimineata');
        out[u.id] = r ? { decizie: r.decision, rutati: r.routed, respinse: r.rejected, schimbari: r.changes.length } : 'deja rulat';
      } catch (e) {
        out[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, out });
  } catch (e) {
    fail(res, e);
  }
}
