// Consumul AI real: fiecare apel la Anthropic își salvează tokenii; costul se calculează la afișare.
import { insert } from './db.js';

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Prețul Sonnet 5.5 (modelul folosit), pe milion de tokeni: 2 $ intrare, 10 $ ieșire (verificat 16.10.2026). */
const PRICE_IN = 2;
const PRICE_OUT = 10;
export function costUsd(input: number, output: number): number {
  return (input * PRICE_IN + output * PRICE_OUT) / 1_000_000;
}

export async function recordUsage(userId: string | null, kind: string, model: string, u: Usage | undefined): Promise<void> {
  if (!u) return;
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  await insert('ai_usage', { user_id: userId, kind, model, input_tokens: input, output_tokens: u.output_tokens ?? 0 }).catch(() => undefined); // tabel lipsă = schemă veche: nu oprește nimic
}
