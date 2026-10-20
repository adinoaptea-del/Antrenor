import type { Goal } from '../../src/calendar/phases.js';
import { fail, json, requireCron, todayIn } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { consentActive } from '../_lib/consent.js';
import { one, select } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { rescore } from '../_lib/score.js';
import { reactToActivities } from '../_lib/react.js';
import { claimEvent, realign, runAgents } from '../_lib/agents.js';
import { importHistory } from '../_lib/history.js';

/** La 15 minute: toți sportivii cu brățări conectate și consimțământ. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; goal: Goal | 'full' | null; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,goal,consents(health_data,withdrawn_at)' });
    const done: Record<string, unknown> = {};
    // Istoricul complet: cel mult un sportiv pe rulare (durează), o singură dată pe sursă.
    let historyBudget = 1;
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
        // Auditul v93, A21: cheia stabilă a ședinței; o analiză trimisă deja pe cheia veche nu se repetă.
        for (const k of r.todayKeys) {
          if (await one('agent_events', { user_id: `eq.${u.id}`, event_key: `eq.analiza:${k.legacy}` }).catch(() => null)) continue;
          if (await claimEvent(u.id, `analiza:${k.key}`)) fresh = true;
        }
        const agent = fresh ? await runAgents(u.id, today, 'dupa_antrenament', true).catch((e: Error) => ({ eroare: e.message })) : null;
        // Decizia s-a schimbat după mesajul de azi: antrenorul îl rescrie, ca să spună ce decide aplicația.
        const realiniat = agent ? false : await realign(u.id, today).catch(() => false);
        let istoric: Record<string, number | string> | null = null;
        if (historyBudget > 0) {
          istoric = await importHistory(u.id).catch((e: Error) => ({ eroare: e.message }));
          if (Object.keys(istoric).length) historyBudget -= 1;
        }
        done[u.id] = { istoric, realiniat, citire: reports.map((x) => `${x.provider}:${x.ok ? x.rows : 'eroare'}`), calendar: r.changes.length, antrenor: agent ? ('eroare' in agent ? agent.eroare : agent.decision) : '-' };
      } catch (e) {
        done[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, done });
  } catch (e) {
    fail(res, e);
  }
}
