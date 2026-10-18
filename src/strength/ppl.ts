// Programul de forță Push / Pull / Legs (modelul dat de Cuza), același pentru toți sportivii.
// Exercițiile și seturile sunt cele din program; codul doar le dozează după faza pregătirii,
// pentru că forța vine peste înot, bicicletă și alergare (vezi doseFor).

import type { Phase } from '../types.js';

export type SetKind = 'heavy' | 'lowered' | 'restpause' | 'fix' | 'max';
export interface PSet {
  kind: SetKind;
  reps: string; // „5-9”, „10-15”, „max”, „4-6 serii”
}
export interface Exercise {
  group: string;
  name: string;
  sets: PSet[];
  note?: string;
}
export interface PplDay {
  id: 'push1' | 'pull1' | 'legs' | 'push2' | 'arms' | 'pull2';
  name: string;
  exercises: Exercise[];
}

const H = (r = '5-9'): PSet => ({ kind: 'heavy', reps: r });
const L = (r = '10-15'): PSet => ({ kind: 'lowered', reps: r });
const RP = (r = '12-15'): PSet => ({ kind: 'restpause', reps: r });
const F = (r: string): PSet => ({ kind: 'fix', reps: r });
const MAX: PSet = { kind: 'max', reps: 'max' };
const ABS: Exercise = { group: 'Abdomen', name: 'Îndoirea genunchilor din atârnat / abdomene clasice', sets: [F('4-6 serii')], note: 'focus pe contracție' };

