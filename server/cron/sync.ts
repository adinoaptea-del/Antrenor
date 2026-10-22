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
import { userToday } from '../_lib/collect.js';
import { drainStravaInbox } from '../_lib/strava-inbox.js';
import { morningFor } from '../_lib/morning.js';
import { jobFinished, jobStarted, loadJobs } from '../_lib/jobs.js';
import { fanOut, jobDue, stalestFirst } from '../../src/util/fanout.js';
import { localDayStartUtc } from '../../src/util/dates.js';

/** La 15 minute: toți sportivii cu brățări conectate și consimțământ. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    requireCron(req);
    const users = await select<{ id: string; tz: string; goal: Goal | 'full' | null; consents: { health_data: boolean; withdrawn_at: string | null } | null }>('users', {}, { select: 'id,tz,goal,consents(health_data,withdrawn_at)' });
    const started = Date.now();
    // C1/E1: întâi evenimentele Strava rămase în coadă (ștergeri confirmate la sursă, sincronizări adunate).
    const inbox = await drainStravaInbox((id) => userToday(id), { max: 100 }).catch((e: Error) => ({ processed: 0, pending: -1, errors: [e.message] }));
    const [jobs, morningJobs] = await Promise.all([loadJobs('sync'), loadJobs('dimineata')]);
    const done: Record<string, unknown> = {};
    // Istoricul complet: cel mult un sportiv pe rulare (durează), o singură dată pe sursă.
    let historyBudget = 1;
    const now = Date.now();
    // E1: sportivii în așteptare după eșecuri (15 min, 30, … 6 h) se sar; ceilalți, cei mai vechi la ultima reușită întâi.
    const eligible = stalestFirst(users.filter((u) => consentActive(u.consents) && jobDue(jobs.get(u.id), now)), (u) => jobs.get(u.id));
    const r = await fanOut(eligible, { limit: 3, budgetMs: 150_000 }, async (u) => {
      await jobStarted(u.id, 'sync');
      // Un sportiv cu eroare nu oprește ceilalți; eroarea rămâne vizibilă în răspuns și în athlete_jobs.
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
          historyBudget -= 1; // rezervat înainte de await: rulările paralele nu pornesc două importuri
          istoric = await importHistory(u.id).catch((e: Error) => ({ eroare: e.message }));
          if (!Object.keys(istoric).length) historyBudget += 1;
        }
        done[u.id] = { istoric, realiniat, citire: reports.map((x) => `${x.provider}:${x.ok ? x.rows : 'eroare'}`), calendar: r.changes.length, antrenor: agent ? ('eroare' in agent ? agent.eroare : agent.decision) : '-' };
        await jobFinished(u.id, 'sync', jobs.get(u.id), null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        done[u.id] = { eroare: msg };
        await jobFinished(u.id, 'sync', jobs.get(u.id), msg);
      }
    });
    // E1: recuperarea dimineții — cine n-a avut rularea de dimineață reușită azi (cron depășit, eroare), între 06 și
    // 12 ora lui, cu timp rămas din buget. runAgents nu scrie al doilea mesaj dacă există deja unul.
    const recuperati: string[] = [];
    const late = users.filter((u) => {
      if (!morningJobs.ready || !consentActive(u.consents) || !jobDue(morningJobs.get(u.id), Date.now())) return false;
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: u.tz || 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date()));
      if (hour < 6 || hour >= 12) return false;
      const ok = morningJobs.get(u.id)?.last_ok_at;
      return !ok || Date.parse(ok) < Date.parse(localDayStartUtc(todayIn(u.tz), u.tz || 'Europe/Bucharest'));
    });
    const left = Math.max(0, 200_000 - (Date.now() - started));
    const m = await fanOut(late, { limit: 2, budgetMs: left }, async (u) => {
      await jobStarted(u.id, 'dimineata');
      try {
        await morningFor(u, todayIn(u.tz));
        recuperati.push(u.id);
        await jobFinished(u.id, 'dimineata', morningJobs.get(u.id), null);
      } catch (e) {
        await jobFinished(u.id, 'dimineata', morningJobs.get(u.id), e instanceof Error ? e.message : String(e));
      }
    });
    json(res, 200, { ok: true, done, strava: inbox, neprocesati: r.notStarted.map((u) => u.id), dimineata_recuperata: recuperati, dimineata_neprocesata: m.notStarted.map((u) => u.id) });
  } catch (e) {
    fail(res, e);
  }
}
