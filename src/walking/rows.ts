// Din rândurile salvate (other_activities) în plimbări numărabile, fără server: aceeași funcție o folosesc pagina,
// calendarul, scorul și testele.

import type { SourceActivity } from '../collector/types.js';
import { addDays, localTimeUtc } from '../util/dates.js';
import { dedupeWalks, splitByDay, type WalkRecord, type WalkSource } from './minutes.js';

/** Activitățile identificate ca mers (numele normalizat din src/collector/other.ts). Pașii zilnici nu sunt aici. */
export const WALK_NAMES = ['plimbare', 'drumeție'] as const;
export const isWalkName = (n: string | null | undefined) => !!n && (WALK_NAMES as readonly string[]).includes(n);

export interface WalkRow {
  id: string;
  source: string;
  date: string;
  start_local: string | null;
  name: string;
  minutes: number;
  start_utc?: string | null;
  elapsed_sec?: number | null;
  moving_sec?: number | null;
  brisk?: boolean | null;
  excluded?: boolean | null;
  reconciled_with?: string | null;
  synced_at?: string | null;
}

const SOURCES: WalkSource[] = ['strava', 'garmin', 'apple', 'android', 'samsung', 'whoop', 'aplicatie', 'manual'];

/** Începutul în UTC: din coloana nouă sau, pe rândurile vechi, din ziua + ora locală în fusul sportivului. */
function startOf(r: WalkRow, tz: string): string | null {
  if (r.start_utc) return new Date(r.start_utc).toISOString();
  const m = r.start_local ? /^(\d{2}):(\d{2})/.exec(r.start_local) : null;
  if (!m) return null;
  // Ora locală → UTC cu offsetul de la ora aceea (corect și în ziua schimbării orei).
  return localTimeUtc(r.date, Number(m[1]) * 60 + Number(m[2]), tz);
}

export function toWalkRecords(rows: WalkRow[], tz: string): WalkRecord[] {
  return rows
    .filter((r) => isWalkName(r.name))
    .map((r) => {
      const source = (SOURCES as string[]).includes(r.source) ? (r.source as WalkSource) : 'manual';
      const elapsed = r.elapsed_sec != null && r.elapsed_sec > 0 ? r.elapsed_sec : Math.max(0, r.minutes) * 60;
      const moving = r.moving_sec != null && r.moving_sec > 0 && r.moving_sec <= elapsed ? r.moving_sec : null;
      return {
        id: r.id,
        source,
        provenance: source === 'manual' ? 'declarat' : 'masurat',
        startUtc: startOf(r, tz),
        date: r.date,
        elapsedSec: elapsed,
        movingSec: moving,
        brisk: r.brisk === true,
        name: r.name,
        deleted: r.excluded === true,
        reconciledWith: r.reconciled_with ?? null,
      } satisfies WalkRecord;
    });
}

/**
 * Plimbările ca activități de mers (pentru calendar și scorul ședințelor de mers), fără dubluri, câte o bucată pe
 * zi (o plimbare peste miezul nopții dă două bucăți).
 */
export function walkActivities(records: WalkRecord[], tz: string): SourceActivity[] {
  const { kept } = dedupeWalks(records);
  const out: SourceActivity[] = [];
  for (const w of kept) {
    const parts = splitByDay(w, tz).filter((p) => p.sec >= 60);
    parts.forEach((p, i) =>
      out.push({
        id: parts.length > 1 ? `${w.id}#${i + 1}` : w.id,
        externalId: w.id,
        source: w.source === 'manual' || w.source === 'aplicatie' ? 'manual' : w.source === 'samsung' ? 'android' : w.source,
        date: p.date,
        sport: 'mers',
        minutes: Math.round(p.sec / 60),
        startLocal: null,
        name: `${w.brisk ? 'mers alert' : (w.name ?? 'plimbare')}${w.provenance === 'declarat' ? ' (declarat)' : ''}`,
      }),
    );
  }
  return out;
}

/** Plimbarea obișnuită din ultimele 14 zile (mediana, minute; auditul v93 A88 — înainte: cea mai lungă), măsurată sau declarată; null fără plimbări. */
export function demonstratedMin(records: WalkRecord[], today: string): number | null {
  const from = addDays(today, -14);
  const { kept } = dedupeWalks(records);
  const xs = kept.filter((w) => w.date >= from && w.date <= today).map((w) => Math.floor((w.movingSec ?? w.elapsedSec) / 60)).sort((a, b) => a - b);
  if (!xs.length) return null;
  // Auditul v93, A88: capacitatea = ce tolerează de obicei (mediana, cu cel puțin 3 plimbări), nu cea mai lungă
  // plimbare ocazională; cu 1–2 plimbări, cea mai scurtă dintre ele (prudent).
  if (xs.length < 3) return xs[0]!;
  return xs.length % 2 ? xs[(xs.length - 1) / 2]! : Math.round((xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2);
}
