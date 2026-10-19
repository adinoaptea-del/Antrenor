// Formularele aplicației. Răspunsurile de dimineață/seară au exact forma cerută de colector (@core/collector/types),
// ca să intre în pachet fără traducere.

import type { EveningForm, MorningForm } from '@core/collector/types.js';
import type { FreeBlock } from '@core/types.js';
import type { RunResult } from '@core/util/run.js';
import { goalKind, isRunGoal, type Goal } from '@core/calendar/phases.js';
import type { FitnessIntake } from '@core/strength/fitness.js';
import { parseDuration, parsePace } from '@core/util/run.js';

export type { EveningForm, MorningForm };

export interface IntakeAnswers {
  nume: string;
  sex?: 'm' | 'f' | null;
  anNastere?: number | null;
  /** Înălțimea în cm. */
  inaltime?: number | null;
  obiectiv: Goal | 'full';
  dataCursa: string; // YYYY-MM-DD
  inot: { nivel: 'nu_stiu' | 'bazin_scurt' | 'continuu_400' | 'peste_1500' | null; apeDeschise: 'nu' | 'putin' | 'da' | null; bazin: boolean | null };
  bicicleta: { tip: 'sosea' | 'tt' | 'mtb' | 'nu_am' | null; trainer: boolean | null; putere: boolean | null; ceaMaiLungaOre: number | null };
  alergare: {
    ceaMaiLungaKm: number | null;
    curseRecente: 'niciuna' | '5-10' | 'semimaraton' | 'maraton' | null;
    /** Ramura: „finalizare” (rezistență) sau „timp” (cu timp-țintă). */
    ramura?: 'finalizare' | 'timp' | null;
    /** Ținta (ritm sau timp final), doar pe ramura „timp”. */
    tinta?: RunResult | null;
    /** Ritmul cu care aleargă acum de obicei, „m:ss” pe km. */
    ritmActual?: string | null;
    /** Poate alerga acum distanța cursei? */
    poateDistanta?: boolean | null;
    /** Dacă da: în cât timp sau cu ce ritm. */
    rezultatActual?: RunResult | null;
  };
  /** Cum se evaluează acum fiecare sport (opțional, ce știe sportivul): din asta pornesc antrenamentele până la primul test. */
  evaluare?: { inot400?: string | null; bicicletaViteza?: number | null; ftp?: number | null; alergare5k?: string | null; alergare10k?: string | null; ritmUsor?: string | null; testEfort?: 'cpet' | 'lactat' | 'teren' | 'nu' | null };
  echipament: { ceas: 'garmin' | 'apple' | 'altul' | 'nu' | null; whoop: boolean; oura: boolean; cantar: boolean };
  program: FreeBlock[];
  /** Câte ore pe săptămână are, realist, pentru sport (timpul liber ≠ timp de sport). */
  oreSport?: number | null;
  /** Ore/săpt. antrenate în ultimele ~2 luni (declarate). Folosite doar fără activități importate. */
  oreRecente?: number | null;
  /** Avizul se consideră dat (întrebarea nu mai e în chestionar); limitareMedic = medicul a limitat efortul. */
  sanatate: { avizCardiolog: 'da' | 'nu' | 'programat' | null; accidentari: string; limitareMedic?: boolean | null };
  /** Doar la fitness (femei). */
  fitness?: FitnessIntake;
  minte: { motiveaza: string; aOprit: string };
  consimtamant: boolean;
}

export interface WeeklyForm {
  weekStart: string; // luni
  energie: 1 | 2 | 3 | 4 | 5 | null;
  aMers: string;
  aOprit: 'nimic' | 'timp' | 'oboseala' | 'durere' | 'motivatie' | 'vreme' | null;
}

export const EMPTY_INTAKE: IntakeAnswers = {
  nume: '',
  obiectiv: '70.3',
  dataCursa: '2027-09-12',
  inot: { nivel: null, apeDeschise: null, bazin: null },
  bicicleta: { tip: null, trainer: null, putere: null, ceaMaiLungaOre: null },
  alergare: { ceaMaiLungaKm: null, curseRecente: null },
  echipament: { ceas: null, whoop: false, oura: false, cantar: false },
  program: [],
  sanatate: { avizCardiolog: null, accidentari: '' },
  minte: { motiveaza: '', aOprit: '' },
  consimtamant: false,
};

export function emptyMorning(date: string): MorningForm {
  return { date, hooper: { somn: null, oboseala: null, stres: null, dureri: null }, semnale: { boala: false, febra: false, deplasare: false, simptom_cardiac: false } };
}

export function emptyEvening(date: string, activityId: string | null): EveningForm {
  return { date, activityId, rpe: null, fata_de_asteptari: null, durere: { scor: null, loc: null }, ce_a_incurcat: null, fueling_conform: null, comentariu: null, tip_neplanificat: null };
}

export function morningComplete(m: MorningForm | undefined): boolean {
  return !!m && Object.values(m.hooper).every((v) => v != null);
}

export function eveningComplete(e: EveningForm | undefined): boolean {
  return !!e && e.rpe != null && e.fata_de_asteptari != null && e.durere.scor != null;
}

/** Răspunsul de ritm sau timp e completat corect. */
export function runResultOk(r: RunResult | null | undefined): boolean {
  return !!r && (r.mod === 'ritm' ? parsePace(r.valoare) != null : parseDuration(r.valoare) != null);
}

export function intakeComplete(i: IntakeAnswers | undefined): boolean {
  if (!i) return false;
  const base = i.consimtamant && i.nume.trim().length > 0 && !!i.sex && !!i.anNastere && i.program.length > 0;
  if (isRunGoal(i.obiectiv)) {
    const a = i.alergare;
    return base && runResultOk(a.tinta) && parsePace(a.ritmActual) != null && a.poateDistanta != null && (!a.poateDistanta || runResultOk(a.rezultatActual));
  }
  const kind = goalKind(i.obiectiv);
  if (kind === 'fitness') return base && !!i.fitness?.experienta && !!i.fitness?.zile && !!i.fitness?.minute;
  if (kind === 'swim') return base && i.inot.nivel != null;
  if (kind === 'bike') return base && i.bicicleta.tip != null;
  return base && i.inot.nivel != null && i.bicicleta.tip != null && i.alergare.ceaMaiLungaKm != null;
}
