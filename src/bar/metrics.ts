// Registrul indicatorilor de pregătire (auditul v93, A73/A74). Trei familii de calcul au existat sub același nume
// vizual de „pregătire”; aici fiecare are un id, un nume, un singur algoritm versionat și o explicație publică. Ecranele
// și pachetul AI folosesc același id pentru aceeași etichetă, iar niciunul nu e o probabilitate de reușită: sunt
// indici interni 0–100 față de repere alese de produs.

export type MetricId = 'pregatire_cursa' | 'pregatire_proba' | 'bara_interna';

export interface MetricDef {
  id: MetricId;
  /** Numele afișat (același pe toate ecranele și în pachetul AI). */
  name: string;
  /** Varianta scurtă pentru rânduri înguste (Acasă). */
  short: string;
  /** Funcția care îl calculează (o singură implementare). */
  algorithm: string;
  version: string;
  window: string;
  /** Cum se tratează lipsa datelor. */
  missing: string;
  explanation: string;
  /** Indice intern, nu probabilitate: interfața nu-l numește „șansă”. */
  kind: 'indice';
  /** Unde apare. */
  shownOn: string[];
}

export const METRICS: Record<MetricId, MetricDef> = {
  pregatire_cursa: {
    id: 'pregatire_cursa',
    name: 'Indice de pregătire pentru cursă',
    short: 'Indice de pregătire',
    algorithm: 'src/bar/race-ready.ts raceReady + src/bar/ready-view.ts readyView',
    version: 'race-ready@2',
    window: 'ultimele 8 săptămâni',
    missing: 'o probă fără date rămâne „fără date”, nu 0; parțialul e veriga cea mai slabă dintre probele măsurate (fără „Cumul”), cu acoperirea scrisă lângă cifră',
    explanation: 'Veriga cea mai slabă dintre probe (distanța demonstrată față de reperul probei, cu limitele de timp la 70.3) și ziua lungă în mai multe sporturi. Reperele sunt alegeri de antrenament, nu studii; indicele nu e șansa de a termina.',
    kind: 'indice',
    shownOn: ['Acasă', 'Progres', 'Gata de cursă', 'pachetul AI (pregatire_cursa)'],
  },
  pregatire_proba: {
    id: 'pregatire_proba',
    name: 'Indice pe probă (rezistență, volum, specific)',
    short: 'Indice pe probă',
    algorithm: 'src/bar/sport-readiness.ts sportReadiness',
    version: 'sport-readiness@2',
    window: 'ultimele 6 săptămâni',
    missing: 'fără rezistență măsurată sau declarată indicele probei e necunoscut (null), nu calculat doar din volum; media cursei e null cât lipsește o probă',
    explanation: 'Rezistență 60%, volum 25%, specific 15%, fiecare față de reperul probei. Alt calcul decât indicele de pregătire pentru cursă: de aceea are alt nume.',
    kind: 'indice',
    shownOn: ['Antrenament (cardul probei)', 'pachetul AI (pregatire_proba)'],
  },
  bara_interna: {
    id: 'bara_interna',
    name: 'Bara internă (istoric, neafișată)',
    short: 'Bara internă',
    algorithm: 'src/bar/bar.ts computeBar',
    version: 'bar@2',
    window: 'ultimele 6 săptămâni',
    missing: 'totalul e null cât lipsește o componentă: ponderile nu se renormalizează pe ce există (ar umfla rezultatul)',
    explanation: 'Scrisă zilnic în bar_daily pentru istoric; nu e afișată ca pregătire și nu e trimisă AI-ului ca indice.',
    kind: 'indice',
    shownOn: [],
  },
};

/** Eticheta scurtă a unui indice: „X/100”, niciodată „X% șanse”. */
export function indexText(value: number | null): string {
  return value == null ? 'fără date' : `${Math.round(value)}/100`;
}
