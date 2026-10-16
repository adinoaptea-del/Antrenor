// Serverul: autentificare Supabase (link pe e-mail) și apelurile către /api/*. Fără SDK: doar fetch.
// Configurare din variabilele Vite: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Lipsesc → aplicația arată ecranul de configurare.

import type { Me } from '@core/api-types.js';

export const CONFIG = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  demo: (import.meta.env.VITE_DEMO as string | undefined) === '1',
};

export const configured = () => !!CONFIG.supabaseUrl && !!CONFIG.anonKey;

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
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: CONFIG.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
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

export async function signInWithEmail(email: string): Promise<void> {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: CONFIG.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, create_user: true, options: { email_redirect_to: location.origin } }),
  });
  if (!res.ok) throw new Error(`nu am putut trimite linkul (${res.status})`);
}

export async function signOut(): Promise<void> {
  const s = memorySession;
  writeSession(null);
  if (s) await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { apikey: CONFIG.anonKey, authorization: `Bearer ${s.access_token}` } }).catch(() => undefined);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await getSession();
  if (!s) throw new ApiError(401, 'neautentificat');
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `eroare ${res.status}`);
  return body as T;
}

export const server = {
  me: () => api<Me>('/api/me'),
  sync: () => api<{ lastSync: string; reports: { provider: string; ok: boolean; rows: number; detail: string | null }[] }>('/api/sync', { method: 'POST' }),
  form: (kind: 'intrare' | 'dimineata' | 'seara' | 'saptamanal', body: unknown) => api<{ ok: boolean; plan?: unknown; agents?: unknown }>(`/api/forms/${kind}`, { method: 'POST', body: JSON.stringify(body) }),
  oauthStart: (provider: 'whoop' | 'strava' | 'oura') => api<{ url: string }>(`/api/oauth/${provider}/start`),
  runAgents: (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal') => api<{ decision?: string; message?: string; memento?: string; changes?: string[]; skipped?: string }>('/api/agents/run', { method: 'POST', body: JSON.stringify({ event, force: true }) }),
  regeneratePlan: () => api<{ ok: boolean; reason?: string; budgetHours: number; weeks?: number }>('/api/plan/generate', { method: 'POST' }),
};
