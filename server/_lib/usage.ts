// Consumul AI real: fiecare apel la Anthropic își salvează tokenii; costul se calculează la afișare.
import { insert } from './db.js';

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * ESTIMARE, nu factură: tariful Sonnet 5.5 pe milion de tokeni (2 $ intrare, 10 $ ieșire, verificat 16.10.2026;
 * versiunea tarifului: 2026-10-16). Cache: scrierea 1,25 × intrarea, citirea 0,1 × intrarea (multiplicatorii standard
 * Anthropic). Dacă modelul din configurație se schimbă, tariful trebuie actualizat aici; factura exactă e în consola Anthropic.
 */
export const PRICE_VERSION = 'sonnet-5.5@2026-10-16';
const PRICE_IN = 2;
const PRICE_OUT = 10;
export function costUsd(input: number, output: number, cacheWrite = 0, cacheRead = 0): number {
  return (input * PRICE_IN + cacheWrite * PRICE_IN * 1.25 + cacheRead * PRICE_IN * 0.1 + output * PRICE_OUT) / 1_000_000;
}

export async function recordUsage(userId: string | null, kind: string, model: string, u: Usage | undefined): Promise<void> {
  if (!u) return;
  const row = { user_id: userId, kind, model, input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0, cache_read_tokens: u.cache_read_input_tokens ?? 0 };
  await insert('ai_usage', row).catch(async () => {
    // Schemă fără coloanele de cache: intrarea totală într-un singur câmp (estimare mai pesimistă), ca nimic să nu se piardă.
    await insert('ai_usage', { user_id: userId, kind, model, input_tokens: row.input_tokens + row.cache_write_tokens + row.cache_read_tokens, output_tokens: row.output_tokens }).catch((e) => console.error('ai_usage', e instanceof Error ? e.message : e));
  });
}
