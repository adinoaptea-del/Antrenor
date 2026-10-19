// Registrul drepturilor pe sursă: ce date au voie să ajungă la modelul AI.
// Versiunea 4 (19.10.2026), decizia proprietarului aplicației, informat despre riscul față de politica API Strava
// (în vigoare din 1 iunie 2026: datele din API și derivatele lor nu se folosesc în operarea unui AI): Strava ajunge
// TEMPORAR la antrenorul AI, doar pentru sportivul ei, până vin datele din Apple Health / Health Connect. Din momentul
// în care același set de date are și activități din Health (apple / android), Strava iese automat din AI — fără
// intervenție manuală. În aplicație (calendar, istoric) Strava rămâne vizibilă oricum.
// (v1 17.10 blocată; v2 18.10 permisă; v3 18.10 seara blocată după audit; v4 temporar permisă până la Health.)

export const AI_BLOCKED_SOURCES: ReadonlySet<string> = new Set<string>();
/** Surse care, odată prezente, scot Strava din AI. */
export const HEALTH_SOURCES: ReadonlySet<string> = new Set(['apple', 'android']);

export function allowedForAI<T extends { source?: string | null }>(rows: T[]): T[] {
  const hasHealth = rows.some((r) => !!r.source && HEALTH_SOURCES.has(r.source));
  return rows.filter((r) => !r.source || (!AI_BLOCKED_SOURCES.has(r.source) && !(hasHealth && r.source === 'strava')));
}
