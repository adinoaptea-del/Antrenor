// Costul rulărilor AI cerute din aplicație (auditul consolidat 22.10.2026, B3).
// 1. Versiunea contextului: amprenta a ce primește modelul (pachetul fără ora exactă, jurnalul, evenimentul, modelele).
//    O cerere manuală pe același context ca ultimul mesaj al zilei nu mai cheamă modelul: mesajul existent rămâne valabil.
// 2. Plafon pe server: cel mult AI_MANUAL_PER_DAY rulări manuale pe sportiv și zi (implicit 6), indiferent de client.
// Rulările programate (cronurile) nu intră în plafon; siguranța (stop, febră, durere) e calculată în cod, nu de AI,
// deci plafonul nu o atinge.
import { createHash } from 'node:crypto';
import { insertIgnore, one, select } from './db.js';

/** Câmpuri care se schimbă fără să schimbe situația (ora exactă a cererii). `moment_zi` rămâne: dimineață ≠ seară. */
const VOLATILE = new Set(['ora_locala']);

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => !VOLATILE.has(k) && o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export function contextHash(parts: { packet: unknown; journal: string[]; event: string; models: unknown; files?: unknown }): string {
  return createHash('sha256').update(stableStringify(parts)).digest('hex').slice(0, 32);
}

export type ManualDecision = { run: true } | { run: false; reason: 'acelasi_context' | 'plafon'; message: string };

/** Pur: ce face o cerere manuală. Același context → reutilizare (nu consumă din plafon); plafon atins → refuz. */
export function manualDecision(i: { used: number; cap: number; sameContextAsLastMessage: boolean }): ManualDecision {
  if (i.sameContextAsLastMessage) return { run: false, reason: 'acelasi_context', message: 'nimic nou: mesajul de azi e scris pe exact aceleași date' };
  if (i.used >= i.cap) return { run: false, reason: 'plafon', message: `ai cerut azi ${i.used} actualizări ale antrenorului (limita zilei e ${i.cap}); mesajul de acum rămâne valabil, iar dimineața și seara vin automat` };
  return { run: true };
}

export function manualCap(): number {
  const n = Number(process.env.AI_MANUAL_PER_DAY ?? '6');
  return Number.isInteger(n) && n >= 1 ? n : 6;
}

/** Rulările manuale de azi (cheile `manual:<zi>:…` din agent_events). */
export async function manualRunsToday(userId: string, today: string): Promise<number> {
  try {
    return (await select('agent_events', { user_id: `eq.${userId}`, event_key: `like.manual:${today}:*` }, { select: 'event_key', limit: 100 })).length;
  } catch {
    return 0;
  }
}

export async function recordManualRun(userId: string, today: string, event: string): Promise<void> {
  await insertIgnore('agent_events', { user_id: userId, event_key: `manual:${today}:${event}:${Date.now().toString(36)}` }, 'user_id,event_key').catch(() => undefined);
}

/** Ultimul mesaj al evenimentului azi a fost scris pe același context? (null/false pe schemă fără context_hash) */
export async function sameContextAsLastMessage(userId: string, event: string, dayStartIso: string, hash: string): Promise<boolean> {
  try {
    const msg = await one<{ packet_id: string | null }>('messages', { user_id: `eq.${userId}`, kind: `eq.${event}`, created_at: `gte.${dayStartIso}` }, { order: 'created_at.desc' });
    if (!msg?.packet_id) return false;
    const p = await one<{ context_hash: string | null }>('packets', { id: `eq.${msg.packet_id}`, user_id: `eq.${userId}` }, { select: 'context_hash' });
    return !!p?.context_hash && p.context_hash === hash;
  } catch {
    return false;
  }
}

/** Rularea manuală nu se face: rulatorul o semnalează așa, iar ruta o întoarce ca „skipped”. */
export class AiSkip extends Error {}
