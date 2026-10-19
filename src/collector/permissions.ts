// Politica pe sursă: ce observații au voie să ajungă la modelul AI. Se aplică pe FIECARE observație (activitate, zi de
// wellness, activitate „altă”), înaintea oricărui calcul derivat care merge la AI (încărcare, istoric, rezumate).
//
// Versiunea 5 (19.10.2026), auditul v2 (V2-17), cerut de proprietar ca regulă permanentă: se respectă condițiile
// autorizate ale fiecărei surse; acordul proprietarului nu e drept contractual asupra API-ului. Politica API Strava
// (actualizată în noiembrie 2024, în vigoare din 2025) nu permite folosirea datelor din API și a derivatelor lor în
// operarea unui model AI → Strava NU ajunge la AI, indiferent dacă există sau nu date din Apple Health / Health Connect
// (comutatorul global din v4 fie păstra date nepermise, fie ascundea istoric util). În aplicație (calendar, istoric,
// scoruri afișate) Strava rămâne vizibilă doar sportivului ei.
// Istoric: v1 17.10 blocată; v2 18.10 permisă; v3 18.10 blocată; v4 temporar permisă până la Health; v5 blocată.

export interface SourcePolicy {
  ai: boolean;
  reason: string;
}

export const SOURCE_POLICY: Readonly<Record<string, SourcePolicy>> = {
  strava: { ai: false, reason: 'termenii API Strava: datele și derivatele lor nu se folosesc în operarea unui AI' },
};

export const AI_BLOCKED_SOURCES: ReadonlySet<string> = new Set(Object.entries(SOURCE_POLICY).filter(([, p]) => !p.ai).map(([s]) => s));
/** Păstrat pentru compatibilitate (nu mai schimbă politica). */
export const HEALTH_SOURCES: ReadonlySet<string> = new Set(['apple', 'android']);

/** Observațiile permise la AI, una câte una. O observație fără sursă (introdusă manual) e permisă. */
export function allowedForAI<T extends { source?: string | null; mergedSources?: readonly string[] | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.source || !AI_BLOCKED_SOURCES.has(r.source));
}
