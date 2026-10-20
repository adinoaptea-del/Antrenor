import type { Goal } from '../calendar/phases.js';
import type { ActivityDetails } from './details.js';
import type { OtherActivity } from './other.js';
import type { LabsComparison } from './labs-compare.js';
// Tipurile colectorului: ce intră de la brățări și formulare, în formă normalizată, independentă de producător.
// Adaptorii (whoop.ts, strava.ts, oura.ts) produc aceste structuri; packet.ts le transformă în pachetul agenților.

import type { Activity, IntensityAllowed, Phase, PlannedWorkout, Sport, Zone } from '../types.js';

export type Source = 'whoop' | 'garmin' | 'oura' | 'strava' | 'manual' | 'athletedata' | 'apple' | 'android';

/** O noapte / o zi de la o sursă. `date` = ziua trezirii (YYYY-MM-DD, ora locală a sportivului). */
export interface SourceDaily {
  date: string;
  source: Source;
  hrv?: number | null; // ms, rMSSD
  rhr?: number | null; // bpm
  sleepMin?: number | null; // minute dormite (nu în pat)
  bedtime?: string | null; // HH:MM local, ora adormirii
  wakeTime?: string | null; // HH:MM local
  sleepScore?: number | null; // 0–100, al producătorului
  recoveryScore?: number | null; // Whoop recovery %, Oura readiness
  respiratoryRate?: number | null;
  /** Abaterea temperaturii pielii în somn față de media ta (°C), cum o dă brățara (Oura). Nu e temperatura corpului. */
  tempDevC?: number | null;
  weightKg?: number | null;
  bodyFatPct?: number | null;
}

/** O activitate de la o sursă, înainte de dedupe. */
export interface SourceActivity extends Activity {
  source: Source;
  /** Identificatorul la producător, pentru dedupe și pentru legarea chestionarului de seară. */
  externalId: string;
  avgPaceMinKm?: number | null;
  avgCadence?: number | null;
  avgWatts?: number | null;
  name?: string | null;
  /** Detaliile măsurate de brățări (cel mai rapid km, pași/km, putere normalizată, ritm/100 m…). */
  details?: ActivityDetails | null;
  /** După dedupe: toate sursele care au înregistrat aceeași ședință (proveniența rămâne la vedere). */
  mergedSources?: Source[];
  /** Id-urile tuturor înregistrărilor unite în ședința asta (auditul v93, A21: identitate stabilă a ședinței). */
  mergedIds?: string[];
}

export interface MorningForm {
  date: string;
  hooper: { somn: number | null; oboseala: number | null; stres: number | null; dureri: number | null }; // 1–7
  semnale: { boala: boolean | null; febra: boolean | null; deplasare: boolean | null; simptom_cardiac: boolean | null; /** După un simptom cardiac: „am fost evaluat medical și pot face efort” (declarat de sportiv). */ cardiac_evaluat?: boolean | null };
  /** Doar când brățările n-au date: „ești odihnit și apt de antrenament azi?”. Sportivul decide. */
  apt?: 'da' | 'partial' | 'nu' | null;
  /** La dureri musculare 6–7/7: unde (picioare, spate, umeri și brațe, tot corpul) și dacă dor la mers. */
  dureri_zona?: 'picioare' | 'spate' | 'brate' | 'tot' | null;
  dureri_mers?: boolean | null;
}

export interface EveningForm {
  date: string;
  activityId?: string | null;
  rpe: number | null; // 0–10
  fata_de_asteptari: 'mai_usor' | 'la_fel' | 'mai_greu' | null;
  durere: { scor: number | null; loc: string | null };
  ce_a_incurcat: 'nimic' | 'somn' | 'mancare' | 'stres' | 'vreme' | 'timp' | 'traseu' | null;
  fueling_conform: 'da' | 'partial' | 'nu' | null;
  comentariu: string | null;
  /** Dacă activitatea a fost în afara planului: ce a fost. */
  tip_neplanificat?: 'cursa' | 'antrenament' | 'altceva' | null;
}

export interface ZonesInput {
  alergare: { fc_z1_z5: [number, number, number, number, number] | null; pace_prag: string | null };
  bicicleta: { ftp: number | null; fc_z1_z5: [number, number, number, number, number] | null };
  inot: { css: number | null };
  fcmax_test: number | null;
  data_test: string | null;
}

export interface LabsInput {
  feritina: number | null;
  vitamina_d: number | null;
  hemoglobina: number | null;
  ck: number | null;
  crp: number | null;
  data_analize: string | null;
  /** Valorile din buletin aflate în afara intervalului de referință al laboratorului (calculat de cod). */
  in_afara_intervalului?: { nume: string; valoare: number | null; unitate: string | null; interval: string | null; directie: 'sub' | 'peste' }[];
  /** Buletinul a fost urcat în ultimele 3 zile: head coach-ul îl comentează (o singură dată, în prima dimineață). */
  noi?: boolean;
  /** Comparația cu buletinul anterior (calculată de cod). null = e primul buletin. */
  comparatie?: LabsComparison | null;
}

export interface NutritionDay {
  date: string;
  kcal: number | null;
  carbohidrati_g: number | null;
  proteine_g: number | null;
  apa_l: number | null;
}

/** Încărcarea calculată de un agregator (CTL/ATL/TSB), dacă există. Colectorul nu o estimează singur. */
export interface LoadInput {
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  source: Source;
}

