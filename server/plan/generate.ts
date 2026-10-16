import { fail, json, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { loadForms, loadUser } from '../_lib/collect.js';
import { generateAndStore, type IntakeLike } from '../_lib/plan.js';

/** POST /api/plan/generate — regenerează planul din ultimul chestionar de intrare (după un test nou, un aviz, un program schimbat). */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const today = todayIn(user.tz);
    const { intake } = await loadForms(u.id, today);
    if (!intake) throw new HttpError(400, 'fără chestionar de intrare');
    json(res, 200, await generateAndStore(u.id, today, intake as unknown as IntakeLike));
  } catch (e) {
    fail(res, e);
  }
}
