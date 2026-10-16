import { ENV } from '../../_lib/env.js';
import { fail, HttpError } from '../../_lib/auth.js';
import { q, redirect, type Req, type Res } from '../../_lib/http.js';
import { providerConfig, PROVIDERS, saveTokens, verifyState, type Provider } from '../../_lib/tokens.js';
import { exchangeCode } from '../../../src/collector/providers/oauth.js';
import { syncUser } from '../../_lib/sync.js';

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
    await saveTokens(userId, provider, tokens);
    await syncUser(userId, 35).catch(() => undefined); // prima citire: ultimele 5 săptămâni, pentru medii și ACWR
    redirect(res, `${ENV.appUrl()}/#profil?conectat=${provider}`);
  } catch (e) {
    fail(res, e);
  }
}
