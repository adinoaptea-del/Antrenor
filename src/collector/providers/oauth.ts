// OAuth 2.0 comun: construirea URL-ului de autorizare, schimbul codului și reîmprospătarea.
// Secretele stau pe server (Supabase Edge Function / Vercel), niciodată în PWA.

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  /** Doar la reîmprospătare: al doilea endpoint, dacă primul refuză (Oura: aplicațiile din portalul vechi). */
  refreshFallbackUrl?: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  /** Separatorul cerut de producător între scope-uri: spațiu (Whoop, Oura) sau virgulă (Strava). */
  scopeSeparator?: string;
  extraAuthorizeParams?: Record<string, string>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms la care expiră accessToken. */
  expiresAt: number;
  scope?: string;
  /** Identificatorul sportivului la producător, dacă vine în răspuns (Strava: athlete.id). */
  externalUserId?: string;
}

export function authorizeUrl(cfg: OAuthConfig, state: string): string {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', cfg.scopes.join(cfg.scopeSeparator ?? ' '));
  u.searchParams.set('state', state);
  for (const [k, v] of Object.entries(cfg.extraAuthorizeParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

async function tokenRequest(cfg: OAuthConfig, body: Record<string, string>, url = cfg.tokenUrl): Promise<TokenSet> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }).toString(),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; expires_at?: number; scope?: string; athlete?: { id: number } };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in ?? 3600) * 1000,
    scope: j.scope,
    externalUserId: j.athlete ? String(j.athlete.id) : undefined,
  };
}

export function exchangeCode(cfg: OAuthConfig, code: string): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
}

/** Reîmprospătarea înlocuiește ambele token-uri (Whoop): salvează perechea nouă și nu rula două refresh-uri în paralel. */
export async function refresh(cfg: OAuthConfig, refreshToken: string, extra: Record<string, string> = {}): Promise<TokenSet> {
  const body = { grant_type: 'refresh_token', refresh_token: refreshToken, ...extra };
  try {
    return await tokenRequest(cfg, body);
  } catch (e) {
    // Un refuz (4xx) nu consumă tokenul de reîmprospătare: încercăm o dată și endpointul vechi, dacă există.
    if (!cfg.refreshFallbackUrl) throw e;
    return tokenRequest(cfg, body, cfg.refreshFallbackUrl);
  }
}

export async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 429) throw new Error('rate limit (429): reîncearcă după fereastra producătorului');
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Ora locală HH:MM dintr-un timestamp ISO și offsetul „+03:00”. */
export function localHm(iso: string, tzOffset: string): string {
  const sign = tzOffset.startsWith('-') ? -1 : 1;
  const [h, m] = tzOffset.slice(1).split(':').map(Number);
  const t = new Date(iso).getTime() + sign * ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function localDate(iso: string, tzOffset: string): string {
  const sign = tzOffset.startsWith('-') ? -1 : 1;
  const [h, m] = tzOffset.slice(1).split(':').map(Number);
  const t = new Date(iso).getTime() + sign * ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
  return new Date(t).toISOString().slice(0, 10);
}
