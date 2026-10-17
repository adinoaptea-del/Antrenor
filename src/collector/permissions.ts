// Registrul drepturilor pe sursă: ce date au voie să ajungă la modelul AI.
// Strava (API Agreement / API Policy, în vigoare din 1 iunie 2026): datele din API și cele derivate din ele nu se
// folosesc în modele AI. Ele rămân în aplicație pentru afișare și calcule proprii, dar nu intră în pachetul agenților,
// nici în totaluri, încărcare sau pregătire calculate pentru pachet.
// Versiunea registrului: 1 (17.10.2026).

export const AI_BLOCKED_SOURCES: ReadonlySet<string> = new Set(['strava']);

export function allowedForAI<T extends { source?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.source || !AI_BLOCKED_SOURCES.has(r.source));
}
