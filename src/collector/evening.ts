// Răspunsul de seară („Cum a fost…?”) aparține ȘEDINȚEI, nu unui id de înregistrare (corecția proprietarului,
// 21.10.2026: „am răspuns de două ori și tot nu dispare”). Aceeași ședință poate fi văzută de două brățări și contopită;
// id-ul păstrat se poate schimba când sosește a doua înregistrare. Răspunsul dat sub oricare din id-urile ei rămâne al ei,
// iar o a doua înregistrare necontopită, suprapusă în timp, nu mai cere alt răspuns.
import type { EveningForm } from './types.js';

export interface EveningKeyed {
  id: string;
  externalId?: string | null;
  mergedIds?: string[] | null;
}
export interface Windowed {
  id: string;
  date: string;
  sport: string;
  minutes: number;
  startLocal?: string | null;
}

/** Toate id-urile sub care putea fi salvat răspunsul pentru activitatea asta. */
export function activityIds(a: EveningKeyed): string[] {
  return [...new Set([a.id, a.externalId ?? null, ...(a.mergedIds ?? [])].filter((x): x is string => !!x))];
}

/** Răspunsul de seară al activității, sub oricare din id-urile ei. */
export function eveningForActivity(a: EveningKeyed, byId: Record<string, EveningForm>): EveningForm | undefined {
  for (const id of activityIds(a)) {
    const e = byId[id];
    if (e) return e;
  }
  return undefined;
}

const startMin = (a: Windowed): number | null => {
  const m = a.startLocal ? /^(\d{1,2}):(\d{2})/.exec(a.startLocal) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Două înregistrări sunt aceeași ședință văzută de altă brățară: același sport, aceeași zi și ferestrele de timp se
 * suprapun (sau, fără ore de start, durate la ≤ 10 minute). Două ședințe reale la ore diferite nu sunt.
 */
export function sameWindow(a: Windowed, b: Windowed): boolean {
  if (a.id === b.id || a.date !== b.date || a.sport !== b.sport) return false;
  const sa = startMin(a);
  const sb = startMin(b);
  if (sa != null && sb != null) return Math.min(sa + a.minutes, sb + b.minutes) - Math.max(sa, sb) > 0;
  return Math.abs(a.minutes - b.minutes) <= 10;
}
