import { randomBytes } from 'node:crypto';
import { fail, HttpError, json, readJson, requireUser, todayIn } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { one, select } from './_lib/db.js';
import { ENV, supabaseKeyHeaders } from './_lib/env.js';
import { syncUser } from './_lib/sync.js';
import { costUsd } from './_lib/usage.js';
import { inviteCode, rotateInvite } from './_lib/invite.js';
import { generateAndStore, type IntakeLike } from './_lib/plan.js';

/**
 * Pentru admin (primul cont): starea fiecărui sportiv și trei reparații.
 * GET  /api/admin → lista: cont, chestionar, plan, brățări, ultima citire (cu eroarea), ultimul mesaj.
 * POST /api/admin { action: 'sync' | 'plan' | 'parola', userId }
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const u = await requireUser(req);
    const me = await one<{ role: string }>('users', { id: `eq.${u.id}` });
    if (me?.role !== 'admin') throw new HttpError(403, 'doar adminul');

    if (req.method === 'GET') {
      const monthStart = `${todayIn('Europe/Bucharest').slice(0, 7)}-01`;
      const [users, tokens, logs, intakes, plans, msgs, usage, acts] = await Promise.all([
        select<{ id: string; email: string; name: string; created_at: string; tz: string }>('users', {}, { select: 'id,email,name,created_at,tz', order: 'created_at.asc' }),
        select<{ user_id: string; provider: string }>('oauth_tokens', {}, { select: 'user_id,provider' }),
        select<{ user_id: string; provider: string; ok: boolean; detail: string | null; ran_at: string }>('sync_log', {}, { order: 'ran_at.desc', limit: 300 }),
        select<{ user_id: string }>('questionnaires', { kind: 'eq.intrare' }, { select: 'user_id' }),
        select<{ user_id: string; start_date: string }>('plans', { active: 'eq.true' }, { select: 'user_id,start_date' }),
        select<{ user_id: string; created_at: string; kind: string }>('messages', {}, { select: 'user_id,created_at,kind', order: 'created_at.desc', limit: 300 }),
        select<{ user_id: string | null; input_tokens: number; output_tokens: number; cache_write_tokens?: number; cache_read_tokens?: number; created_at: string }>('ai_usage', { created_at: `gte.${monthStart}T00:00:00Z` }, { select: '*', limit: 20000 }).catch(() => []),
        select<{ user_id: string; date: string; sport: string; source: string; name: string | null; minutes: number; distance_km: number | null }>('activities', {}, { select: 'user_id,date,sport,source,name,minutes,distance_km', order: 'date.desc', limit: 400 }),
      ]);
      const today = todayIn('Europe/Bucharest');
      const cost = (rows: typeof usage) => Math.round(rows.reduce((s, r) => s + costUsd(r.input_tokens, r.output_tokens, r.cache_write_tokens ?? 0, r.cache_read_tokens ?? 0), 0) * 100) / 100;
      json(res, 200, {
        inviteUrl: `${ENV.appUrl()}/?invite=${await inviteCode(true)}`,
        costMonth: cost(usage),
        costToday: cost(usage.filter((r) => r.created_at.slice(0, 10) === today)),
        tracking: usage.length > 0,
        users: users.map((x) => {
          const last = logs.filter((l) => l.user_id === x.id);
          const byProvider = [...new Set(tokens.filter((t) => t.user_id === x.id).map((t) => t.provider))].map((p) => {
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