export interface CollectorInput {
  today: string;
  event: 'dimineata' | 'dupa_antrenament' | 'saptamanal';
  /** Ora locală a sportivului (HH:MM) când rulează agenții: mesajul se scrie pentru momentul zilei. */
  nowLocal?: string | null;
  athlete: {
    obiectiv: string;
    goal?: Goal | null;
    declaredSwimM?: number | null;
    raceDate: string;
    phase: Phase;
    weekLabel?: string;
    sex?: 'm' | 'f' | null;
    varsta?: number | null;
    inaltimeCm?: number | null;
    /** La alergare cu timp-țintă: timpul-țintă (s) din chestionar; verdictul se calculează în pachet din ceas. */
    targetSec?: number | null;
    /** Alergare: „finalizare” (rezistență) sau „timp”. */
    ramura?: 'finalizare' | 'timp' | null;
    /** Fitness (femei): răspunsurile din chestionar (zile, minute, nivel, acces, mișcare, context opțional). */
    fitness?: import('../strength/fitness.js').FitnessIntake | null;
    tinta?: { timp_tinta_s: number; ritm_tinta_s_km: number; verdict: 'realist' | 'ambitios' | 'nerealist' | 'necunoscut'; motive: string[]; timp_estimat_s: number | null; cel_mai_bun_efort: string | null } | null;
  };
  wellness: SourceDaily[];
  activities: SourceActivity[];
  plan: PlannedWorkout[];
  zones: ZonesInput | null;
  morning?: MorningForm | null;
  /** Chestionarele de dimineață din ultimele 14 zile (și cele parțiale): ce a simțit sportivul se ține minte. */
  morningHistory?: MorningForm[];
  evenings: EveningForm[];
  /** Incidentele din ultimele 12 luni (durere, simptom cardiac), pentru restricția activă (auditul v93, A02). */
  incidents?: { mornings: MorningForm[]; evenings: EveningForm[] };
  labs?: LabsInput | null;
  /** Limita de intensitate din analize (feritină / hemoglobină), cu motivul — trimisă chiar dacă buletinul e vechi (auditul v93, A89). */
  labsLimit?: string | null;
  /** Recuperarea și mișcarea în plus de pe brățări (saună, yoga, plimbări, alte sporturi). */
  others?: OtherActivity[];
  /** Mersul pe jos (obiectivul „mers”): săptămâna calculată în cod (src/walking/view.ts). */
  walking?: import('../walking/view.js').WalkingView | null;
  nutrition?: NutritionDay[];
  /** Mesele de azi calculate de motorul nutriționistului (src/nutrition): AI-ul le explică, nu le recalculează. */
  mealsToday?: import('../nutrition/engine.js').NutritionDay | null;
  load?: LoadInput | null;
  aviz: { cardiolog: 'da' | 'nu' | string; intensitate_permisa: IntensityAllowed };
  /** Prognoza pentru orașul din profil (Open-Meteo). null fără oraș. */
  weather?: WeatherInput | null;
  /** Istoric pentru creșterea controlată: zile verzi la rând (readiness), ultima creștere aplicată. */
  history?: { greenStreak: number; lastIncrease: string | null } | null;
  /** Rezumatul istoricului pe până la 24 de luni (calculat de cod). */
  trainingHistory?: import('../history/summary.js').HistorySummary | null;
  /** Cum răspunde corpul sportivului la fiecare tip de recuperare (asocieri pe 90 de zile, calculate de cod). */
  recoveryEffects?: import('../recovery/recovery.js').RecoveryEffect[];
  /** Surse conectate pe care AI-ul nu are voie să le vadă (Strava): doar faptul că sunt conectate, fără date. */
  hiddenSources?: string[];
  /** Totaluri de la începutul pregătirii (data planului), pe sport. */
  totals?: { since: string; bySport: Record<Sport, { km: number; ore: number; sedinte: number }> } | null;
  /**
   * Scorurile salvate în tabelul `scores`, pe ședința din plan (server/_lib/score.ts loadStoredScores). Pachetul le
   * folosește pe acestea când activitatea e aceeași, ca AI-ul să vadă aceeași culoare ca ecranele (auditul v93, T51).
   */
  storedScores?: Record<string, StoredScore> | null;
}

/** Un scor salvat: aceeași formă ca rezultatul lui scoreWorkout, legat de activitatea pe care a fost calculat. */
export interface StoredScore {
  activityId: string | null;
  color: import('../types.js').Color;
  reasons: string[];
  metrics: import('../scoring/score.js').ScoreMetrics;
  flags: import('../scoring/score.js').ScoreFlags;
  evaluare: import('../scoring/score.js').Evaluation | null;
}

export interface WeatherDay {
  tmax: number | null;
  tmin: number | null;
  resimtita_max: number | null;
  ploaie_mm: number | null;
  vant_kmh: number | null;
  /** Probabilitatea maximă de ploaie în zi (%), când prognoza o dă. */
  prob_ploaie?: number | null;
}
export interface WeatherInput {
  oras: string;
  azi: WeatherDay;
  maine: WeatherDay;
  /** Poimâine (pentru inversarea după vreme, src/calendar/weather-swap.ts). */
  poimaine?: WeatherDay | null;
  /** Toate zilele prognozei (azi + 4), cu data: pentru inversarea după vreme. */
  zile?: { date: string; w: WeatherDay }[];
}

export type Zones5 = Partial<Record<Zone, number>>;
export type SportHours = Record<Sport, number>;
