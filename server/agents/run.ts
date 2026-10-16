import { fail, json, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { loadUser } from '../_lib/collect.js';
import { runAgents } from '../_lib/agents.js';

/** POST /api/agents/run { event: 'dimineata' | 'dupa_antrenament' | 'saptamanal' } — rulare manuală (pilot). */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const body = await readJson<{ event?: 'dimineata' | 'dupa_antrenament' | 'saptamanal'; force?: boolean }>(req);
    const out = await runAgents(u.id, todayIn(user.tz), body.event ?? 'dimineata', body.force ?? true);
    json(res, 200, out ?? { skipped: 'există deja o rulare azi pentru evenimentul ăsta' });
  } catch (e) {
    fail(res, e);
  }
}
