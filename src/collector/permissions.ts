// Registrul drepturilor pe sursă: ce date au voie să ajungă la modelul AI.
// Versiunea 3 (18.10.2026, după auditul independent): Strava iese din nou din AI. Politica API Strava (în vigoare din
// 1 iunie 2026) nu permite folosirea datelor din API și a celor derivate în operarea unui AI (context, memorie), nu
// doar la antrenarea modelelor. Datele rămân în aplicație pentru afișare (calendar, istoric), dar nu intră în pachetul
// agenților, în totaluri, încărcare, istoric sau pregătire calculate pentru pachet.
// (v1 17.10: Strava blocată; v2 18.10 dimineața: permisă la cererea proprietarului; v3: blocată din nou.)

export const AI_BLOCKED_SOURCES: ReadonlySet<string> = new Set(['strava']);

export function allowedForAI<T extends { source?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.source || !AI_BLOCKED_SOURCES.has(r.source));
}
