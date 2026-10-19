// Ce afișăm din indicele de pregătire: complet (toate probele au date) sau parțial (doar probele cu date, cu cele
// lipsă numite). Parțialul e veriga cea mai slabă dintre probele măsurate: o probă fără date nu devine 0 și nici nu e
// ascunsă — e scrisă lângă cifră.

import type { RaceReady } from './race-ready.js';

export interface ReadyView {
  pct: number | null;
  partial: boolean;
  missing: string[];
  withData: number;
  total: number;
}

export function readyView(r: RaceReady | null | undefined): ReadyView {
  if (!r) return { pct: null, partial: false, missing: [], withData: 0, total: 0 };
  const missing = r.coverage.missing.filter((m) => m !== 'Cumul');
  if (r.ready != null) return { pct: r.ready, partial: false, missing, withData: r.coverage.withData, total: r.coverage.total };
  const measured = r.links.filter((l) => l.pct != null);
  const pct = measured.length ? Math.min(...measured.map((l) => l.pct!)) : null;
  return { pct, partial: pct != null, missing, withData: r.coverage.withData, total: r.coverage.total };
}
