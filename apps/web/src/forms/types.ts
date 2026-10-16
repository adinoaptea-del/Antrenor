// Formularele aplicației. Răspunsurile de dimineață/seară au exact forma cerută de colector (@core/collector/types),
// ca să intre în pachet fără traducere.

import type { EveningForm, MorningForm } from '@core/collector/types.js';
import type { FreeBlock } from '@core/types.js';

export type { EveningForm, MorningForm };

export interface IntakeAnswers {
  nume: string;
  obiectiv: '70.3' | 'olimpic' | 'sprint' | 'full';
  dataCursa: string; // YYYY-MM-DD
  inot: { nivel: 'nu_stiu' | 'bazin_scurt' | 'continuu_400' | 'peste_1500' | null; apeDeschise: 'nu' | 'putin' | 'da' | null; bazin: boolean | null };
  bicicleta: { tip: 'sosea' | 'tt' | 'mtb' | 'nu_am' | null; trainer: boolean | null; putere: boolean | null; ceaMaiLungaOre: number | null };
  alergare: { ceaMaiLungaKm: number | null; curseRecente: 'niciuna' | '5-10' | 'semimaraton' | 'maraton' | null };
  echipament: { ceas: 'garmin' | 'apple' | 'altul' | 'nu' | null; whoop: boolean; oura: boolean; cantar: boolean };
  program: FreeBlock[];
  sanatate: { avizCardiolog: 'da' | 'nu' | 'programat' | null; accidentari: string };
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

export function intakeComplete(i: IntakeAnswers | undefined): boolean {
  return !!i && i.consimtamant && i.nume.trim().length > 0 && i.inot.nivel != null && i.bicicleta.tip != null && i.alergare.ceaMaiLungaKm != null && i.program.length > 0 && i.sanatate.avizCardiolog != null;
}
