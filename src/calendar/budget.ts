// Bugetul de ore pe săptămână din programul real al sportivului.
// Regula din protocol: suma blocurilor libere de minimum 45 min × 0,8 (nimeni nu folosește tot timpul liber).

import type { FreeBlock } from '../types.js';

export const MIN_BLOCK_MIN = 45;
export const REALITY_FACTOR = 0.8;

export interface Budget {
  /** Ore de sport pe săptămână folosite de plan. */
  hours: number;
  blocks: FreeBlock[];
  /** Timpul liber bifat (ore), separat de timpul de sport. */
  freeHours: number;
  /** Orele declarate de sportiv pentru sport; null = nedeclarate. */
  declaredHours: number | null;
  /** Fals = disponibilitatea nu e validată (prea mult timp liber, fără ore declarate): nu se generează plan. */
  valid: boolean;
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

/** Peste atât timp liber pe zi nu se mai numără ca timp de sport (o zi întreagă liberă ≠ 16 ore de antrenament). */
export const MAX_SPORT_MIN_PER_DAY = 5 * 60;
/** Peste atâtea ore (după × 0,8) cerem sportivului să spună explicit cât timp are pentru sport. */
export const UNDECLARED_LIMIT_H = 24;

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Bugetul de sport pe săptămână. Timpul liber (ferestrele bifate) nu e același lucru cu timpul pentru sport:
 * - fiecare zi contează cel mult MAX_SPORT_MIN_PER_DAY;
 * - × 0,8 (nimeni nu folosește tot timpul liber);
 * - plafonat la orele declarate de sportiv pentru sport (`sportCapHours`), dacă le-a spus.
 * `valid` e fals când timpul liber e mare și sportivul n-a spus câte ore are pentru sport: atunci nu se generează plan.
 */
export function weeklyBudget(blocks: FreeBlock[], realityFactor = REALITY_FACTOR, sportCapHours: number | null = null): Budget {
  const usable = normalizeBlocks(blocks).filter((b) => b.endMin - b.startMin >= MIN_BLOCK_MIN);
  const freeMin = usable.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  let dayCapped = 0;
  for (let d = 0; d < 7; d++) dayCapped += Math.min(MAX_SPORT_MIN_PER_DAY, usable.filter((b) => b.day === d).reduce((s, b) => s + (b.endMin - b.startMin), 0));
  const fromBlocks = (dayCapped / 60) * realityFactor;
  const cap = sportCapHours != null && Number.isFinite(sportCapHours) && sportCapHours > 0 ? sportCapHours : null;
  const hours = r1(cap != null ? Math.min(fromBlocks, cap) : fromBlocks);
  const valid = usable.length > 0 && (cap != null || fromBlocks <= UNDECLARED_LIMIT_H);
  return { hours, blocks: usable, freeHours: r1(freeMin / 60), declaredHours: cap, valid };
}

/** Rezumatul pe zile al disponibilității (minute libere numărate pentru sport). */
export function perDayMinutes(blocks: FreeBlock[]): number[] {
  const usable = normalizeBlocks(blocks).filter((b) => b.endMin - b.startMin >= MIN_BLOCK_MIN);
  return Array.from({ length: 7 }, (_, d) => Math.min(MAX_SPORT_MIN_PER_DAY, usable.filter((b) => b.day === d).reduce((s, b) => s + (b.endMin - b.startMin), 0)));
}

/** Cel mai lung bloc al unei zile (minute). */
export function longestBlock(blocks: FreeBlock[], day: number): number {
  return blocks.filter((b) => b.day === day).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
}
