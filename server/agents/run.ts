import { fail, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { loadUser } from '../_lib/collect.js';
import { acquireLock, releaseLock, runAgents } from '../_lib/agents.js';

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
    const event = body.event ?? 'dimineata';
    // Două apăsări una după alta nu pornesc două rulări: o încuietoare pe sportiv + eveniment, cât ține rularea
    // (una rămasă de la o rulare căzută expiră după 5 minute).
    const lockKey = `rulare:${event}`;
    const lock = await acquireLock(u.id, lockKey, 5 * 60_000);
    if (!lock) out = { skipped: 'antrenorul scrie deja mesajul; apare în câteva clipe' };
    else
      try {
        out = (await runAgents(u.id, todayIn(user.tz), event, body.force ?? true)) ?? { skipped: 'nimic nou: mesajul de azi e scris pe datele de acum' };
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      } finally {
        await releaseLock(u.id, lockKey);
      }
    clearInterval(beat);
    res.end(JSON.stringify(out));
  } catch (e) {
    if (beat) clearInterval(beat);
    if (res.headersSent) res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    else fail(res, e);
  }
}
