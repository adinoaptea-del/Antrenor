// Programul de forță AIRON: Push / Pull / Legs adaptiv (documentul „AIRON_Program_Forta_PPL_Adaptiv”, 18.10.2026).
//
// Ce e aici e motorul determinist din contractul programului: catalogul de exerciții (ID-uri stabile), cele șase ședințe
// A/B, completările, blocurile de 26 de săptămâni strânse sau extinse după data cursei, doza pe bloc și potrivirea
// ședinței în minutele pe care le are sportivul. Agentul de forță explică și propune alternative; nu inventează exerciții,
// kilograme sau capacități.
//
// Reguli din program, aplicate aici:
//  - efort cu repetări în rezervă (RIR): 3–4 la început, apoi 2–3; fără epuizare, rest-pause sau drop-seturi;
//  - pauze 2–3 min la mișcările principale, 60–120 s la accesorii; când timpul e scurt se taie accesorii, nu pauze;
//  - rotația Push A → Pull A → Legs A → Push B → Pull B → Legs B la 3 ședințe pe săptămână; cu 2 ședințe, două ședințe
//    pentru tot corpul (A/B), nu un PPL incomplet permanent;
//  - orizont variabil: sub 26 de săptămâni se strâng/unesc blocurile de dezvoltare, peste 26 se prelungește baza sau se
//    repetă blocuri productive; intensitatea și volumul NU se înmulțesc cu raportul dintre 26 și timpul rămas;
//  - fără greutăți inventate: fără istoric, „calibrare”.

export type Region = 'upper' | 'legs' | 'core' | 'carry';
export type Role = 'main' | 'accessory' | 'carry' | 'core';

export interface Exercise {
  id: string;
  name: string;
  group: string;
  region: Region;
  role: Role;
  /** Seturile de lucru din tabelul programului. */
  sets: number;
  reps: string;
  unilateral?: boolean;
  cue: string;
  alt: string;
}

export type SessionId = 'pushA' | 'pullA' | 'legsA' | 'pushB' | 'pullB' | 'legsB' | 'fullA' | 'fullB';

export interface StrengthSession {
  id: SessionId;
  name: string;
  focus: string;
  exercises: string[];
  /** Completările pentru a doua expunere pe săptămână (doar în PPL). */
  completions: { id: string; sets: number }[];
  /** Din blocul de bază: două seturi din prima mișcare se înlocuiesc cu acest exercițiu unilateral (dacă e tolerat). */
  legSwap?: string;
}

