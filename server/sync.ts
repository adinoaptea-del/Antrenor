import { fail, json, requireUser, todayIn } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { syncUser } from './_lib/sync.js';
import { rescore } from './_lib/score.js';
import { loadUser } from './_lib/collect.js';
import { reactToActivities } from './_lib/react.js';

/** POST /api/sync — butonul „citește datele”: trage ultimele 3 zile, rescorează, recalculează bara. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw Object.assign(new Error('POST'), { status: 405 });
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const reports = await syncUser(u.id, 3);
    const today = todayIn(user.tz);
    const goal = user.goal && user.goal !== 'full' ? user.goal : '70.3';
    const score = await rescore(u.id, today, goal);
    // Calendarul reacționează imediat la activitățile noi; mesajul antrenorului vine din citirea automată (15 min).
    await reactToActivities(u.id, today).catch(() => undefined);
    json(res, 200, { lastSync: new Date().toISOString(), reports, scored: score.scored, unplanned: score.unplanned, bar: score.bar });
  } catch (e) {
    fail(res, e);
  }
}
