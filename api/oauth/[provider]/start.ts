import { fail, json, requireUser, HttpError } from '../../_lib/auth.js';
import { q, type Req, type Res } from '../../_lib/http.js';
import { providerConfig, providerConfigured, PROVIDERS, signState, type Provider } from '../../_lib/tokens.js';
import { authorizeUrl } from '../../../src/collector/providers/oauth.js';

/** GET /api/oauth/{whoop|strava|oura}/start → { url }: aplicația navighează acolo; producătorul trimite înapoi la callback. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const u = await requireUser(req);
    const provider = q(req, 'provider') as Provider;
    if (!PROVIDERS.includes(provider)) throw new HttpError(404, 'producător necunoscut');
    if (!providerConfigured(provider)) throw new HttpError(503, `${provider} nu e configurat pe server (lipsesc cheile aplicației)`);
    json(res, 200, { url: authorizeUrl(providerConfig(provider), signState(u.id)) });
  } catch (e) {
    fail(res, e);
  }
}
