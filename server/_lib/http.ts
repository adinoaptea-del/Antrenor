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

/**
 * Lucru care continuă după răspuns (auditul consolidat, C1: webhook-ul confirmă primirea imediat). Pe Vercel,
 * `waitUntil` vine din contextul cererii (același simbol pe care îl citește @vercel/functions); fără el, promisiunea
 * rulează cât trăiește instanța, iar ce nu apucă se reia din coadă la cronul de 15 minute.
 */
export function afterResponse(p: Promise<unknown>): void {
  const safe = p.catch((e: unknown) => console.error('după răspuns', e instanceof Error ? e.message : String(e)));
  try {
    const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined>)[Symbol.for('@vercel/request-context')]?.get?.();
    ctx?.waitUntil?.(safe);
  } catch {
    /* fără context Vercel */
  }
}

/** Valoarea unui cookie din cerere, sau null. */
export function readCookie(req: Req, name: string): string | null {
  const raw = String(req.headers.cookie ?? '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Cookie-ul nonce-ului OAuth (C4): HttpOnly (scriptul paginii nu-l citește), Secure, SameSite=Lax (se trimite la
 * întoarcerea de la producător, care e o navigare de nivel superior), doar pe /api/oauth, 15 minute. maxAge 0 = șters.
 */
export function oauthCookie(name: string, value: string, maxAgeSec: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
