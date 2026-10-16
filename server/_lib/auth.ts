// Cine cheamă: sportivul (JWT-ul lui Supabase din aplicație) sau cron-ul Vercel (CRON_SECRET).
import type { IncomingMessage } from 'node:http';
import { ENV } from './env.js';

export interface AuthUser {
  id: string;
  email: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h || !h.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim();
}

/** Verifică token-ul la Supabase Auth (GET /auth/v1/user). Fără cache: o cerere HTTP pe apel, destul pentru un pilot. */
export async function requireUser(req: IncomingMessage): Promise<AuthUser> {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'fără token');
  const res = await fetch(`${ENV.supabaseUrl()}/auth/v1/user`, { headers: { apikey: ENV.supabaseAnon(), authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, 'token invalid sau expirat');
  const u = (await res.json()) as { id: string; email: string };
  return { id: u.id, email: u.email };
}

export function requireCron(req: IncomingMessage): void {
  const token = bearer(req);
  if (!token || token !== ENV.cronSecret()) throw new HttpError(401, 'cron neautorizat');
}

/** Ziua curentă în fusul sportivului (YYYY-MM-DD). */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function json(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }, e: unknown): void {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  json(res, status, { error: message });
}

export async function readJson<T>(req: IncomingMessage & { body?: unknown }): Promise<T> {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return req.body as T;
  if (typeof req.body === 'string') return JSON.parse(req.body) as T;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  const text = Buffer.concat(chunks).toString('utf8');
  return (text ? JSON.parse(text) : {}) as T;
}
