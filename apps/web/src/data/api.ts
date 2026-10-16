// Serverul: autentificare Supabase (link pe e-mail) și apelurile către /api/*. Fără SDK: doar fetch.
// Configurare din variabilele Vite: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Lipsesc → aplicația arată ecranul de configurare.

import type { Me } from '@core/api-types.js';

export const CONFIG = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  local: (import.meta.env.VITE_LOCAL as string | undefined) === '1',
};

export const configured = () => !!CONFIG.supabaseUrl && !!CONFIG.anonKey;

/** Ce spune serverul despre el însuși (GET /api/config): fără secrete. */
export interface ServerConfig {
  configured: boolean;
  reason?: string;
  supabaseUrl?: string;
  publishableKey?: string;
  ready?: boolean;
  /** Schema bazei e mai veche decât codul: aplicația rulează singură actualizarea (idempotentă). */
  upgrade?: boolean;
  signupOpen?: boolean;
  firstUser?: boolean;
  agents?: boolean;
  providers?: Record<'whoop' | 'strava' | 'oura', boolean>;
}

export let SERVER: ServerConfig | null = null;

/** Cheile Supabase vin de la server la pornire, nu din build: un singur deploy, fără variabile VITE_. */
/** Etapa pornirii, afișată pe ecranul de încărcare ca să știm unde s-a oprit. */
export let BOOT_STAGE = 'pornesc';
export function setBootStage(s: string): void {
  BOOT_STAGE = s;
}

/** Nicio cerere nu atârnă la nesfârșit: după timeout apare o eroare cu „Încearcă din nou”. */
export async function fetchWithTimeout(input: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new ApiError(0, `serverul nu a răspuns în ${Math.round(ms / 1000)} s (${input.split('?')[0]})`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function loadServerConfig(): Promise<ServerConfig> {
  const res = await fetchWithTimeout('/api/config', { headers: { accept: 'application/json' } }, 20_000);
  if (!res.ok) throw new Error(`serverul nu răspunde (${res.status})`);
  const c = (await res.json()) as ServerConfig;
  SERVER = c;
  if (c.supabaseUrl && c.publishableKey) {
    CONFIG.supabaseUrl = c.supabaseUrl;
    CONFIG.anonKey = c.publishableKey;
  }
  return c;
}

/** Cheia publică merge în `apikey` (atât cheile noi sb_publishable_…, cât și cele vechi JWT). */
const keyHeaders = (): Record<string, string> => ({ apikey: CONFIG.anonKey });

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch s
  user: { id: string; email: string };
}

const SESSION_KEY = 'antrenor.session.v1';

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* fără storage: sesiunea trăiește doar în pagină */
  }
  memorySession = s;
}

let memorySession: Session | null = readSession();

/** Linkul din e-mail revine cu #access_token=…&refresh_token=…: le luăm din URL și curățăm adresa. */
export function captureSessionFromUrl(): boolean {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!hash.includes('access_token=')) return false;
  const p = new URLSearchParams(hash);
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  const expiresIn = Number(p.get('expires_in') ?? 3600);
  if (!access || !refresh) return false;
  const payload = JSON.parse(atob(access.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { sub: string; email: string };
  writeSession({ access_token: access, refresh_token: refresh, expires_at: Math.floor(Date.now() / 1000) + expiresIn, user: { id: payload.sub, email: payload.email } });
  try {
    history.replaceState(null, '', location.pathname + '#acasa');
  } catch {
    /* ignorăm */
  }
  return true;
}

async function refreshSession(s: Session): Promise<Session | null> {
  const res = await fetchWithTimeout(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { ...keyHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  }, 15_000);
  if (!res.ok) {
    writeSession(null);
    return null;
  }
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } };
  const next: Session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + j.expires_in, user: j.user };
  writeSession(next);
  return next;
}

export async function getSession(): Promise<Session | null> {
  const s = memorySession;
  if (!s) return null;
  if (s.expires_at - Math.floor(Date.now() / 1000) > 60) return s;
  return refreshSession(s);
}

function saveTokenResponse(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }): void {
  writeSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + j.expires_in, user: { id: j.user.id, email: j.user.email } });
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { ...keyHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (res.status === 400) throw new Error('e-mail sau parolă greșită');
  if (!res.ok) throw new Error(`nu am putut intra (${res.status})`);
  saveTokenResponse(await res.json());
}

/** Contul se creează pe serverul nostru (deja confirmat), apoi intrăm cu parola. */
export async function signUp(email: string, password: string): Promise<void> {
  const res = await fetch('/api/account/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error ?? `nu am putut crea contul (${res.status})`);
  await signInWithPassword(email, password);
}

export async function runSetup(): Promise<{ ok: boolean; steps: { step: string; ok: boolean; detail?: string }[] }> {
  const s = await getSession().catch(() => null);
  const res = await fetch('/api/setup', { method: 'POST', headers: s ? { authorization: `Bearer ${s.access_token}` } : {} });
  const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean; steps?: { step: string; ok: boolean; detail?: string }[] };
  if (!res.ok) throw new Error(j.error ?? `eroare ${res.status}`);
  return { ok: !!j.ok, steps: j.steps ?? [] };
}

export async function signOut(): Promise<void> {
  const s = memorySession;
  writeSession(null);
  if (s) await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { ...keyHeaders(), authorization: `Bearer ${s.access_token}` } }).catch(() => undefined);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await getSession();
  if (!s) throw new ApiError(401, 'neautentificat');
  const res = await fetchWithTimeout(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}`, ...(init.headers ?? {}) } }, path.includes('-citire') || path.includes('/agents/') ? 280_000 : 30_000);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new ApiError(res.status, `serverul a răspuns ciudat (${res.status}): ${text.slice(0, 80)}`);
  }
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `eroare ${res.status}`);
  // Răspunsurile lungi (agenții) vin cu 200 de la început; o eroare apare atunci în corp.
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' && Object.keys(body).length === 1) throw new ApiError(500, (body as { error: string }).error);
  return body as T;
}

export const server = {
  me: () => api<Me>('/api/me'),
  sync: () => api<{ lastSync: string; reports: { provider: string; ok: boolean; rows: number; detail: string | null }[] }>('/api/sync', { method: 'POST' }),
  form: (kind: string, body: unknown) => api<{ ok: boolean; plan?: unknown; agents?: unknown }>(`/api/forms/${kind}`, { method: 'POST', body: JSON.stringify(body) }),
  oauthStart: (provider: 'whoop' | 'strava' | 'oura') => api<{ url: string }>(`/api/oauth/${provider}/start`),
  runAgents: (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal') => api<{ decision?: string; message?: string; memento?: string; changes?: string[]; skipped?: string }>('/api/agents/run', { method: 'POST', body: JSON.stringify({ event, force: true }) }),
  adminList: () => api<{ users: AdminUser[] }>('/api/admin'),
  adminAction: (action: 'sync' | 'plan' | 'parola', userId: string) => api<{ ok: boolean; text: string }>('/api/admin', { method: 'POST', body: JSON.stringify({ action, userId }) }),
  regeneratePlan: () => api<{ ok: boolean; reason?: string; budgetHours: number; weeks?: number }>('/api/plan/generate', { method: 'POST' }),
};

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  since: string;
  intake: boolean;
  planStart: string | null;
  devices: { provider: string; lastSync: string | null; ok: boolean | null; detail: string | null }[];
  lastMessage: string | null;
}

/** Repornire curată: șterge cache-ul aplicației (nu datele) și reîncarcă. Prima reparație pentru orice blocaj. */
export async function hardReload(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* fără service worker / cache: doar reîncărcăm */
  }
  location.reload();
}
