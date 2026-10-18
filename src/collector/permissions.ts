// Registrul drepturilor pe sursă: ce date au voie să ajungă la modelul AI.
// Versiunea 2 (18.10.2026), decizia proprietarului aplicației: Strava intră și ea la antrenorul AI, strict în limitele
// acordului API Strava: datele unui sportiv merg doar la antrenorul LUI (feedback pentru el), nu antrenează niciun
// model (API-ul Anthropic nu antrenează pe datele trimise) și nu sunt arătate altor utilizatori (nici în ecranul
// adminului). Mecanismul rămâne: o sursă pusă aici iese din pachetul agenților.

export const AI_BLOCKED_SOURCES: ReadonlySet<string> = new Set<string>();

export function allowedForAI<T extends { source?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.source || !AI_BLOCKED_SOURCES.has(r.source));
}
