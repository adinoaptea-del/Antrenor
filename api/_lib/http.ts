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
