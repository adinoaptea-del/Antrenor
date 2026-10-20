// Auditul v93, A94: tokenurile OAuth se păstrează criptate (AES-256-GCM) când există cheia TOKEN_ENC_KEY (32 de octeți,
// base64, doar în variabilele Vercel). Fără cheie, scrierea rămâne ca înainte (în clar) — se semnalează în Admin.
// Citirea acceptă ambele forme, deci activarea cheii nu strică conexiunile existente (se criptează la următoarea scriere).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer | null {
  const k = process.env.TOKEN_ENC_KEY;
  if (!k) return null;
  const b = Buffer.from(k, 'base64');
  return b.length === 32 ? b : null;
}

export function encryptionEnabled(): boolean {
  return key() != null;
}

export function seal(text: string | null): string | null {
  const k = key();
  if (text == null || !k || text.startsWith(PREFIX)) return text;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return `${PREFIX}${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')}`;
}

export function unseal(text: string | null): string | null {
  if (text == null || !text.startsWith(PREFIX)) return text;
  const k = key();
  if (!k) throw new Error('token criptat, dar cheia TOKEN_ENC_KEY lipsește');
  const raw = Buffer.from(text.slice(PREFIX.length), 'base64url');
  const d = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
