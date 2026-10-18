import { fail, json, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { insert, one, remove, update, upsert } from '../_lib/db.js';
import { geocode } from '../_lib/weather.js';
import { readTest } from '../_lib/test-extract.js';
import { readLabs } from '../_lib/labs-extract.js';
import { saveSettings } from '../_lib/settings.js';
import { newAppleToken } from '../webhooks/apple.js';
import { disconnect } from '../_lib/tokens.js';
import { ENV } from '../_lib/env.js';
import type { BodyForm, LabsForm, TestsForm } from '../../src/api-types.js';
import { loadUser } from '../_lib/collect.js';
import { generateAndStore, saveIntake, type IntakeLike } from '../_lib/plan.js';
import { rescore } from '../_lib/score.js';
import { reactToActivities } from '../_lib/react.js';
import { applyPlanEvents, runAgents } from '../_lib/agents.js';
import { loadForms, loadPlan } from '../_lib/collect.js';
import { morningSafetyEvents, painSafetyEvents, type MorningSafety } from '../../src/calendar/safety.js';
import { addDays, localDayStartUtc } from '../../src/util/dates.js';
import { shortenWorkout } from '../../src/calendar/validate.js';

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
      // Același set de obiective în aplicație, server și bază; Ironman complet nu e încă disponibil.
      if (!['70.3', 'olimpic', 'sprint', 'semimaraton', 'maraton'].includes(String(intake.obiectiv))) throw new HttpError(400, 'obiectiv indisponibil deocamdată: alege 70.3, olimpic, sprint, semimaraton sau maraton');
      if (!isDate(intake.dataCursa) || intake.dataCursa <= today) throw new HttpError(400, 'data cursei trebuie să fie în viitor');
      await saveIntake(u.id, today, intake);
      const plan = await generateAndStore(u.id, today, intake);
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'dimineata') {
      const date = formDate(body.date, today);
      await upsert('questionnaires', { user_id: u.id, kind, for_date: date, activity_id: null, answers: body }, 'user_id,kind,for_date,activity_id');
      // Protecția din cod, imediat la salvare, fără să aștepte agenții: febră, simptom cardiac, boală.
      const safety = morningSafetyEvents(date, body.semnale as Record<string, unknown> | undefined);
      const changes = await protect(u.id, today, user.tz, safety);
      json(res, 200, { ok: true, protectie: safety.events.length ? { verdict: safety.verdict, changes } : null });
      return;
    }
    if (kind === 'seara') {
      const date = formDate(body.date, today);
      const activityId = typeof body.activityId === 'string' ? body.activityId : null;
      await upsert('questionnaires', { user_id: u.id, kind, for_date: date, activity_id: activityId, answers: body }, 'user_id,kind,for_date,activity_id');
      // Durerea mare schimbă zilele următoare imediat, din cod, chiar dacă agenții nu rulează.
      await protect(u.id, today, user.tz, painSafetyEvents(date, body.durere));
      const goal = user.goal && user.goal !== 'full' ? user.goal : '70.3';
      await rescore(u.id, today, goal);
      // RPE ≥ 7 sau tipul ales (cursă / altceva) schimbă reacția calendarului imediat.
      await reactToActivities(u.id, today).catch(() => undefined);
      let agents = null;
      if (body.tip_neplanificat && body.tip_neplanificat !== 'altceva') agents = await runAgents(u.id, today, 'dupa_antrenament', true).catch((e: Error) => ({ error: e.message }));
      json(res, 200, { ok: true, agents });
      return;
    }
    if (kind === 'saptamanal') {
      const weekStart = typeof body.weekStart === 'string' && isDate(body.weekStart) ? body.weekStart : today;
      await upsert('questionnaires', { user_id: u.id, kind, for_date: weekStart, activity_id: null, answers: body }, 'user_id,kind,for_date,activity_id');
      // Bilanțul de duminică, pe reguli: obosit (energie 1–2 din 5, „oboseala” a oprit săptămâna sau efort 9–10 la o
      // ședință) = săptămâna viitoare fără creștere și o intensitate mai puțin. Altfel planul merge înainte.
      const forms = await loadForms(u.id, today);
      const hardRpe = forms.evenings.filter((e) => e.date >= weekStart && e.date <= today && (e.rpe ?? 0) >= 9);
      const energie = typeof body.energie === 'number' ? body.energie : null;
      const motiv = energie != null && energie <= 2 ? `energie ${energie}/5` : body.aOprit === 'oboseala' ? 'oboseala a oprit săptămâna' : hardRpe.length ? `efort ${hardRpe[0]!.rpe}/10 la o ședință` : null;
      let changes: string[] = [];
      if (motiv) {
        const { planId, workouts } = await loadPlan(u.id, addDays(today, -7), addDays(today, 14));
        if (planId) changes = await applyPlanEvents(u.id, today, planId, workouts, [{ kind: 'bilant', date: today, obosit: true, motiv }]);
      }
      json(res, 200, { ok: true, bilant: motiv ? { obosit: true, motiv, changes } : { obosit: false } });
      return;
    }
    if (kind === 'analize') {
      const l = body as unknown as LabsForm;
      const vals = { feritina: n(l.feritina), vitamina_d: n(l.vitamina_d), hemoglobina: n(l.hemoglobina), ck: n(l.ck), crp: n(l.crp) };
      if (Object.values(vals).every((v) => v == null) && !l.alte?.length) throw new HttpError(400, 'cel puțin o valoare');
      const drawn = isDate(l.data) ? l.data : today;
      await remove('labs', { user_id: `eq.${u.id}`, drawn_at: `eq.${drawn}` });
      await insert('labs', { user_id: u.id, drawn_at: drawn, ...vals, other: l.alte?.length ? { laborator: l.laborator ?? null, valori: l.alte } : null });
      // Planul se reface cu analizele noi (pot limita sau elibera intensitatea).
      const intakeRow = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'teste') {
      const t = body as unknown as TestsForm;
      if (!isDate(t.data)) throw new HttpError(400, 'data testului');
      // Zonele: numere pozitive, în ordine crescătoare; altfel nu se salvează (nu stricăm zonele existente).
      const zones = (z: (number | null)[] | undefined) => (z && z.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 260) && z.every((v, i) => i === 0 || (v as number) > (z[i - 1] as number)) ? z : null);
      await remove('tests', { user_id: `eq.${u.id}`, tested_at: `eq.${t.data}` });
      await insert('tests', { user_id: u.id, kind: t.tip, results: t, tested_at: t.data });
      // Doar zonele prezente în testul ăsta se schimbă: un test de alergare nu șterge FTP-ul sau CSS-ul de dinainte.
      const measured = {
        run_hr_zones: zones(t.alergare_z),
        run_threshold_pace_sec_km: paceSec(t.pace_prag),
        bike_ftp_w: n(t.ftp),
        bike_hr_zones: zones(t.bicicleta_z),
        swim_css_sec_100m: n(t.css),
        hr_max_test: n(t.fcmax),
      };
      const present = Object.fromEntries(Object.entries(measured).filter(([, v]) => v != null));
      if (Object.keys(present).length) {
        await upsert('zones', { user_id: u.id, ...present, source: t.tip === 'altul' ? 'teren' : t.tip, tested_at: t.data, updated_at: new Date().toISOString() }, 'user_id');
      }
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
    if (kind === 'analize-citire') {
      // Doar citire: nu salvează nimic; sportivul verifică valorile și apoi salvează prin „analize”.
      const file = typeof body.file === 'string' ? body.file : '';
      const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
      if (!file) throw new HttpError(400, 'lipsește fișierul');
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new HttpError(400, 'doar PDF sau poză (JPG, PNG)');
      json(res, 200, { ok: true, citire: await readLabs(file, mediaType, u.id) });
      return;
    }
    if (kind === 'teste-citire') {
      // Doar citire: raportul clinicii; sportivul verifică și salvează prin „teste”.
      const file = typeof body.file === 'string' ? body.file : '';
      const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
      if (!file) throw new HttpError(400, 'lipsește fișierul');
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new HttpError(400, 'doar PDF sau poză (JPG, PNG)');
      json(res, 200, { ok: true, citire: await readTest(file, mediaType, u.id) });
      return;
    }
    if (kind === 'sugestie') {
      // Sportivul alege: varianta ușoară (intră în calendar) sau ședința din plan. Se revalidează pe starea de acum.
      const id = String(body.workoutId ?? '');
      const accept = body.accept === true;
      const row = await one<{ id: string; date: string; status: string; planned_minutes: number; target_zones: number[]; structure: string | null; intervals: unknown; suggestion: { minutes: number; zones: number[]; structure: string; reason: string; accepted: boolean | null; original?: { minutes: number; zones: number[]; structure: string | null; intervals?: unknown } } | null }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!row?.suggestion) throw new HttpError(404, 'nu există sugestie pentru ședința asta');
      const s = row.suggestion;
      if (row.status !== 'planificat' && row.status !== 'mutat') throw new HttpError(409, 'ședința nu mai e activă (anulată sau înlocuită); planul s-a schimbat');
      if (row.date < today) throw new HttpError(409, 'sugestia era pentru o zi trecută');
      // Aceeași alegere de două ori = nimic nou.
      if (s.accepted === accept) {
        json(res, 200, { ok: true, neschimbat: true });
        return;
      }
      if (accept) {
        const original = s.original ?? { minutes: row.planned_minutes, zones: row.target_zones, structure: row.structure, intervals: row.intervals ?? null };
        await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}`, status: 'in.(planificat,mutat)' }, { planned_minutes: s.minutes, target_zones: s.zones, structure: s.structure, intervals: null, note: `varianta ușoară aleasă (în loc de ${original.minutes} min)`, suggestion: { ...s, accepted: true, original } });
      } else if (s.accepted === true && s.original) {
        // Revine la ședința din plan: prescripția originală se pune înapoi.
        await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { planned_minutes: s.original.minutes, target_zones: s.original.zones, structure: s.original.structure, intervals: s.original.intervals ?? null, note: null, suggestion: { ...s, accepted: false } });
      } else {
        await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { suggestion: { ...s, accepted: false } });
      }
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'admin-chei') {
      // Doar adminul (primul cont): cheile aplicațiilor de la producători, ca să nu fie nevoie de Vercel.
      const me = await one<{ role: string }>('users', { id: `eq.${u.id}` });
      if (me?.role !== 'admin') throw new HttpError(403, 'doar adminul poate pune cheile');
      const p = String(body.provider ?? '').toUpperCase();
      if (!['WHOOP', 'STRAVA', 'OURA'].includes(p)) throw new HttpError(400, 'producător necunoscut');
      const id = String(body.clientId ?? '').trim();
      const secret = String(body.clientSecret ?? '').trim();
      if (!id || !secret) throw new HttpError(400, 'lipsește Client ID sau Client Secret');
      await saveSettings({ [`${p}_CLIENT_ID`]: id, [`${p}_CLIENT_SECRET`]: secret } as never);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'aviz') {
      // O bifă: ai aviz cardiologic sau nu. Schimbă intensitatea permisă și chestionarul de intrare.
      const da = body.aviz === 'da';
      await upsert('clearances', { user_id: u.id, cardiology: da, cleared_at: da ? today : null, intensity_allowed: da ? 'toate' : 'Z2' }, 'user_id');
      const intake = await one<{ id: string; answers: { sanatate?: Record<string, unknown> } }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      let plan = null;
      if (intake) {
        const answers = { ...intake.answers, sanatate: { ...(intake.answers.sanatate ?? {}), avizCardiolog: da ? 'da' : 'nu' } };
        await update('questionnaires', { id: `eq.${intake.id}` }, { answers });
        // Intensitatea permisă schimbă planul: îl refacem de la lunea următoare, păstrând restul răspunsurilor.
        plan = await generateAndStore(u.id, today, answers as unknown as IntakeLike);
      }
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'profil' && ('sex' in body || 'anNastere' in body)) {
      const sex = body.sex === 'm' || body.sex === 'f' ? body.sex : null;
      const year = Number(body.anNastere);
      const maxYear = Number(today.slice(0, 4)) - 18;
      if (!sex) throw new HttpError(400, 'alege sexul');
      if (!Number.isInteger(year) || year < 1930 || year > maxYear) throw new HttpError(400, `anul nașterii între 1930 și ${maxYear}`);
      const h = Number(body.inaltime);
      if (body.inaltime != null && body.inaltime !== '' && (!Number.isFinite(h) || h < 120 || h > 230)) throw new HttpError(400, 'înălțimea în cm, între 120 și 230');
      await update('users', { id: `eq.${u.id}` }, { sex, birth_year: year, ...(Number.isFinite(h) && h >= 120 && h <= 230 ? { height_cm: Math.round(h) } : {}) });
      // Vârsta schimbă structura planului (descărcare mai des de la 40 de ani): planul se reface.
      const intakeRow = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      json(res, 200, { ok: true, plan });
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
    if (kind === 'activitate') {
      // Corectura sportivului: { activityId, sport?: 'inot'|'bicicleta'|'alergare'|'forta', ignored?: boolean, reset?: boolean }
      const id = String(body.activityId ?? '');
      if (!id) throw new HttpError(400, 'lipsește ședința');
      const own = await one<{ id: string }>('activities', { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!own) throw new HttpError(404, 'ședință inexistentă');
      if (body.reset) {
        await remove('activity_overrides', { user_id: `eq.${u.id}`, activity_id: `eq.${id}` });
      } else {
        const sport = ['inot', 'bicicleta', 'alergare', 'forta'].includes(String(body.sport)) ? String(body.sport) : null;
        await upsert('activity_overrides', { user_id: u.id, activity_id: id, sport, ignored: body.ignored === true, updated_at: new Date().toISOString() }, 'user_id,activity_id');
      }
      await rescore(u.id, today, ((user.goal as string | null) ?? '70.3') as '70.3').catch(() => undefined);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'timp') {
      // „Am doar X minute azi”: scurtează ședința de azi corect; restul săptămânii nu se încarcă în plus.
      const id = String(body.workoutId ?? '');
      const minutes = Number(body.minutes);
      const row = await one<Record<string, unknown> & { id: string; date: string; status: string; planned_minutes: number; type: string; structure: string | null; note: string | null }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!row) throw new HttpError(404, 'ședință inexistentă');
      if (row.status !== 'planificat' && row.status !== 'mutat') throw new HttpError(409, 'ședința nu mai e activă');
      if (row.date !== today) throw new HttpError(409, 'se poate scurta doar ședința de azi');
      if (!Number.isInteger(minutes) || minutes < 15 || minutes >= row.planned_minutes) throw new HttpError(400, `alege între 15 și ${row.planned_minutes - 5} min`);
      const { workouts } = await loadPlan(u.id, today, today);
      const w = workouts.find((x) => x.id === id);
      if (!w) throw new HttpError(404, 'ședință inexistentă');
      const shorter = shortenWorkout(w, minutes);
      await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { planned_minutes: shorter.plannedMinutes, type: shorter.type, target_zones: shorter.targetZones, intervals: shorter.intervals ?? null, structure: shorter.structure ?? null, note: shorter.note ?? null, is_key: shorter.key });
      json(res, 200, { ok: true, structura: shorter.structure ?? null });
      return;
    }
    if (kind === 'deconectare') {
      // Deconectarea unei brățări: tokenul se șterge, importul se oprește. Datele importate deja rămân (ștergerea lor e separată).
      const p = String(body.provider ?? '');
      if (p === 'apple') await update('users', { id: `eq.${u.id}` }, { apple_token: null });
      else if (['whoop', 'strava', 'oura'].includes(p)) await disconnect(u.id, p as 'whoop' | 'strava' | 'oura');
      else throw new HttpError(400, 'brățară necunoscută');
      json(res, 200, { ok: true });
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

/** Aplică pe plan evenimentele de siguranță (o singură dată fiecare) și scrie avertismentul din cod, o dată pe zi. */
async function protect(userId: string, today: string, tz: string | null | undefined, safety: MorningSafety): Promise<string[]> {
  if (!safety.events.length) return [];
  const { planId, workouts } = await loadPlan(userId, addDays(today, -7), addDays(today, 14));
  const changes = planId ? await applyPlanEvents(userId, today, planId, workouts, safety.events) : [];
  if (safety.message) {
    const dayStart = localDayStartUtc(today, tz || 'Europe/Bucharest');
    const said = await one('messages', { user_id: `eq.${userId}`, kind: 'eq.avertisment', body: `eq.${safety.message}`, created_at: `gte.${dayStart}` });
    if (!said) await insert('messages', { user_id: userId, kind: 'avertisment', body: safety.message, decision: safety.verdict });
  }
  return changes;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
/** Dată calendaristică reală (2026-02-30 nu trece). */
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
/** Data unui formular: reală, nu în viitor, nu mai veche de 60 de zile; altfel ziua de azi. */
const formDate = (v: unknown, today: string): string => {
  if (v == null || v === '') return today;
  if (!isDate(v) || v > today || v < addDays(today, -60)) throw new HttpError(400, 'data formularului nu e validă');
  return v;
};
function paceSec(p: string | null | undefined): number | null {
  const m = p ? /^(\d{1,2}):([0-5]\d)$/.exec(p.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
