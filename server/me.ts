import { fail, json, requireUser, todayIn } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { buildMe } from './_lib/me.js';
import { loadUser } from './_lib/collect.js';
import { update } from './_lib/db.js';
import { validTz } from '../src/util/dates.js';

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const u = await requireUser(req);
    let user = await loadUser(u.id);
    // Ziua sportivului e în fusul LUI (auditul de coaching, Q12): telefonul trimite fusul la fiecare citire; până acum
    // users.tz rămânea la valoarea implicită (Europe/Bucharest) pentru toți. Se salvează doar când e valid și diferit.
    const tz = validTz(req.headers['x-airon-tz']);
    if (tz && tz !== user.tz) {
      await update('users', { id: `eq.${u.id}` }, { tz }).catch(() => undefined);
      user = { ...user, tz };
    }
    json(res, 200, await buildMe(u.id, todayIn(user.tz)));
  } catch (e) {
    fail(res, e);
  }
}
