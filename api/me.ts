import { fail, json, requireUser, todayIn } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { buildMe } from './_lib/me.js';
import { loadUser } from './_lib/collect.js';

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    json(res, 200, await buildMe(u.id, todayIn(user.tz)));
  } catch (e) {
    fail(res, e);
  }
}
