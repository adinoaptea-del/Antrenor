// Tipurile minime ale funcțiilor Vercel (Node), fără dependență de @vercel/node.
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Req = IncomingMessage & { query: Record<string, string | string[] | undefined>; body?: unknown };
export type Res = ServerResponse;

export function q(req: Req, name: string): string {
  const v = req.query[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export function redirect(res: Res, to: string): void {
  res.statusCode = 302;
  res.setHeader('location', to);
  res.end();
}

/**
 * Auditul v93, A94: tokenul personal al webhook-ului (Apple / Android) poate veni în antet (`x-airon-token` sau
 * `Authorization: Bearer …`), ca să nu apară în jurnalele de acces; `?t=` rămâne pentru exporturile deja configurate.
 */
export function webhookToken(req: Req): string {
  const h = req.headers['x-airon-token'];
  const fromHeader = (Array.isArray(h) ? h[0] : h) ?? '';
  const auth = String(req.headers.authorization ?? '');
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? '';
  return (fromHeader || bearer || q(req, 't')).trim();
}