const E = (x: Exercise): Exercise => x;
export const CATALOG: Record<string, Exercise> = Object.fromEntries(
  [
    // Push A
    E({ id: 'push-db-bench', name: 'Împins cu gantere, bancă orizontală', group: 'piept', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'omoplații strânși, coborâre controlată 2–3 s', alt: 'împins la aparat pentru piept' }),
    E({ id: 'push-landmine', name: 'Împins unilateral landmine', group: 'umeri, piept', region: 'upper', role: 'accessory', sets: 2, reps: '8–12/braț', unilateral: true, cue: 'trunchiul fix, fără rotație', alt: 'împins unilateral cu gantera, din picioare' }),
    E({ id: 'push-cable-fly', name: 'Fluturări la cabluri', group: 'piept', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele ușor îndoite, umerii nu pleacă în față', alt: 'fluturări la aparat' }),
    E({ id: 'push-cable-lateral', name: 'Ridicări laterale la cablu', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'până la nivelul umerilor, fără balans', alt: 'ridicări laterale cu gantere' }),
    E({ id: 'push-rope-pushdown', name: 'Triceps cu frânghia la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele lângă corp, se mișcă doar antebrațul', alt: 'extensii triceps la aparat' }),
    // Push B
    E({ id: 'push-db-incline', name: 'Împins cu gantere, bancă ușor înclinată', group: 'piept', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'banca la 15–30°, coborâre controlată', alt: 'împins înclinat la aparat' }),
    E({ id: 'push-machine-shoulder', name: 'Împins la aparat pentru umeri', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'fără arcuire lombară; amplitudinea pe care o tolerezi', alt: 'împins landmine' }),
    E({ id: 'push-pushup', name: 'Flotări cu dificultate adaptată', group: 'piept, triceps', region: 'upper', role: 'accessory', sets: 2, reps: '8–15', cue: 'corp drept; sprijinul (bancă, genunchi) sau încărcarea se ajustează', alt: 'împins la aparat pentru piept' }),
    E({ id: 'push-db-lateral', name: 'Ridicări laterale cu gantere', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'controlat, fără balans', alt: 'ridicări laterale la cablu' }),
    E({ id: 'push-overhead-cable', name: 'Triceps deasupra capului, la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele fixe, întindere completă tolerată', alt: 'triceps cu frânghia la cablu' }),
    // Pull A
    E({ id: 'pull-lat-neutral', name: 'Helcometru, priză neutră', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'tragi cu coatele spre șolduri, fără balans', alt: 'tracțiuni asistate' }),
    E({ id: 'pull-chest-row', name: 'Ramat cu pieptul sprijinit', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'pieptul rămâne pe sprijin, pauză scurtă sus', alt: 'ramat la cablu din șezut' }),
    E({ id: 'pull-rev-fly-machine', name: 'Fluturări inverse la aparat', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'brațele lungi, mișcarea din umăr', alt: 'fluturări inverse la cabluri' }),
    E({ id: 'pull-db-hammer', name: 'Flexii cu gantere, priză neutră', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele fixe, fără balans', alt: 'flexii pentru biceps la cablu' }),
    E({ id: 'pull-farmer', name: 'Farmer carry, două gantere', group: 'prindere, trunchi', region: 'carry', role: 'carry', sets: 2, reps: '20–30 m', cue: 'postura dreaptă; setul se oprește înainte să pierzi postura', alt: 'suitcase carry' }),
    // Pull B
    E({ id: 'pull-assisted-pullup', name: 'Tracțiuni asistate', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'asistența aleasă ca intervalul să fie respectat', alt: 'helcometru, priză neutră' }),
    E({ id: 'pull-cable-row-1arm', name: 'Ramat unilateral la cablu', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–12/braț', unilateral: true, cue: 'fără rotația trunchiului', alt: 'ramat unilateral cu gantera, sprijinit' }),
    E({ id: 'pull-rev-fly-cable', name: 'Fluturări inverse la cabluri', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'brațele lungi, fără să ridici umerii', alt: 'fluturări inverse la aparat' }),
    E({ id: 'pull-cable-curl', name: 'Flexii pentru biceps la cablu', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele fixe', alt: 'flexii cu gantere, priză neutră' }),
    E({ id: 'pull-suitcase', name: 'Suitcase carry, o ganteră', group: 'trunchi, prindere', region: 'carry', role: 'carry', sets: 2, reps: '20–30 m/parte', unilateral: true, cue: 'nu te apleci spre ganteră', alt: 'farmer carry' }),
    // Legs A
    E({ id: 'legs-press', name: 'Presă pentru picioare', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', cue: 'amplitudinea tolerată de genunchi; spatele lipit de spătar', alt: 'genuflexiune cu gantera la piept' }),
    E({ id: 'legs-db-rdl', name: 'Îndreptări românești cu gantere', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–10', cue: 'șoldurile duse în spate, spatele neutru', alt: 'ridicări de bazin' }),
    E({ id: 'legs-seated-curl', name: 'Flexii pentru coapse din șezut', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'controlat la revenire', alt: 'flexii pentru coapse culcat' }),
    E({ id: 'legs-standing-calf', name: 'Ridicări pe vârfuri din picioare', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'pauză sus, coborâre completă tolerată', alt: 'ridicări pe vârfuri din șezut' }),
    E({ id: 'legs-dead-bug', name: 'Dead bug controlat', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '6–10/parte', unilateral: true, cue: 'lombarul rămâne pe sol', alt: 'Pallof press la cablu' }),
    E({ id: 'legs-split-squat', name: 'Fandare statică asistată', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12/picior', unilateral: true, cue: 'sprijin de mână; genunchiul urmărește vârful', alt: 'presă unilaterală' }),
    // Legs B
    E({ id: 'legs-goblet', name: 'Genuflexiune cu gantera la piept', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', cue: 'trunchiul drept, adâncimea tolerată', alt: 'presă pentru picioare' }),
    E({ id: 'legs-hip-thrust', name: 'Ridicări de bazin la aparat sau cu bara', group: 'fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', cue: 'bărbia ușor în piept, pauză sus', alt: 'îndreptări românești cu gantere' }),
    E({ id: 'legs-lying-curl', name: 'Flexii pentru coapse culcat', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'bazinul lipit de banc', alt: 'flexii pentru coapse din șezut' }),
    E({ id: 'legs-seated-calf', name: 'Ridicări pe vârfuri din șezut', group: 'gambe (solear)', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', cue: 'pauză jos și sus', alt: 'ridicări pe vârfuri din picioare' }),
    E({ id: 'legs-pallof', name: 'Pallof press la cablu', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '8–12/parte', unilateral: true, cue: 'bazinul și umerii nu se rotesc', alt: 'dead bug controlat' }),
    E({ id: 'legs-step-up', name: 'Urcare pe treaptă joasă', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12/picior', unilateral: true, cue: 'împingi din piciorul de sus, fără elan', alt: 'fandare statică asistată' }),
  ].map((x) => [x.id, x]),
);

export const SESSIONS: Record<SessionId, StrengthSession> = {
  pushA: { id: 'pushA', name: 'Push A', focus: 'piept, umeri, triceps', exercises: ['push-db-bench', 'push-landmine', 'push-cable-fly', 'push-cable-lateral', 'push-rope-pushdown'], completions: [{ id: 'pull-chest-row', sets: 2 }, { id: 'legs-seated-curl', sets: 2 }] },
  pullA: { id: 'pullA', name: 'Pull A', focus: 'spate, umăr posterior, biceps', exercises: ['pull-lat-neutral', 'pull-chest-row', 'pull-rev-fly-machine', 'pull-db-hammer', 'pull-farmer'], completions: [{ id: 'push-db-bench', sets: 2 }, { id: 'legs-press', sets: 2 }] },
  legsA: { id: 'legsA', name: 'Legs A', focus: 'picioare, trunchi', exercises: ['legs-press', 'legs-db-rdl', 'legs-seated-curl', 'legs-standing-calf', 'legs-dead-bug'], completions: [], legSwap: 'legs-split-squat' },
  pushB: { id: 'pushB', name: 'Push B', focus: 'piept, umeri, triceps', exercises: ['push-db-incline', 'push-machine-shoulder', 'push-pushup', 'push-db-lateral', 'push-overhead-cable'], completions: [{ id: 'pull-cable-row-1arm', sets: 2 }, { id: 'legs-lying-curl', sets: 2 }] },
  pullB: { id: 'pullB', name: 'Pull B', focus: 'spate, umăr posterior, biceps', exercises: ['pull-assisted-pullup', 'pull-cable-row-1arm', 'pull-rev-fly-cable', 'pull-cable-curl', 'pull-suitcase'], completions: [{ id: 'push-db-incline', sets: 2 }, { id: 'legs-goblet', sets: 2 }] },
  legsB: { id: 'legsB', name: 'Legs B', focus: 'picioare, trunchi', exercises: ['legs-goblet', 'legs-hip-thrust', 'legs-lying-curl', 'legs-seated-calf', 'legs-pallof'], completions: [], legSwap: 'legs-step-up' },
  // Cu două ședințe pe săptămână: tot corpul, din același catalog (alegerea AIRON; programul cere tot corpul, nu un PPL incomplet).
  fullA: { id: 'fullA', name: 'Tot corpul A', focus: 'picioare, împins, tras, trunchi', exercises: ['legs-press', 'push-db-bench', 'pull-lat-neutral', 'legs-db-rdl', 'push-cable-lateral', 'pull-farmer', 'legs-dead-bug'], completions: [] },
  fullB: { id: 'fullB', name: 'Tot corpul B', focus: 'picioare, tras, împins, trunchi', exercises: ['legs-goblet', 'pull-chest-row', 'push-machine-shoulder', 'legs-hip-thrust', 'legs-lying-curl', 'pull-suitcase', 'legs-pallof'], completions: [] },
};

export const PPL_ROTATION: SessionId[] = ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'];
export const FULL_ROTATION: SessionId[] = ['fullA', 'fullB'];
export const isLegsSession = (id: SessionId) => id === 'legsA' || id === 'legsB';

// ——— Blocurile ———

export type Block = 'acomodare' | 'baza' | 'forta' | 'hipertrofie' | 'integrare' | 'consolidare' | 'evaluare' | 'mentinere' | 'precursa';

export const BLOCK_LABEL: Record<Block, string> = {
  acomodare: 'Acomodare',
  baza: 'Bază',
  forta: 'Accent pe forță',
  hipertrofie: 'Hipertrofie moderată',
  integrare: 'Integrare funcțională',
  consolidare: 'Consolidare',
  evaluare: 'Evaluare',
  mentinere: 'Menținere',
  precursa: 'Înainte de cursă',
};

export const BLOCK_GOAL: Record<Block, string> = {
  acomodare: 'calibrare, tehnică, toleranță; greutăți alese, nu presupuse',
  baza: 'creștere graduală spre dozele din tabel; lucru unilateral tolerat',
  forta: 'prima mișcare stabilă poate trece la 5–8 repetări, dacă tehnica permite',
  hipertrofie: 'majoritatea exercițiilor în 8–12 repetări; schimbări selective, motivate',
  integrare: 'păstrezi mișcarea principală, unilateral, transportul și trunchiul; ajustare după anduranță',
  consolidare: 'menții ce funcționează; anduranța crește, seturile scad înainte de recorduri',
  evaluare: 'compari performanțe submaximale similare, toleranța și aderența',
  mentinere: 'menținere și familiarizare: puțin volum, nimic nou',
  precursa: 'doză redusă, aceleași exerciții, nimic nou lângă cursă',
};

export interface BlockWeek {
  block: Block;
  /** Săptămâna în bloc, de la 1. */
  week: number;
  /** Lungimea blocului. */
  len: number;
}

const DEV_ORDER: Block[] = ['baza', 'forta', 'hipertrofie', 'integrare'];
/** La sportivii de anduranță, ce se păstrează întâi când timpul e scurt (hipertrofia e ce cade prima). */
const DEV_PRIORITY: Block[] = ['baza', 'forta', 'integrare', 'hipertrofie'];

/**
 * Orizontul variabil: împarte săptămânile până la cursă în blocuri. Referința: 4 acomodare · 4 bază · 4 forță ·
 * 4 hipertrofie · 4 integrare · 4 consolidare · 2 la final (26). Sub 26 se strâng blocurile de dezvoltare (fără să sară
 * peste reacomodare), peste 26 se prelungește baza și se repetă blocurile productive. Ultimele 1–2 săptămâni sunt doză
 * redusă înaintea cursei; foarte aproape de cursă, doar menținere și familiarizare.
 */
export function strengthBlocks(totalWeeks: number): BlockWeek[] {
  const T = Math.max(0, Math.floor(totalWeeks));
  const seq: { block: Block; len: number }[] = [];
  if (T === 0) return [];
  if (T <= 5) {
    // Obiectiv foarte apropiat: o săptămână de familiarizare, menținere, ultima săptămână redusă.
    if (T >= 3) seq.push({ block: 'acomodare', len: 1 });
    const pre = 1;
    const mid = T - pre - (T >= 3 ? 1 : 0);
    if (mid > 0) seq.push({ block: 'mentinere', len: mid });
    seq.push({ block: 'precursa', len: pre });
  } else {
    const pre = T >= 10 ? 2 : 1;
    const acc = T < 14 ? 2 : T < 20 ? 3 : 4;
    const avail = T - pre - acc;
    const len: Record<Block, number> = { acomodare: acc, baza: 0, forta: 0, hipertrofie: 0, integrare: 0, consolidare: 0, evaluare: 0, mentinere: 0, precursa: pre };
    const extras: { block: Block; len: number }[] = [];
    if (avail < 20) {
      len.consolidare = avail >= 8 ? 2 : avail >= 5 ? 1 : 0;
      let dev = avail - len.consolidare;
      for (const b of DEV_PRIORITY) {
        const take = Math.min(4, dev);
        len[b] = take;
        dev -= take;
      }
    } else {
      for (const b of DEV_ORDER) len[b] = 4;
      len.consolidare = 4;
      let extra = avail - 20;
      // Mai mult timp: întâi baza mai lungă (cel mult +4), apoi blocuri productive repetate (forță, hipertrofie), cu reevaluare.
      const addBase = Math.min(4, extra);
      len.baza += addBase;
      extra -= addBase;
      const cycle: Block[] = ['forta', 'hipertrofie'];
      let k = 0;
      while (extra >= 4) {
        extras.push({ block: cycle[k % 2]!, len: 4 });
        extra -= 4;
        k += 1;
      }
      len.consolidare += extra;
    }
    seq.push({ block: 'acomodare', len: len.acomodare });
    for (const b of ['baza', 'forta', 'hipertrofie'] as Block[]) if (len[b]) seq.push({ block: b, len: len[b] });
    seq.push(...extras);
    if (len.integrare) seq.push({ block: 'integrare', len: len.integrare });
    if (len.consolidare) seq.push({ block: 'consolidare', len: len.consolidare });
    seq.push({ block: 'precursa', len: pre });
  }
  const out: BlockWeek[] = [];
  for (const s of seq) for (let w = 1; w <= s.len; w++) out.push({ block: s.block, week: w, len: s.len });
  return out.slice(0, T);
}

// ——— Prescripția ———

export type LegsMode = 'normal' | 'usor' | 'fara';

export interface StrengthSpec {
  session: SessionId;
  block: Block;
  week: number;
  len: number;
  /** Săptămână de descărcare în planul de anduranță: o treime din seturi jos, efort mai moderat. */
  recovery?: boolean;
  /** „usor”: a doua zi e ședință-cheie; „fara”: ultimele 10 zile dinaintea cursei. */
  legs?: LegsMode;
}

export interface Rx {
  ex: Exercise;
  sets: number;
  reps: string;
  rir: string;
  /** Pauza dintre seturi, secunde. */
  rest: number;
  completion?: boolean;
  note?: string;
}

export interface Prescription {
  spec: StrengthSpec;
  session: StrengthSession;
  items: Rx[];
  /** Durata estimată, minute (încălzire + seturi + pauze), rotunjită la 5. */
  minutes: number;
  /** Ce s-a tăiat ca să încapă în timp și de ce. */
  trimmed: string[];
  notes: string[];
}

const REST: Record<Role, number> = { main: 150, accessory: 90, carry: 75, core: 60 };
const WORK_SEC = 40;
const WARMUP_MIN = 8;

function rirFor(spec: StrengthSpec): string {
  if (spec.block === 'acomodare') return spec.week <= 2 ? '3–4' : '3';
  if (spec.block === 'precursa') return '3–4';
  if (spec.block === 'mentinere') return '3';
  if (spec.recovery) return '3';
  if (spec.block === 'baza' && spec.week === 1) return '3';
  return '2–3';
}

/** Durata (s) a unui exercițiu: fiecare set = lucru + pauză; la unilateral, ambele părți. */
function itemSec(r: Rx): number {
  return r.sets * (WORK_SEC * (r.ex.unilateral ? 2 : 1) + r.rest);
}

export function estimateMinutes(items: Rx[]): number {
  return WARMUP_MIN + items.reduce((n, r) => n + itemSec(r), 0) / 60;
}

/** Prescripția întreagă pentru blocul și săptămâna date, fără limită de timp. */
export function prescribeFull(spec: StrengthSpec): Prescription {
  const session = SESSIONS[spec.session];
  const rir = rirFor(spec);
  const notes: string[] = [];
  const isPpl = !spec.session.startsWith('full');
  let items: Rx[] = session.exercises.map((id) => {
    const ex = CATALOG[id]!;
    return { ex, sets: ex.sets, reps: ex.reps, rir, rest: REST[ex.role] };
  });

  // Din bază, la Legs: două seturi din prima mișcare devin lucru unilateral (fandare / treaptă), fără volum în plus.
  if (session.legSwap && spec.block !== 'acomodare' && spec.block !== 'mentinere' && spec.block !== 'precursa') {
    const first = items[0]!;
    first.sets = Math.max(1, first.sets - 2);
    const sw = CATALOG[session.legSwap]!;
    items.splice(1, 0, { ex: sw, sets: 2, reps: sw.reps, rir, rest: REST.main, note: 'dacă e tolerat; altfel rămân seturile de la prima mișcare' });
  }

  // Completările (a doua expunere pe săptămână), cu ~3 repetări în rezervă, incluse în durată.
  if (isPpl && !(spec.block === 'acomodare' && spec.week <= 2) && spec.block !== 'mentinere' && spec.block !== 'precursa') {
    const n = spec.block === 'consolidare' || spec.block === 'evaluare' ? 1 : 2;
    for (const c of session.completions) {
      const ex = CATALOG[c.id]!;
      items.push({ ex, sets: Math.min(c.sets, n), reps: ex.reps, rir: '3', rest: REST.accessory, completion: true });
    }
  }

  for (const r of items) {
    if (r.completion) continue;
    switch (spec.block) {
      case 'acomodare':
        r.sets = spec.week <= 2 ? (r.ex.role === 'main' ? 2 : 1) : Math.max(1, r.sets - 1);
        break;
      case 'forta':
        if (r === items[0] && r.ex.role === 'main' && !r.ex.unilateral) r.reps = '5–8';
        break;
      case 'consolidare':
      case 'evaluare':
        if (r.ex.role === 'accessory') r.sets = Math.max(1, r.sets - 1);
        break;
      case 'mentinere':
        r.sets = r.ex.role === 'main' ? 2 : 1;
        break;
      case 'precursa':
        r.sets = Math.max(1, Math.ceil(r.sets / 2));
        break;
      default:
        break;
    }
  }
  if (spec.block === 'forta' && items[0]?.reps === '5–8') notes.push('prima mișcare la 5–8 repetări doar dacă tehnica rămâne aceeași; altfel rămâi la intervalul din tabel');
  if (spec.block === 'acomodare') notes.push('fără istoric de greutăți: calibrezi — alegi greutatea cu care intervalul se respectă cu rezerva cerută');
  if (spec.block === 'evaluare') notes.push('compari cu aceeași ședință de data trecută, la aceeași rezervă și amplitudine');

  // Descărcarea din planul de anduranță: aproximativ o treime din seturi mai puțin, efort mai moderat.
  if (spec.recovery) {
    for (const r of items) r.sets = Math.max(1, Math.round((r.sets * 2) / 3));
    notes.push('săptămână de descărcare: o treime din seturi mai puțin');
  }

  // Picioarele: ușoare înaintea unei ședințe-cheie, deloc în ultimele 10 zile dinaintea cursei.
  if (spec.legs === 'fara') {
    items = items.filter((r) => r.ex.region !== 'legs');
    notes.push('fără picioare: ultimele zile dinaintea cursei');
  } else if (spec.legs === 'usor') {
    for (const r of items) if (r.ex.region === 'legs') {
      r.sets = 1;
      r.rir = '4';
    }
    notes.push('picioare ușoare: a doua zi e o ședință-cheie');
  }

  return { spec, session, items, minutes: roundUp5(estimateMinutes(items)), trimmed: [], notes };
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;

/**
 * Ședința potrivită în timpul dat. Ordinea tăierilor (din program: „când timpul e scurt, reduce accesorii, nu timpul
 * de recuperare dintre mișcările principale”): completările, apoi seturile accesoriilor de la coadă, apoi accesoriile
 * întregi (izolările întâi, apoi transportul, apoi trunchiul), abia la urmă un set din mișcările principale.
 * Pauzele nu se scurtează niciodată. Volum în plus nu se adaugă când e timp mai mult.
 */
export function prescribe(spec: StrengthSpec, minutes: number): Prescription {
  const p = prescribeFull(spec);
  const items = p.items.map((r) => ({ ...r }));
  const trimmed: string[] = [];
  const fits = () => estimateMinutes(items) <= minutes;
  const removeWhere = (pred: (r: Rx) => boolean, why: (r: Rx) => string) => {
    for (let i = items.length - 1; i >= 0 && !fits(); i--) {
      if (pred(items[i]!)) {
        trimmed.push(why(items[i]!));
        items.splice(i, 1);
      }
    }
  };
  removeWhere((r) => !!r.completion, (r) => `completarea ${r.ex.name.toLowerCase()}`);
  for (let i = items.length - 1; i >= 0 && !fits(); i--) {
    const r = items[i]!;
    if (r.ex.role === 'accessory' && r.sets > 1) {
      r.sets -= 1;
      trimmed.push(`un set la ${r.ex.name.toLowerCase()}`);
    }
  }
  removeWhere((r) => r.ex.role === 'accessory', (r) => r.ex.name.toLowerCase());
  removeWhere((r) => r.ex.role === 'carry', (r) => r.ex.name.toLowerCase());
  removeWhere((r) => r.ex.role === 'core', (r) => r.ex.name.toLowerCase());
  for (let i = items.length - 1; i >= 0 && !fits(); i--) {
    const r = items[i]!;
    if (r.sets > 2) {
      r.sets -= 1;
      trimmed.push(`un set la ${r.ex.name.toLowerCase()}`);
    }
  }
  // Tot nu încape: rămân primele mișcări principale, câte încap (minimum una).
  while (!fits() && items.length > 1) trimmed.push(items.pop()!.ex.name.toLowerCase());
  const notes = [...p.notes];
  if (trimmed.length) notes.push(`ca să încapă în ${minutes} min: fără ${trimmed.join(', ')}; pauzele rămân întregi`);
  return { ...p, items, minutes: roundUp5(estimateMinutes(items)), trimmed, notes };
}

// ——— Textul din plan (citit de oameni și de cod) ———

const LEGS_TEXT: Record<Exclude<LegsMode, 'normal'>, string> = { usor: 'picioare ușoare', fara: 'fără picioare' };

/** „Push A · Bază, săpt. 2/4 · 2–3 repetări în rezervă · descărcare”. */
export function strengthStructure(spec: StrengthSpec): string {
  const parts = [SESSIONS[spec.session].name, `${BLOCK_LABEL[spec.block]}, săpt. ${spec.week}/${spec.len}`, `${rirFor(spec)} repetări în rezervă`];
  if (spec.recovery) parts.push('descărcare');
  if (spec.legs && spec.legs !== 'normal') parts.push(LEGS_TEXT[spec.legs]);
  return parts.join(' · ');
}

export function parseStrength(structure: string | null | undefined): StrengthSpec | null {
  if (!structure) return null;
  const parts = structure.split(' · ');
  const session = (Object.values(SESSIONS).find((s) => s.name === parts[0]) ?? null)?.id;
  if (!session) return null;
  const m = /^(.+), săpt\. (\d+)\/(\d+)$/.exec(parts[1] ?? '');
  if (!m) return null;
  const block = (Object.entries(BLOCK_LABEL).find(([, l]) => l === m[1]) ?? [])[0] as Block | undefined;
  if (!block) return null;
  const rest = parts.slice(2);
  const legs: LegsMode = rest.includes(LEGS_TEXT.fara) ? 'fara' : rest.includes(LEGS_TEXT.usor) ? 'usor' : 'normal';
  return { session, block, week: Number(m[2]), len: Number(m[3]), recovery: rest.includes('descărcare'), legs };
}

/** Numele ședinței din textul din plan (și pentru planurile vechi „Push 1 · …”). */
export function sessionName(structure: string | null | undefined): string | null {
  const s = parseStrength(structure);
  if (s) return SESSIONS[s.session].name;
  const first = (structure ?? '').split(' · ')[0] ?? '';
  return /^(Push|Pull|Picioare|Brațe|Legs|Tot corpul)/.test(first) ? first : null;
}

export const STRENGTH_RULES: { t: string; d: string }[] = [
  { t: 'Efort', d: 'Cu repetări în rezervă (RIR): la început 3–4, apoi de regulă 2–3. Rezerva e o estimare a ta, nu o măsurătoare. Fără epuizare completă, fără rest-pause, fără drop-seturi.' },
  { t: 'Încălzire', d: 'Seturile din tabel sunt seturi de lucru. Înainte: încălzire generală scurtă și seturi progresive la primele mișcări, fără să te obosești.' },
  { t: 'Pauze', d: '2–3 minute la mișcările principale, 60–120 secunde la accesorii; mai mult dacă respirația și controlul nu s-au refăcut. Nu scurtezi pauzele ca să crească pulsul.' },
  { t: 'Progresie dublă', d: 'Alegi o greutate cu care intervalul se respectă. Data viitoare, la aceeași ședință (Push A cu Push A), adaugi repetări. Când toate seturile ajung la capătul de sus curat, cu rezerva cerută, crești cu cel mai mic increment; revenirea spre capătul de jos e normală.' },
  { t: 'Când scazi', d: 'Dacă nu mai atingi capătul de jos sau pierzi tehnica, scazi greutatea. Nu crești deodată greutatea, seturile și apropierea de epuizare. La un exercițiu nou recalibrezi; kilogramele nu se transferă între aparate.' },
  { t: 'Durere', d: 'Durere nouă, ascuțită sau în creștere: oprești mișcarea care o provoacă și spui în formularul de seară. Durere în piept, leșin sau lipsă de aer neobișnuită: oprești efortul și mergi la medic.' },
];
