// Ce afișăm din indicele de pregătire: complet (toate probele au date) sau parțial (doar probele cu date, cu cele
// lipsă numite). Parțialul e veriga cea mai slabă dintre PROBELE măsurate: o probă fără date nu devine 0 și nici nu e
// ascunsă — e scrisă lângă cifră. „Cumul” (ziua lungă în mai multe sporturi) nu e o probă: nu intră în parțial (o zi
// cu un singur sport dădea 0 și Acasă scria „Pregătit: 0%” cu înotul și alergarea la 79/78 — auditul v93, A74).

import type { RaceReady } from './race-ready.js';
import { METRICS, type MetricId } from './metrics.js';

export interface ReadyView {
  pct: number | null;
  partial: boolean;
  missing: string[];
  withData: number;
  total: number;
  /** Id-ul din registrul indicatorilor (src/bar/metrics.ts): același pe Acasă, Progres și în pachetul AI. */
  metricId: MetricId;
}

export function readyView(r: RaceReady | null | undefined): ReadyView {
  const metricId: MetricId = 'pregatire_cursa';
  if (!r) return { pct: null, partial: false, missing: [], withData: 0, total: 0, metricId };
  const missing = r.coverage.missing.filter((m) => m !== 'Cumul');
  if (r.ready != null) return { pct: r.ready, partial: false, missing, withData: r.coverage.withData, total: r.coverage.total, metricId };
  const measured = r.links.filter((l) => l.pct != null && l.name !== 'Cumul');
  const pct = measured.length ? Math.min(...measured.map((l) => l.pct!)) : null;
  return { pct, partial: pct != null, missing, withData: r.coverage.withData, total: r.coverage.total, metricId };
}

/**
 * Rândul de pe Acasă. Indice intern, scris „X/100” (nu procent de reușită, nu șansă), cu acoperirea (câte probe au
 * date) lângă cifră. Într-o zi cu restricție, capacitatea demonstrată nu e permisiune: o spune explicit (A76).
 */
export function readyLabel(rv: ReadyView, opts: { restrictedToday?: boolean } = {}): string {
  const name = METRICS[rv.metricId].short;
  if (rv.pct == null) return `${name}: îți evaluăm nivelul`;
  const cover = rv.partial ? ` (parțial: ${rv.withData} din ${rv.total} probe${rv.missing.length ? `, fără ${rv.missing.join(', ').toLowerCase()}` : ''})` : '';
  return `${name}: ${rv.pct}/100${cover}${opts.restrictedToday ? ' · azi decide restricția, nu indicele' : ''}`;
}
