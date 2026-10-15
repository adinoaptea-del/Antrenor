// Bugetul de ore pe săptămână din programul real al sportivului.
// Regula din protocol: suma blocurilor libere de minimum 45 min × 0,8 (nimeni nu folosește tot timpul liber).

import type { FreeBlock } from '../types.js';

export const MIN_BLOCK_MIN = 45;
export const REALITY_FACTOR = 0.8;

export interface Budget {
  hours: number;
  blocks: FreeBlock[];
}

export function weeklyBudget(blocks: FreeBlock[], realityFactor = REALITY_FACTOR): Budget {
  const usable = blocks
    .filter((b) => b.endMin > b.startMin && b.endMin - b.startMin >= MIN_BLOCK_MIN)
    .sort((a, b) => a.day - b.day || a.startMin - b.startMin);
  const minutes = usable.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  return { hours: Math.round(((minutes / 60) * realityFactor) * 10) / 10, blocks: usable };
}

/** Cel mai lung bloc al unei zile (minute). */
export function longestBlock(blocks: FreeBlock[], day: number): number {
  return blocks.filter((b) => b.day === day).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
}
