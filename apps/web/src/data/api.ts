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

/**
 * O singură reînnoire odată (tokenul de reînnoire se schimbă la fiecare folosire: două cereri simultane ar invalida
 * sesiunea). Ieșirea din cont doar când Supabase spune clar că sesiunea nu mai e validă (400/401/403); fără semnal
 * sau cu serverul căzut, sesiunea rămâne și aplicația arată ultimele date.
 */
let refreshing: Promise<Session | null> | null = null;
async function refreshSession(s: Session): Promise<Session | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { ...keyHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      }, 15_000);
    } catch {
      throw new ApiError(0, 'fără semnal');
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      writeSession(null);
      return null;
    }
    if (!res.ok) throw new ApiError(res.status, `nu am putut reînnoi sesiunea (${res.status})`);
    const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } };
    const next: Session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + j.expires_in, user: j.user };
    writeSession(next);
    return next;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Eroare de rețea (fără semnal, timeout, server de negăsit), nu un refuz al serverului. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504;
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /load failed|failed to fetch|network|nu a răspuns|serverul nu răspunde/i.test(msg);
}

/** Ultimul `Me` primit, ca aplicația să se deschidă și fără semnal (doar citire). */
const ME_CACHE = 'airon-me-cache';
export function saveMeCache(me: Me): void {
  try {
    localStorage.setItem(ME_CACHE, JSON.stringify({ at: new Date().toISOString(), userId: me.user.id, me }));
  } catch {
    /* fără loc sau fără stocare: merge și fără */
  }
}
export function readMeCache(): { at: string; me: Me } | null {
  try {
    const raw = localStorage.getItem(ME_CACHE);
    if (!raw) return null;
    const c = JSON.parse(raw) as { at: string; userId: string; me: Me };
    if (memorySession && c.userId !== memorySession.user.id) return null;
    return { at: c.at, me: c.me };
  } catch {
    return null;
  }
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
  // Linkul de invitație (…/?invite=cod) se păstrează pe telefon până la crearea contului.
  let invite = new URLSearchParams(location.search).get('invite') ?? '';
  try {
    if (invite) localStorage.setItem('airon-invite', invite);
    else invite = localStorage.getItem('airon-invite') ?? '';
  } catch {
    /* fără stocare: rămâne cel din adresă */
  }
  const res = await fetch('/api/account/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, invite }) });
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
  runAgents: (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal', force = true) => api<{ decision?: string; message?: string; memento?: string; changes?: string[]; skipped?: string }>('/api/agents/run', { method: 'POST', body: JSON.stringify({ event, force }) }),
  adminList: () => api<{ users: AdminUser[]; costMonth?: number; costToday?: number; tracking?: boolean; inviteUrl?: string }>('/api/admin'),
  newInvite: () => api<{ ok: boolean; inviteUrl: string }>('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'invitatie' }) }),
  adminAction: (action: 'sync' | 'plan' | 'parola' | 'detalii', userId: string) => api<{ ok: boolean; text: string }>('/api/admin', { method: 'POST', body: JSON.stringify({ action, userId }) }),
  regeneratePlan: (preview = false) =>
    api<{ ok: boolean; reason?: string; budgetHours: number; weeks?: number; preview?: boolean; currentBudgetHours?: number | null; from?: string; firstWeekHours?: number; firstWeekSessions?: number; workouts?: number }>(
      `/api/plan/generate${preview ? '?preview=1' : ''}`,
      { method: 'POST' },
    ),
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
  costMonth?: number;
  recent?: { date: string; sport: string; source: string; name: string | null; minutes: number; km: number | null }[];
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
