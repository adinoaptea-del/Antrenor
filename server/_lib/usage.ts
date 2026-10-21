// Consumul AI real: fiecare apel la Anthropic își salvează tokenii; costul se calculează la afișare.
import { insert } from './db.js';

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * ESTIMARE, nu factură: tariful pe milion de tokeni, pe model (verificat 21.10.2026, tarifele publicate de Anthropic):
 * Sonnet 5.5 = 2 $ intrare / 10 $ ieșire; Opus 5.5 = 4 $ / 20 $. Cache: scrierea 1,25 × intrarea, citirea 0,1 × intrarea
 * (multiplicatorii standard Anthropic). Model necunoscut = tariful Opus (estimare pesimistă, nu subestimăm). Factura
 * exactă e în consola Anthropic.
 */
export const PRICE_VERSION = 'per-model@2026-10-21';
const PRICES: Record<string, [number, number]> = {
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
export function priceOf(model: string | null | undefined): [number, number] {
  return (model && PRICES[model]) || (model && /sonnet/.test(model) ? PRICES['claude-sonnet-5-5']! : PRICES['claude-opus-5-5']!);
}
export function costUsd(input: number, output: number, cacheWrite = 0, cacheRead = 0, model: string | null = 'claude-sonnet-5-5'): number {
  const [pin, pout] = priceOf(model);
  return (input * pin + cacheWrite * pin * 1.25 + cacheRead * pin * 0.1 + output * pout) / 1_000_000;
}

export async function recordUsage(userId: string | null, kind: string, model: string, u: Usage | undefined): Promise<void> {
  if (!u) return;
  const row = { user_id: userId, kind, model, input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0, cache_read_tokens: u.cache_read_input_tokens ?? 0 };
  await insert('ai_usage', row).catch(async () => {
    // Schemă fără coloanele de cache: intrarea totală într-un singur câmp (estimare mai pesimistă), ca nimic să nu se piardă.
    await insert('ai_usage', { user_id: userId, kind, model, input_tokens: row.input_tokens + row.cache_write_tokens + row.cache_read_tokens, output_tokens: row.output_tokens }).catch((e) => console.error('ai_usage', e instanceof Error ? e.message : e));
  });
}
