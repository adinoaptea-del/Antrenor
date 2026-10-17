// Bugetul de ore pe săptămână din programul real al sportivului.
// Regula din protocol: suma blocurilor libere de minimum 45 min × 0,8 (nimeni nu folosește tot timpul liber).

import type { FreeBlock } from '../types.js';

export const MIN_BLOCK_MIN = 45;
export const REALITY_FACTOR = 0.8;

export interface Budget {
  hours: number;
  blocks: FreeBlock[];
}

/** Blocurile valide (zi 0–6, minute 0–1440), cu suprapunerile din aceeași zi unite (10–11 + 10:30–11:30 = 10–11:30). */
export function normalizeBlocks(blocks: FreeBlock[]): FreeBlock[] {
  const valid = blocks
    .filter((b) => Number.isInteger(b.day) && b.day >= 0 && b.day <= 6 && Number.isFinite(b.startMin) && Number.isFinite(b.endMin))
    .map((b) => ({ ...b, startMin: Math.max(0, Math.min(1440, b.startMin)), endMin: Math.max(0, Math.min(1440, b.endMin)) }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.day - b.day || a.startMin - b.startMin);
  const out: FreeBlock[] = [];
  for (const b of valid) {
    const last = out[out.length - 1];
    if (last && last.day === b.day && b.startMin <= last.endMin) last.endMin = Math.max(last.endMin, b.endMin);
    else out.push({ ...b });
  }
  return out;
}

export function weeklyBudget(blocks: FreeBlock[], realityFactor = REALITY_FACTOR): Budget {
  const usable = normalizeBlocks(blocks).filter((b) => b.endMin - b.startMin >= MIN_BLOCK_MIN);
  const minutes = usable.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  return { hours: Math.round(((minutes / 60) * realityFactor) * 10) / 10, blocks: usable };
}

/** Cel mai lung bloc al unei zile (minute). */
export function longestBlock(blocks: FreeBlock[], day: number): number {
  return blocks.filter((b) => b.day === day).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
}
