// Token-urile OAuth ale fiecărui sportiv: citire cu reîmprospătare automată, scriere, state semnat pentru redirect.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ENV } from './env.js';
import { one, remove, select, upsert } from './db.js';
import { seal, unseal } from './secretbox.js';
import { refresh, type OAuthConfig, type TokenSet } from '../../src/collector/providers/oauth.js';
import { whoopConfig } from '../../src/collector/providers/whoop.js';
import { stravaConfig } from '../../src/collector/providers/strava.js';
import { ouraConfig } from '../../src/collector/providers/oura.js';

export type Provider = 'whoop' | 'strava' | 'oura';
export const PROVIDERS: Provider[] = ['whoop', 'strava', 'oura'];

export function providerConfig(p: Provider): OAuthConfig {
  const redirect = `${ENV.appUrl()}/api/oauth/${p}/callback`;
  switch (p) {
    case 'whoop':
      return whoopConfig({ WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID!, WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET!, WHOOP_REDIRECT_URI: redirect });
    case 'strava':
      return stravaConfig({ STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID!, STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET!, STRAVA_REDIRECT_URI: redirect });
    case 'oura':
      return ouraConfig({ OURA_CLIENT_ID: process.env.OURA_CLIENT_ID!, OURA_CLIENT_SECRET: process.env.OURA_CLIENT_SECRET!, OURA_REDIRECT_URI: redirect });
  }
}

export function providerConfigured(p: Provider): boolean {
  const k = { whoop: 'WHOOP_CLIENT_ID', strava: 'STRAVA_CLIENT_ID', oura: 'OURA_CLIENT_ID' }[p];
  return !!process.env[k];
}

interface TokenRow {
  user_id: string;
  provider: Provider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string | null;
  external_user_id: string | null;
  connected_at: string;
}

export async function saveTokens(userId: string, provider: Provider, t: TokenSet): Promise<void> {
  await upsert(
    'oauth_tokens',
    {
      user_id: userId,
      provider,
      access_token: seal(t.accessToken),
      refresh_token: seal(t.refreshToken ?? null),
      expires_at: new Date(t.expiresAt).toISOString(),
      scope: t.scope ?? null,
      external_user_id: t.externalUserId ?? null,
      updated_at: new Date().toISOString(),
    },
    'user_id,provider',
  );
}

/** Token valid pentru o cerere: reîmprospătat dacă expiră în sub 5 minute. null = neconectat. */
export async function accessToken(userId: string, provider: Provider): Promise<string | null> {
  const enc = await one<TokenRow>('oauth_tokens', { user_id: `eq.${userId}`, provider: `eq.${provider}` });
  if (!enc) return null;
  const row = openRow(enc);
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60_000) return row.access_token;
  if (!row.refresh_token) return row.access_token;
  let t;
  try {
    t = await refresh(providerConfig(provider), row.refresh_token);
  } catch (e) {
    // Oura și WHOOP: tokenul de reîmprospătare e de unică folosință. Dacă o altă sincronizare (cron, buton) l-a folosit
    // între timp, perechea nouă e deja salvată: o folosim, în loc să declarăm conexiunea pierdută.
    const againEnc = await one<TokenRow>('oauth_tokens', { user_id: `eq.${userId}`, provider: `eq.${provider}` });
    const again = againEnc ? openRow(againEnc) : null;
    if (again && again.refresh_token !== row.refresh_token && new Date(again.expires_at).getTime() - Date.now() > 60_000) return again.access_token;
    throw e;
  }
  await saveTokens(userId, provider, { ...t, refreshToken: t.refreshToken ?? row.refresh_token, externalUserId: t.externalUserId ?? row.external_user_id ?? undefined });
  return t.accessToken;
}

function openRow(r: TokenRow): TokenRow {
  return { ...r, access_token: unseal(r.access_token) ?? '', refresh_token: unseal(r.refresh_token) };
}

export async function connectedProviders(userId: string): Promise<TokenRow[]> {
  return select<TokenRow>('oauth_tokens', { user_id: `eq.${userId}` });
}

export async function disconnect(userId: string, provider: Provider): Promise<void> {
  await remove('oauth_tokens', { user_id: `eq.${userId}`, provider: `eq.${provider}` });
}

/** Un state semnat pentru OAuth: cine e sportivul și când a pornit; valabil 15 minute. Scurt și doar cu caractere sigure în URL. */
export function signState(userId: string): string {
  const payload = `${userId.replace(/-/g, '')}.${Date.now().toString(36)}`;
  const sig = createHmac('sha256', ENV.stateSecret()).update(payload).digest('base64url').slice(0, 22);
  return `${payload}.${sig}`;
}

export function verifyState(state: string): string {
  if (!state) throw new Error('conectarea nu a primit înapoi codul de siguranță (state); apasă din nou Conectează');
  const [id, ts, sig] = state.split('.');
  if (!id || !ts || !sig || id.length !== 32) throw new Error('codul de siguranță (state) primit înapoi e modificat; apasă din nou Conectează');
  const expected = createHmac('sha256', ENV.stateSecret()).update(`${id}.${ts}`).digest('base64url').slice(0, 22);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error('codul de siguranță (state) nu se potrivește; apasă din nou Conectează');
  if (Date.now() - parseInt(ts, 36) > 15 * 60_000) throw new Error('au trecut peste 15 minute de la Conectează; apasă din nou');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
