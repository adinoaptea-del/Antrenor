// O singură funcție Vercel pentru tot /api (planul gratuit permite maximum 12 funcții).
// vercel.json rescrie /api/<cale> → /api/router?__p=<cale>; aici alegem handler-ul și punem parametrii în req.query.
import { fail, HttpError } from './_lib/auth.js';
import { hydrateSettings } from './_lib/settings.js';
import type { Req, Res } from './_lib/http.js';
import account_signup from './account/signup.js';
import account_password from './account/password.js';
import agents_run from './agents/run.js';
import config from './config.js';
import cron_evening from './cron/evening.js';
import cron_morning from './cron/morning.js';
import cron_sync from './cron/sync.js';
import forms from './forms/[kind].js';
import me from './me.js';
import oauth_callback from './oauth/[provider]/callback.js';
import oauth_start from './oauth/[provider]/start.js';
import plan_generate from './plan/generate.js';
import setup from './setup.js';
import admin from './admin.js';
import sync from './sync.js';
import track from './track.js';
import webhooks_strava from './webhooks/strava.js';
import webhooks_whoop from './webhooks/whoop.js';
import webhooks_apple from './webhooks/apple.js';
import webhooks_android from './webhooks/android.js';

type Handler = (req: Req, res: Res) => Promise<void>;

const STATIC: Record<string, Handler> = {
  'account/signup': account_signup,
  'account/password': account_password,
  'agents/run': agents_run,
  config,
  'cron/evening': cron_evening,
  'cron/morning': cron_morning,
  'cron/sync': cron_sync,
  me,
  'plan/generate': plan_generate,
  setup,
  admin,
  sync,
  track,
  'webhooks/strava': webhooks_strava,
  'webhooks/whoop': webhooks_whoop,
  'webhooks/apple': webhooks_apple,
  'webhooks/android': webhooks_android,
};

export function resolve(path: string): { handler: Handler; params: Record<string, string> } | null {
  const p = path.replace(/^\/+|\/+$/g, '').replace(/^api\//, '');
  if (STATIC[p]) return { handler: STATIC[p]!, params: {} };
  let m = /^forms\/([^/]+)$/.exec(p);
  if (m) return { handler: forms, params: { kind: m[1]! } };
  m = /^oauth\/([^/]+)\/(start|callback)$/.exec(p);
  if (m) return { handler: m[2] === 'start' ? oauth_start : oauth_callback, params: { provider: m[1]! } };
  return null;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const raw = req.query.__p;
  const fromQuery = Array.isArray(raw) ? raw.join('/') : raw;
  const path = fromQuery ?? new URL(req.url ?? '/', 'http://x').pathname;
  const r = resolve(path);
  if (!r) {
    fail(res, new HttpError(404, `nu există /api/${path}`));
    return;
  }
  await hydrateSettings();
  // Parametrii originali pot ajunge doar în req.url după rescriere: îi luăm și de acolo.
  const fromUrl: Record<string, string> = {};
  try {
    new URL(req.url ?? '/', 'http://x').searchParams.forEach((v, k) => {
      if (k !== '__p') fromUrl[k] = v;
    });
  } catch {
    /* url neparsabil */
  }
  const { __p: _drop, ...rest } = req.query;
  req.query = { ...fromUrl, ...rest, ...r.params };
  await r.handler(req, res);
}