export const PPL: PplDay[] = [
  {
    id: 'push1',
    name: 'Push 1',
    exercises: [
      { group: 'Piept', name: 'Împins din înclinat cu gantere', sets: [H(), L()] },
      { group: 'Piept', name: 'Împins din orizontal la aparat', sets: [H(), L()] },
      { group: 'Umeri', name: 'Presă militară umeri', sets: [H(), L()] },
      { group: 'Umeri', name: 'Ramat cu bara vertical', sets: [H(), L(), RP()] },
      { group: 'Piept', name: 'Fluturări la cabluri din înclinat', sets: [H(), L()] },
      { group: 'Umeri', name: 'Fluturări laterale cu gantere', sets: [H(), L()] },
      { group: 'Piept', name: 'Flotări la paralele (dips), cu greutatea corpului', sets: [MAX, MAX] },
      { group: 'Triceps', name: 'Extensia tricepsului la aparat', sets: [H(), L()] },
      { group: 'Triceps', name: 'Extensie cu gantera deasupra capului', sets: [H(), L()] },
      ABS,
    ],
  },
  {
    id: 'pull1',
    name: 'Pull 1',
    exercises: [
      { group: 'Spate', name: 'Ramat la aparat de sus', sets: [H(), L(), RP()] },
      { group: 'Spate', name: 'Ramat cu sprijin pe piept la aparat', sets: [H(), L()] },
      { group: 'Spate', name: 'Ramat din aplecat cu bara', sets: [H(), L()] },
      { group: 'Spate', name: 'Tracțiuni (priză supinație)', sets: [MAX, MAX] },
      { group: 'Spate', name: 'Pullover la scripete', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Deltoid posterior', name: 'Fluturări înapoi la aparat', sets: [H(), L()] },
      { group: 'Biceps', name: 'Flexii cu bara Z', sets: [H('8-12'), L()] },
      { group: 'Biceps', name: 'Flexii la aparat', sets: [RP('10-15')] },
      { group: 'Trapez', name: 'Ridicări de umeri', sets: [H(), L()] },
    ],
  },
  {
    id: 'legs',
    name: 'Picioare',
    exercises: [
      { group: 'Cvadriceps', name: 'Presă', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Cvadriceps', name: 'Genuflexiuni hack (hack squat)', sets: [F('8-12'), L()] },
      { group: 'Cvadriceps', name: 'Extensii', sets: [H(), L(), RP()] },
      { group: 'Femural', name: 'RDL (îndreptări)', sets: [H(), L()] },
      { group: 'Femural', name: 'Flexii din șezut la aparat', sets: [H(), L()] },
      { group: 'Femural', name: 'Flexii unilaterale la aparat (din picioare)', sets: [F('8-12'), F('8-12'), RP()] },
      { group: 'Adductor', name: 'Adductor la aparat', sets: [H(), L()] },
      { group: 'Abductor', name: 'Abductor la aparat', sets: [H(), L()] },
      { group: 'Gambe', name: 'Ridicări pe vârfuri din picioare la aparat', sets: [H('8-12'), L('15-18'), RP('15-20')] },
    ],
  },
  {
    id: 'push2',
    name: 'Push 2',
    exercises: [
      { group: 'Piept', name: 'Împins la presă din înclinat la aparat', sets: [H(), L()] },
      { group: 'Piept', name: 'Împins din orizontal la aparat', sets: [H(), L(), RP()] },
      { group: 'Piept', name: 'Împins din declinat cu gantere', sets: [H(), L()] },
      { group: 'Piept', name: 'Fluturări la cabluri', sets: [H(), L()] },
      { group: 'Piept', name: 'Fluturări la aparat (peck deck)', sets: [RP()] },
      { group: 'Umeri', name: 'Împins pentru umeri la aparat', sets: [H(), L()] },
      { group: 'Umeri', name: 'Extensii laterale la aparat', sets: [H(), L()] },
      { group: 'Triceps', name: 'Extensii triceps la cabluri încrucișate', sets: [F('10-15'), F('10-15')] },
      { group: 'Triceps', name: 'Extensii triceps la cabluri sau gantere din aplecat', sets: [H(), L()] },
    ],
  },
  {
    id: 'arms',
    name: 'Brațe',
    exercises: [
      { group: 'Triceps', name: 'Împins din orizontal cu bara (priză îngustă)', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Triceps', name: 'Extensii deasupra capului cu gantera, cu ambele mâini', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Triceps', name: 'Extensii la cablu pe fiecare mână (priză inversă)', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Biceps', name: 'Flexii la aparat', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Biceps', name: 'Flexii la cablu (ciocan)', sets: [F('8-12'), F('8-12'), F('8-12')] },
      { group: 'Biceps', name: 'Flexii concentrate cu gantera', sets: [F('8-12'), F('8-12'), F('8-12')] },
      ABS,
    ],
  },
  {
    id: 'pull2',
    name: 'Pull 2',
    exercises: [
      { group: 'Spate', name: 'Tracțiuni la helcometru (priză supinație)', sets: [H(), L(), RP()] },
      { group: 'Spate', name: 'Tracțiuni la helcometru (priză largă)', sets: [H(), L()] },
      { group: 'Spate', name: 'Ramat T cu bara', sets: [H(), L()] },
      { group: 'Spate', name: 'Ramat la cablu', sets: [H(), L()] },
      { group: 'Deltoid posterior', name: 'Fluturări laterale din aplecat', sets: [H('8-12'), L('8-12')] },
      { group: 'Lombar', name: 'Hiperextensii', sets: [MAX, MAX, MAX] },
      { group: 'Trapez', name: 'Ridicări de umeri', sets: [H(), L()] },
      ABS,
    ],
  },
];

export const PPL_RULES: { t: string; d: string }[] = [
  { t: 'Intensitate', d: 'La capacitatea maximă: ultima repetare e chiar ultima, dar cu execuție perfectă, fără balans și fără mișcări explozive. Totul controlat prin contracția musculară.' },
  { t: 'Seturi', d: 'De obicei 2 serii pe exercițiu. Seturile de încălzire nu sunt scrise: fă cel puțin unul (mai multe la greutăți mari), fără să te epuizezi în ele.' },
  { t: 'Set greu', d: 'Primul set, cu greutate mare și puține repetări (5–9).' },
  { t: 'Set redus', d: 'Aceeași intensitate, cu greutatea scăzută cât să ajungi la 10–15 repetări.' },
  { t: 'Pauză', d: 'Refacere completă între seturi: 2–5 minute.' },
  { t: 'Progresie', d: 'Compari Pull 1 doar cu Pull 1 și încerci să-ți depășești cifrele, numai cu execuție perfectă. Rămâi la aceeași greutate până faci 9 repetări la setul greu sau 15 la cel redus, apoi o crești data viitoare.' },
  { t: 'Rest-pause', d: 'Faci repetările, ții greutatea, 3 respirații adânci, continui; repeți până nu mai poți face nicio repetare.' },
];

/** Rotația: ordinea din program. „Brațe” intră doar la cine face cel puțin 3 ședințe de forță pe săptămână. */
export function rotation(sessionsPerWeek: number): PplDay['id'][] {
  return sessionsPerWeek >= 3 ? ['push1', 'pull1', 'legs', 'push2', 'arms', 'pull2'] : ['push1', 'pull1', 'legs', 'push2', 'pull2'];
}

export type Dose = 'invatare' | 'complet' | 'anduranta' | 'mentinere';

/**
 * Doza după fază (forța vine peste înot, bicicletă și alergare):
 * - evaluare: învățare — aceleași exerciții, fără rest-pause, te oprești la 1–2 repetări înainte de cedare.
 * - baza1, baza2: complet — programul exact cum e scris.
 * - build: anduranță — fără rest-pause la picioare (oboseala ar strica alergarea și bicicleta din zilele următoare).
 * - peak, taper: menținere — doar setul greu, fără set redus și rest-pause; picioarele deloc în ultimele 10 zile (taper).
 */
export function doseFor(phase: Phase): Dose {
  return phase === 'evaluare' ? 'invatare' : phase === 'build' ? 'anduranta' : phase === 'peak' || phase === 'taper' ? 'mentinere' : 'complet';
}

export const DOSE_TEXT: Record<Dose, string> = {
  invatare: 'învățare: fără rest-pause, oprește-te cu 1–2 repetări înainte de cedare; prioritate execuția',
  complet: 'programul complet, cum e scris',
  anduranta: 'fără rest-pause la picioare: oboseala ar strica alergarea și bicicleta din zilele următoare',
  mentinere: 'menținere: doar setul greu, fără set redus și fără rest-pause',
};

/** Textul dozei, cu sporturile sportivului (la un singur sport nu pomenim bicicleta sau alergarea altcuiva). */
export function doseText(dose: Dose, sports: readonly string[]): string {
  if (dose !== 'anduranta') return DOSE_TEXT[dose];
  const names = (['inot', 'bicicleta', 'alergare'] as const).filter((s) => sports.includes(s)).map((s) => ({ inot: 'înotul', bicicleta: 'bicicleta', alergare: 'alergarea' })[s]);
  const what = names.length <= 1 ? (names[0] ?? 'antrenamentul') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`;
  return `fără rest-pause la picioare: oboseala ar strica ${what} din zilele următoare`;
}

export function dosed(day: PplDay, dose: Dose): PplDay {
  const ex = day.exercises.map((e) => {
    let sets = e.sets;
    // Învățare: fără rest-pause și fără seturi până la epuizare; „max” devine set oprit cu 2–3 repetări în rezervă.
    if (dose === 'invatare') sets = sets.filter((s) => s.kind !== 'restpause').map((s) => (s.kind === 'max' ? { kind: 'fix' as const, reps: '2–3 în rezervă' } : s));
    if (dose === 'anduranta' && day.id === 'legs') sets = sets.filter((s) => s.kind !== 'restpause');
    if (dose === 'mentinere') sets = sets.filter((s) => s.kind !== 'restpause' && s.kind !== 'lowered').slice(0, Math.max(1, sets.filter((s) => s.kind === 'heavy').length || 1));
    return { ...e, sets };
  });
  // Un exercițiu rămas fără seturi permise de doză iese din ședință (nu se readuce setul interzis).
  return { ...day, exercises: ex.filter((e) => e.sets.length > 0) };
}

export function dayById(id: string): PplDay | undefined {
  return PPL.find((d) => d.id === id);
}

/** Recunoaște ziua din textul ședinței din plan („Push 1 · …”). */
export function dayFromStructure(structure: string | null | undefined): PplDay | undefined {
  if (!structure) return undefined;
  return PPL.find((d) => structure.toLowerCase().startsWith(d.name.toLowerCase()));
}

/** Durata realistă: ~6 min pe exercițiu cu pauze complete; menținerea e mai scurtă. */
export function pplMinutes(day: PplDay, dose: Dose): number {
  const perEx = dose === 'mentinere' ? 4 : 6.5;
  return Math.round((day.exercises.length * perEx + 8) / 5) * 5;
}
