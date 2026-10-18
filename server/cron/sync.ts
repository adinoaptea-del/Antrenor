import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { select } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { rescore } from '../_lib/score.js';
import { reactToActivities } from '../_lib/react.js';
import { claimEvent, realign, runAgents } from '../_lib/agents.js';

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
        const today = todayIn(u.tz);
        const reports = await syncUser(u.id, 3);
        if (reports.length) await rescore(u.id, today, u.goal && u.goal !== 'full' ? u.goal : '70.3');
        // Calendarul reacționează imediat la activitățile noi (efort mare: restul zilei închis, zilele următoare ușoare).
        const r = await reactToActivities(u.id, today);
        // Antrenorul scrie după fiecare activitate nouă de azi, o singură dată pe activitate.
        let fresh = false;
        for (const k of r.todayKeys) if (await claimEvent(u.id, `analiza:${k}`)) fresh = true;
        const agent = fresh ? await runAgents(u.id, today, 'dupa_antrenament', true).catch((e: Error) => ({ eroare: e.message })) : null;
        // Decizia s-a schimbat după mesajul de azi: antrenorul îl rescrie, ca să spună ce decide aplicația.
        const realiniat = agent ? false : await realign(u.id, today).catch(() => false);
        done[u.id] = { realiniat, citire: reports.map((x) => `${x.provider}:${x.ok ? x.rows : 'eroare'}`), calendar: r.changes.length, antrenor: agent ? ('eroare' in agent ? agent.eroare : agent.decision) : '-' };
      } catch (e) {
        done[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, done });
  } catch (e) {
    fail(res, e);
  }
}
