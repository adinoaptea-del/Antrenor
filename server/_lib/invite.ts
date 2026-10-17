// Codul de invitație al grupului: îl vede doar adminul (ecranul Prieteni), ca link. Se poate schimba oricând.
import { randomBytes } from 'node:crypto';
import { select, upsert } from './db.js';

export async function inviteCode(create = false): Promise<string | null> {
  const rows = await select<{ value: string }>('app_settings', { key: 'eq.INVITE_CODE' }, { select: 'value', limit: 1 }).catch(() => []);
  if (rows[0]?.value) return rows[0].value;
  if (!create) return null;
  return rotateInvite();
}

export async function rotateInvite(): Promise<string> {
  const code = randomBytes(12).toString('base64url');
  await upsert('app_settings', { key: 'INVITE_CODE', value: code, updated_at: new Date().toISOString() }, 'key');
  return code;
}
