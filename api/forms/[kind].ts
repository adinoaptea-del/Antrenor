import { fail, json, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { upsert } from '../_lib/db.js';
import { loadUser } from '../_lib/collect.js';
import { generateAndStore, saveIntake, type IntakeLike } from '../_lib/plan.js';
import { rescore } from '../_lib/score.js';
import { runAgents } from '../_lib/agents.js';

/**
 * POST /api/forms/intrare   → salvează chestionarul, programul, avizul, consimțământul; generează planul.
 * POST /api/forms/dimineata → { date, hooper, semnale }
 * POST /api/forms/seara     → { date, activityId, rpe, … , tip_neplanificat } → rescorează; dacă e în afara planului, rulează „dupa_antrenament” pentru calendar.
 * POST /api/forms/saptamanal → { weekStart, … }
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const today = todayIn(user.tz);
    const kind = q(req, 'kind');
    const body = await readJson<Record<string, unknown>>(req);

    if (kind === 'intrare') {
      const intake = body as unknown as IntakeLike & { consimtamant?: boolean };
      if (!intake.consimtamant) throw new HttpError(400, 'fără consimțământ nu se salvează date de sănătate');
      await saveIntake(u.id, today, intake);
      const plan = await generateAndStore(u.id, today, intake);
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'dimineata') {
      const date = typeof body.date === 'string' ? body.date : today;
      await upsert('questionnaires', { user_id: u.id, kind, for_date: date, activity_id: null, answers: body }, 'user_id,kind,for_date,activity_id');
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'seara') {
      const date = typeof body.date === 'string' ? body.date : today;
      const activityId = typeof body.activityId === 'string' ? body.activityId : null;
      await upsert('questionnaires', { user_id: u.id, kind, for_date: date, activity_id: activityId, answers: body }, 'user_id,kind,for_date,activity_id');
      const goal = user.goal && user.goal !== 'full' ? user.goal : '70.3';
      await rescore(u.id, today, goal);
      let agents = null;
      if (body.tip_neplanificat && body.tip_neplanificat !== 'altceva') agents = await runAgents(u.id, today, 'dupa_antrenament', true).catch((e: Error) => ({ error: e.message }));
      json(res, 200, { ok: true, agents });
      return;
    }
    if (kind === 'saptamanal') {
      const weekStart = typeof body.weekStart === 'string' ? body.weekStart : today;
      await upsert('questionnaires', { user_id: u.id, kind, for_date: weekStart, activity_id: null, answers: body }, 'user_id,kind,for_date,activity_id');
      json(res, 200, { ok: true });
      return;
    }
    throw new HttpError(404, `formular necunoscut: ${kind}`);
  } catch (e) {
    fail(res, e);
  }
}
