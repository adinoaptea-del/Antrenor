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
      redirect(res, `${ENV.appUrl()}/#profil?eroare=${encodeURIComponent(q(req, 'error'))}`);
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
    redirect(res, `${ENV.appUrl()}/#profil?eroare=${encodeURIComponent(msg)}`);
  }
}
