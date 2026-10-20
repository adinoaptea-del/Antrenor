// Politica pe sursă: ce observații au voie să ajungă la modelul AI. Se aplică pe FIECARE observație (activitate, zi de
// wellness, activitate „altă”), înaintea oricărui calcul derivat care merge la AI (încărcare, istoric, rezumate).
//
// Versiunea 6 (19.10.2026), decizie permanentă a proprietarului, luată în cunoștință de cauză („ne asumăm riscul”),
// după ce i s-a explicat că politica API Strava nu permite folosirea datelor și a derivatelor lor într-un AI:
// Strava AJUNGE la antrenorul AI, doar pentru sportivul ei, PÂNĂ există activități din Apple Health / Health Connect
// în același set de date; din acel moment Strava iese automat din AI, observație cu observație. Decizia NU se
// inversează la un audit viitor fără acordul explicit al proprietarului. În aplicație Strava rămâne vizibilă doar
// sportivului ei.
// Istoric: v1 17.10 blocată; v2 18.10 permisă; v3 18.10 blocată; v4 temporar permisă până la Health; v5 blocată
// (audit v2, V2-17); v6 permisă până la Health, decizie permanentă a proprietarului.

export interface SourcePolicy {
  ai: boolean;
  /** Sursa iese din AI când în același set există observații din aceste surse. */
  untilSources?: readonly string[];
  reason: string;
}

/** Surse care, odată prezente, scot Strava din AI. */
export const HEALTH_SOURCES: ReadonlySet<string> = new Set(['apple', 'android']);

export const SOURCE_POLICY: Readonly<Record<string, SourcePolicy>> = {
  strava: { ai: true, untilSources: [...HEALTH_SOURCES], reason: 'decizia proprietarului (risc asumat față de termenii API Strava): permisă până apar date din Apple Health / Health Connect' },
};

export const AI_BLOCKED_SOURCES: ReadonlySet<string> = new Set(Object.entries(SOURCE_POLICY).filter(([, p]) => !p.ai).map(([s]) => s));

/**
 * Observațiile permise la AI, una câte una. O observație fără sursă (introdusă manual) e permisă. `present` = sursele
 * sportivului pe TOT istoricul (auditul v93, A93/A108): același verdict în toate ferestrele aceluiași pachet. Fără el,
 * se deduce din rândurile date (comportamentul vechi, doar pentru apelurile izolate).
 */
export function allowedForAI<T extends { source?: string | null; mergedSources?: readonly string[] | null }>(rows: T[], presentAll?: ReadonlySet<string>): T[] {
  const present = presentAll ?? new Set(rows.map((r) => r.source).filter((x): x is string => !!x));
  const blocked = (src: string) => {
    const p = SOURCE_POLICY[src];
    if (!p) return false;
    if (!p.ai) return true;
    return (p.untilSources ?? []).some((u) => present.has(u));
  };
  return rows.filter((r) => !r.source || !blocked(r.source));
}

/** Sursele scoase din AI pentru sportivul ăsta (static sau prin regula „până apar date din…”), cu motivul. */
export function excludedFromAI(present: ReadonlySet<string>): { source: string; reason: string }[] {
  return Object.entries(SOURCE_POLICY)
    .filter(([, p]) => !p.ai || (p.untilSources ?? []).some((u) => present.has(u)))
    .map(([source, p]) => ({ source, reason: p.ai ? 'au apărut date din Apple Health / Health Connect: regula proprietarului o scoate din AI' : p.reason }));
}
