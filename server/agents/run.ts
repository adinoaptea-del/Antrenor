import { fail, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { loadUser } from '../_lib/collect.js';
import { runAgents } from '../_lib/agents.js';

/**
 * POST /api/agents/run { event: 'dimineata' | 'dupa_antrenament' | 'saptamanal' } — rulare manuală.
 * Echipa de agenți poate dura 1–3 minute. Pe telefon, o conexiune tăcută atâta timp e tăiată de rețea sau de Safari
 * („Load failed”). De aceea răspunsul pornește imediat și trimite un spațiu la 5 s (JSON-ul acceptă spații în față),
 * iar la final rezultatul sau eroarea, tot ca JSON.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  let beat: ReturnType<typeof setInterval> | null = null;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const body = await readJson<{ event?: 'dimineata' | 'dupa_antrenament' | 'saptamanal'; force?: boolean }>(req);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-accel-buffering', 'no');
    res.write(' ');
    beat = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 5000);
    let out: unknown;
    try {
      out = (await runAgents(u.id, todayIn(user.tz), body.event ?? 'dimineata', body.force ?? true)) ?? { skipped: 'există deja o rulare azi pentru evenimentul ăsta' };
    } catch (e) {
      out = { error: e instanceof Error ? e.message : String(e) };
    }
    clearInterval(beat);
    res.end(JSON.stringify(out));
  } catch (e) {
    if (beat) clearInterval(beat);
    if (res.headersSent) res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    else fail(res, e);
  }
}
