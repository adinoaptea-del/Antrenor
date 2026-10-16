import { fail, json, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { insert, remove, update, upsert } from '../_lib/db.js';
import { geocode } from '../_lib/weather.js';
import { newAppleToken } from '../webhooks/apple.js';
import { ENV } from '../_lib/env.js';
import type { BodyForm, LabsForm, TestsForm } from '../../src/api-types.js';
import { loadUser } from '../_lib/collect.js';
import { generateAndStore, saveIntake, type IntakeLike } from '../_lib/plan.js';
import { rescore } from '../_lib/score.js';
import { runAgents } from '../_lib/agents.js';

/**
 * POST /api/forms/intrare   → salvează chestionarul, programul, avizul, consimțământul; generează planul.
 * POST /api/forms/dimineata → { date, hooper, semnale }
 * POST /api/forms/seara     → { date, activityId, rpe, … , tip_neplanificat } → rescorează; dacă e în afara planului, rulează „dupa_antrenament” pentru calendar.
 * POST /api/forms/saptamanal → { weekStart, … }
 * POST /api/forms/analize → LabsForm (cinci valori) · /teste → TestsForm (+ zonele) · /corp → greutate, grăsime (rând „manual”)
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
    if (kind === 'analize') {
      const l = body as unknown as LabsForm;
      const vals = { feritina: n(l.feritina), vitamina_d: n(l.vitamina_d), hemoglobina: n(l.hemoglobina), ck: n(l.ck), crp: n(l.crp) };
      if (Object.values(vals).every((v) => v == null)) throw new HttpError(400, 'cel puțin o valoare');
      const drawn = isDate(l.data) ? l.data : today;
      await remove('labs', { user_id: `eq.${u.id}`, drawn_at: `eq.${drawn}` });
      await insert('labs', { user_id: u.id, drawn_at: drawn, ...vals });
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'teste') {
      const t = body as unknown as TestsForm;
      if (!isDate(t.data)) throw new HttpError(400, 'data testului');
      const zones = (z: (number | null)[] | undefined) => (z && z.every((v) => typeof v === 'number' && v > 0) ? z : null);
      await remove('tests', { user_id: `eq.${u.id}`, tested_at: `eq.${t.data}` });
      await insert('tests', { user_id: u.id, kind: t.tip, results: t, tested_at: t.data });
      await upsert(
        'zones',
        {
          user_id: u.id,
          run_hr_zones: zones(t.alergare_z),
          run_threshold_pace_sec_km: paceSec(t.pace_prag),
          bike_ftp_w: n(t.ftp),
          bike_hr_zones: zones(t.bicicleta_z),
          swim_css_sec_100m: n(t.css),
          hr_max_test: n(t.fcmax),
          source: t.tip === 'altul' ? 'teren' : t.tip,
          tested_at: t.data,
          updated_at: new Date().toISOString(),
        },
        'user_id',
      );
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'corp') {
      const b = body as unknown as BodyForm;
      if (n(b.greutate) == null) throw new HttpError(400, 'greutatea');
      const date = isDate(b.data) ? b.data : today;
      await upsert('wellness_daily', { user_id: u.id, date, source: 'manual', weight_kg: n(b.greutate), body_fat_pct: n(b.grasime_pct) }, 'user_id,date,source');
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'profil') {
      const city = typeof body.oras === 'string' ? body.oras.trim() : '';
      if (!city) {
        await update('users', { id: `eq.${u.id}` }, { city: null, lat: null, lon: null });
        json(res, 200, { ok: true, oras: null });
        return;
      }
      const g = await geocode(city);
      if (!g) throw new HttpError(400, `nu găsesc orașul „${city}”`);
      await update('users', { id: `eq.${u.id}` }, { city: g.name, lat: g.lat, lon: g.lon });
      json(res, 200, { ok: true, oras: g.name });
      return;
    }
    if (kind === 'apple') {
      // Un token personal nou: adresa veche nu mai primește date.
      const token = newAppleToken();
      await update('users', { id: `eq.${u.id}` }, { apple_token: token });
      json(res, 200, { ok: true, url: `${ENV.appUrl()}/api/webhooks/apple?t=${token}` });
      return;
    }
    throw new HttpError(404, `formular necunoscut: ${kind}`);
  } catch (e) {
    fail(res, e);
  }
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
function paceSec(p: string | null | undefined): number | null {
  const m = p ? /^(\d{1,2}):(\d{2})$/.exec(p.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
