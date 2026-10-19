// Formularele de mers pe jos: plimbare adăugată / cronometrată / corectată / ștearsă / legată de un import, ținta
// săptămânii (cu jurnal) și profilul (capacitatea, mersul alert). După fiecare scriere: scorul și pagina se recalculează
// din rânduri (nimic nu se ține în cache), deci totalul e același și după reîncărcare, și într-o sesiune nouă.

import { HttpError } from './auth.js';
import { insert, one, remove, update } from './db.js';
import { loadPrefs, savePrefs, walkProfileOf } from './prefs.js';
import { rescore } from './score.js';
import { generateAndStore, type IntakeLike } from './plan.js';
import { changeTarget } from '../../src/walking/minutes.js';
import { isWalkName } from '../../src/walking/rows.js';
import { addDays, localTimeUtc } from '../../src/util/dates.js';
import { localDate } from '../../src/walking/minutes.js';

const SCHEMA_MSG = 'Baza de date trebuie actualizată pentru mers (Admin → Actualizează baza de date, schema 9).';

interface Ctx {
  userId: string;
  tz: string;
  today: string;
  goal: string | null;
}

type Row = { id: string; source: string; name: string; date: string; minutes: number; start_utc?: string | null; elapsed_sec?: number | null };

async function own(ctx: Ctx, id: string): Promise<Row> {
  const r = await one<Row>('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` }, { select: 'id,source,name,date,minutes,start_utc,elapsed_sec' }).catch(() => one<Row>('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` }, { select: 'id,source,name,date,minutes' }));
  if (!r || !isWalkName(r.name)) throw new HttpError(404, 'plimbare inexistentă');
  return r;
}

/** Ziua + ora locală → ISO UTC (în fusul sportivului). */
function startUtcOf(date: string, hm: string | null, tz: string): string | null {
  const m = hm ? /^(\d{1,2}):(\d{2})$/.exec(hm) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return localTimeUtc(date, Number(m[1]) * 60 + Number(m[2]), tz);
}

const isDay = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

async function after(ctx: Ctx): Promise<void> {
  await rescore(ctx.userId, ctx.today, (ctx.goal ?? 'mers') as 'mers').catch(() => undefined);
}

async function replan(ctx: Ctx): Promise<string | null> {
  const intake = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${ctx.userId}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
  if (!intake || intake.answers.obiectiv !== 'mers') return null;
  const r = await generateAndStore(ctx.userId, ctx.today, intake.answers).catch((e: Error) => ({ ok: false as const, reason: e.message }));
  return r.ok ? null : `Ședințele nu s-au putut reface: ${r.reason}`;
}

/** Întoarce răspunsul formularului sau null dacă nu e un formular de mers. */
export async function walkForm(kind: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown> | null> {
  if (kind === 'mers') {
    const op = String(body.op ?? '');
    if (op === 'adauga') {
      // Manual (declarat) sau cronometrat în aplicație (start și stop reale, pauzele scoase).
      const app = body.sursa === 'aplicatie';
      const brisk = body.alert === true;
      let date: string;
      let startUtc: string | null;
      let elapsed: number;
      let moving: number | null = null;
      if (app) {
        const s = Date.parse(String(body.startUtc ?? ''));
        elapsed = Math.round(Number(body.elapsedSec));
        moving = body.movingSec == null ? null : Math.round(Number(body.movingSec));
        if (!Number.isFinite(s) || !Number.isFinite(elapsed) || elapsed < 60 || elapsed > 6 * 3600) throw new HttpError(400, 'înregistrarea trebuie să aibă între 1 minut și 6 ore');
        // Doar timpul trecut: nu se salvează minute „din viitor”.
        if (s + elapsed * 1000 > Date.now() + 120_000) throw new HttpError(400, 'înregistrarea se termină în viitor');
        if (moving != null && (!Number.isFinite(moving) || moving < 0 || moving > elapsed)) moving = null;
        startUtc = new Date(s).toISOString();
        date = localDate(s, ctx.tz);
      } else {
        date = isDay(body.data) ? body.data : ctx.today;
        const min = Number(body.minute);
        if (!Number.isInteger(min) || min < 1 || min > 300) throw new HttpError(400, 'minutele între 1 și 300');
        if (date > ctx.today || date < addDays(ctx.today, -60)) throw new HttpError(400, 'ziua: din ultimele 60 de zile, nu din viitor');
        elapsed = min * 60;
        startUtc = startUtcOf(date, typeof body.ora === 'string' ? body.ora : null, ctx.tz);
        if (startUtc && Date.parse(startUtc) + elapsed * 1000 > Date.now() + 120_000) throw new HttpError(400, 'plimbarea nu s-a terminat încă: adaug-o după ce o termini');
      }
      const id = `${app ? 'app' : 'manual'}-mers-${ctx.userId.slice(0, 8)}-${Date.now().toString(36)}`;
      const hm = startUtc ? new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startUtc)) : null;
      await insert('other_activities', { id, user_id: ctx.userId, source: app ? 'aplicatie' : 'manual', external_id: id, date, start_local: hm, kind: 'recuperare', name: 'plimbare', minutes: Math.round((moving ?? elapsed) / 60), avg_hr: null, max_hr: null, start_utc: startUtc, elapsed_sec: elapsed, moving_sec: moving, brisk }).catch(() => {
        throw new HttpError(409, SCHEMA_MSG);
      });
      await after(ctx);
      return { ok: true, id };
    }
    const id = String(body.id ?? '');
    if (!id) throw new HttpError(400, 'lipsește plimbarea');
    const row = await own(ctx, id);
    const mine = row.source === 'manual' || row.source === 'aplicatie';
    if (op === 'editeaza') {
      const patch: Record<string, unknown> = {};
      if (typeof body.alert === 'boolean') patch.brisk = body.alert;
      // Ce a măsurat o brățară nu se rescrie de mână; plimbările tale (declarate) se pot corecta.
      if (row.source === 'manual') {
        if (body.minute != null) {
          const min = Number(body.minute);
          if (!Number.isInteger(min) || min < 1 || min > 300) throw new HttpError(400, 'minutele între 1 și 300');
          patch.minutes = min;
          patch.elapsed_sec = min * 60;
        }
        if (body.data != null) {
          if (!isDay(body.data) || body.data > ctx.today || body.data < addDays(ctx.today, -60)) throw new HttpError(400, 'ziua: din ultimele 60 de zile, nu din viitor');
          patch.date = body.data;
        }
        if (body.ora !== undefined) {
          const d = (patch.date as string | undefined) ?? row.date;
          const s = typeof body.ora === 'string' && body.ora ? startUtcOf(d, body.ora, ctx.tz) : null;
          patch.start_utc = s;
          patch.start_local = s ? body.ora : null;
        } else if (patch.date && row.start_utc) {
          // Ziua mutată: ora rămâne aceeași, în ziua nouă.
          const hm = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.start_utc));
          patch.start_utc = startUtcOf(patch.date as string, hm, ctx.tz);
        }
      } else if (body.minute != null || body.data != null || body.ora !== undefined) {
        throw new HttpError(400, mine ? 'o înregistrare cronometrată nu se rescrie; o poți șterge' : 'durata măsurată de brățară nu se rescrie de mână; o poți scoate din bulă');
      }
      if (!Object.keys(patch).length) throw new HttpError(400, 'nimic de schimbat');
      await update('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` }, patch).catch(() => {
        throw new HttpError(409, SCHEMA_MSG);
      });
      await after(ctx);
      return { ok: true };
    }
    if (op === 'sterge') {
      // Plimbarea ta se șterge; un import se scoate din bulă (rămâne marcat, ca reimportul să nu-l readucă).
      if (mine) await remove('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` });
      else
        await update('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` }, { excluded: true }).catch(() => {
          throw new HttpError(409, SCHEMA_MSG);
        });
      await after(ctx);
      return { ok: true };
    }
    if (op === 'readu') {
      await update('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` }, { excluded: false }).catch(() => {
        throw new HttpError(409, SCHEMA_MSG);
      });
      await after(ctx);
      return { ok: true };
    }
    if (op === 'leaga') {
      // O plimbare declarată e de fapt importul X: se numără importul, nu amândouă.
      if (row.source !== 'manual' && row.source !== 'aplicatie') throw new HttpError(400, 'doar o plimbare adăugată de tine se leagă de un import');
      const cu = body.cu == null || body.cu === '' ? null : String(body.cu);
      if (cu) {
        const target = await own(ctx, cu);
        if (target.source === 'manual' || target.source === 'aplicatie') throw new HttpError(400, 'leag-o de o plimbare importată');
      }
      await update('other_activities', { id: `eq.${id}`, user_id: `eq.${ctx.userId}` }, { reconciled_with: cu }).catch(() => {
        throw new HttpError(409, SCHEMA_MSG);
      });
      await after(ctx);
      return { ok: true };
    }
    throw new HttpError(400, 'operație necunoscută');
  }
  if (kind === 'mers-tinta') {
    // Ținta nu se schimbă în tăcere: valoarea veche, cea nouă, motivul și săptămâna de la care se aplică rămân în jurnal.
    const prefs = await loadPrefs(ctx.userId);
    const profile = walkProfileOf(prefs.mers);
    let changes;
    try {
      changes = changeTarget(profile.changes, { to: Number(body.tinta), reason: String(body.motiv ?? ''), today: ctx.today, at: new Date().toISOString(), now: body.acum === true, initial: profile.initial });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
    await savePrefs(ctx.userId, { ...prefs, mers: { ...profile, changes } });
    const warn = await replan(ctx);
    await after(ctx);
    return { ok: true, change: changes.at(-1), ...(warn ? { info: warn } : {}) };
  }
  if (kind === 'mers-profil') {
    // Capacitatea (cât merge acum fără oprire) și mersul alert: schimbă ședințele de luni încolo.
    const prefs = await loadPrefs(ctx.userId);
    const profile = walkProfileOf(prefs.mers);
    const cap = body.capacitate == null ? profile.capacityMin : Number(body.capacitate);
    if (!Number.isInteger(cap) || cap < 5 || cap > 240) throw new HttpError(400, 'capacitatea: între 5 și 240 de minute');
    const brisk = body.alert === 'da' || body.alert === 'nu' || body.alert === 'nu_stiu' ? body.alert : profile.brisk;
    await savePrefs(ctx.userId, { ...prefs, mers: { ...profile, capacityMin: cap, brisk } });
    const warn = await replan(ctx);
    return { ok: true, ...(warn ? { info: warn } : {}) };
  }
  return null;
}
