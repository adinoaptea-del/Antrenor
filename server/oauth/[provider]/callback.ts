import { ENV } from '../../_lib/env.js';
import { HttpError } from '../../_lib/auth.js';
import { q, redirect, type Req, type Res } from '../../_lib/http.js';
import { providerConfig, PROVIDERS, saveTokens, verifyState, type Provider } from '../../_lib/tokens.js';
import { exchangeCode } from '../../../src/collector/providers/oauth.js';
import { syncUser } from '../../_lib/sync.js';
import { whoopApi } from '../../../src/collector/providers/whoop.js';

/** GET /api/oauth/{provider}/callback?code=&state= → schimbă codul, salvează token-urile, trage 35 de zile, revine în Profil. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const provider = q(req, 'provider') as Provider;
    if (!PROVIDERS.includes(provider)) throw new HttpError(404, 'producător necunoscut');
    if (q(req, 'error')) {
      const raw = [q(req, 'error'), q(req, 'error_description')].filter(Boolean).join(': ');
      const text = q(req, 'error') === 'access_denied' ? 'autorizarea a fost anulată la producător (n-ai apăsat „Authorize”).' : friendlyOAuthError(provider, raw);
      redirect(res, `${ENV.appUrl()}/#profil?eroare=${encodeURIComponent(text)}`);
      return;
    }
    const userId = verifyState(q(req, 'state'));
    const tokens = await exchangeCode(providerConfig(provider), q(req, 'code'));
    // WHOOP nu trimite id-ul sportivului în răspunsul de token: îl cerem din profil, ca webhook-ul să găsească contul.
    if (provider === 'whoop' && !tokens.externalUserId) {
      const p = await whoopApi.profile(tokens.accessToken).catch(() => null);
      if (p?.user_id != null) tokens.externalUserId = String(p.user_id);
    }
    await saveTokens(userId, provider, tokens);
    await syncUser(userId, 35).catch(() => undefined); // prima citire: ultimele 5 săptămâni, pentru medii și ACWR
    redirect(res, `${ENV.appUrl()}/#profil?conectat=${provider}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('oauth callback', q(req, 'provider'), msg, 'parametri primiți:', Object.keys(req.query).join(','), 'url:', (req.url ?? '').split('?')[0]);
    redirect(res, `${ENV.appUrl()}/#profil?eroare=${encodeURIComponent(friendlyOAuthError(q(req, 'provider') as Provider, msg))}`);
  }
}

/**
 * Mesajul pentru sportiv (nu JSON-ul brut al producătorului). La Strava, cel mai des motiv pentru un prieten: aplicația
 * Strava a lui AIRON e la capacitatea de sportivi („Single Player Mode” = doar dezvoltatorul; apoi 10; peste 10 cere
 * review) — asta se rezolvă doar de administrator, din strava.com/settings/api, nu de sportiv.
 */
export function friendlyOAuthError(provider: Provider, raw: string): string {
  const code = /token (\d{3})/.exec(raw)?.[1];
  const short = raw.replace(/\s+/g, ' ').slice(0, 140);
  if (provider === 'strava' && (code === '400' || code === '401' || code === '403' || /invalid|unauthorized|forbidden|capacity|athlete/i.test(raw))) {
    return `Strava a refuzat conectarea (${code ? `cod ${code}` : short}). De obicei aplicația Strava a lui AIRON e la limita de sportivi conectați (Strava pornește cu 1, apoi 10) — spune-i administratorului să ridice capacitatea din strava.com/settings/api, apoi încearcă din nou.`;
  }
  return short;
}
