// Tipurile comune ale nucleului. Toate datele vin din colector (script), niciodată din agenți.

export type Sport = 'inot' | 'bicicleta' | 'alergare' | 'forta';

/** Tipul unui antrenament propus. `brick` = bicicletă urmată imediat de alergare. */
export type WorkoutType = 'z2' | 'tehnica' | 'calitate' | 'lung' | 'brick' | 'forta' | 'odihna';

export type Phase = 'evaluare' | 'baza1' | 'baza2' | 'build' | 'peak' | 'taper';

/**
 * Culorile din calendar.
 * - verde / galben / portocaliu: executat bine / mediu / slab
 * - rosu: nefăcut (nicio activitate potrivită până la finalul zilei următoare)
 * - gri: anulat de sistem (readiness roșu, boală, durere) — nu contează ca nereușită
 * - albastru: activitate neplanificată — intră în încărcare, nu în scor
 * - asteptare: încă în fereastra de execuție (azi sau mâine); nu e o culoare afișată ca scor final
 */
export type Color = 'verde' | 'galben' | 'portocaliu' | 'rosu' | 'gri' | 'albastru' | 'asteptare';

export type Zone = 1 | 2 | 3 | 4 | 5;

export type IntensityAllowed = 'Z2' | 'pana_la_Z4' | 'toate';

export interface PlannedWorkout {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  sport: Sport;
  type: WorkoutType;
  plannedMinutes: number;
  targetZones: Zone[];
  /** Antrenament-cheie: lung sau calitate. Progresia merge înainte doar pe ele. */
  key: boolean;
  /** Treapta de progresie (index), ca să putem repeta sau coborî o treaptă. */
  step?: number;
  structure?: string;
  intervals?: { count: number; minutes: number; zone: Zone };
  status: 'planificat' | 'anulat_sistem' | 'mutat' | 'sters';
  note?: string;
  /**
   * Zilele galbene/portocalii: ședința rămâne cum e în plan, cu o SUGESTIE mai ușoară. Sportivul alege:
   * accepted = true → varianta ușoară intră în calendar; false → face ședința din plan; null → n-a ales încă.
   */
  /** Varianta propusă (sportivul alege). `sport` = altă disciplină (ex. fără impact la durere), doar cu confirmare. */
  suggestion?: { minutes: number; zones: Zone[]; structure: string; reason: string; accepted: boolean | null; sport?: Sport } | null;
  /** Cum arăta ședința în plan înainte de prima schimbare (de sistem sau a sportivului): pentru „Actualizat” și pentru revenire. */
  original?: WorkoutSnapshot | null;
  /** Când s-a schimbat ultima dată (ISO). */
  changedAt?: string | null;
}

export interface WorkoutSnapshot {
  date: string;
  sport?: Sport;
  type: WorkoutType;
  plannedMinutes: number;
  targetZones: Zone[];
  structure?: string | null;
  key: boolean;
  status: PlannedWorkout['status'];
  intervals?: PlannedWorkout['intervals'] | null;
}

/** O ședință care încă trebuie făcută: planificată sau mutată pe altă zi. Singura regulă folosită în toate filtrele. */
export function isActiveWorkout(w: Pick<PlannedWorkout, 'status'>): boolean {
  return w.status === 'planificat' || w.status === 'mutat';
}

export interface Activity {
  id: string;
  date: string;
  sport: Sport;
  minutes: number;
  /** Ora de start (HH:MM, ora locală), când o știe sursa: deosebește două ședințe reale din aceeași zi. */
  startLocal?: string | null;
  distanceKm?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  /** Minute în fiecare zonă, cu zonele sportivului (nu ale ceasului). null = fără date de zone. */
  timeInZonesMin?: Partial<Record<Zone, number>> | null;
  /** La ședințele de calitate: procentul intervalelor în țintă, din analiza detaliată. */
  intervalsHitPct?: number | null;
  intervalsAbandoned?: number | null;
  mainSetAbandoned?: boolean | null;
  /** Derivație cardiacă: FC medie și putere/viteză pe prima și ultima treime. */
  firstThirdHr?: number | null;
  lastThirdHr?: number | null;
  firstThirdOutput?: number | null;
  lastThirdOutput?: number | null;
  /** Minute de la finalul unei activități de bicicletă în aceeași zi (pentru brick). */
  afterBikeMinutes?: number | null;
}

export interface EveningQuestionnaire {
  /** 0–10 */
  rpe?: number | null;
  vsExpected?: 'mai_usor' | 'la_fel' | 'mai_greu' | null;
  /** 0–10 */
  painScore?: number | null;
  painLoc?: string | null;
  whatInterfered?: 'nimic' | 'somn' | 'mancare' | 'stres' | 'vreme' | 'timp' | 'traseu' | null;
  fuelingOk?: 'da' | 'partial' | 'nu' | null;
  comment?: string | null;
}

/** Bloc liber recurent în săptămână. day: 0 = luni … 6 = duminică; minute din miezul nopții. */
export interface FreeBlock {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMin: number;
  endMin: number;
}
