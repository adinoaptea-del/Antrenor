import type { Goal } from '../../src/calendar/phases.js';
import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { select } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { rescore } from '../_lib/score.js';
import { runAgents } from '../_lib/agents.js';
import { labsReminder } from '../_lib/reminders.js';
import { missedStrength, moduleProgression } from '../_lib/react.js';

/** Dimineața (05:30 ora României): sincronizare, scor, apoi piramida pentru fiecare sportiv cu plan și consimțământ. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; goal: Goal | 'full' | null; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,goal,consents(health_data,withdrawn_at)' });
    const out: Record<string, unknown> = {};
    for (const u of users) {
      if (!consentActive(u.consents)) continue;
      const today = todayIn(u.tz);
      try {
        await syncUser(u.id, 3);
        await rescore(u.id, today, u.goal && u.goal !== 'full' ? u.goal : '70.3');
        await labsReminder(u.id, today).catch(() => false);
        // Fitness: sala ratată ieri → rotația continuă (fără dublare), înaintea mesajului de dimineață.
        if (u.goal && u.goal.startsWith('fit-')) await missedStrength(u.id, today).catch(() => []);
        // Treptele modulelor din execuții, nu din calendar (V2-05); și „rămâne” își scrie dovezile în jurnal.
        else await moduleProgression(u.id, today).catch(() => []);
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
