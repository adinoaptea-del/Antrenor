import { randomBytes } from 'node:crypto';
import { fail, HttpError, json, readJson, requireUser, todayIn } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { one, remove, select, update } from './_lib/db.js';
import { disconnectAll } from './_lib/tokens.js';
import { ENV, supabaseKeyHeaders } from './_lib/env.js';
import { syncUser } from './_lib/sync.js';
import { costUsd } from './_lib/usage.js';
import { inviteCode, rotateInvite } from './_lib/invite.js';
import { generateAndStore, historyHours, type IntakeLike } from './_lib/plan.js';
import { summarizeUsage, type FeedbackRow, type UsageRow } from '../src/usage.js';

/**
 * Pentru admin (primul cont): starea fiecărui sportiv și trei reparații.
 * GET  /api/admin → lista: cont, chestionar, plan, brățări, ultima citire (cu eroarea), ultimul mesaj.
 * POST /api/admin { action: 'sync' | 'plan' | 'parola' | 'detalii' | 'sterge', userId }
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const u = await requireUser(req);
    const me = await one<{ role: string }>('users', { id: `eq.${u.id}` });
    if (me?.role !== 'admin') throw new HttpError(403, 'doar adminul');

    if (req.method === 'GET') {
      const monthStart = `${todayIn('Europe/Bucharest').slice(0, 7)}-01`;
      const since28 = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const [users, tokens, logs, intakes, plans, msgs, usage, acts, weights, rides, appUse, lastUse, feedback] = await Promise.all([
        select<{ id: string; email: string; name: string; created_at: string; tz: string; sex: string | null; birth_year: number | null; height_cm: number | null }>('users', {}, { select: '*', order: 'created_at.asc' }),
        select<{ user_id: string; provider: string }>('oauth_tokens', {}, { select: 'user_id,provider' }),
        select<{ user_id: string; provider: string; ok: boolean; detail: string | null; ran_at: string }>('sync_log', {}, { order: 'ran_at.desc', limit: 300 }),
        select<{ user_id: string }>('questionnaires', { kind: 'eq.intrare' }, { select: 'user_id' }),
        select<{ user_id: string; start_date: string }>('plans', { active: 'eq.true' }, { select: 'user_id,start_date' }),
        select<{ user_id: string; created_at: string; kind: string }>('messages', {}, { select: 'user_id,created_at,kind', order: 'created_at.desc', limit: 300 }),
        select<{ user_id: string | null; input_tokens: number; output_tokens: number; cache_write_tokens?: number; cache_read_tokens?: number; created_at: string }>('ai_usage', { created_at: `gte.${monthStart}T00:00:00Z` }, { select: '*', limit: 20000 }).catch(() => []),
        select<{ user_id: string; date: string; sport: string; source: string; name: string | null; minutes: number; distance_km: number | null }>('activities', {}, { select: 'user_id,date,sport,source,name,minutes,distance_km', order: 'date.desc', limit: 400 }),
        select<{ user_id: string }>('wellness_daily', { source: 'eq.manual', weight_kg: 'not.is.null' }, { select: 'user_id' }).catch(() => []),
        // Bicicleta pe 6 săptămâni (ce intră în „pregătirea pe probe”), ca să vezi de unde vine o tură nefăcută.
        select<{ id: string; user_id: string; date: string; source: string; name: string | null; minutes: number; distance_km: number | null }>('activities', { sport: 'eq.bicicleta', date: `gte.${new Date(Date.now() - 42 * 86_400_000).toISOString().slice(0, 10)}` }, { select: 'id,user_id,date,source,name,minutes,distance_km', order: 'date.desc', limit: 500 }).catch(() => []),
        // Folosirea aplicației (schema 12; pe o bază veche: liste goale). Ultimele 28 de zile + ultima intrare, oricât de veche.
        select<UsageRow & { user_id: string }>('app_usage_daily', { date: `gte.${since28}` }, { select: 'user_id,date,sessions,seconds,details,screens,last_at', limit: 5000 }).catch(() => null),
        select<{ user_id: string; last_at: string }>('app_usage_daily', {}, { select: 'user_id,last_at', order: 'last_at.desc', limit: 1000 }).catch(() => []),
        select<FeedbackRow & { user_id: string }>('app_feedback', {}, { select: 'user_id,date,score,note', order: 'date.desc', limit: 1000 }).catch(() => []),
      ]);
      const today = todayIn('Europe/Bucharest');
      const cost = (rows: typeof usage) => Math.round(rows.reduce((s, r) => s + costUsd(r.input_tokens, r.output_tokens, r.cache_write_tokens ?? 0, r.cache_read_tokens ?? 0), 0) * 100) / 100;
      // Strava: câți sportivi au aplicația Strava conectată. Aplicația Strava a lui AIRON pornește în „Single Player Mode”
      // (1 sportiv = dezvoltatorul); se ridică la 10 din strava.com/settings/api, peste 10 cere review (developers.strava.com).
      const stravaAthletes = new Set(tokens.filter((t) => t.provider === 'strava').map((t) => t.user_id)).size;
      json(res, 200, {
        inviteUrl: `${ENV.appUrl()}/?invite=${await inviteCode(true)}`,
        strava: { athletes: stravaAthletes, configured: !!process.env.STRAVA_CLIENT_ID },
        costMonth: cost(usage),
        costToday: cost(usage.filter((r) => r.created_at.slice(0, 10) === today)),
        tracking: usage.length > 0,
        usageReady: appUse != null,
        users: users.map((x) => {
          const last = logs.filter((l) => l.user_id === x.id);
          // Brățările cu token (OAuth) și cele care trimit singure (Apple Health, Samsung prin Health Connect): după sync_log.
          const pushed = [...new Set(last.filter((l) => l.provider === 'apple' || l.provider === 'android').map((l) => l.provider))];
          const byProvider = [...new Set([...tokens.filter((t) => t.user_id === x.id).map((t) => t.provider), ...pushed])].map((p) => {
            const l = last.find((r) => r.provider === p);
            return { provider: p, lastSync: l?.ran_at ?? null, ok: l?.ok ?? null, detail: l?.detail ?? null };
          });
          return {
            id: x.id,
            email: x.email,
            name: x.name,
            since: x.created_at.slice(0, 10),
            intake: intakes.some((i) => i.user_id === x.id),
            planStart: plans.find((p) => p.user_id === x.id)?.start_date ?? null,
            devices: byProvider,
            lastMessage: msgs.find((m) => m.user_id === x.id && m.kind !== 'memento')?.created_at ?? null,
            costMonth: cost(usage.filter((r) => r.user_id === x.id)),
            // Mesele sunt personalizate doar cu toate cele patru date (aceleași ca în motorul de nutriție).
            nutritionMissing: [x.sex ? null : 'sexul', x.birth_year ? null : 'anul nașterii', x.height_cm ? null : 'înălțimea', weights.some((w) => w.user_id === x.id) ? null : 'greutatea'].filter((v): v is string => !!v),
            // Datele Strava nu se arată altor utilizatori (nici adminului): doar câte ture sunt de acolo.
            rides42: rides.filter((r) => r.user_id === x.id && r.source !== 'strava').map((r) => ({ date: r.date, source: r.source, name: r.name, minutes: r.minutes, km: r.distance_km == null ? null : Number(r.distance_km) })),
            rides42Strava: rides.some((r) => r.user_id === x.id && r.source === 'strava'),
            usage: (() => {
              const sum = summarizeUsage((appUse ?? []).filter((r) => r.user_id === x.id), feedback.filter((f) => f.user_id === x.id), today, x.created_at.slice(0, 10));
              // Ultima intrare poate fi mai veche de 28 de zile.
              return { ...sum, lastSeen: sum.lastSeen ?? lastUse.find((r) => r.user_id === x.id)?.last_at ?? null };
            })(),
            recent: acts.filter((r) => r.user_id === x.id && r.source !== 'strava').slice(0, 8).map((r) => ({ date: r.date, sport: r.sport, source: r.source, name: r.name, minutes: r.minutes, km: r.distance_km })),
          };
        }),
      });
      return;
    }

    if (req.method !== 'POST') throw new HttpError(405, 'GET sau POST');
    const body = await readJson<{ action?: string; userId?: string }>(req);
    if (body.action === 'invitatie') {
      // Link nou: cel vechi nu mai creează conturi.
      json(res, 200, { ok: true, inviteUrl: `${ENV.appUrl()}/?invite=${await rotateInvite()}` });
      return;
    }
    const target = await one<{ id: string; tz: string; email: string }>('users', { id: `eq.${body.userId ?? ''}` });
    if (!target) throw new HttpError(404, 'sportiv inexistent');

    if (body.action === 'detalii') {
      // Ce a răspuns la chestionar (doar ce ține de antrenament) și următoarele două săptămâni din plan: ca să judeci planul.
      const today = todayIn(target.tz);
      const intake = await one<{ answers: Record<string, any> }>('questionnaires', { user_id: `eq.${target.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      const a = intake?.answers ?? {};
      const plan = await one<{ id: string; start_date: string; race_date: string; goal: string; budget_hours: number }>('plans', { user_id: `eq.${target.id}`, active: 'eq.true' });
      const ws = plan ? await select<{ date: string; sport: string; type: string; planned_minutes: number; structure: string | null; status: string }>('workouts_planned', { plan_id: `eq.${plan.id}`, date: `gte.${today}` }, { order: 'date.asc', limit: 40 }) : [];
      const hist = await historyHours(target.id, today);
      const DAY = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
      const prog = Array.isArray(a.program) ? (a.program as { day: number; startMin: number; endMin: number }[]).map((b) => `${DAY[b.day]} ${Math.floor(b.startMin / 60)}–${Math.ceil(b.endMin / 60)}`).join(', ') : '–';
      const al = a.alergare ?? {};
      const lines = [
        `Obiectiv: ${a.obiectiv ?? '–'} · data ${a.dataCursa ?? '–'} · ramura ${al.ramura ?? (al.tinta ? 'timp' : '–')}${al.tinta ? ` · ținta ${al.tinta.valoare} (${al.tinta.mod})` : ''}`,
        `Nivel: ritm ușor ${al.ritmActual ?? a.evaluare?.ritmUsor ?? '–'} · cea mai lungă ${al.ceaMaiLungaKm ?? '–'} km · a alergat distanța: ${al.poateDistanta == null ? '–' : al.poateDistanta ? `da (${al.rezultatActual?.valoare ?? '?'})` : 'nu'} · 5 km ${a.evaluare?.alergare5k ?? '–'} · 10 km ${a.evaluare?.alergare10k ?? '–'}`,
        `Program: ${prog} · ore declarate ${a.oreSport ?? '–'} · an naștere ${a.anNastere ?? '–'}`,
        `Istoric (ore/săpt., cele mai noi întâi): ${hist.length ? hist.join(', ') : 'fără'}`,
        plan ? `Plan: din ${plan.start_date} până la ${plan.race_date}, buget ${plan.budget_hours} h/săpt.` : 'Fără plan activ',
        ...ws.filter((w) => w.status !== 'sters').slice(0, 16).map((w) => `${w.date.slice(5)} · ${w.sport} · ${w.type} · ${w.planned_minutes} min · ${(w.structure ?? '').slice(0, 110)}`),
      ];
      json(res, 200, { ok: true, text: lines.join('\n') });
      return;
    }
    if (body.action === 'sync') {
      const r = await syncUser(target.id, 7);
      json(res, 200, { ok: true, text: r.length ? r.map((x) => `${x.provider}: ${x.ok ? `${x.rows} rânduri` : `eroare: ${x.detail ?? ''}`}`).join(' · ') : 'nicio brățară conectată' });
      return;
    }
    if (body.action === 'plan') {
      const intake = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${target.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      if (!intake) throw new HttpError(400, 'nu are chestionarul de intrare');
      const r = await generateAndStore(target.id, todayIn(target.tz), intake.answers);
      json(res, 200, { ok: r.ok, text: r.ok ? `plan nou: ${r.weeks} săptămâni, ${r.budgetHours} h/săpt.` : (r.reason ?? 'nu s-a putut') });
      return;
    }
    if (body.action === 'sterge') {
      // Ștergerea unui prieten (cererea proprietarului, 21.10.2026: loc liber pentru alt prieten de test). Întâi
      // brățările se deconectează cu revocare la producător (Strava eliberează locul din capacitatea aplicației),
      // apoi contul de autentificare: schema șterge în cascadă tot ce ține de el (users → plan, activități, formulare,
      // mesaje, scoruri, folosire). Adminul nu se poate șterge pe sine și nu poate șterge alt admin.
      if (target.id === u.id) throw new HttpError(409, 'nu te poți șterge pe tine de aici');
      const role = await one<{ role: string }>('users', { id: `eq.${target.id}` }, { select: 'role' });
      if (role?.role === 'admin') throw new HttpError(409, 'alt administrator nu se șterge de aici');
      const revoked = await disconnectAll(target.id).catch(() => [] as string[]);
      // Referințele care nu sunt în cascadă (antrenorul unui sportiv, cine a aprobat o ajustare) se golesc întâi.
      await update('users', { coach_id: `eq.${target.id}` }, { coach_id: null }).catch(() => undefined);
      await update('plans', { approved_by: `eq.${target.id}` }, { approved_by: null }).catch(() => undefined);
      const r = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users/${target.id}`, { method: 'DELETE', headers: supabaseKeyHeaders(ENV.supabaseService()) });
      if (!r.ok && r.status !== 404) throw new HttpError(500, `nu am putut șterge contul (${r.status})`);
      // Dacă rândul din users a rămas (cont de autentificare lipsă), îl ștergem direct: tot în cascadă.
      await remove('users', { id: `eq.${target.id}` }).catch(() => undefined);
      json(res, 200, { ok: true, text: `cont șters: ${target.email}${revoked.length ? ` · brățări deconectate: ${revoked.join(', ')}` : ''} · locul e liber pentru alt prieten` });
      return;
    }
    if (body.action === 'parola') {
      // Parolă temporară: i-o trimiți tu prietenului; o schimbă după ce intră (sau o păstrează).
      const password = randomBytes(6).toString('base64url');
      const r = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users/${target.id}`, {
        method: 'PUT',
        headers: { ...supabaseKeyHeaders(ENV.supabaseService()), 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) throw new HttpError(500, `nu am putut schimba parola (${r.status})`);
      json(res, 200, { ok: true, text: `parolă temporară pentru ${target.email}: ${password}` });
      return;
    }
    throw new HttpError(400, 'acțiune necunoscută');
  } catch (e) {
    fail(res, e);
  }
}
