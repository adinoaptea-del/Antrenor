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
/** Echipament: aparat, cablu, bară, bancă (sală); gantere, bandă, corp, scaun/treaptă (și acasă). */
export type Equip = 'aparat' | 'cablu' | 'bara' | 'banca' | 'gantere' | 'banda' | 'corp' | 'scaun' | 'reformer';
/** Acasă, fără declarația echipamentului (chestionarele vechi): gantere, bandă, corp, scaun. */
export const HOME_EQUIP: Equip[] = ['gantere', 'banda', 'corp', 'scaun'];
/**
 * Ce declară sportivul că are acasă (regula 49): gantere, bandă elastică, saltea, reformer (Pilates). Greutatea corpului și
 * un scaun stabil se presupun mereu; salteaua nu schimbă exercițiile (cele de la sol se fac oricum pe ceva moale).
 */
export type HomeGear = 'gantere' | 'banda' | 'saltea' | 'reformer';
export const HOME_GEAR: HomeGear[] = ['gantere', 'banda', 'saltea', 'reformer'];
export const HOME_GEAR_LABEL: Record<HomeGear, string> = { gantere: 'gantere', banda: 'bandă elastică', saltea: 'saltea', reformer: 'reformer (Pilates)' };
/** Echipamentul disponibil acasă: cel declarat + corp + scaun; fără declarație, varianta de până acum. */
export function homeEquip(gear?: readonly HomeGear[] | null): Equip[] {
  if (!gear) return HOME_EQUIP;
  return [...new Set<Equip>(['corp', 'scaun', ...gear.filter((g): g is Exclude<HomeGear, 'saltea'> => g !== 'saltea')])];
}
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
  /** Echipamentul necesar (fitness): ce trebuie să existe ca exercițiul să fie executabil. */
  equip?: Equip[];
  /** Pauza dintre seturi (s), când exercițiul are pauza lui în program (fitness); altfel după rol. */
  rest?: number;
  /** Poziția culcat (pe spate / pe burtă): exclusă în contextul de sarcină / postpartum (auditul v93, A105). */
  lying?: 'spate' | 'burta';
  /** Fișa exercițiului (fitness): ce lucrează, cum reglezi aparatul, greșelile frecvente. */
  purpose?: string;
  setup?: string;
  mistakes?: string;
}

export type FitnessSessionId = 'f1' | 'f2' | 'a3' | 'b3' | 'c3' | 'l1' | 'l2' | 'l3' | 'u1' | 'u2' | 'fa' | 'fb' | 'fc' | 'fd' | 'ft';
/** Bărbații (anduranță): Push / Pull / Picioare cu exerciții care se schimbă de la o ședință la alta. */
export type SplitSessionId = 'push' | 'pull' | 'legs';
/** Modulele scurte de întreținere ale fizioterapeutului (A: picior și șold; B: umăr și trunchi), separate de sală. */
export type MaintenanceSessionId = 'intA' | 'intB';
export type SessionId = 'pushA' | 'pullA' | 'legsA' | 'pushB' | 'pullB' | 'legsB' | 'fullA' | 'fullB' | 'full' | SplitSessionId | FitnessSessionId | MaintenanceSessionId;

export interface StrengthSession {
  id: SessionId;
  name: string;
  focus: string;
  exercises: string[];
  /** Completările pentru a doua expunere pe săptămână (doar în PPL). */
  completions: { id: string; sets: number }[];
  /** Din blocul de bază: două seturi din prima mișcare se înlocuiesc cu acest exercițiu unilateral (dacă e tolerat). */
  legSwap?: string;
  /** Doza din tabelul ședinței (fitness), când diferă de cea din catalog. */
  dose?: Record<string, { sets: number; reps?: string; rest?: number; ss?: string }>;
  /** Durata estimată afișată (fitness, varianta amplă A–D), din programul de referință. */
  estimate?: string;
  /**
   * Push / Pull / Picioare (bărbați): fiecare poziție are un set de exerciții echivalente, cu aparate diferite; varianta
   * ședinței alege câte unul din fiecare. Ultima poziție (abdomen) e opțională și cade prima când e puțin timp.
   */
  slots?: string[][];
  /** Încălzirea ședinței, scrisă concret (ce faci în cele 10 minute). */
  warmup?: string;
  /** Finalul de cardio (ca la antrenoare: scări, mers rapid, eliptică); minutele cresc până ședința are cel puțin 45. */
  finisher?: { text: string; min: number; max: number };
  /** Numele vechi (planuri salvate): se citesc și se rescriu cu numele de acum. */
  aliases?: string[];
  /** Variantele ședinței (fitness, din săptămânile antrenoarei): exercițiile se schimbă de la o ședință la alta. */
  variants?: { exercises: string[]; dose: NonNullable<StrengthSession['dose']> }[];
  /**
   * Modul de întreținere (fizioterapeut, auditul v93 A91): 12–20 min, 1–2 serii, rezervă mare. NU e ședință de sală:
   * nu se ridică la 45 de minute și la 3 serii (regula 20 guvernează ședințele de forță, nu modulul de întreținere).
   */
  maintenance?: boolean;
  /**
   * Tot corpul (o singură ședință pe săptămână): picioarele ȘI partea de sus în aceeași ședință. EXCEPȚIA decisă de
   * proprietar pe 20.10.2026 (auditul v93, A50) de la regula „picioarele nu se combină cu partea de sus”: la o ședință pe
   * săptămână, altfel o grupă ar fi lucrată o dată la 2–3 săptămâni. La 2+ ședințe regula rămâne (sus / jos, PPL).
   */
  fullBody?: boolean;
}

const E = (x: Exercise): Exercise => x;
export const CATALOG: Record<string, Exercise> = Object.fromEntries(
  [
    // Push A
    E({ id: 'push-db-bench', name: 'Împins cu gantere, bancă orizontală', group: 'piept', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'omoplații strânși pe bancă; cobori ganterele încet, în 2–3 secunde', alt: 'împins la aparat pentru piept' }),
    E({ id: 'push-landmine', name: 'Împins landmine cu un braț', group: 'umeri, piept', region: 'upper', role: 'accessory', sets: 2, reps: '8–12/braț', unilateral: true, cue: 'trunchiul fix, fără rotație', alt: 'împins cu o ganteră, din picioare' }),
    E({ id: 'push-cable-fly', name: 'Fluturări la cabluri', group: 'piept', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele ușor îndoite, umerii nu pleacă în față', alt: 'fluturări la aparat' }),
    E({ id: 'push-cable-lateral', name: 'Ridicări laterale la cablu', group: 'umeri (lateral)', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'până la nivelul umerilor, fără balans', alt: 'ridicări laterale cu gantere' }),
    E({ id: 'push-rope-pushdown', name: 'Triceps cu frânghia la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele lângă corp, se mișcă doar antebrațul', alt: 'extensii triceps la aparat' }),
    // Push B
    E({ id: 'push-db-incline', name: 'Împins cu gantere, bancă ușor înclinată', group: 'piept', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'banca la 15–30°, coborâre controlată', alt: 'împins înclinat la aparat' }),
    E({ id: 'push-machine-shoulder', name: 'Împins la aparat pentru umeri', group: 'umeri (fața)', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'spatele lipit de spătar; cobori cât nu te doare umărul', alt: 'împins cu gantere deasupra capului' }),
    E({ id: 'push-pushup', name: 'Flotări cu dificultate adaptată', group: 'piept, triceps', region: 'upper', role: 'accessory', sets: 2, reps: '8–15', cue: 'corp drept; sprijinul (bancă, genunchi) sau încărcarea se ajustează', alt: 'împins la aparat pentru piept' }),
    E({ id: 'push-db-lateral', name: 'Ridicări laterale cu gantere', group: 'umeri (lateral)', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'controlat, fără balans', alt: 'ridicări laterale la cablu' }),
    E({ id: 'push-overhead-cable', name: 'Triceps deasupra capului, la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele fixe; întinzi brațele complet deasupra capului', alt: 'triceps cu frânghia la cablu' }),
    // Pull A
    E({ id: 'pull-lat-neutral', name: 'Helcometru, priză neutră', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'tragi cu coatele spre șolduri, fără balans', alt: 'tracțiuni asistate' }),
    E({ id: 'pull-chest-row', name: 'Ramat cu pieptul sprijinit', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'pieptul rămâne pe pernă; strângi omoplații o secundă la final', alt: 'ramat la cablu din șezut' }),
    E({ id: 'pull-rev-fly-machine', name: 'Fluturări inverse la aparat', group: 'umeri (spate)', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'brațele lungi, mișcarea din umăr', alt: 'fluturări inverse la cabluri' }),
    E({ id: 'pull-db-hammer', name: 'Flexii cu gantere, priză neutră', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele fixe, fără balans', alt: 'flexii pentru biceps la cablu' }),
    E({ id: 'pull-farmer', name: 'Farmer carry, două gantere', group: 'prindere, trunchi', region: 'carry', role: 'carry', sets: 2, reps: '20–30 m', cue: 'postura dreaptă; setul se oprește înainte să pierzi postura', alt: 'suitcase carry' }),
    // Pull B
    E({ id: 'pull-assisted-pullup', name: 'Tracțiuni asistate', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'alegi asistența cu care faci repetările cerute; urci până la bărbie peste bară', alt: 'helcometru, priză neutră' }),
    E({ id: 'pull-cable-row-1arm', name: 'Ramat la cablu cu un braț', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–12/braț', unilateral: true, cue: 'fără rotația trunchiului', alt: 'ramat cu gantera, un braț, sprijinit pe bancă' }),
    E({ id: 'pull-rev-fly-cable', name: 'Fluturări inverse la cabluri', group: 'umeri (spate)', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'brațele lungi, fără să ridici umerii', alt: 'fluturări inverse la aparat' }),
    E({ id: 'pull-cable-curl', name: 'Flexii pentru biceps la cablu', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele fixe', alt: 'flexii cu gantere, priză neutră' }),
    E({ id: 'pull-suitcase', name: 'Suitcase carry, o ganteră', group: 'trunchi, prindere', region: 'carry', role: 'carry', sets: 2, reps: '20–30 m/parte', unilateral: true, cue: 'nu te apleci spre ganteră', alt: 'farmer carry' }),
    // Legs A
    E({ id: 'legs-press', name: 'Presă pentru picioare', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', cue: 'cobori cât nu te doare genunchiul; spatele lipit de spătar', alt: 'genuflexiune cu gantera la piept' }),
    E({ id: 'legs-db-rdl', name: 'Îndreptări românești cu gantere', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–10', cue: 'șoldurile duse în spate, spatele neutru', alt: 'ridicări de bazin' }),
    E({ id: 'legs-seated-curl', name: 'Flexii femurali (spatele coapsei), din șezut', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'controlat la revenire', alt: 'flexii femurali culcat' }),
    E({ id: 'legs-standing-calf', name: 'Ridicări pe vârfuri din picioare', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'ții o secundă sus, cobori călcâiele cât poți', alt: 'ridicări pe vârfuri din șezut' }),
    E({ id: 'legs-dead-bug', name: 'Dead bug controlat', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '6–10/parte', unilateral: true, cue: 'partea de jos a spatelui rămâne lipită de sol', alt: 'Pallof press la cablu' }),
    E({ id: 'legs-split-squat', name: 'Fandare statică asistată', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12/picior', unilateral: true, cue: 'sprijin de mână; genunchiul urmărește vârful', alt: 'presă cu un picior' }),
    // Legs B
    E({ id: 'legs-goblet', name: 'Genuflexiune cu gantera la piept', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', cue: 'spatele drept; cobori cât poți fără durere', alt: 'presă pentru picioare' }),
    E({ id: 'legs-hip-thrust', name: 'Ridicări de bazin la aparat sau cu bara', group: 'fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', cue: 'umerii pe bancă, împingi bazinul în sus și ții o secundă sus', alt: 'îndreptări românești cu gantere' }),
    E({ id: 'legs-lying-curl', name: 'Flexii femurali (spatele coapsei), culcat', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'bazinul lipit de banc', alt: 'flexii femurali din șezut' }),
    E({ id: 'legs-seated-calf', name: 'Ridicări pe vârfuri din șezut', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', cue: 'ții o secundă jos și una sus', alt: 'ridicări pe vârfuri din picioare' }),
    E({ id: 'legs-pallof', name: 'Pallof press la cablu', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '8–12/parte', unilateral: true, cue: 'bazinul și umerii nu se rotesc', alt: 'dead bug controlat' }),
    E({ id: 'legs-pogo', name: 'Sărituri pe loc (pogo)', group: 'gambe, tendon ahilean', region: 'legs', role: 'accessory', sets: 2, reps: '15–20', cue: 'contact scurt cu solul, genunchii aproape drepți, aterizezi pe antepicior; se oprește la primul semn de durere', alt: 'sărituri ușoare cu coarda' }),
    E({ id: 'legs-step-up', name: 'Urcare pe treaptă joasă', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12/picior', unilateral: true, cue: 'împingi din piciorul de sus, fără elan', alt: 'fandare statică asistată' }),
    // ——— Push / Pull / Picioare cu exerciții care se schimbă (bărbați, 19.10.2026) ———
    // Push: piept, umeri (fața și lateral), triceps
    E({ id: 'push-bb-bench', name: 'Împins cu bara, bancă orizontală', group: 'piept', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'cobori bara încet pe piept, omoplații strânși pe bancă, picioarele pe sol', alt: 'împins cu gantere' }),
    E({ id: 'push-machine-chest', name: 'Împins la aparat pentru piept', group: 'piept', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'mânerele la mijlocul pieptului; împingi fără să ridici umerii', alt: 'împins cu gantere' }),
    E({ id: 'push-smith-incline', name: 'Împins înclinat la Smith sau la aparat', group: 'piept (partea de sus)', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'banca puțin înclinată; bara coboară sub claviculă', alt: 'împins înclinat cu gantere' }),
    E({ id: 'push-bb-incline', name: 'Împins înclinat cu bara', group: 'piept (partea de sus)', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'banca puțin înclinată, cobori încet, fără să sari bara de pe piept', alt: 'împins înclinat la aparat' }),
    E({ id: 'push-db-ohp', name: 'Împins deasupra capului cu gantere, șezând', group: 'umeri (fața)', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'spatele lipit de spătar; împingi drept în sus, fără să te arcuiești', alt: 'împins la aparat pentru umeri' }),
    E({ id: 'push-arnold', name: 'Împins Arnold cu gantere', group: 'umeri (fața și lateral)', region: 'upper', role: 'accessory', sets: 2, reps: '10–12', cue: 'pornești cu palmele spre tine și le rotești în timp ce împingi', alt: 'împins deasupra capului cu gantere' }),
    E({ id: 'push-machine-lateral', name: 'Ridicări laterale la aparat', group: 'umeri (lateral)', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', cue: 'ridici din coate până la nivelul umerilor, fără smucituri', alt: 'ridicări laterale cu gantere' }),
    E({ id: 'push-pec-deck', name: 'Fluturări la aparat (pec deck)', group: 'piept', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele ușor îndoite; strângi brațele în față, revii încet', alt: 'fluturări la cabluri' }),
    E({ id: 'push-db-fly', name: 'Fluturări cu gantere pe bancă', group: 'piept', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'deschizi brațele larg, cu coatele ușor îndoite, doar cât simți pieptul întins', alt: 'fluturări la aparat' }),
    E({ id: 'push-bar-pushdown', name: 'Triceps la cablu cu bara scurtă', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele lipite de corp; se mișcă doar antebrațul', alt: 'triceps cu frânghia la cablu' }),
    E({ id: 'push-dips', name: 'Flotări la paralele (cu asistență dacă e nevoie)', group: 'triceps, piept', region: 'upper', role: 'accessory', sets: 2, reps: '6–12', cue: 'cobori până la cot în unghi drept, fără să lași umerii să cadă în față', alt: 'triceps la cablu cu bara' }),
    E({ id: 'push-db-overhead-ext', name: 'Extensii triceps cu o ganteră deasupra capului', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'coatele spre tavan, cobori gantera în spatele capului și o urci înapoi', alt: 'extensii deasupra capului la cablu' }),
    E({ id: 'push-skullcrusher', name: 'Extensii culcat cu bara EZ', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'culcat pe bancă, cobori bara spre frunte doar din coate', alt: 'extensii cu o ganteră deasupra capului' }),
    // Pull: spate, umăr spate, trapez, biceps
    E({ id: 'pull-lat-wide', name: 'Helcometru, priză largă', group: 'spate (lățime)', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'tragi bara la piept cu coatele în jos, fără să te lași pe spate', alt: 'tracțiuni asistate' }),
    E({ id: 'pull-bb-row', name: 'Ramat cu bara, aplecat', group: 'spate (grosime)', region: 'upper', role: 'main', sets: 3, reps: '6–10', cue: 'spatele drept, aplecat din șold; tragi bara spre buric', alt: 'ramat la cablu din șezut' }),
    E({ id: 'pull-seated-cable-row', name: 'Ramat la cablu din șezut', group: 'spate (grosime)', region: 'upper', role: 'main', sets: 3, reps: '8–12', cue: 'pieptul sus, tragi mânerul spre burtă, fără să te legeni', alt: 'ramat cu pieptul sprijinit' }),
    E({ id: 'pull-db-row-1arm', name: 'Ramat cu gantera, un braț, sprijinit pe bancă', group: 'spate', region: 'upper', role: 'accessory', sets: 2, reps: '8–12/braț', unilateral: true, cue: 'o mână și un genunchi pe bancă; tragi gantera spre șold', alt: 'ramat la cablu cu un braț' }),
    E({ id: 'pull-straight-arm', name: 'Tragere cu brațele întinse la cablu', group: 'spate (lățime)', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'brațele aproape drepte; aduci bara de la nivelul capului până la coapse', alt: 'pullover cu gantera' }),
    E({ id: 'pull-tbar-row', name: 'Ramat T-bar (bara în colț sau aparat)', group: 'spate (grosime)', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'spatele drept; tragi spre piept și strângi omoplații', alt: 'ramat cu bara, aplecat' }),
    E({ id: 'pull-face-pull', name: 'Face pull la cablu, cu frânghia', group: 'umeri (spate), trapez', region: 'upper', role: 'accessory', sets: 2, reps: '12–15', cue: 'tragi frânghia spre față și deschizi mâinile lângă urechi', alt: 'fluturări inverse la aparat' }),
    E({ id: 'pull-db-shrug', name: 'Ridicări de umeri cu gantere', group: 'trapez', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'ridici umerii drept spre urechi, ții o secundă sus, fără să-i rotești', alt: 'ridicări de umeri cu bara' }),
    E({ id: 'pull-bb-shrug', name: 'Ridicări de umeri cu bara', group: 'trapez', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'bara în fața coapselor; ridici umerii drept în sus, cobori încet', alt: 'ridicări de umeri cu gantere' }),
    E({ id: 'pull-machine-shrug', name: 'Ridicări de umeri la aparat sau la Smith', group: 'trapez', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', cue: 'brațele întinse, mișcarea vine doar din umeri', alt: 'ridicări de umeri cu gantere' }),
    E({ id: 'pull-ez-curl', name: 'Flexii cu bara EZ', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '8–12', cue: 'coatele lângă corp, fără să te legeni', alt: 'flexii cu gantere' }),
    E({ id: 'pull-db-curl-alt', name: 'Flexii cu gantere, alternativ', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '8–12/braț', unilateral: true, cue: 'rotești palma în sus în timp ce urci; cobori încet', alt: 'flexii cu bara EZ' }),
    E({ id: 'pull-preacher', name: 'Flexii la banca Scott sau la aparat', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–12', cue: 'brațele sprijinite pe pernă; nu lași cotul să se blocheze jos', alt: 'flexii la cablu' }),
    E({ id: 'pull-incline-curl', name: 'Flexii cu gantere, pe bancă înclinată', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–12', cue: 'spatele pe bancă, brațele atârnă; urci fără să miști cotul în față', alt: 'flexii cu gantere, alternativ' }),
    // Picioare: cvadriceps, femurali, fesieri, adductori, abductori, gambe
    E({ id: 'legs-bb-squat', name: 'Genuflexiuni cu bara', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '6–10', cue: 'bara pe umeri, cobori ca pe un scaun, cu spatele drept și genunchii în direcția vârfurilor', alt: 'presă pentru picioare' }),
    E({ id: 'legs-hack', name: 'Genuflexiuni la aparatul hack', group: 'cvadriceps', region: 'legs', role: 'main', sets: 3, reps: '8–12', cue: 'spatele lipit de spătar; cobori cât poți fără să ți se dezlipească bazinul', alt: 'presă pentru picioare' }),
    E({ id: 'legs-bb-rdl', name: 'Îndreptări românești cu bara', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 3, reps: '6–10', cue: 'împingi șoldurile în spate, bara alunecă pe coapse, spatele rămâne drept', alt: 'îndreptări românești cu gantere' }),
    E({ id: 'legs-walking-lunge', name: 'Fandări din mers cu gantere', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12/picior', unilateral: true, cue: 'pași lungi; genunchiul din spate coboară aproape de sol', alt: 'fandare bulgărească' }),
    E({ id: 'legs-bulgarian', name: 'Fandare bulgărească (piciorul din spate pe bancă)', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, cue: 'cobori drept în jos; genunchiul din față nu cade spre interior', alt: 'fandări din mers' }),
    E({ id: 'legs-ext', name: 'Extensii pentru cvadriceps la aparat', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', cue: 'întinzi picioarele, ții o secundă sus, cobori încet', alt: 'extensii cu un picior' }),
    E({ id: 'legs-ext-1', name: 'Extensii la aparat, câte un picior', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 2, reps: '10–15/picior', unilateral: true, cue: 'același aparat, un picior pe rând, fără smucituri', alt: 'extensii cu ambele picioare' }),
    E({ id: 'legs-standing-curl', name: 'Flexii femurali din picioare, câte un picior', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15/picior', unilateral: true, cue: 'șoldul rămâne lipit de pernă; aduci călcâiul spre fesier', alt: 'flexii femurali culcat' }),
    E({ id: 'legs-adduction', name: 'Adducție la aparat (strângi picioarele)', group: 'adductori (interiorul coapsei)', region: 'legs', role: 'accessory', sets: 2, reps: '12–15', cue: 'strângi pernele una spre alta, ții o secundă, deschizi încet', alt: 'adducție la cablu' }),
    E({ id: 'legs-cable-adduction', name: 'Adducție la cablu, din picioare', group: 'adductori (interiorul coapsei)', region: 'legs', role: 'accessory', sets: 2, reps: '12–15/picior', unilateral: true, cue: 'manșeta pe gleznă; aduci piciorul prin fața celuilalt', alt: 'adducție la aparat' }),
    E({ id: 'legs-sumo-goblet', name: 'Genuflexiune sumo cu gantera', group: 'adductori, fesieri', region: 'legs', role: 'accessory', sets: 2, reps: '10–12', cue: 'picioarele larg, vârfurile în afară; cobori cu spatele drept', alt: 'adducție la aparat' }),
    E({ id: 'legs-abduction', name: 'Abducție la aparat (deschizi picioarele)', group: 'abductori (exteriorul șoldului)', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', cue: 'deschizi pernele în lateral, ții o secundă, revii încet', alt: 'abducție la cablu' }),
    E({ id: 'legs-cable-abduction', name: 'Abducție la cablu, din picioare', group: 'abductori (exteriorul șoldului)', region: 'legs', role: 'accessory', sets: 2, reps: '12–15/picior', unilateral: true, cue: 'manșeta pe gleznă; duci piciorul în lateral fără să te apleci', alt: 'abducție la aparat' }),
    E({ id: 'legs-band-walk', name: 'Mers lateral cu bandă elastică', group: 'abductori (exteriorul șoldului)', region: 'legs', role: 'accessory', sets: 2, reps: '10–15 pași/parte', cue: 'banda deasupra genunchilor, ușor ghemuit, pași mici în lateral', alt: 'abducție la aparat' }),
    E({ id: 'legs-press-calf', name: 'Ridicări pe vârfuri la presa pentru picioare', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '12–15', cue: 'doar vârfurile pe platformă; împingi cât de sus poți, cobori încet', alt: 'ridicări pe vârfuri din picioare' }),
    // Abdomen (opțional, la finalul fiecărei ședințe)
    E({ id: 'core-cable-crunch', name: 'Abdomen la cablu, din genunchi', group: 'abdomen', region: 'core', role: 'core', sets: 2, reps: '10–15', cue: 'frânghia lângă cap; strângi abdomenul și cobori pieptul spre genunchi', alt: 'abdomen pe saltea' }),
    E({ id: 'core-hanging-knee', name: 'Ridicări de genunchi, atârnat sau sprijinit pe coate', group: 'abdomen', region: 'core', role: 'core', sets: 2, reps: '8–15', cue: 'ridici genunchii spre piept fără să te balansezi', alt: 'abdomen la cablu' }),
    E({ id: 'core-plank', name: 'Planșă pe antebrațe', group: 'abdomen', region: 'core', role: 'core', sets: 2, reps: '30–45 s', cue: 'corpul drept de la cap la călcâie; strângi abdomenul și fesierii', alt: 'planșă pe genunchi' }),
    E({ id: 'core-ab-wheel', name: 'Roata pentru abdomen, din genunchi', group: 'abdomen', region: 'core', role: 'core', sets: 2, reps: '6–10', cue: 'mergi în față doar cât spatele nu se lasă', alt: 'planșă pe antebrațe' }),
    // ——— Fitness pentru femei (documentul „AIRON_Antrenor_Fitness_Femei_6_Luni”, 18.10.2026) ———
    E({ id: 'fit-hip-thrust', equip: ['aparat', 'bara', 'banca'], name: 'Hip thrust la aparat sau cu bara', group: 'fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'sprijin stabil; extensie din șold, fără să arcuiești spatele', alt: 'glute bridge încărcat' }),
    E({ id: 'fit-leg-press', equip: ['aparat'], name: 'Presă pentru picioare', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'mișcare confortabilă, cu bazinul stabil; nu forța adâncimea', alt: 'genuflexiune goblet la bancă' }),
    E({ id: 'fit-reverse-lunge', equip: ['corp', 'gantere'], name: 'Fandare înapoi cu sprijin', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 3, reps: '8–10/picior', unilateral: true, rest: 90, cue: 'control, sprijin dacă e nevoie; sarcina nu compromite echilibrul', alt: 'step-up pe treaptă joasă' }),
    E({ id: 'fit-leg-ext', equip: ['aparat'], name: 'Extensii genunchi la aparat', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'mișcare controlată, fără durere articulară', alt: 'presă pentru picioare, pe o porțiune mai scurtă de mișcare, fără durere în genunchi' }),
    E({ id: 'fit-calf', equip: ['corp', 'scaun'], name: 'Ridicări pe vârfuri', group: 'gambe', region: 'legs', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'mișcare fără durere, fără balans', alt: 'ridicări pe vârfuri din șezut' }),
    E({ id: 'fit-calf-seated', equip: ['aparat'], name: 'Ridicări pe vârfuri din șezut', group: 'gambe', region: 'legs', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'cât poți fără durere, ritm controlat', alt: 'ridicări pe vârfuri din picioare' }),
    E({ id: 'fit-dead-bug', equip: ['corp'], name: 'Dead bug simplificat', group: 'trunchi', region: 'core', role: 'core', sets: 3, reps: '6–8/parte', unilateral: true, rest: 50, cue: 'respirație confortabilă; cât controlezi', alt: 'Pallof press' }),
    E({ id: 'fit-rdl', equip: ['gantere'], name: 'Îndreptări românești cu gantere', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–10', rest: 120, cue: 'șoldurile merg înapoi; cobori doar până unde controlezi trunchiul', alt: 'glute bridge, iar aplecarea din șold se învață separat' }),
    E({ id: 'fit-leg-curl', equip: ['aparat'], name: 'Flexii femurali la aparat', group: 'femurali', region: 'legs', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'bazin stabil, fără impuls', alt: 'flexii femurali culcat' }),
    E({ id: 'fit-step-up', equip: ['scaun', 'gantere'], name: 'Step-up pe treaptă joasă', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 3, reps: '8–10/picior', unilateral: true, rest: 90, cue: 'înălțimea care permite control; sprijin la nevoie', alt: 'fandare înapoi cu sprijin' }),
    E({ id: 'fit-kickback', equip: ['cablu'], name: 'Extensia șoldului la cablu (kickback)', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '12–15/picior', unilateral: true, rest: 75, cue: 'mișcare din șold, fără să arcuiești spatele', alt: 'extensie de șold cu bandă' }),
    E({ id: 'fit-abduction', equip: ['aparat'], name: 'Abducție șold la aparat sau cu bandă', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '12–20', rest: 75, cue: 'control, fără smucituri; banda nu e obligatorie', alt: 'abducție culcat pe o parte' }),
    E({ id: 'fit-lat', equip: ['aparat'], name: 'Tracțiuni la helcometru, priză confortabilă', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'tragi cu coatele spre șolduri, fără balans', alt: 'tracțiuni asistate' }),
    E({ id: 'fit-chest-press', equip: ['aparat'], name: 'Împins la aparat pentru piept', group: 'piept, triceps', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'omoplații stabili, coborâre controlată', alt: 'flotări la suport înalt' }),
    E({ id: 'fit-row', equip: ['aparat', 'banca'], name: 'Ramat cu pieptul sprijinit', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'pieptul rămâne pe sprijin, pauză scurtă la final', alt: 'ramat la cablu' }),
    E({ id: 'fit-cable-row', equip: ['cablu'], name: 'Ramat la cablu, priză confortabilă', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'trunchiul fix, tragi cu coatele', alt: 'ramat cu pieptul sprijinit' }),
    E({ id: 'fit-incline', equip: ['banca', 'gantere'], name: 'Împins înclinat cu gantere sau la aparat', group: 'piept, umeri', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'banca puțin înclinată, coborâre controlată', alt: 'împins la aparat pentru piept' }),
    E({ id: 'fit-shoulder', equip: ['aparat'], name: 'Împins umeri la aparat, dacă nu doare', group: 'umeri', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'fără să arcuiești spatele; cobori cât nu doare', alt: 'împins landmine' }),
    E({ id: 'fit-pushup-high', equip: ['corp', 'scaun'], name: 'Flotări la suport înalt sau împins la aparat pentru piept', group: 'piept, triceps', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'corpul drept; înălțimea suportului dă dificultatea', alt: 'împins la aparat pentru piept' }),
    E({ id: 'fit-lateral', equip: ['gantere'], name: 'Ridicări laterale cu gantere', group: 'umeri', region: 'upper', role: 'accessory', sets: 3, reps: '12–15', rest: 75, cue: 'până la nivelul umerilor, fără balans', alt: 'ridicări laterale cu banda' }),
    E({ id: 'fit-triceps', equip: ['cablu'], name: 'Extensii triceps la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'coatele lângă corp', alt: 'extensii triceps la aparat' }),
    E({ id: 'fit-biceps', equip: ['gantere'], name: 'Flexii biceps cu gantere', group: 'biceps', region: 'upper', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'coatele fixe, fără balans', alt: 'flexii cu banda (sub tălpi)' }),
    E({ id: 'fit-rev-fly', equip: ['aparat'], name: 'Reverse fly la aparat sau cu bandă', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 3, reps: '12–15', rest: 75, cue: 'brațele lungi, mișcarea din umăr', alt: 'fluturări inverse la cablu' }),
    E({ id: 'fit-pallof', equip: ['cablu'], name: 'Pallof press la cablu sau cu bandă', group: 'trunchi', region: 'core', role: 'core', sets: 3, reps: '8–12/parte', unilateral: true, rest: 50, cue: 'bazinul și umerii nu se rotesc', alt: 'dead bug simplificat' }),
    // ——— Fitness, varianta amplă A–D (documentul „AIRON_Fitness_Femei_26_Saptamani”, 19.10.2026) ———
    E({ id: 'fit-bulgarian', equip: ['banca', 'gantere'], name: 'Bulgarian split squat', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 3, reps: '8–10/picior', unilateral: true, rest: 105, cue: 'sprijinul pentru echilibru e permis; coborâre controlată', alt: 'fandare înapoi cu sprijin', purpose: 'forță și control pe un picior, fesieri și coapse', setup: 'piciorul din spate pe o bancă de înălțimea genunchiului; distanța cât să cobori drept', mistakes: 'genunchiul din față cade spre interior; elan din trunchi; pas prea scurt' }),
    E({ id: 'fit-goblet', equip: ['gantere', 'banca'], name: 'Genuflexiune goblet la bancă', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', rest: 120, cue: 'gantera la piept, cobori controlat până atingi banca', alt: 'presă pentru picioare', purpose: 'genuflexiunea, cu adâncimea dată de bancă', setup: 'banca la înălțimea la care cobori cu spatele neutru', mistakes: 'te lași greu pe bancă; călcâiele se ridică' }),
    E({ id: 'fit-abduction-cable', equip: ['cablu'], name: 'Abducție la cablu', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '12–20', rest: 75, cue: 'piciorul pleacă lateral din șold, fără balans', alt: 'abducție la aparat', purpose: 'fesierul mijlociu, stabilitatea bazinului', setup: 'manșeta la gleznă, scripetele jos; te ții de aparat', mistakes: 'înclini trunchiul ca să ridici piciorul mai sus' }),
    E({ id: 'fit-db-press', equip: ['gantere', 'banca'], name: 'Împins cu gantere, bancă orizontală', group: 'piept, triceps', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'omoplații strânși, coborâre controlată', alt: 'împins la aparat pentru piept', purpose: 'piept și triceps, cu stabilizare', setup: 'urci ganterele de pe genunchi în poziție, apoi te întinzi', mistakes: 'coatele larg la 90°; ganterele se lovesc sus' }),
    E({ id: 'fit-lateral-cable', equip: ['cablu'], name: 'Ridicări laterale la cablu', group: 'umeri', region: 'upper', role: 'accessory', sets: 3, reps: '12–20', rest: 75, cue: 'ridici fără avânt, până la umăr', alt: 'ridicări laterale cu gantere', purpose: 'deltoidul lateral', setup: 'scripetele jos, mânerul în mâna opusă, lateral față de aparat', mistakes: 'ridici umărul spre ureche; balans din corp' }),
    E({ id: 'fit-lat-neutral', equip: ['aparat'], name: 'Helcometru, priză neutră', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–12', rest: 105, cue: 'tragi fără impuls și controlezi revenirea', alt: 'altă priză confortabilă', purpose: 'spatele (dorsalii), cu umerii într-o poziție comodă', setup: 'genunchii fixați sub pernă; mânerul neutru (palmele față în față)', mistakes: 'te lași pe spate ca să tragi; bara coboară la ceafă' }),
    E({ id: 'fit-hammer', equip: ['gantere'], name: 'Biceps hammer cu gantere', group: 'biceps, antebraț', region: 'upper', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'încheietura neutră, cotul stabil', alt: 'flexii cu banda', purpose: 'biceps și antebraț', setup: 'în picioare sau așezată, ganterele cu palmele spre corp', mistakes: 'coatele pleacă în față; balans din spate' }),
    E({ id: 'fit-carry', equip: ['gantere'], name: 'Transport gantere (farmer carry)', group: 'trunchi, prindere', region: 'carry', role: 'carry', sets: 3, reps: '20–30 m', rest: 75, cue: 'mers stabil și respirație confortabilă', alt: 'alt exercițiu de trunchi, dacă spațiul nu permite distanța' }),
    // ——— Exercițiile din structura unei antrenoare reale (19.10.2026): picioare pe trei accente, spate+biceps, piept+umeri+triceps ———
    E({ id: 'fit-squat', equip: ['bara'], name: 'Genuflexiuni cu bara', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 4, reps: '20 / 15 / 12 / 8', rest: 120, cue: 'bara pe umeri, picioarele la lățimea umerilor; cobori controlat cu spatele drept, genunchii în direcția vârfurilor', alt: 'genuflexiuni la Smith sau cu gantera la piept', purpose: 'cvadriceps și fesieri', setup: 'suporturile barei la nivelul umerilor; începi cu bara goală', mistakes: 'călcâiele se ridică; genunchii cad spre interior; rotunjești spatele jos' }),
    E({ id: 'fit-glute-bridge', equip: ['corp', 'banda'], name: 'Pod de fesieri (glute bridge), cu bandă deasupra genunchilor', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '40 (30 cu 3 s sus + 10 rapide)', rest: 75, cue: 'pe spate, tălpile aproape de fesieri; ridici bazinul strângând fesierii, ții sus, cobori controlat', alt: 'pod de fesieri cu gantera pe bazin', purpose: 'fesierii mari' }),
    E({ id: 'fit-glute-bridge-1', equip: ['corp'], name: 'Pod de fesieri pe un picior', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '20/picior', unilateral: true, rest: 60, cue: 'un picior întins în aer; împingi din călcâiul de pe sol', alt: 'pod de fesieri pe ambele picioare, mai lent' }),
    E({ id: 'fit-sumo-squat', equip: ['gantere'], name: 'Genuflexiune sumo cu gantera', group: 'adductori, fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '20', rest: 75, cue: 'picioarele larg, vârfurile spre exterior; gantera ținută între picioare', alt: 'genuflexiune sumo fără greutate' }),
    E({ id: 'fit-lateral-walk', equip: ['banda'], name: 'Mers lateral cu bandă', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '10 pași stânga + 10 dreapta', rest: 45, cue: 'genunchii ușor îndoiți, banda întinsă tot timpul; pași mici', alt: 'abducție cu banda din șezut' }),
    E({ id: 'fit-lateral-lunge', equip: ['corp', 'gantere'], name: 'Fandare laterală stânga–dreapta', group: 'adductori, fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '15 (o repetare = stânga + dreapta)', rest: 60, cue: 'pas larg în lateral, șezi pe piciorul îndoit, celălalt rămâne întins', alt: 'fandare înapoi' }),
    E({ id: 'fit-walking-lunge', equip: ['gantere', 'corp'], name: 'Fandări pe loc cu gantere', group: 'fesieri, cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '20 (10/picior)', unilateral: true, rest: 75, cue: 'pas lung, genunchiul din spate coboară aproape de sol; trunchiul drept', alt: 'fandări înapoi, fără greutate' }),
    E({ id: 'fit-adduction', equip: ['aparat'], name: 'Adducție la aparat (strângi picioarele)', group: 'adductori', region: 'legs', role: 'accessory', sets: 3, reps: '30', rest: 60, cue: 'strângi controlat, ții 1 s, revii încet', alt: 'genuflexiune sumo cu gantera', purpose: 'interiorul coapsei' }),
    E({ id: 'fit-sl-rdl', equip: ['gantere'], name: 'Îndreptări pe un picior cu gantere', group: 'femurali, fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '15/picior', unilateral: true, rest: 75, cue: 'te apleci din șold pe un picior, celălalt pleacă în spate; spatele drept', alt: 'îndreptări românești cu gantere' }),
    E({ id: 'fit-sumo-deadlift', equip: ['gantere'], name: 'Îndreptări sumo cu gantera', group: 'fesieri, femurali', region: 'legs', role: 'main', sets: 4, reps: '20 / 15 / 12 / 8', rest: 120, cue: 'picioarele larg; ridici din picioare și șold, cu spatele drept', alt: 'îndreptări sumo cu o ganteră mai grea' }),
    E({ id: 'fit-hyperext', equip: ['aparat'], name: 'Hiperextensii (accent pe fesieri)', group: 'fesieri, spate jos', region: 'legs', role: 'accessory', sets: 3, reps: '30', rest: 60, cue: 'te ridici până la linia corpului, strângi fesierii sus; fără să arcuiești mult', alt: 'pod de fesieri pe sol' }),
    E({ id: 'fit-pulse-squat', equip: ['gantere'], name: 'Genuflexiuni pulsate cu o ganteră', group: 'cvadriceps, fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '30 pulsuri', rest: 60, cue: 'stai jos în genuflexiune și urci–cobori doar câțiva centimetri', alt: 'genuflexiune cu gantera la piept' }),
    E({ id: 'fit-straight-arm', equip: ['cablu'], name: 'Tragere cu brațele întinse la cablu', group: 'spate', region: 'upper', role: 'accessory', sets: 3, reps: '15', rest: 60, cue: 'brațele aproape întinse, tragi bara până la coapse din umeri', alt: 'tragere cu brațele întinse cu banda' }),
    E({ id: 'fit-lat-narrow', equip: ['aparat'], name: 'Helcometru, priză îngustă', group: 'spate', region: 'upper', role: 'main', sets: 4, reps: '15', rest: 90, cue: 'tragi spre piept cu coatele pe lângă corp', alt: 'ramat la cablu' }),
    E({ id: 'fit-db-row', equip: ['gantere', 'banca'], name: 'Ramat cu gantere, aplecat', group: 'spate', region: 'upper', role: 'accessory', sets: 3, reps: '20', rest: 75, cue: 'spatele drept, aplecat din șold; tragi ganterele spre șolduri', alt: 'ramat la aparat' }),
    E({ id: 'fit-curl-alt', equip: ['gantere'], name: 'Flexii biceps alternativ', group: 'biceps', region: 'upper', role: 'accessory', sets: 3, reps: '20 (10/braț)', rest: 60, cue: 'coatele lângă corp, fără balans', alt: 'flexii cu banda' }),
    E({ id: 'fit-curl-rot', equip: ['gantere'], name: 'Flexii biceps cu rotație', group: 'biceps', region: 'upper', role: 'accessory', sets: 3, reps: '20', rest: 60, cue: 'pornești cu palmele spre corp și le rotești în sus pe drum', alt: 'flexii biceps simultan' }),
    E({ id: 'fit-fly', equip: ['aparat'], name: 'Fluturări la aparat (pec deck) sau la cabluri', group: 'piept', region: 'upper', role: 'accessory', sets: 4, reps: '15', rest: 60, cue: 'coatele ușor îndoite, aduci brațele în fața pieptului fără să ridici umerii', alt: 'fluturări cu gantere pe bancă' }),
    E({ id: 'fit-pushup', equip: ['corp'], name: 'Flotări, priză largă (din genunchi dacă e nevoie)', group: 'piept, triceps', region: 'upper', role: 'accessory', sets: 3, reps: '10–20', rest: 60, cue: 'corpul drept de la cap la genunchi/călcâie; cobori pieptul controlat', alt: 'flotări cu mâinile pe un scaun stabil' }),
    E({ id: 'fit-front-raise', equip: ['gantere'], name: 'Ridicări frontale cu gantere', group: 'umeri', region: 'upper', role: 'accessory', sets: 3, reps: '15', rest: 60, cue: 'până la nivelul umerilor, fără balans', alt: 'ridicări frontale cu discul' }),
    E({ id: 'fit-bent-fly', equip: ['gantere'], name: 'Fluturări aplecat (umărul din spate)', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 3, reps: '15', rest: 60, cue: 'aplecat din șold, deschizi brațele lateral cu coatele ușor îndoite', alt: 'desfacerea benzii în fața pieptului' }),
    E({ id: 'fit-triceps-kickback', equip: ['gantere'], name: 'Kickback triceps cu gantera', group: 'triceps', region: 'upper', role: 'accessory', sets: 3, reps: '15', rest: 60, cue: 'cotul fix lângă corp, întinzi antebrațul în spate', alt: 'extensii triceps cu banda' }),
    E({ id: 'fit-triceps-floor', equip: ['gantere', 'corp'], name: 'Extensii triceps culcat pe sol cu gantere', group: 'triceps', region: 'upper', role: 'accessory', sets: 3, reps: '20', rest: 60, cue: 'coatele spre tavan, cobori ganterele lângă cap și le ridici înapoi', alt: 'extensii triceps deasupra capului' }),
    E({ id: 'fit-heel-squat', equip: ['gantere', 'corp'], name: 'Genuflexiuni cu călcâiele pe un disc (accent pe cvadriceps)', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '20', rest: 75, cue: 'călcâiele ridicate pe un disc sau o placă; cobori adânc, cu trunchiul drept', alt: 'genuflexiune cu gantera la piept' }),
    E({ id: 'fit-iso-squat', equip: ['corp'], name: 'Genuflexiune izometrică (ții jos)', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '1 min ținut', rest: 60, cue: 'cobori până la coapsele paralele cu solul și ții, cu spatele drept', alt: 'scaunul la perete' }),
    E({ id: 'fit-squat-rdl', equip: ['gantere'], name: 'Genuflexiune urmată de îndreptare românească', group: 'fesieri, cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '20', rest: 75, cue: 'o genuflexiune, apoi din picioare te apleci din șold cu ganterele pe coapse; asta e o repetare', alt: 'genuflexiune cu gantera la piept' }),
    E({ id: 'fit-smith-lunge', equip: ['aparat'], name: 'Fandări pe loc la Smith', group: 'fesieri, cvadriceps', region: 'legs', role: 'main', sets: 4, reps: '20 / 20 / 10 / 10 pe picior', unilateral: true, rest: 90, cue: 'bara pe umeri, pas lung; genunchiul din spate coboară aproape de sol', alt: 'fandări pe loc cu gantere' }),
    E({ id: 'fit-cable-squat', equip: ['cablu'], name: 'Genuflexiuni la cablu (scripetele jos)', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 4, reps: '20 / 20 / 10 / 10', rest: 90, cue: 'ții mânerul la piept, cobori adânc cu greutatea pe călcâie', alt: 'genuflexiune cu gantera la piept' }),
    E({ id: 'fit-lateral-step', equip: ['cablu'], name: 'Pas lateral din genuflexiune, la cablu', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '15 pe fiecare parte', rest: 60, cue: 'manșeta la gleznă, stai în genuflexiune și faci pași laterali controlați', alt: 'mers lateral cu bandă' }),
    E({ id: 'fit-reverse-hyper', equip: ['banca', 'corp'], name: 'Reverse hyper pe bancă (cu greutăți la glezne)', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '20, ții 3 s sus la fiecare', rest: 60, cue: 'culcat cu bazinul pe marginea băncii; ridici picioarele întinse până la linia corpului', alt: 'extensia șoldului în patru labe' }),
    E({ id: 'fit-straight-leg', equip: ['banca', 'corp'], name: 'Ridicări cu piciorul întins, pe bancă (greutăți la glezne)', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '30 pe picior: 20 cu 3 s sus + 10 rapide', unilateral: true, rest: 60, cue: 'sprijinit pe bancă, piciorul întins urcă până la linia corpului', alt: 'extensia șoldului cu banda' }),
    E({ id: 'fit-frog-pumps', equip: ['corp'], name: 'Frog pumps (pod de fesieri cu tălpile lipite)', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '30', rest: 45, cue: 'tălpile lipite, genunchii în lateral; ridici bazinul scurt și strângi fesierii', alt: 'pod de fesieri' }),
    E({ id: 'fit-lunge-walk', equip: ['gantere', 'corp'], name: 'Mers fandat', group: 'fesieri, cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '10 pași înainte + 10 înapoi', rest: 75, cue: 'pași lungi, trunchiul drept, genunchiul din spate aproape de sol', alt: 'fandări pe loc' }),
    E({ id: 'fit-rdl-bar', equip: ['bara'], name: 'Îndreptări românești cu bara', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 4, reps: '20 / 20 / 10 / 10 — crești la seriile de 10', rest: 120, cue: 'bara aproape de picioare, spatele drept; cobori până simți întinderea în spatele coapsei', alt: 'îndreptări românești cu gantere' }),
    E({ id: 'fit-h-db-fly', equip: ['gantere', 'corp'], name: 'Fluturări cu gantere de pe podea', group: 'piept', region: 'upper', role: 'accessory', sets: 3, reps: '15', rest: 60, cue: 'pe spate, coatele ușor îndoite; cobori până ating podeaua cu brațele', alt: 'flotări cu mâinile pe scaun' }),
    // ——— Fitness acasă: gantere, bandă, corp, scaun (auditul F55, F01). Nimic cu aparat, cablu, bară sau bancă. ———
    E({ id: 'fit-h-glute-bridge', equip: ['gantere', 'corp'], name: 'Pod de fesieri cu gantera pe bazin', group: 'fesieri', region: 'legs', role: 'main', sets: 3, reps: '10–15', rest: 105, cue: 'pe spate, tălpile pe podea; ridici bazinul strângând fesierii, ții o secundă sus', alt: 'pod de fesieri pe un picior, fără ganteră', purpose: 'fesierii mari', setup: 'gantera pe bazin, ținută cu ambele mâini; un prosop sub ea', mistakes: 'arcuiești spatele în loc să ridici din șold' }),
    E({ id: 'fit-h-goblet', equip: ['gantere', 'scaun'], name: 'Genuflexiune cu gantera la piept, până la scaun', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'cobori controlat până atingi scaunul, apoi urci împingând în călcâie', alt: 'genuflexiune fără greutate, până la scaun', purpose: 'coapse și fesieri', setup: 'scaun stabil în spate; gantera ținută vertical la piept', mistakes: 'te lași greu pe scaun; genunchii cad spre interior' }),
    E({ id: 'fit-h-split-squat', equip: ['gantere', 'corp'], name: 'Fandare statică cu gantere', group: 'cvadriceps, fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '8–12/picior', unilateral: true, rest: 75, cue: 'un picior în față, unul în spate; cobori drept în jos și urci', alt: 'fandare statică fără greutate, cu mâna pe perete', purpose: 'coapse, pe un picior', setup: 'o ganteră în fiecare mână; sprijin de perete dacă ai nevoie', mistakes: 'genunchiul din față cade spre interior' }),
    E({ id: 'fit-h-band-curl', equip: ['banda'], name: 'Flexii femurali cu banda, culcat pe burtă', group: 'femurali', region: 'legs', role: 'accessory', sets: 3, reps: '12–15', rest: 75, cue: 'aduci călcâiele spre fesieri, revii încet', alt: 'îndreptări românești pe un picior, fără greutate', purpose: 'spatele coapsei', setup: 'banda prinsă de un picior de masă sau de ușă, la nivelul gleznelor', mistakes: 'ridici bazinul de pe podea' }),
    E({ id: 'fit-h-band-kickback', equip: ['banda'], name: 'Extensia șoldului cu banda, în patru labe', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '12–15/picior', unilateral: true, rest: 75, cue: 'împingi piciorul în spate din șold, fără să arcuiești spatele', alt: 'aceeași mișcare fără bandă', setup: 'banda în jurul tălpii, capetele sub mâini', mistakes: 'arcuiești spatele; balans' }),
    E({ id: 'fit-h-band-abduction', equip: ['banda'], name: 'Abducție cu banda deasupra genunchilor', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '12–20', rest: 75, cue: 'deschizi genunchii împotriva benzii, ții o secundă', alt: 'abducție culcat pe o parte, fără bandă', setup: 'așezată pe scaun sau în pod de fesieri; banda deasupra genunchilor', mistakes: 'deschizi cu smucituri' }),
    E({ id: 'fit-h-band-pulldown', equip: ['banda'], name: 'Tragere la piept cu banda prinsă sus', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–15', rest: 105, cue: 'tragi coatele în jos spre coaste, strângi omoplații', alt: 'ramat cu gantera, un braț', purpose: 'spatele (dorsalii)', setup: 'banda prinsă sus, de ușă (cu o ancoră de ușă); stai în genunchi', mistakes: 'te lași pe spate; ridici umerii' }),
    E({ id: 'fit-h-floor-press', equip: ['gantere', 'corp'], name: 'Împins cu gantere de pe podea', group: 'piept, triceps', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 105, cue: 'pe spate, cobori până atinge cotul podeaua ușor, apoi împingi', alt: 'flotări cu mâinile pe scaun', purpose: 'piept și triceps', setup: 'genunchii îndoiți, ganterele urcate de pe genunchi', mistakes: 'coatele la 90° de corp; lovești podeaua cu cotul' }),
    E({ id: 'fit-h-db-row', equip: ['gantere', 'scaun'], name: 'Ramat cu gantera, un braț, sprijin pe scaun', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '8–12/braț', unilateral: true, rest: 90, cue: 'tragi gantera spre șold, fără să rotești trunchiul', alt: 'ramat cu banda', purpose: 'mijlocul spatelui', setup: 'o mână și un genunchi pe scaun, spatele drept', mistakes: 'tragi din biceps; rotești trunchiul' }),
    E({ id: 'fit-h-band-row', equip: ['banda'], name: 'Ramat cu banda, din șezut', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–15', rest: 90, cue: 'tragi mânerele spre burtă, strângi omoplații', alt: 'ramat cu gantera, un braț', purpose: 'mijlocul spatelui', setup: 'pe podea, banda în jurul tălpilor', mistakes: 'te lași pe spate; ridici umerii' }),
    E({ id: 'fit-h-pushup-incline', equip: ['corp', 'scaun'], name: 'Flotări cu mâinile pe scaun sau masă', group: 'piept, triceps', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 90, cue: 'corpul drept; cobori pieptul spre margine și împingi', alt: 'flotări cu mâinile pe perete', purpose: 'piept, triceps', setup: 'scaun lipit de perete sau masă stabilă', mistakes: 'șoldurile cad; capul înainte' }),
    E({ id: 'fit-h-db-ohp', equip: ['gantere', 'scaun'], name: 'Împins cu gantere deasupra capului, pe scaun', group: 'umeri', region: 'upper', role: 'main', sets: 3, reps: '8–12', rest: 90, cue: 'spatele drept; împingi în sus fără să te arcuiești', alt: 'același exercițiu cu banda sub tălpi', purpose: 'umerii', setup: 'pe scaun, ganterele la nivelul umerilor', mistakes: 'arcuiești spatele; cobori prea jos' }),
    E({ id: 'fit-h-db-triceps', equip: ['gantere'], name: 'Extensii triceps cu o ganteră deasupra capului', group: 'triceps', region: 'upper', role: 'accessory', sets: 3, reps: '10–15', rest: 75, cue: 'coatele spre tavan; cobori gantera în spatele capului și o urci', alt: 'extensii cu banda', setup: 'așezată, gantera ținută cu ambele mâini', mistakes: 'coatele se deschid larg' }),
    E({ id: 'fit-h-band-pullapart', equip: ['banda'], name: 'Desfacerea benzii în fața pieptului', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 3, reps: '12–20', rest: 60, cue: 'brațele întinse; deschizi banda până la piept, strângi omoplații', alt: 'fluturări inverse cu gantere ușoare, aplecată', setup: 'banda ținută la lățimea umerilor', mistakes: 'ridici umerii; îndoi coatele mult' }),
    E({ id: 'fit-h-band-pallof', equip: ['banda'], name: 'Pallof press cu banda', group: 'trunchi', region: 'core', role: 'core', sets: 3, reps: '8–12/parte', unilateral: true, rest: 50, cue: 'împingi banda drept în față și nu lași trunchiul să se rotească', alt: 'dead bug', setup: 'banda prinsă lateral, la nivelul pieptului (ușă, picior de masă)', mistakes: 'te rotești după bandă' }),
    E({ id: 'fit-h-seated-calf', equip: ['gantere', 'scaun'], name: 'Ridicări pe vârfuri din șezut, gantera pe genunchi', group: 'gambe', region: 'legs', role: 'accessory', sets: 3, reps: '12–15', rest: 60, cue: 'urci pe vârfuri, ții o secundă, cobori încet', alt: 'ridicări pe vârfuri din picioare, pe treaptă', setup: 'pe scaun; vârfurile pe o carte groasă', mistakes: 'ricoșezi jos' }),
    E({ id: 'fit-h-bulgarian', equip: ['gantere', 'scaun'], name: 'Fandare bulgărească cu piciorul din spate pe un scaun', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 3, reps: '8–10/picior', unilateral: true, rest: 105, cue: 'cobori drept în jos; sprijin de perete e permis', alt: 'fandare înapoi cu sprijin', purpose: 'fesieri și coapse, pe un picior', setup: 'scaun stabil, lipit de perete', mistakes: 'genunchiul din față cade spre interior' }),
    // ——— Reformer (Pilates), acasă (regula 49): arcurile sunt greutatea — le alegi ca ultimele 2–3 repetări să fie grele ———
    E({ id: 'fit-r-footwork', equip: ['reformer'], name: 'Presă de picioare la reformer (footwork)', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '12–15', rest: 90, lying: 'spate', cue: 'împingi căruciorul până aproape întins, fără să blochezi genunchii; revii în 3 secunde', alt: 'genuflexiune cu gantera la piept, până la scaun', purpose: 'coapse și fesieri, ca la presa de la sală', setup: 'culcată pe spate, umerii la tampoane, călcâiele pe bară la lățimea șoldurilor; arcuri grele (de obicei 3–4) — alegi așa încât ultimele 2–3 repetări să fie grele', mistakes: 'blochezi genunchii la final; bazinul se ridică de pe cărucior; lași căruciorul să lovească la întoarcere' }),
    E({ id: 'fit-r-single-leg', equip: ['reformer'], name: 'Presă pe un picior la reformer', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '10–12/picior', unilateral: true, rest: 75, lying: 'spate', cue: 'un călcâi pe bară, celălalt picior în aer, la 90°; împingi și revii controlat', alt: 'fandare statică cu gantere', purpose: 'coapsa, pe un picior (în locul extensiilor de la aparat)', setup: 'ca la presa de picioare, cu un arc mai puțin', mistakes: 'genunchiul cade spre interior; bazinul se rotește' }),
    E({ id: 'fit-r-bridge', equip: ['reformer'], name: 'Pod de fesieri cu tălpile pe bară, la reformer', group: 'fesieri, femurali', region: 'legs', role: 'accessory', sets: 3, reps: '10–15', rest: 75, lying: 'spate', cue: 'ridici bazinul, apoi împingi căruciorul puțin și îl aduci înapoi fără să cobori bazinul', alt: 'pod de fesieri pe un picior', purpose: 'fesierii și spatele coapsei', setup: 'culcată pe spate, tălpile pe bară; arcuri medii', mistakes: 'arcuiești spatele de jos; cobori bazinul la fiecare repetare' }),
    E({ id: 'fit-r-ham-curl', equip: ['reformer'], name: 'Flexii femurali cu picioarele în curele, la reformer', group: 'femurali', region: 'legs', role: 'accessory', sets: 3, reps: '10–15', rest: 75, lying: 'spate', cue: 'picioarele întinse în curele; tragi în jos spre cărucior și ridici bazinul puțin, revii încet', alt: 'îndreptări românești pe un picior', purpose: 'spatele coapsei (în locul flexiilor de la aparat)', setup: 'culcată pe spate, curelele pe tălpi; arcuri ușoare-medii', mistakes: 'tragi din genunchi în loc de șold; spatele se arcuiește' }),
    E({ id: 'fit-r-side-abduction', equip: ['reformer'], name: 'Abducție culcat pe o parte, cu cureaua, la reformer', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '12–15/picior', unilateral: true, rest: 60, cue: 'piciorul de sus în curea, întins; îl ridici spre tavan împotriva arcului și revii încet', alt: 'abducție culcat pe o parte, fără bandă', purpose: 'fesierul lateral', setup: 'culcată pe o parte pe cărucior, capul sprijinit pe braț; un arc ușor', mistakes: 'rotești bazinul spre spate; balans' }),
    E({ id: 'fit-r-side-splits', equip: ['reformer'], name: 'Side splits la reformer (din picioare)', group: 'adductori, abductori', region: 'legs', role: 'accessory', sets: 3, reps: '10–12', rest: 60, cue: 'deschizi căruciorul lateral cât îl controlezi și îl aduci înapoi strângând coapsele', alt: 'genuflexiune sumo cu gantera', purpose: 'interiorul și exteriorul coapsei (în locul adducției la aparat)', setup: 'în picioare, un picior pe platformă, celălalt pe cărucior; un arc ușor; mâinile pe șolduri', mistakes: 'deschizi mai mult decât poți aduce înapoi; te apleci' }),
    E({ id: 'fit-r-kickback', equip: ['reformer'], name: 'Extensia șoldului în patru labe, la reformer', group: 'fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '12–15/picior', unilateral: true, rest: 60, cue: 'talpa pe bara de umeri; împingi căruciorul în spate din șold, fără să arcuiești spatele', alt: 'extensia șoldului în patru labe, fără bandă', purpose: 'fesierul mare', setup: 'mâinile pe bara de picioare, un genunchi pe cărucior; un arc ușor-mediu', mistakes: 'arcuiești spatele; împingi din genunchi' }),
    E({ id: 'fit-r-pulling-straps', equip: ['reformer'], name: 'Tragere cu curelele, culcat pe cutie (pulling straps)', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–12', rest: 90, lying: 'burta', cue: 'brațele întinse; tragi curelele pe lângă corp spre șolduri, ridici ușor pieptul, revii încet', alt: 'ramat cu gantera, un braț', purpose: 'spatele (dorsalii), în locul helcometrului', setup: 'cutia lungă pe cărucior, culcată pe burtă cu capul spre curele; un arc ușor-mediu', mistakes: 'ridici umerii spre urechi; arcuiești mult spatele' }),
    E({ id: 'fit-r-row', equip: ['reformer'], name: 'Ramat din șezut, cu curelele, la reformer', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–12', rest: 90, cue: 'tragi coatele în spate pe lângă corp și strângi omoplații; revii fără să lași arcurile să te tragă', alt: 'ramat cu gantera, un braț', purpose: 'mijlocul spatelui', setup: 'așezată pe cărucior (sau pe cutie), cu fața spre curele; un arc ușor-mediu', mistakes: 'te lași pe spate; ridici umerii' }),
    E({ id: 'fit-r-rear-delt', equip: ['reformer'], name: 'Deschideri cu curelele din șezut (umărul din spate)', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 3, reps: '12–15', rest: 60, cue: 'brațele aproape întinse, la nivelul pieptului; le deschizi lateral și strângi omoplații', alt: 'fluturări aplecat cu gantere ușoare', purpose: 'umărul din spate și postura', setup: 'așezată cu fața spre curele; un arc ușor', mistakes: 'îndoi mult coatele; ridici umerii' }),
    E({ id: 'fit-r-biceps', equip: ['reformer'], name: 'Flexii biceps cu curelele, la reformer', group: 'biceps', region: 'upper', role: 'accessory', sets: 3, reps: '12–15', rest: 60, cue: 'coatele fixe lângă corp; aduci palmele spre umeri și revii încet', alt: 'flexii biceps cu gantere', purpose: 'bicepsul', setup: 'așezată sau în genunchi cu fața spre curele; un arc ușor', mistakes: 'coatele pleacă în față; te lași pe spate' }),
    // ——— Acasă fără bandă sau fără gantere (regula 49): variante cu greutatea corpului ———
    E({ id: 'fit-side-abduction', equip: ['corp'], name: 'Abducție culcat pe o parte', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 3, reps: '15–20/picior', unilateral: true, rest: 60, cue: 'piciorul de sus întins, vârful ușor în jos; îl ridici din șold și cobori încet', alt: 'mers lateral cu bandă', purpose: 'fesierul lateral', setup: 'culcată pe o parte, pe saltea; piciorul de jos îndoit pentru echilibru', mistakes: 'rotești bazinul spre spate; ridici prea sus și se mișcă talia' }),
    E({ id: 'fit-towel-row', equip: ['corp'], name: 'Ramat cu prosopul prins de clanță', group: 'spate', region: 'upper', role: 'main', sets: 3, reps: '10–15', rest: 90, cue: 'te lași pe spate cu brațele întinse și te tragi spre ușă strângând omoplații', alt: 'ramat cu gantera, un braț', purpose: 'spatele', setup: 'un prosop trecut după clanța unei uși închise (verifici că ușa e închisă bine); cu cât tălpile sunt mai aproape de ușă, cu atât e mai greu', mistakes: 'tragi din brațe, cu umerii ridicați; șoldurile cad' }),
    E({ id: 'fit-prone-ytw', equip: ['corp'], name: 'Y-T-W culcat pe burtă', group: 'umăr posterior, spate sus', region: 'upper', role: 'accessory', sets: 3, reps: '6 din fiecare literă', rest: 60, lying: 'burta', cue: 'ridici brațele în Y, apoi T, apoi W, cu degetele mari în sus; ții o secundă sus', alt: 'deschideri cu banda în fața pieptului', purpose: 'umărul din spate și postura', setup: 'pe burtă pe saltea, fruntea pe un prosop', mistakes: 'ridici capul; arcuiești spatele de jos' }),
    E({ id: 'fit-pike-pushup', equip: ['corp'], name: 'Flotări în V (pike), pentru umeri', group: 'umeri', region: 'upper', role: 'accessory', sets: 3, reps: '6–10', rest: 75, cue: 'bazinul sus, corpul în V; cobori capul între palme și împingi înapoi', alt: 'flotări cu mâinile pe scaun', purpose: 'umerii, fără gantere', setup: 'palmele pe saltea, puțin mai late decât umerii; tălpile mai aproape de mâini = mai greu', mistakes: 'cobori pieptul, nu capul; coatele se deschid larg' }),
    E({ id: 'fit-bench-dip', equip: ['scaun', 'corp'], name: 'Flotări pe scaun pentru triceps', group: 'triceps', region: 'upper', role: 'accessory', sets: 3, reps: '8–12', rest: 60, cue: 'palmele pe marginea scaunului, cobori din coate până la 90° și urci', alt: 'extensii triceps cu o ganteră', purpose: 'tricepsul', setup: 'scaun stabil lipit de perete; genunchii îndoiți (mai ușor) sau picioarele întinse (mai greu)', mistakes: 'cobori sub 90° cu durere în umăr; umerii urcă spre urechi' }),
    E({ id: 'fit-bw-squat', equip: ['corp'], name: 'Genuflexiune cu greutatea corpului, coborâre lentă', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 3, reps: '12–20', rest: 75, cue: 'cobori în 3 secunde, urci normal; când 20 ies ușor, ții 2 secunde jos', alt: 'genuflexiune până la scaun', purpose: 'coapse și fesieri, fără greutăți', setup: 'tălpile la lățimea umerilor, brațele în față pentru echilibru', mistakes: 'genunchii cad spre interior; călcâiele se ridică' }),
    E({ id: 'fit-bw-split-squat', equip: ['corp'], name: 'Fandare statică fără greutate', group: 'cvadriceps, fesieri', region: 'legs', role: 'accessory', sets: 3, reps: '10–15/picior', unilateral: true, rest: 60, cue: 'cobori drept în jos în 3 secunde și urci; mâna pe perete dacă ai nevoie', alt: 'genuflexiune izometrică', purpose: 'coapse, pe un picior', setup: 'un picior în față, unul în spate, lângă un perete', mistakes: 'genunchiul din față cade spre interior; te apleci în față' }),
    E({ id: 'fit-bw-lunge', equip: ['corp'], name: 'Fandare înapoi fără greutate', group: 'fesieri, coapse', region: 'legs', role: 'accessory', sets: 3, reps: '10–12/picior', unilateral: true, rest: 60, cue: 'pas înapoi, cobori până aproape atinge genunchiul podeaua, revii împingând în călcâiul din față', alt: 'fandare statică fără greutate', purpose: 'fesieri și coapse, pe un picior', setup: 'lângă un perete, pentru sprijin', mistakes: 'genunchiul din față trece mult peste vârf; pași prea mici' }),
    E({ id: 'fit-bw-step-up', equip: ['scaun', 'corp'], name: 'Urcare pe treaptă fără greutate', group: 'fesieri, coapse', region: 'legs', role: 'accessory', sets: 3, reps: '10–12/picior', unilateral: true, rest: 60, cue: 'urci împingând în piciorul de sus, fără să te împingi din cel de jos; cobori încet', alt: 'fandare înapoi fără greutate', purpose: 'fesieri și coapse, pe un picior', setup: 'o treaptă sau un scaun stabil, lipit de perete', mistakes: 'sari din piciorul de jos; genunchiul cade spre interior' }),
    E({ id: 'fit-towel-curl', equip: ['corp'], name: 'Flexii biceps cu prosopul, împotriva piciorului', group: 'biceps', region: 'upper', role: 'accessory', sets: 3, reps: '8–12', rest: 60, cue: 'prosopul pe sub talpă; tragi cu brațele în timp ce piciorul împinge în jos, cât să fie greu dar mișcarea să meargă lent', alt: 'flexii biceps cu gantere', purpose: 'bicepsul, fără gantere', setup: 'pe un scaun, un prosop trecut pe sub talpa unui picior, capetele în mâini', mistakes: 'coatele pleacă de lângă corp; tragi cu spatele' }),
    // ——— Întreținerea fizioterapeutului (promptul fizioterapeut.md, traseul A): doza mică, rezervă mare, fără aparate ———
    E({ id: 'pt-sit-stand', equip: ['scaun', 'corp'], name: 'Ridicare de pe scaun', group: 'cvadriceps, fesieri', region: 'legs', role: 'accessory', sets: 2, reps: '8', rest: 50, cue: 'te ridici fără să te împingi cu mâinile; cobori încet până atingi scaunul', alt: 'genuflexiune până la scaun, cu mâna pe un sprijin', purpose: 'forța de a te ridica, genunchi și șold', setup: 'scaun stabil, lipit de perete; tălpile la lățimea șoldurilor', mistakes: 'te arunci înapoi pe scaun; genunchii cad spre interior' }),
    E({ id: 'pt-calf-floor', equip: ['corp'], name: 'Ridicări pe vârfuri la sol, cu sprijin', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10, lent', rest: 45, cue: 'urci în 2 secunde, cobori în 2–3 secunde; mâna pe perete doar pentru echilibru', alt: 'aceeași mișcare din șezut', purpose: 'gambele și glezna', setup: 'în picioare, lângă un perete', mistakes: 'ricoșezi jos; te lași pe marginea exterioară a tălpii' }),
    E({ id: 'pt-balance', equip: ['corp'], name: 'Echilibru pe un picior, lângă sprijin', group: 'echilibru, gleznă', region: 'legs', role: 'accessory', sets: 2, reps: '20 s pe fiecare picior', unilateral: true, rest: 30, cue: 'genunchiul ușor moale, bazinul drept; atingi sprijinul doar dacă pierzi echilibrul', alt: 'cu ambele picioare, unul în fața celuilalt', purpose: 'controlul gleznei și al șoldului', setup: 'lângă un perete sau o masă', mistakes: 'bazinul cade pe o parte; ții respirația' }),
    E({ id: 'pt-bridge', equip: ['corp'], name: 'Pod fesier', group: 'fesieri', region: 'legs', role: 'accessory', sets: 2, reps: '8', rest: 45, cue: 'ridici bazinul strângând fesierii, ții o secundă sus, cobori încet', alt: 'ridicare de pe scaun', purpose: 'fesierii', setup: 'pe spate, tălpile pe sol aproape de fesieri', mistakes: 'arcuiești spatele în loc să ridici din șold' }),
    E({ id: 'pt-band-row', equip: ['banda'], name: 'Ramat cu bandă ușoară', group: 'spate, umăr posterior', region: 'upper', role: 'accessory', sets: 2, reps: '10', rest: 45, cue: 'tragi coatele pe lângă corp și strângi omoplații, fără să ridici umerii', alt: 'ramat cu o sticlă de apă, aplecat cu sprijin', purpose: 'spatele și postura umerilor', setup: 'banda prinsă la nivelul pieptului (clanță, picior de masă) sau în jurul tălpilor, din șezut', mistakes: 'umerii urcă spre urechi; tragi din trunchi' }),
    E({ id: 'pt-wall-slide', equip: ['corp'], name: 'Alunecări ale brațelor pe perete', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '8', rest: 40, cue: 'antebrațele pe perete; urci brațele cât nu doare și cobori încet', alt: 'ridicări ale brațelor în față, fără greutate', purpose: 'mobilitatea și controlul umerilor', setup: 'cu fața la perete, antebrațele pe perete la nivelul umerilor', mistakes: 'ridici umerii spre urechi; forțezi peste durere' }),
    E({ id: 'pt-bird-dog', equip: ['corp'], name: 'Bird-dog simplificat', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '6 pe fiecare parte', unilateral: true, rest: 40, cue: 'în patru labe, întinzi un braț și piciorul opus fără să se rotească bazinul', alt: 'doar piciorul sau doar brațul, pe rând', purpose: 'controlul trunchiului', setup: 'palmele sub umeri, genunchii sub șolduri', mistakes: 'arcuiești spatele; bazinul se rotește' }),
    E({ id: 'pt-thoracic', equip: ['scaun'], name: 'Mobilizare toracică în șezut', group: 'spate (mijloc)', region: 'core', role: 'core', sets: 1, reps: '6 rotații lente pe fiecare parte', rest: 30, cue: 'brațele încrucișate pe piept; rotești trunchiul încet, bazinul rămâne pe scaun', alt: 'rotații culcat pe o parte', purpose: 'mobilitatea spatelui de sus', setup: 'pe un scaun, tălpile pe sol', mistakes: 'rotești din bazin; forțezi capătul mișcării' }),
  ].map((x) => [x.id, x]),
);

/** Fișele exercițiilor de fitness existente: scop, reglare, greșeli frecvente (fără demonstrații video verificate încă). */
const FIT_SHEETS: Record<string, [string, string, string]> = {
  'fit-hip-thrust': ['fesierii mari, extensia șoldului', 'omoplații pe bancă (sau pe spătarul aparatului), picioarele cât să ai tibia verticală sus; o pernă sub bară', 'arcuiești spatele în loc să extinzi șoldul; împingi din vârfuri'],
  'fit-leg-press': ['cvadriceps și fesieri', 'spătarul cât să nu ți se ridice bazinul jos; picioarele la lățimea șoldurilor', 'bazinul se rulează jos; genunchii se blochează sus; genunchii cad spre interior'],
  'fit-reverse-lunge': ['fesieri și coapse, pe un picior', 'loc liber în spate; o mână pe un suport dacă ai nevoie', 'pas prea scurt; genunchiul din față cade spre interior'],
  'fit-leg-ext': ['cvadriceps', 'axa aparatului în dreptul genunchiului; perna pe gleznă', 'smucești sus; ridici bazinul de pe scaun'],
  'fit-calf': ['gambe', 'antepiciorul pe o treaptă, călcâiele libere', 'ricoșezi jos; mișcare prea scurtă'],
  'fit-calf-seated': ['gamba (solearul)', 'perna pe coapse, chiar deasupra genunchilor', 'ricoșezi jos; ridici prea repede'],
  'fit-dead-bug': ['controlul trunchiului', 'pe spate, genunchii și brațele sus', 'partea de jos a spatelui se dezlipește de sol; ții respirația'],
  'fit-rdl': ['femurali și fesieri, aplecarea din șold', 'ganterele în fața coapselor, genunchii ușor îndoiți', 'rotunjești spatele; ganterele pleacă departe de picioare; cobori sub ce controlezi'],
  'fit-leg-curl': ['femurali', 'axa în dreptul genunchiului; perna pe gleznă', 'ridici bazinul; revii necontrolat'],
  'fit-step-up': ['fesieri și coapse, pe un picior', 'treaptă la înălțimea la care urci fără elan', 'împingi din piciorul de jos; elan din trunchi'],
  'fit-kickback': ['fesieri', 'manșeta la gleznă, scripetele jos; te ții de aparat', 'arcuiești spatele; balans'],
  'fit-abduction': ['fesierul mijlociu', 'pernele pe exteriorul genunchilor; spătarul drept', 'deschizi cu smucituri; revii necontrolat'],
  'fit-lat': ['spatele (dorsalii)', 'genunchii fixați sub pernă; priza puțin mai largă decât umerii', 'te lași mult pe spate; tragi bara la ceafă'],
  'fit-chest-press': ['piept, triceps', 'mânerele la nivelul pieptului mijlociu', 'umerii urcă spre urechi; coatele se blochează'],
  'fit-row': ['mijlocul spatelui', 'pieptul pe pernă, mânerele la capătul brațelor', 'pieptul se ridică de pe pernă; tragi din biceps'],
  'fit-cable-row': ['mijlocul spatelui', 'picioarele pe suport, genunchii ușor îndoiți', 'balans din trunchi; umerii urcă'],
  'fit-incline': ['piept superior, umeri', 'banca la 15–30°', 'banca prea ridicată; coborâre necontrolată'],
  'fit-shoulder': ['umeri', 'mânerele la nivelul umerilor la start', 'arcuiești spatele; cobori mai mult decât controlezi'],
  'fit-pushup-high': ['piept, triceps', 'suportul cât să faci repetările cu corpul drept', 'șoldurile cad; capul înainte'],
  'fit-lateral': ['deltoidul lateral', 'ganterele lângă coapse, coatele ușor îndoite', 'avânt din corp; ridici umerii spre urechi'],
  'fit-triceps': ['triceps', 'scripetele sus, coatele lângă corp', 'coatele pleacă în față; te apleci peste'],
  'fit-biceps': ['biceps', 'în picioare, coatele lângă corp', 'balans din spate; coatele înaintează'],
  'fit-rev-fly': ['umăr posterior', 'pieptul pe pernă, mânerele la nivelul umerilor', 'ridici umerii; îndoi coatele mult'],
  'fit-pallof': ['trunchiul care rezistă la rotație', 'scripetele la nivelul pieptului, lateral', 'te rotești după cablu; ții respirația'],
  'fit-carry': ['trunchi, prindere, postură', 'două gantere grele dar controlabile', 'te apleci; pași mari și grăbiți'],
};
for (const [id, [purpose, setup, mistakes]] of Object.entries(FIT_SHEETS)) Object.assign(CATALOG[id]!, { purpose, setup, mistakes });

/** Exercițiile făcute culcat (metadată de catalog), pentru varianta prudentă la sarcină / postpartum. */
const LYING: Record<string, 'spate' | 'burta'> = {
  'fit-glute-bridge': 'spate', 'fit-glute-bridge-1': 'spate', 'fit-frog-pumps': 'spate', 'fit-dead-bug': 'spate', 'fit-hip-thrust': 'spate',
  'fit-h-glute-bridge': 'spate', 'fit-h-floor-press': 'spate', 'fit-h-db-fly': 'spate', 'fit-triceps-floor': 'spate', 'fit-db-press': 'spate',
  'fit-h-band-curl': 'burta', 'fit-reverse-hyper': 'burta', 'fit-straight-leg': 'burta', 'fit-hyperext': 'burta',
  'pt-bridge': 'spate', 'legs-dead-bug': 'spate', 'legs-hip-thrust': 'spate', 'legs-lying-curl': 'burta',
  'push-db-bench': 'spate', 'push-bb-bench': 'spate', 'push-db-fly': 'spate', 'push-skullcrusher': 'spate',
};
for (const [id, lying] of Object.entries(LYING)) CATALOG[id]!.lying = lying;

/**
 * Fișe adăugate (auditul v93, A60): doar ce e standard și sigur — scopul, poziția de start și greșelile de evitat —, fără
 * texte lungi inventate. Exercițiile rămase fără fișă au indicația scurtă (`cue`) și alternativa; lista lor e în raport.
 */
const MORE_SHEETS: Record<string, [string, string, string]> = {
  'fit-adduction': ['interiorul coapsei (adductorii)', 'pernele pe interiorul genunchilor; aparatul deschis cât simți o întindere ușoară, fără durere', 'închizi cu smucituri; deschizi aparatul mai larg decât controlezi'],
  'fit-bent-fly': ['umărul din spate și mijlocul spatelui', 'aplecat din șold, spatele drept, genunchii ușor îndoiți; ganterele atârnă sub umeri', 'ridici trunchiul ca să ajuți; îndoi mult coatele; ridici umerii spre urechi'],
  'fit-cable-squat': ['cvadriceps și fesieri', 'scripetele jos, mânerul ținut la piept; picioarele la lățimea umerilor, la un pas de aparat', 'te lași tras în față de cablu; călcâiele se ridică; genunchii cad spre interior'],
  'fit-curl-alt': ['biceps', 'în picioare, ganterele lângă coapse, coatele lipite de corp', 'balans din spate; coatele pleacă în față; cobori necontrolat'],
  'fit-curl-rot': ['biceps și antebraț', 'în picioare, ganterele lângă coapse, palmele spre corp', 'balans din spate; coatele pleacă în față'],
  'fit-fly': ['piept', 'scaunul reglat cât mânerele să fie la înălțimea pieptului; spatele lipit de spătar', 'împingi umerii în față; îndoi coatele și devine împins; deschizi mai mult decât e confortabil pentru umăr'],
  'fit-frog-pumps': ['fesierii', 'pe spate, tălpile lipite, genunchii căzuți în lateral, călcâiele aproape de fesieri', 'împingi din spate în loc de fesieri; arcuiești partea de jos a spatelui'],
  'fit-front-raise': ['umărul din față', 'în picioare, ganterele în fața coapselor, coatele ușor îndoite', 'balans din trunchi; urci peste nivelul umerilor; ridici umerii spre urechi'],
  'fit-glute-bridge': ['fesierii mari', 'pe spate, tălpile pe sol la lățimea șoldurilor, aproape de fesieri; banda deasupra genunchilor', 'arcuiești spatele sus în loc să strângi fesierii; genunchii cad spre interior după bandă'],
  'fit-glute-bridge-1': ['fesierul piciorului de sprijin', 'pe spate, o talpă pe sol aproape de fesier, celălalt picior întins în aer', 'bazinul se înclină spre piciorul din aer; împingi din vârf, nu din călcâi'],
  'fit-h-db-fly': ['piept', 'pe spate pe podea, genunchii îndoiți; ganterele deasupra pieptului, palmele față în față', 'întinzi complet coatele; lași brațele să cadă pe podea'],
  'fit-heel-squat': ['cvadriceps', 'călcâiele pe un disc subțire, vârfurile pe sol; gantera la piept, dacă o folosești', 'trunchiul se apleacă mult în față; genunchii cad spre interior'],
  'fit-hyperext': ['fesieri și partea de jos a spatelui', 'perna aparatului sub oasele bazinului, gleznele fixate, brațele încrucișate la piept', 'urci peste linia corpului și arcuiești spatele; cobori brusc'],
  'fit-lat-narrow': ['spatele (dorsalii)', 'mânerul îngust, genunchii fixați sub pernă', 'te lași mult pe spate; tragi din brațe în loc să duci coatele în jos'],
  'fit-lateral-lunge': ['adductori, fesieri, cvadriceps', 'picioarele apropiate; mâinile la piept sau o ganteră ușoară ținută la piept', 'genunchiul piciorului îndoit cade spre interior; călcâiul se ridică; trunchiul cade în față'],
  'fit-lateral-step': ['fesierul lateral', 'manșeta la gleznă, scripetele jos, stai lateral față de aparat, ușor ghemuit', 'te ridici din genuflexiune la fiecare pas; înclini trunchiul'],
  'fit-lateral-walk': ['fesierul lateral', 'banda deasupra genunchilor, picioarele la lățimea șoldurilor, ușor ghemuit', 'lași banda să se strângă între pași; genunchii cad spre interior; te legeni dintr-o parte în alta'],
  'fit-lunge-walk': ['fesieri și cvadriceps', 'câțiva metri de spațiu liber; ganterele lângă corp sau fără greutate', 'pas prea scurt; genunchiul din față cade spre interior; trunchiul cade în față'],
  'fit-pulse-squat': ['cvadriceps și fesieri', 'gantera ținută la piept; cobori în genuflexiune și rămâi jos', 'urci prea sus între pulsuri; călcâiele se ridică'],
  'fit-pushup': ['piept, triceps, umeri', 'mâinile puțin mai larg decât umerii; pe genunchi sau pe vârfuri', 'șoldurile cad sau urcă; coatele larg la 90° de corp; capul înainte'],
  'fit-rdl-bar': ['femurali și fesieri', 'bara în fața coapselor, priza puțin mai largă decât șoldurile, genunchii ușor îndoiți', 'rotunjești spatele; bara se depărtează de picioare; cobori sub ce controlezi'],
  'fit-reverse-hyper': ['fesieri', 'culcat cu bazinul pe marginea băncii, te ții de bancă; greutățile la glezne', 'arcuiești spatele sus; balansezi picioarele'],
  'fit-sl-rdl': ['femurali și fesieri, echilibru', 'în picioare pe un picior, genunchiul ușor îndoit; o mână pe un sprijin, dacă ai nevoie', 'bazinul se rotește în lateral; rotunjești spatele; genunchiul se blochează'],
  'fit-smith-lunge': ['fesieri și cvadriceps, pe un picior', 'bara Smith pe umeri; un picior în față, unul în spate, la distanța la care cobori drept', 'genunchiul din față cade spre interior; împingi din piciorul din spate'],
  'fit-straight-arm': ['spatele (dorsalii)', 'scripetele sus; aplecat ușor din șold, brațele aproape întinse', 'îndoi coatele și devine împins; balans din trunchi'],
  'fit-straight-leg': ['fesierii', 'sprijinit pe bancă, greutățile la glezne', 'arcuiești spatele ca să urci piciorul mai sus; balans'],
  'fit-sumo-deadlift': ['fesieri, femurali, adductori', 'picioarele larg, vârfurile în afară; gantera ținută între picioare', 'rotunjești spatele; genunchii cad spre interior; ridici din spate, nu din picioare'],
  'fit-sumo-squat': ['adductori și fesieri', 'picioarele larg, vârfurile în afară; gantera ținută vertical între picioare', 'genunchii cad spre interior; călcâiele se ridică; trunchiul cade în față'],
  'fit-triceps-floor': ['triceps', 'pe spate pe podea, coatele spre tavan, ganterele deasupra pieptului', 'coatele se deschid larg; duci ganterele spre față'],
  'fit-triceps-kickback': ['triceps', 'aplecat din șold, cu o mână sprijinită; cotul lipit de corp, la nivelul trunchiului', 'mișcarea vine din umăr; balans; cotul coboară'],
  'fit-walking-lunge': ['fesieri și cvadriceps', 'un picior în față, unul în spate; ganterele lângă corp', 'genunchiul din față cade spre interior; trunchiul cade în față; pas prea scurt'],
  'core-ab-wheel': ['abdomen', 'în genunchi pe o saltea, roata sub umeri', 'lași spatele să se arcuiască; mergi mai departe decât controlezi'],
  'core-cable-crunch': ['abdomen', 'în genunchi în fața scripetelui sus, frânghia lângă cap', 'tragi din brațe; te lași pe călcâie în loc să rulezi trunchiul'],
  'core-hanging-knee': ['abdomen', 'atârnat la bară sau sprijinit pe coate la aparatul pentru abdomen', 'balans; ridici genunchii fără să rulezi bazinul'],
  'core-plank': ['trunchi', 'antebrațele sub umeri, corpul drept de la cap la călcâie', 'șoldurile cad sau urcă; ții respirația'],
  'legs-press': ['cvadriceps și fesieri', 'spatele lipit de spătar, picioarele pe platformă la lățimea șoldurilor', 'bazinul se dezlipește jos; genunchii se blochează sus; genunchii cad spre interior'],
  'legs-bb-squat': ['cvadriceps și fesieri', 'bara pe partea de sus a spatelui (nu pe gât), picioarele la lățimea umerilor', 'călcâiele se ridică; genunchii cad spre interior; rotunjești spatele jos'],
  'legs-goblet': ['cvadriceps și fesieri', 'gantera ținută vertical la piept, picioarele puțin mai larg decât șoldurile', 'trunchiul cade în față; călcâiele se ridică'],
  'legs-db-rdl': ['femurali și fesieri', 'ganterele în fața coapselor, genunchii ușor îndoiți', 'rotunjești spatele; ganterele se depărtează de picioare'],
  'legs-bb-rdl': ['femurali și fesieri', 'bara în fața coapselor, priza la lățimea umerilor, genunchii ușor îndoiți', 'rotunjești spatele; bara se depărtează de picioare'],
  'legs-hip-thrust': ['fesieri', 'omoplații pe bancă, bara peste bazin cu o pernă, tălpile la lățimea șoldurilor', 'arcuiești spatele sus; împingi din vârfuri'],
  'legs-seated-curl': ['femurali', 'axa aparatului în dreptul genunchiului, perna pe gleznă', 'ridici bazinul de pe scaun; revii necontrolat'],
  'legs-lying-curl': ['femurali', 'axa aparatului în dreptul genunchiului, perna pe gleznă', 'ridici bazinul de pe banc; revii necontrolat'],
  'legs-ext': ['cvadriceps', 'axa aparatului în dreptul genunchiului, perna pe gleznă', 'smucești sus; ridici bazinul de pe scaun'],
  'legs-standing-calf': ['gambe', 'antepiciorul pe o treaptă, călcâiele libere', 'ricoșezi jos; mișcare prea scurtă'],
  'legs-seated-calf': ['gamba (solearul)', 'perna pe coapse, chiar deasupra genunchilor; antepiciorul pe platformă', 'ricoșezi jos; urci prea repede'],
  'legs-adduction': ['interiorul coapsei (adductorii)', 'pernele pe interiorul genunchilor', 'închizi cu smucituri; deschizi mai larg decât controlezi'],
  'legs-abduction': ['fesierul lateral', 'pernele pe exteriorul genunchilor; spătarul drept', 'deschizi cu smucituri; revii necontrolat'],
  'push-db-bench': ['piept, triceps', 'pe bancă, omoplații strânși, tălpile pe sol; ganterele urcate de pe genunchi', 'coatele larg la 90°; ganterele se lovesc sus; arcuiești mult spatele'],
  'push-bb-bench': ['piept, triceps', 'ochii sub bară, priza puțin mai largă decât umerii, omoplații strânși', 'bara sare de pe piept; fesierii se ridică de pe bancă; coatele larg la 90°'],
  'push-db-incline': ['pieptul de sus, umeri', 'banca la 15–30°, ganterele urcate de pe genunchi', 'banca prea ridicată; coborâre necontrolată'],
  'push-db-ohp': ['umeri', 'pe bancă cu spătar vertical, ganterele la nivelul umerilor', 'arcuiești spatele; cobori mai jos decât controlezi'],
  'push-db-lateral': ['deltoidul lateral', 'în picioare, ganterele lângă coapse, coatele ușor îndoite', 'balans din corp; ridici umerii spre urechi'],
  'push-cable-lateral': ['deltoidul lateral', 'scripetele jos, mânerul în mâna opusă, lateral față de aparat', 'balans din corp; ridici umerii spre urechi'],
  'push-rope-pushdown': ['triceps', 'scripetele sus, frânghia; coatele lângă corp', 'coatele pleacă în față; te apleci peste'],
  'pull-lat-neutral': ['spatele (dorsalii)', 'genunchii fixați sub pernă; mânerul neutru (palmele față în față)', 'te lași mult pe spate; tragi bara la ceafă'],
  'pull-lat-wide': ['spatele (dorsalii)', 'genunchii fixați sub pernă; priza puțin mai largă decât umerii', 'te lași mult pe spate; tragi bara la ceafă'],
  'pull-chest-row': ['mijlocul spatelui', 'pieptul pe pernă, mânerele la capătul brațelor', 'pieptul se ridică de pe pernă; tragi din biceps'],
  'pull-seated-cable-row': ['mijlocul spatelui', 'picioarele pe suport, genunchii ușor îndoiți, spatele drept', 'balans din trunchi; umerii urcă'],
  'pull-db-hammer': ['biceps și antebraț', 'în picioare, ganterele cu palmele spre corp, coatele lângă corp', 'coatele pleacă în față; balans din spate'],
  'pull-face-pull': ['umărul din spate, trapez', 'scripetele la nivelul feței, frânghia', 'tragi din trunchi; ridici umerii'],
  'pull-assisted-pullup': ['spatele (dorsalii)', 'genunchii pe platforma de asistență; priza puțin mai largă decât umerii', 'balans; cobori brusc; nu urci până la bărbie'],
};
for (const [id, [purpose, setup, mistakes]] of Object.entries(MORE_SHEETS)) {
  const ex = CATALOG[id]!;
  Object.assign(ex, { purpose: ex.purpose ?? purpose, setup: ex.setup ?? setup, mistakes: ex.mistakes ?? mistakes });
}

/** Echipamentul exercițiilor de sală care se pot face și acasă (gantere, bandă, corp, scaun) — pentru PPL-ul de acasă. */
const HOME_OK: Record<string, Equip[]> = {
  'pull-db-shrug': ['gantere'], 'pull-db-curl-alt': ['gantere'], 'pull-db-hammer': ['gantere'], 'push-db-lateral': ['gantere'], 'push-db-overhead-ext': ['gantere'],
  'push-arnold': ['gantere', 'scaun'], 'push-pushup': ['corp', 'scaun'], 'legs-walking-lunge': ['gantere', 'corp'], 'legs-step-up': ['scaun', 'corp'], 'legs-sumo-goblet': ['gantere'],
  'legs-band-walk': ['banda'], 'legs-standing-calf': ['corp'], 'legs-goblet': ['gantere'], 'legs-db-rdl': ['gantere'], 'legs-split-squat': ['corp', 'gantere'],
  'legs-dead-bug': ['corp'], 'core-plank': ['corp'], 'pull-farmer': ['gantere'], 'pull-suitcase': ['gantere'], 'legs-pogo': ['corp'],
};
for (const [id, eq] of Object.entries(HOME_OK)) CATALOG[id]!.equip ??= eq;

/** Abdomenul de la finalul ședinței (opțional), altul la fiecare ședință. */
const ABS = ['core-cable-crunch', 'core-hanging-knee', 'core-plank', 'core-ab-wheel', 'legs-dead-bug', 'legs-pallof'];

const LEG_WARMUP = '10 min mers rapid pe bandă (înclinație ușoară), apoi 50 de genuflexiuni fără greutate';
const GLUTE_WARMUP = '10 min mers rapid pe bandă, apoi 2 min activare fesieri cu banda deasupra genunchilor (pod de fesieri și deschideri, fără pauză)';
const UPPER_WARMUP = '10 min eliptică sau mers rapid, rotiri de umeri, apoi 2 serii ușoare la primul exercițiu (nu se numără)';
const STAIRS = { text: 'scări (stepper), viteza 8–10, ritm constant', min: 10, max: 20 };
const WALK = { text: 'mers rapid pe bandă, viteza ~6, cu înclinație', min: 10, max: 30 };
const ELLIPTICAL = { text: 'bicicletă eliptică, rezistență medie, ritm constant', min: 10, max: 20 };
/** Ședința de fitness scrisă ca la antrenoare: [exercițiu, serii, repetări (schema seriilor), pauză s, superserie]. */
type CoachRow = [string, number, string, number, string?];
function coach(id: FitnessSessionId, name: string, aliases: string[], focus: string, warmup: string, finisher: StrengthSession['finisher'], ...tables: CoachRow[][]): StrengthSession {
  const variants = tables.map((rows) => ({ exercises: rows.map((r) => r[0]), dose: Object.fromEntries(rows.map(([k, sets, reps, rest, ss]) => [k, { sets, reps, rest, ...(ss ? { ss } : {}) }])) }));
  return { id, name, aliases, focus, warmup, finisher, exercises: variants[0]!.exercises, completions: [], dose: variants[0]!.dose, ...(variants.length > 1 ? { variants } : {}) };
}

export const SESSIONS: Record<SessionId, StrengthSession> = {
  pushA: { id: 'pushA', name: 'Push A', focus: 'piept, umeri, triceps', exercises: ['push-db-bench', 'push-landmine', 'push-cable-fly', 'push-cable-lateral', 'push-rope-pushdown'], completions: [] },
  pullA: { id: 'pullA', name: 'Pull A', focus: 'spate, umăr posterior, biceps', exercises: ['pull-lat-neutral', 'pull-chest-row', 'pull-rev-fly-machine', 'pull-db-hammer', 'pull-farmer'], completions: [] },
  legsA: { id: 'legsA', name: 'Legs A', focus: 'picioare, trunchi', exercises: ['legs-press', 'legs-db-rdl', 'legs-seated-curl', 'legs-standing-calf', 'legs-dead-bug'], completions: [], legSwap: 'legs-split-squat' },
  pushB: { id: 'pushB', name: 'Push B', focus: 'piept, umeri, triceps', exercises: ['push-db-incline', 'push-machine-shoulder', 'push-pushup', 'push-db-lateral', 'push-overhead-cable'], completions: [] },
  pullB: { id: 'pullB', name: 'Pull B', focus: 'spate, umăr posterior, biceps', exercises: ['pull-assisted-pullup', 'pull-cable-row-1arm', 'pull-rev-fly-cable', 'pull-cable-curl', 'pull-suitcase'], completions: [] },
  legsB: { id: 'legsB', name: 'Legs B', focus: 'picioare, trunchi', exercises: ['legs-goblet', 'legs-hip-thrust', 'legs-lying-curl', 'legs-seated-calf', 'legs-pallof'], completions: [], legSwap: 'legs-step-up' },
  // Bărbații: Push / Pull / Picioare în rotație de la 3 ședințe pe săptămână (sub 3: tot corpul sau sus / jos, A50);
  // fiecare poziție are trei variante cu exerciții și aparate diferite, ca ședințele să nu fie identice.
  push: split('push', 'Push', 'piept, umeri (fața și lateral), triceps, abdomen', [
    ['push-bb-bench', 'push-db-bench', 'push-machine-chest'],
    ['push-db-incline', 'push-smith-incline', 'push-bb-incline'],
    ['push-db-ohp', 'push-machine-shoulder', 'push-arnold'],
    ['push-cable-lateral', 'push-db-lateral', 'push-machine-lateral'],
    ['push-cable-fly', 'push-pec-deck', 'push-db-fly'],
    ['push-rope-pushdown', 'push-dips', 'push-bar-pushdown'],
    ['push-overhead-cable', 'push-skullcrusher', 'push-db-overhead-ext'],
    ABS,
  ]),
  pull: split('pull', 'Pull', 'spate, umeri (spate), trapez, biceps, abdomen', [
    ['pull-lat-wide', 'pull-assisted-pullup', 'pull-lat-neutral'],
    ['pull-bb-row', 'pull-seated-cable-row', 'pull-chest-row'],
    ['pull-db-row-1arm', 'pull-straight-arm', 'pull-tbar-row'],
    ['pull-face-pull', 'pull-rev-fly-machine', 'pull-rev-fly-cable'],
    ['pull-db-shrug', 'pull-bb-shrug', 'pull-machine-shrug'],
    ['pull-ez-curl', 'pull-db-curl-alt', 'pull-cable-curl'],
    ['pull-db-hammer', 'pull-incline-curl', 'pull-preacher'],
    [...ABS.slice(2), ...ABS.slice(0, 2)],
  ]),
  legs: split('legs', 'Picioare', 'cvadriceps, femurali, fesieri, adductori, abductori, gambe', [
    ['legs-bb-squat', 'legs-press', 'legs-hack'],
    ['legs-bb-rdl', 'legs-hip-thrust', 'legs-db-rdl'],
    ['legs-walking-lunge', 'legs-bulgarian', 'legs-step-up'],
    ['legs-ext', 'legs-ext-1'],
    ['legs-lying-curl', 'legs-seated-curl', 'legs-standing-curl'],
    ['legs-adduction', 'legs-cable-adduction', 'legs-sumo-goblet'],
    ['legs-abduction', 'legs-cable-abduction', 'legs-band-walk'],
    ['legs-standing-calf', 'legs-seated-calf', 'legs-press-calf'],
    [...ABS.slice(1), ABS[0]!],
  ]),
  // O singură ședință pe săptămână: tot corpul (excepția din 20.10.2026, A50 — vezi `fullBody`). Câte o mișcare
  // principală pe tipar: genuflexiune, împins, tras orizontal, aplecare din șold, tras vertical; gambe și trunchi la final.
  full: { id: 'full', name: 'Tot corpul', fullBody: true, focus: 'picioare, piept, spate, umeri, trunchi', exercises: ['legs-goblet', 'push-db-bench', 'pull-chest-row', 'legs-db-rdl', 'pull-lat-neutral', 'legs-standing-calf', 'legs-pallof'], completions: [] },
  // Cu două ședințe pe săptămână: o zi de picioare și una pentru partea de sus, alternativ. Picioarele nu se combină
  // niciodată cu partea de sus în aceeași ședință (regula proprietarului, 19.10.2026); abdomenul merge cu oricare.
  fullA: { id: 'fullA', name: 'Picioare și trunchi', aliases: ['Tot corpul A'], focus: 'cvadriceps, femurali, fesieri, gambe, abdomen', exercises: ['legs-press', 'legs-db-rdl', 'legs-split-squat', 'legs-lying-curl', 'legs-standing-calf', 'legs-dead-bug'], completions: [] },
  fullB: { id: 'fullB', name: 'Partea de sus și trunchi', aliases: ['Tot corpul B'], focus: 'piept, spate, umeri, brațe, abdomen', exercises: ['push-db-bench', 'pull-lat-neutral', 'push-db-incline', 'pull-chest-row', 'push-cable-lateral', 'pull-db-hammer', 'legs-pallof'], completions: [] },
  // Fitness (structura unei antrenoare reale, 19.10.2026): trei zile de picioare cu accente diferite (cvadriceps;
  // fesieri și femurali; abductori) și două pentru partea de sus (spate + biceps; piept + umeri + triceps). Picioarele
  // nu se combină cu partea de sus. Fiecare ședință: 10 min de încălzire concretă, exerciții de 3–4 serii (piramide
  // 20/15/12/8 cu greutatea crescută, ținut 3 s, superserii), apoi cardio la final (scări, mers rapid, eliptică).
  l1: coach('l1', 'Picioare A: cvadriceps și fesieri', ['L1 Fesieri și coapse'], 'cvadriceps, fesieri, adductori', LEG_WARMUP, STAIRS, [
    ['fit-leg-ext', 3, '20 / 15 / 12 — crești greutatea la fiecare serie', 90],
    ['fit-leg-press', 3, '20 / 15 / 12 — crești greutatea la fiecare serie', 120],
    ['fit-squat', 4, '20 / 15 / 12 / 8 — crești greutatea la fiecare serie', 120],
    ['fit-walking-lunge', 3, '20 (10 pe fiecare picior)', 75, 'A'],
    ['fit-adduction', 3, '30', 60, 'A'],
  ], [
    // Varianta 2 (săptămâna 1/1 a antrenoarei)
    ['fit-squat', 4, '20 / 20 / 10 / 10 — la seriile de 10 crești greutatea', 120],
    ['fit-leg-press', 3, '20', 120, 'A'],
    ['fit-adduction', 3, '30', 60, 'A'],
    ['fit-walking-lunge', 3, '20 (10 pe fiecare picior)', 75],
    ['fit-heel-squat', 3, '20', 75],
  ], [
    // Varianta 3 (săptămâna 4/1)
    ['fit-lateral-walk', 3, '4 pași stânga + 4 dreapta, de 5 ori', 45, 'A'],
    ['fit-lunge-walk', 3, '10 pași înainte + 10 înapoi', 75, 'A'],
    ['fit-sumo-deadlift', 4, '20 / 20 / 10 / 10 — la seriile de 10 crești greutatea', 120],
    ['fit-smith-lunge', 3, '20 / 10 / 10 pe picior — la seriile de 10 crești greutatea', 90],
    ['fit-lateral-step', 3, '15 pe fiecare parte', 60, 'B'],
    ['fit-lateral-lunge', 3, '20 (o repetare = stânga + dreapta)', 60, 'B'],
  ]),
  l2: coach('l2', 'Picioare B: fesieri și femurali', ['L2 Posterior și fesieri'], 'femurali, fesieri', GLUTE_WARMUP, STAIRS, [
    ['fit-leg-curl', 4, '20 / 15 / 12 / 8 — crești greutatea la fiecare serie', 90],
    ['fit-rdl', 3, '15', 90, 'A'],
    ['fit-sl-rdl', 3, '15 pe fiecare picior', 75, 'A'],
    ['fit-glute-bridge', 3, '40: 30 cu 3 s ținut sus + 10 rapide', 60, 'B'],
    ['fit-kickback', 3, '20 pe fiecare picior', 60, 'B'],
    ['fit-hip-thrust', 4, '20 — crești greutatea la fiecare serie, aceleași repetări', 120],
  ], [
    // Varianta 2 (săptămâna 8/1)
    ['fit-hip-thrust', 4, '20 — crești greutatea la fiecare serie, aceleași repetări', 120],
    ['fit-kickback', 3, '20 / 10 / 10 pe picior — la seriile de 10 crești greutatea', 60],
    ['fit-abduction', 4, '20 — crești greutatea la fiecare serie; la ultima repetare ții 10 s', 60],
    ['fit-leg-curl', 3, '20 / 15 / 12 — crești greutatea la fiecare serie', 90],
    ['fit-reverse-hyper', 3, '30, ții 3 s sus (cu greutăți la glezne)', 60],
  ], [
    // Varianta 3 (săptămânile 8/3 și 5/3)
    ['fit-leg-curl', 4, '20 / 20 / 10 / 10 — la seriile de 10 crești greutatea', 90, 'A'],
    ['fit-rdl-bar', 4, '20 / 20 / 10 / 10 — la seriile de 10 crești greutatea', 120, 'A'],
    ['fit-glute-bridge-1', 3, '20 pe fiecare picior (cu greutăți la glezne)', 60, 'B'],
    ['fit-frog-pumps', 3, '30', 45, 'B'],
    ['fit-sumo-deadlift', 4, '20 / 15 / 12 / 8 — crești greutatea la fiecare serie', 120],
    ['fit-sl-rdl', 3, '15 pe fiecare picior', 75, 'C'],
    ['fit-adduction', 3, '30', 60, 'C'],
  ]),
  l3: coach('l3', 'Picioare C: abductori și fesieri', [], 'abductori, fesieri, adductori', LEG_WARMUP, STAIRS, [
    ['fit-abduction', 3, '50: 30 cu 3 s ținut la deschidere + 20 rapide', 60, 'A'],
    ['fit-lateral-lunge', 3, '15 (o repetare = stânga + dreapta)', 60, 'A'],
    ['fit-lateral-walk', 3, '10 pași stânga + 10 pași dreapta', 45, 'A'],
    ['fit-bulgarian', 4, '20 / 20 / 10 / 10 pe picior — la seriile de 10 crești greutatea', 90],
    ['fit-abduction-cable', 3, '20 pe fiecare picior, ții 3 s sus', 60, 'B'],
    ['fit-sumo-squat', 3, '20', 60, 'B'],
    ['fit-hyperext', 3, '30', 60],
  ], [
    // Varianta 2 (săptămânile 2/3 și 5/2)
    ['fit-abduction', 3, '30, cu greutate mai mare; la ultima repetare ții 10 s', 60],
    ['fit-straight-leg', 3, '30 pe picior: 20 cu 3 s sus + 10 rapide (greutăți la glezne)', 60, 'A'],
    ['fit-reverse-hyper', 3, '20, ții 3 s sus (greutăți la glezne)', 60, 'A'],
    ['fit-abduction-cable', 3, '20 pe picior; la ultima repetare ții 10 s', 60],
    ['fit-cable-squat', 4, '20 / 20 / 10 / 10 — la seriile de 10 crești greutatea', 90],
    ['fit-lateral-step', 3, '15 pe fiecare parte', 60, 'B'],
    ['fit-pulse-squat', 3, '30 pulsuri', 60, 'B'],
  ], [
    // Varianta 3 (săptămâna 5/2)
    ['fit-abduction', 4, '40, ții 3 s la fiecare deschidere; la ultima ții 10 s', 60, 'A'],
    ['fit-pulse-squat', 4, '15 pulsuri, de pe treaptă', 60, 'A'],
    ['fit-abduction-cable', 3, '20 pe picior', 60, 'B'],
    ['fit-sumo-squat', 3, '20', 60, 'B'],
    ['fit-lateral-step', 3, '15 pe fiecare parte', 60],
  ]),
  u1: coach('u1', 'Spate și biceps', ['U1 Spate, piept, umeri'], 'spate, umărul din spate, biceps', UPPER_WARMUP, WALK, [
    ['fit-lat', 4, '15 — priză largă', 90, 'A'],
    ['fit-lat-narrow', 3, '15', 90, 'A'],
    ['fit-cable-row', 3, '15', 90],
    ['fit-bent-fly', 3, '15', 60],
    ['fit-curl-alt', 3, '20 (10 pe fiecare braț)', 60, 'B'],
    ['fit-hammer', 3, '15', 60, 'B'],
    ['fit-curl-rot', 3, '20', 60, 'B'],
  ], [
    // Varianta 2 (săptămâna 8/1: spate și umeri)
    ['fit-lat', 4, '20 / 20 / 10 / 10 — priză largă, la seriile de 10 crești greutatea', 90, 'A'],
    ['fit-lat-narrow', 3, '20 / 10 / 10 — la seriile de 10 crești greutatea', 90, 'A'],
    ['fit-cable-row', 3, '20 / 10 / 10', 90],
    ['fit-lateral', 4, '20', 60, 'B'],
    ['fit-front-raise', 3, '20', 60, 'B'],
    ['fit-bent-fly', 3, '20', 60, 'B'],
  ], [
    // Varianta 3 (săptămâna 4/1: spate și biceps, superserii)
    ['fit-lat', 4, '15 — priză largă', 90, 'A'],
    ['fit-lat-narrow', 3, '15', 90, 'A'],
    ['fit-straight-arm', 3, '15', 60, 'A'],
    ['fit-curl-alt', 4, '20 (10 pe fiecare braț)', 60, 'B'],
    ['fit-curl-rot', 3, '20', 60, 'B'],
    ['fit-hammer', 3, '10', 60, 'B'],
  ]),
  u2: coach('u2', 'Piept, umeri și triceps', ['U2 Partea superioară și trunchi'], 'piept, umeri, triceps', UPPER_WARMUP, ELLIPTICAL, [
    ['fit-fly', 4, '15', 60, 'A'],
    ['fit-chest-press', 3, '15', 90, 'A'],
    ['fit-pushup', 3, '10–20', 60, 'A'],
    ['fit-shoulder', 3, '15', 90, 'B'],
    ['fit-front-raise', 3, '15', 60, 'B'],
    ['fit-lateral', 3, '15', 60, 'C'],
    ['fit-rev-fly', 3, '15', 60, 'C'],
    ['fit-triceps', 3, '15 — cobori în 3 s', 60, 'D'],
    ['fit-triceps-kickback', 3, '15', 60, 'D'],
  ], [
    // Varianta 2 (săptămâna 8/2)
    ['fit-fly', 4, '15', 60, 'A'],
    ['fit-bent-fly', 4, '15', 60, 'A'],
    ['fit-chest-press', 3, '15', 90, 'B'],
    ['fit-pushup', 3, '20', 60, 'B'],
    ['fit-triceps-kickback', 4, '15', 60, 'C'],
    ['fit-triceps', 3, '15', 60, 'C'],
    ['fit-triceps-floor', 3, '15', 60, 'C'],
  ], [
    // Varianta 3 (săptămânile 7/1 și 4/3)
    ['fit-pushup', 3, '10, priză largă', 60, 'A'],
    ['fit-fly', 3, '20', 60, 'A'],
    ['fit-chest-press', 3, '20', 90, 'B'],
    ['fit-lateral', 3, '20', 60, 'B'],
    ['fit-front-raise', 3, '50, greutate mică', 60],
    ['fit-triceps-kickback', 3, '30', 60, 'C'],
    ['fit-triceps-floor', 3, '50, greutate mică', 60, 'C'],
  ]),
  // Fitness cu o singură zi pe săptămână: tot corpul (excepția din 20.10.2026, A50), aceleași exerciții de bază ale
  // programului, 3 serii, ca fiecare tipar (fesieri, coapse, spate, piept) să fie lucrat în fiecare săptămână.
  ft: { ...coach('ft', 'Tot corpul (o zi pe săptămână)', [], 'fesieri, coapse, spate, piept, trunchi', '10 min mers rapid pe bandă sau eliptică, apoi 20 de genuflexiuni fără greutate și rotiri de umeri', WALK, [
    ['fit-hip-thrust', 3, '10–12', 105],
    ['fit-leg-press', 3, '10–12', 105],
    ['fit-lat', 3, '10–12', 90],
    ['fit-chest-press', 3, '10–12', 90],
    ['fit-row', 3, '10–12', 90],
    ['fit-rdl', 3, '10–12', 105],
    ['fit-pallof', 3, '8–12/parte', 50],
  ]), fullBody: true },
  // Ședințele vechi (planuri salvate înainte de 19.10.2026, combinau picioarele cu partea de sus): se citesc din plan,
  // dar prescripția lor e cea a ședinței noi echivalente (LEGACY_FIT); planul se rescrie la deschidere.
  f1: fit('f1', 'F1 Tot corpul', 'fesieri, coapse, împins, tras, trunchi', { 'fit-hip-thrust': 3 }),
  f2: fit('f2', 'F2 Tot corpul', 'posterior, fesieri, tras, împins, trunchi', { 'fit-rdl': 3 }),
  a3: fit('a3', 'A3 Fesieri și coapse', 'fesieri, coapse și trunchi superior', { 'fit-hip-thrust': 3 }),
  b3: fit('b3', 'B3 Partea superioară', 'partea superioară și femurali', { 'fit-lat': 3 }),
  c3: fit('c3', 'C3 Posterior și fesieri', 'posterior, fesieri și trunchi superior', { 'fit-rdl': 3 }),
  // Întreținerea fizioterapeutului (traseul A, fără durere și fără restricții): modul scurt, 12–20 min, nu ședință de
  // sală. Doza e cea din promptul fizioterapeut.md; regula 20 (45 min, 3–4 serii) nu i se aplică.
  intA: maint('intA', 'Întreținere A: picior și șold', 'ridicarea de pe scaun, gambe, echilibru, fesieri', { 'pt-sit-stand': [2, '8', 50], 'pt-calf-floor': [2, '10, lent', 45], 'pt-balance': [2, '20 s pe fiecare picior', 30], 'pt-bridge': [2, '8', 45] }),
  intB: maint('intB', 'Întreținere B: umăr și trunchi', 'spatele de sus, umerii, trunchiul', { 'pt-band-row': [2, '10', 45], 'pt-wall-slide': [2, '8', 40], 'pt-bird-dog': [2, '6 pe fiecare parte', 40], 'pt-thoracic': [1, '6 rotații lente pe fiecare parte', 30] }),
  // Varianta amplă de patru zile (A–D): doza pentru sportiva eligibilă (experiență, timp ≥ 55 min, prezență
  // demonstrată la 4 zile), nu o înlocuire obligatorie a ședințelor L1/U1/L2/U2. Doza de construire: 3 serii la fiecare
  // exercițiu (regula 20; documentul de referință avea 2 la accesorii și în săpt. 1–4, aliniat pe 20.10.2026, A60).
  fa: fitX('fa', 'A Picioare și fesieri', 'picioare și fesieri, accent genuflexiune', '55–70 min', { 'fit-hip-thrust': [3, '8–12', 120], 'fit-leg-press': [3, '8–12', 150], 'fit-bulgarian': [3, '8–10/picior', 105], 'fit-leg-curl': [3, '10–15', 90], 'fit-abduction': [3, '12–20', 75], 'fit-calf': [3, '10–15', 75], 'fit-pallof': [3, '8–12/parte', 50] }),
  fb: fitX('fb', 'B Superior, accent spate', 'spate, umeri, brațe', '45–60 min', { 'fit-lat': [3, '8–12', 120], 'fit-row': [3, '8–12', 120], 'fit-chest-press': [3, '8–12', 105], 'fit-lateral': [3, '12–20', 75], 'fit-rev-fly': [3, '12–20', 75], 'fit-biceps': [3, '10–15', 75], 'fit-triceps': [3, '10–15', 75] }),
  fc: fitX('fc', 'C Fesieri și lanț posterior', 'fesieri, femurali, trunchi', '50–65 min', { 'fit-rdl': [3, '8–10', 150], 'fit-hip-thrust': [3, '10–15', 120], 'fit-reverse-lunge': [3, '8–12/picior', 105], 'fit-leg-curl': [3, '10–15', 90], 'fit-calf-seated': [3, '12–15', 75], 'fit-dead-bug': [3, '6–10/parte', 50] }),
  fd: fitX('fd', 'D Superior, accent împins', 'piept, umeri, spate, brațe', '45–60 min', { 'fit-incline': [3, '8–12', 120], 'fit-cable-row': [3, '8–12', 120], 'fit-shoulder': [3, '8–12', 105], 'fit-lat-neutral': [3, '10–12', 105], 'fit-lateral': [3, '12–20', 75], 'fit-hammer': [3, '10–15', 75], 'fit-triceps': [3, '10–15', 75] }),
};

function split(id: SplitSessionId, name: string, focus: string, slots: string[][]): StrengthSession {
  return { id, name, focus, exercises: slots.map((p) => p[0]!), completions: [], slots };
}

/** Exercițiile ședinței pentru varianta dată: din fiecare poziție, altul la fiecare ședință de același tip. */
export function sessionExercises(s: StrengthSession, variant = 0): string[] {
  return s.slots ? s.slots.map((p) => p[variant % p.length]!) : s.exercises;
}

export const isSplitSession = (id: SessionId): id is SplitSessionId => id === 'push' || id === 'pull' || id === 'legs';

function fitX(id: FitnessSessionId, name: string, focus: string, estimate: string, dose: Record<string, [number, string, number]>): StrengthSession {
  return { id, name, focus, estimate, exercises: Object.keys(dose), completions: [], dose: Object.fromEntries(Object.entries(dose).map(([k, [sets, reps, rest]]) => [k, { sets, reps, rest }])) };
}

function maint(id: MaintenanceSessionId, name: string, focus: string, dose: Record<string, [number, string, number]>): StrengthSession {
  return { id, name, focus, maintenance: true, exercises: Object.keys(dose), completions: [], dose: Object.fromEntries(Object.entries(dose).map(([k, [sets, reps, rest]]) => [k, { sets, reps, rest }])) };
}
export const isMaintenanceSession = (id: SessionId): id is MaintenanceSessionId => id === 'intA' || id === 'intB';

/** Ședințele variantei ample. */
export const FITNESS_WIDE: FitnessSessionId[] = ['fa', 'fb', 'fc', 'fd'];
export const isWideSession = (id: SessionId) => (FITNESS_WIDE as SessionId[]).includes(id);

/**
 * Varietatea controlată (săptămânile 13–16): câte un element echivalent pe ședință, nu tot programul. Variantele nu sunt
 * identice biomecanic: greutatea se recalibrează.
 */
export const FITNESS_SWAPS: [string, string][] = [
  ['fit-abduction', 'fit-abduction-cable'],
  ['fit-chest-press', 'fit-db-press'],
  ['fit-reverse-lunge', 'fit-step-up'],
  ['fit-lateral', 'fit-lateral-cable'],
  ['fit-leg-press', 'fit-goblet'],
];

/** Acasă (gantere, bandă, corp, scaun): fiecare exercițiu de sală are echivalentul lui; alternativa e tot de acasă. */
export const HOME_SWAP: Record<string, string> = {
  'fit-hip-thrust': 'fit-h-glute-bridge',
  'fit-leg-press': 'fit-h-goblet',
  'fit-goblet': 'fit-h-goblet',
  'fit-leg-ext': 'fit-h-split-squat',
  'fit-leg-curl': 'fit-h-band-curl',
  'fit-kickback': 'fit-h-band-kickback',
  'fit-abduction': 'fit-h-band-abduction',
  'fit-abduction-cable': 'fit-h-band-abduction',
  'fit-lat': 'fit-h-band-pulldown',
  'fit-lat-neutral': 'fit-h-band-pulldown',
  'fit-chest-press': 'fit-h-floor-press',
  'fit-db-press': 'fit-h-floor-press',
  'fit-row': 'fit-h-db-row',
  'fit-cable-row': 'fit-h-band-row',
  'fit-incline': 'fit-h-pushup-incline',
  'fit-pushup-high': 'fit-h-pushup-incline',
  'fit-shoulder': 'fit-h-db-ohp',
  'fit-lateral-cable': 'fit-lateral',
  'fit-triceps': 'fit-h-db-triceps',
  'fit-rev-fly': 'fit-h-band-pullapart',
  'fit-pallof': 'fit-h-band-pallof',
  'fit-calf-seated': 'fit-h-seated-calf',
  'fit-bulgarian': 'fit-h-bulgarian',
  'fit-squat': 'fit-h-goblet',
  'fit-adduction': 'fit-sumo-squat',
  'fit-hyperext': 'fit-glute-bridge-1',
  'fit-lat-narrow': 'fit-h-band-row',
  'fit-straight-arm': 'fit-h-band-pulldown',
  'fit-fly': 'fit-h-db-fly',
  'fit-db-row': 'fit-h-db-row',
  'fit-smith-lunge': 'fit-walking-lunge',
  'fit-cable-squat': 'fit-h-goblet',
  'fit-lateral-step': 'fit-lateral-walk',
  'fit-reverse-hyper': 'fit-h-band-kickback',
  'fit-straight-leg': 'fit-h-band-kickback',
  'fit-rdl-bar': 'fit-rdl',
  // Bărbații acasă (regula 22): Push / Pull / Picioare și tot corpul, cu echivalentele de acasă (aceeași poziție din ședință).
  'push-bb-bench': 'fit-h-floor-press', 'push-db-bench': 'fit-h-floor-press', 'push-machine-chest': 'fit-h-floor-press',
  'push-db-incline': 'push-pushup', 'push-smith-incline': 'push-pushup', 'push-bb-incline': 'push-pushup',
  'push-db-ohp': 'fit-h-db-ohp', 'push-machine-shoulder': 'fit-h-db-ohp', 'push-landmine': 'fit-h-db-ohp',
  'push-cable-lateral': 'push-db-lateral', 'push-machine-lateral': 'push-db-lateral',
  'push-cable-fly': 'fit-h-db-fly', 'push-pec-deck': 'fit-h-db-fly', 'push-db-fly': 'fit-h-db-fly',
  'push-rope-pushdown': 'fit-triceps-kickback', 'push-dips': 'fit-triceps-kickback', 'push-bar-pushdown': 'fit-triceps-kickback',
  'push-overhead-cable': 'push-db-overhead-ext', 'push-skullcrusher': 'push-db-overhead-ext',
  'pull-lat-wide': 'fit-h-band-pulldown', 'pull-assisted-pullup': 'fit-h-band-pulldown', 'pull-lat-neutral': 'fit-h-band-pulldown',
  'pull-bb-row': 'fit-h-band-row', 'pull-seated-cable-row': 'fit-h-band-row', 'pull-chest-row': 'fit-h-band-row',
  'pull-db-row-1arm': 'fit-h-db-row', 'pull-straight-arm': 'fit-h-db-row', 'pull-tbar-row': 'fit-h-db-row', 'pull-cable-row-1arm': 'fit-h-db-row',
  'pull-face-pull': 'fit-h-band-pullapart', 'pull-rev-fly-machine': 'fit-h-band-pullapart', 'pull-rev-fly-cable': 'fit-h-band-pullapart',
  'pull-bb-shrug': 'pull-db-shrug', 'pull-machine-shrug': 'pull-db-shrug',
  'pull-ez-curl': 'fit-biceps', 'pull-cable-curl': 'fit-biceps', 'pull-incline-curl': 'pull-db-hammer', 'pull-preacher': 'pull-db-hammer',
  'legs-bb-squat': 'fit-h-goblet', 'legs-press': 'fit-h-goblet', 'legs-hack': 'fit-h-goblet',
  'legs-bb-rdl': 'fit-rdl', 'legs-hip-thrust': 'fit-h-glute-bridge', 'legs-bulgarian': 'fit-h-bulgarian',
  'legs-ext': 'fit-h-split-squat', 'legs-ext-1': 'fit-h-split-squat',
  'legs-lying-curl': 'fit-h-band-curl', 'legs-seated-curl': 'fit-h-band-curl', 'legs-standing-curl': 'fit-h-band-curl',
  'legs-adduction': 'legs-sumo-goblet', 'legs-cable-adduction': 'legs-sumo-goblet',
  'legs-abduction': 'fit-h-band-abduction', 'legs-cable-abduction': 'fit-h-band-abduction',
  'legs-seated-calf': 'fit-h-seated-calf', 'legs-press-calf': 'legs-standing-calf',
  'core-cable-crunch': 'core-plank', 'core-ab-wheel': 'core-plank', 'core-hanging-knee': 'legs-dead-bug', 'legs-pallof': 'fit-h-band-pallof',
};

/**
 * Cu reformer acasă (regula 49): aceste exerciții trec pe reformer, cu arcurile ca greutate (presa de picioare, flexiile
 * femurali, abducția, adducția, extensia șoldului, tracțiunile și ramatul). Restul rămân cu gantere / corp.
 */
export const REFORMER_SWAP: Record<string, string> = {
  'fit-leg-press': 'fit-r-footwork', 'legs-press': 'fit-r-footwork', 'legs-hack': 'fit-r-footwork',
  'fit-leg-ext': 'fit-r-single-leg', 'legs-ext': 'fit-r-single-leg', 'legs-ext-1': 'fit-r-single-leg',
  'fit-leg-curl': 'fit-r-ham-curl', 'fit-h-band-curl': 'fit-r-ham-curl', 'legs-lying-curl': 'fit-r-ham-curl', 'legs-seated-curl': 'fit-r-ham-curl', 'legs-standing-curl': 'fit-r-ham-curl',
  'fit-hyperext': 'fit-r-bridge', 'fit-reverse-hyper': 'fit-r-bridge',
  'fit-abduction': 'fit-r-side-abduction', 'fit-abduction-cable': 'fit-r-side-abduction', 'fit-h-band-abduction': 'fit-r-side-abduction', 'legs-abduction': 'fit-r-side-abduction', 'legs-cable-abduction': 'fit-r-side-abduction',
  'fit-adduction': 'fit-r-side-splits', 'legs-adduction': 'fit-r-side-splits', 'legs-cable-adduction': 'fit-r-side-splits',
  'fit-kickback': 'fit-r-kickback', 'fit-h-band-kickback': 'fit-r-kickback', 'fit-straight-leg': 'fit-r-kickback',
  'fit-lat': 'fit-r-pulling-straps', 'fit-lat-neutral': 'fit-r-pulling-straps', 'fit-straight-arm': 'fit-r-pulling-straps', 'fit-h-band-pulldown': 'fit-r-pulling-straps',
  'pull-lat-wide': 'fit-r-pulling-straps', 'pull-assisted-pullup': 'fit-r-pulling-straps', 'pull-lat-neutral': 'fit-r-pulling-straps',
  'fit-cable-row': 'fit-r-row', 'fit-lat-narrow': 'fit-r-row', 'fit-h-band-row': 'fit-r-row', 'pull-seated-cable-row': 'fit-r-row', 'pull-chest-row': 'fit-r-row', 'pull-bb-row': 'fit-r-row',
  'fit-rev-fly': 'fit-r-rear-delt', 'fit-h-band-pullapart': 'fit-r-rear-delt', 'pull-face-pull': 'fit-r-rear-delt', 'pull-rev-fly-machine': 'fit-r-rear-delt', 'pull-rev-fly-cable': 'fit-r-rear-delt',
};

/**
 * Când lipsește echipamentul variantei de acasă (ex. nu are bandă sau gantere): următoarele variante, în ordine; se
 * alege prima pe care o poate face. Reformerul apare aici ca rezervă și pentru exercițiile pe care nu le preia direct.
 */
const HOME_FALLBACK: Record<string, string[]> = {
  'fit-h-band-curl': ['fit-r-ham-curl', 'fit-sl-rdl', 'fit-rdl', 'fit-glute-bridge-1'],
  'fit-h-band-kickback': ['fit-r-kickback', 'fit-glute-bridge-1', 'fit-frog-pumps'],
  'fit-h-band-abduction': ['fit-r-side-abduction', 'fit-side-abduction'],
  'fit-lateral-walk': ['fit-r-side-abduction', 'fit-side-abduction'],
  'fit-glute-bridge': ['fit-glute-bridge-1'],
  'fit-h-band-pulldown': ['fit-r-pulling-straps', 'fit-h-db-row', 'fit-towel-row'],
  'fit-h-band-row': ['fit-r-row', 'fit-h-db-row', 'fit-towel-row'],
  'fit-h-band-pullapart': ['fit-r-rear-delt', 'fit-bent-fly', 'fit-prone-ytw'],
  'fit-h-band-pallof': ['fit-dead-bug'],
  'fit-h-glute-bridge': ['fit-r-bridge', 'fit-glute-bridge-1'],
  'fit-h-goblet': ['fit-r-footwork', 'fit-bw-squat', 'pt-sit-stand'],
  'fit-h-split-squat': ['fit-r-single-leg', 'fit-bw-split-squat', 'fit-iso-squat'],
  'fit-h-bulgarian': ['fit-r-single-leg', 'fit-bw-split-squat', 'fit-iso-squat'],
  'fit-h-floor-press': ['fit-h-pushup-incline'],
  'fit-h-db-fly': ['fit-h-pushup-incline'],
  'fit-h-db-row': ['fit-r-row', 'fit-towel-row'],
  'fit-h-db-ohp': ['fit-pike-pushup'],
  'fit-h-db-triceps': ['fit-bench-dip'],
  'fit-h-seated-calf': ['fit-calf'],
  'fit-rdl': ['fit-r-ham-curl', 'fit-glute-bridge-1', 'fit-frog-pumps'],
  'fit-sl-rdl': ['fit-r-ham-curl', 'fit-glute-bridge-1'],
  'fit-sumo-squat': ['fit-r-side-splits', 'fit-bw-squat', 'fit-iso-squat'],
  'fit-sumo-deadlift': ['fit-r-bridge', 'fit-glute-bridge-1'],
  'fit-walking-lunge': ['fit-r-single-leg', 'fit-bw-lunge', 'fit-iso-squat'],
  'fit-lunge-walk': ['fit-r-single-leg', 'fit-bw-lunge', 'fit-iso-squat'],
  'fit-reverse-lunge': ['fit-r-single-leg', 'fit-bw-lunge', 'fit-iso-squat'],
  'fit-lateral-lunge': ['fit-r-side-splits', 'fit-bw-lunge', 'fit-iso-squat'],
  'fit-step-up': ['fit-r-single-leg', 'fit-bw-step-up', 'pt-sit-stand'],
  'fit-heel-squat': ['fit-r-footwork', 'fit-bw-squat', 'fit-iso-squat'],
  'fit-pulse-squat': ['fit-r-footwork', 'fit-bw-squat', 'fit-iso-squat'],
  'fit-squat-rdl': ['fit-r-footwork', 'fit-bw-squat', 'fit-iso-squat'],
  'fit-biceps': ['fit-r-biceps', 'fit-towel-curl'], 'fit-hammer': ['fit-r-biceps', 'fit-towel-curl'], 'fit-curl-alt': ['fit-r-biceps', 'fit-towel-curl'], 'fit-curl-rot': ['fit-r-biceps', 'fit-towel-curl'],
  'fit-bent-fly': ['fit-r-rear-delt', 'fit-prone-ytw'],
  'fit-lateral': ['fit-prone-ytw'],
  'fit-front-raise': ['fit-pike-pushup'],
  'fit-triceps-kickback': ['fit-bench-dip'], 'fit-triceps-floor': ['fit-bench-dip'],
};

/**
 * Exercițiul executabil la locul dat; null dacă nu există variantă (nu se activează un exercițiu imposibil).
 * Acasă (regula 49), cu echipamentul declarat: reformerul preia exercițiile din REFORMER_SWAP; altfel echivalentul de
 * acasă dacă ai ce-i trebuie; altfel prima rezervă executabilă (fără bandă: pod pe un picior, abducție culcat etc.).
 */
export function forPlace(id: string, place: 'sala' | 'acasa' | undefined, gear?: readonly HomeGear[] | null): string | null {
  if (place !== 'acasa') return id;
  const have = homeEquip(gear);
  const ok = (x: string | undefined): x is string => !!x && !!CATALOG[x]?.equip && CATALOG[x]!.equip!.every((e) => have.includes(e));
  const h = HOME_SWAP[id] ?? id;
  const chain = [...(have.includes('reformer') ? [REFORMER_SWAP[id], REFORMER_SWAP[h]] : []), h, ...(HOME_FALLBACK[h] ?? [])];
  return chain.find(ok) ?? null;
}

/** Nota de acasă: ce echipament se folosește (cel declarat sau, fără declarație, varianta de până acum). */
export function homeNote(gear?: readonly HomeGear[] | null): string {
  if (!gear) return 'acasă: gantere, bandă și greutatea corpului (un scaun stabil ajută)';
  const g = gear.map((x) => HOME_GEAR_LABEL[x]);
  return `${g.length ? `acasă, cu ce ai declarat: ${g.join(', ')} și greutatea corpului` : 'acasă, doar cu greutatea corpului'} (un scaun stabil ajută)${gear.includes('reformer') ? '; la reformer arcurile sunt greutatea — le alegi așa încât ultimele 2–3 repetări să fie grele, iar când ies ușor treci la un arc mai greu' : ''}`;
}

function fit(id: FitnessSessionId, name: string, focus: string, dose: Record<string, number>): StrengthSession {
  return { id, name, focus, exercises: Object.keys(dose), completions: [], dose: Object.fromEntries(Object.entries(dose).map(([k, n]) => [k, { sets: n }])) };
}

export const FITNESS_ROTATION: Record<2 | 3 | 4, FitnessSessionId[]> = { 2: ['l1', 'u1'], 3: ['l1', 'u1', 'l2'], 4: ['l1', 'u1', 'l2', 'u2'] };
/** Ședințele vechi → cele noi (aceeași zi, fără picioare + partea de sus împreună). */
export const LEGACY_FIT: Partial<Record<FitnessSessionId, FitnessSessionId>> = { f1: 'l1', f2: 'u1', a3: 'l1', b3: 'u1', c3: 'l2' };
const FIT_LOWER: FitnessSessionId[] = ['l1', 'l2', 'l3'];
const FIT_UPPER: FitnessSessionId[] = ['u1', 'u2'];
/**
 * Tiparul săptămânii, după frecvență (auditul v93, A50; decizia proprietarului, 20.10.2026): 1 zi = tot corpul;
 * 2 zile = picioare, sus; 3 = picioare, sus, picioare; 4 = picioare, sus, picioare, sus.
 */
export const FIT_PATTERN: Record<number, ('L' | 'U' | 'F')[]> = { 1: ['F'], 2: ['L', 'U'], 3: ['L', 'U', 'L'], 4: ['L', 'U', 'L', 'U'] };
/**
 * Rotația de fitness pe tot programul (nu doar în săptămână): zilele de picioare trec prin A → B → C, cele de sus prin
 * spate+biceps → piept+umeri+triceps, ca toate ședințele să apară și să nu se repete aceeași zi de la o săptămână la alta.
 */
export class FitnessRotator {
  private l = 0;
  private u = 0;
  private v: Record<string, number> = {};
  next(kind: 'L' | 'U' | 'F'): { session: FitnessSessionId; variant?: number } {
    if (kind === 'F') return { session: 'ft' };
    const session = kind === 'L' ? FIT_LOWER[this.l++ % FIT_LOWER.length]! : FIT_UPPER[this.u++ % FIT_UPPER.length]!;
    if (!SESSIONS[session].variants) return { session };
    const variant = (this.v[session] ?? 0) % SESSIONS[session].variants!.length;
    this.v[session] = variant + 1;
    return { session, variant };
  }
  week(days: number): { session: FitnessSessionId; variant?: number }[] {
    return (FIT_PATTERN[days] ?? FIT_PATTERN[2]!).map((k) => this.next(k));
  }
}
export const FITNESS_ROTATION_WIDE: FitnessSessionId[] = ['fa', 'fb', 'fc', 'fd'];

/** L = picioare (și trunchi), U = partea de sus (și trunchi), F = tot corpul. */
export type SessionKind = 'L' | 'U' | 'F';
/**
 * Clasificarea ședinței (auditul v93, A104) din metadatele exercițiilor — regiunea fiecăruia, pe toate pozițiile și
 * variantele — după maparea numelor vechi (LEGACY_FIT), nu dintr-o listă de nume. Abdomenul și transportul nu schimbă
 * clasa. O ședință nouă se clasifică singură; încălzirea, cardio-ul de final și rotația citesc aceeași clasă.
 */
export function sessionKind(id: SessionId): SessionKind {
  const s = SESSIONS[LEGACY_FIT[id as FitnessSessionId] ?? id];
  if (s.fullBody) return 'F';
  const ids = [...s.exercises, ...(s.slots?.flat() ?? []), ...(s.variants?.flatMap((v) => v.exercises) ?? [])];
  const regions = new Set(ids.map((e) => CATALOG[e]?.region));
  return regions.has('legs') && regions.has('upper') ? 'F' : regions.has('legs') ? 'L' : 'U';
}
/** Grupul de rotație: ședințele care se pot înlocui una pe alta când se decalează rotația (aceeași structură). */
export function rotationGroup(id: SessionId): string {
  if (isMaintenanceSession(id)) return 'intretinere';
  if (id === 'full' || id === 'ft') return id;
  if (id === 'fullA' || id === 'fullB') return 'sus-jos';
  if (isSplitSession(id)) return 'ppl';
  if (isWideSession(id)) return 'fitness-ampla';
  if (isFitnessSession(id)) return 'fitness';
  return 'ppl-ab';
}
export const isFitnessSession = (id: SessionId): id is FitnessSessionId => ['f1', 'f2', 'a3', 'b3', 'c3', 'l1', 'l2', 'l3', 'u1', 'u2', 'fa', 'fb', 'fc', 'fd', 'ft'].includes(id);

export const PPL_ROTATION: SessionId[] = ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'];
export const FULL_ROTATION: SessionId[] = ['fullA', 'fullB'];
export const SPLIT_ROTATION: SplitSessionId[] = ['push', 'pull', 'legs'];
export const isLegsSession = (id: SessionId) => id === 'legsA' || id === 'legsB' || id === 'legs';
/** Ședințele care încarcă picioarele (genuflexiuni, presă, fandări, fesieri): contează la „zi tare, zi ușoară” pe picioare. */
export const LEG_LOAD_SESSIONS: ReadonlySet<SessionId> = new Set<SessionId>(['legs', 'legsA', 'legsB', 'full', 'fullA', 'l1', 'l2', 'l3', 'ft', 'f1', 'f2', 'a3', 'c3', 'fa', 'fc']);
/**
 * Cât încarcă picioarele o ședință de sală, din textul din plan: 'greu' (ziua de picioare obișnuită), 'usor' (picioare
 * ușoare, greutăți mai mici — mitigarea lângă o ședință-cheie), null (partea de sus, întreținere, fără picioare).
 */
export function legLoadOf(structure: string | null | undefined): 'greu' | 'usor' | null {
  const spec = parseStrength(structure);
  if (!spec) return null;
  if (!LEG_LOAD_SESSIONS.has(spec.session) || spec.legs === 'fara') return null;
  return spec.legs === 'usor' || spec.reduced ? 'usor' : 'greu';
}

export interface SplitState {
  i: number;
  deferred: boolean;
  /** Câte ședințe au trecut de când picioarele au fost amânate. */
  waits?: number;
  counts: Record<SplitSessionId, number>;
}
export const newSplitState = (): SplitState => ({ i: 0, deferred: false, waits: 0, counts: { push: 0, pull: 0, legs: 0 } });

/**
 * Următoarea ședință din rotația Push → Pull → Picioare. Picioarele nu cad în ajunul unei ședințe-cheie (trec la
 * următoarea zi de sală) și deloc în ultimele 10 zile dinaintea cursei. Varianta = a câta ședință de acel tip e.
 * Amânarea nu poate deveni dispariție (auditul v93, A50): după o ședință în plus de așteptare, picioarele vin oricum,
 * ca ședință de picioare ușoară (`light`: greutăți mai mici), nu se mai amână.
 */
export function nextSplit(st: SplitState, legsBlocked: boolean, nearRace: boolean): { session: SplitSessionId; variant: number; light?: boolean } {
  if (st.deferred && !nearRace && (!legsBlocked || (st.waits ?? 0) >= 1)) {
    st.deferred = false;
    st.waits = 0;
    return { session: 'legs', variant: st.counts.legs++, ...(legsBlocked ? { light: true } : {}) };
  }
  if (st.deferred && !nearRace) st.waits = (st.waits ?? 0) + 1;
  let session = SPLIT_ROTATION[st.i++ % 3]!;
  if (session === 'legs' && (legsBlocked || nearRace)) {
    if (!nearRace && !st.deferred) {
      st.deferred = true;
      st.waits = 0;
    }
    session = SPLIT_ROTATION[st.i++ % 3]!;
  }
  return { session, variant: st.counts[session]++ };
}

/**
 * Structura forței după frecvența REALĂ a săptămânii (auditul v93, A50; decizia proprietarului, 20.10.2026), nu după
 * sex: 1 ședință = tot corpul (excepția „fullBody”); 2 = picioare / partea de sus (fiecare tipar o dată pe săptămână);
 * 3+ = Push / Pull / Picioare la bărbați (regula 20), structura antrenoarei / PPL A–B la celelalte.
 */
export type SplitFamily = 'full' | 'upper-lower' | 'ppl';
export const splitFamily = (perWeek: number): SplitFamily => (perWeek <= 1 ? 'full' : perWeek === 2 ? 'upper-lower' : 'ppl');

/**
 * Ordinea sus / jos într-o săptămână cu 2 ședințe: picioarele în ziua care nu e în ajunul unei ședințe-cheie; dacă
 * ambele sunt, picioarele rămân, dar ușoare (nu dispar).
 */
export function upperLowerWeek(beforeKey: boolean[]): { session: 'fullA' | 'fullB'; legs: LegsMode }[] {
  const legsAt = beforeKey[0] && !beforeKey[1] ? 1 : 0;
  return beforeKey.map((bk, i) => (i === legsAt ? { session: 'fullA' as const, legs: bk ? ('usor' as const) : ('normal' as const) } : { session: 'fullB' as const, legs: 'normal' as const }));
}

// ——— Blocurile ———

export type Block = 'acomodare' | 'baza' | 'forta' | 'hipertrofie' | 'integrare' | 'consolidare' | 'evaluare' | 'mentinere' | 'precursa' | 'construire' | 'progres' | 'tranzitie';

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
  construire: 'Construire',
  progres: 'Progres',
  tranzitie: 'Tranziție',
};

export const BLOCK_GOAL: Record<Block, string> = {
  acomodare: 'înveți exercițiile și găsești greutățile potrivite; ușor',
  baza: 'crești încet numărul de serii și greutatea',
  forta: 'la primul exercițiu, greutate mai mare și mai puține repetări (5–8)',
  hipertrofie: 'mai mult volum, de regulă 8–12 repetări, pentru masă musculară',
  integrare: 'păstrezi forța câștigată, cu volum potrivit antrenamentelor de anduranță',
  consolidare: 'păstrezi ce ai câștigat; mai puține serii, anduranța e pe primul loc',
  evaluare: 'vezi cât ai progresat față de data trecută, fără să forțezi',
  mentinere: 'puțin volum, nimic nou: doar păstrezi',
  precursa: 'jumătate din serii, nimic nou: cursa e aproape',
  construire: 'consolidezi frecvența; crești repetările sau sarcina, câte un exercițiu',
  progres: 'accent pe fesieri și picioare, cu echilibru pentru trunchi și partea superioară',
  tranzitie: 'reevaluezi obiectivul; păstrezi exercițiile principale și mișcarea zilnică',
};

/** La fitness, aceleași blocuri au alt sens decât la sportivii de anduranță. */
export const FITNESS_BLOCK_GOAL: Partial<Record<Block, string>> = {
  acomodare: 'înveți exercițiile, respirația și execuția; fără epuizare',
  consolidare: 'păstrezi performanța; cel mult o serie în plus la două exerciții, doar dacă e nevoie',
  mentinere: 'stabilizezi obiceiurile și capacitatea fizică, cu volum sustenabil',
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
    const len: Record<Block, number> = { acomodare: acc, baza: 0, forta: 0, hipertrofie: 0, integrare: 0, consolidare: 0, evaluare: 0, mentinere: 0, precursa: pre, construire: 0, progres: 0, tranzitie: 0 };
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
  /** Fitness: prima săptămână cu mai multe zile (2 → 3 sau 3 → 4): 3 serii pe exercițiu; totalul pe săptămână crește (A52). */
  transition?: boolean;
  /** Push / Pull / Picioare: a câta ședință de acest tip (de la 0); alege exercițiile. */
  variant?: number;
  /** Fitness: unde se antrenează (acasă = doar gantere, bandă, corp, scaun). */
  place?: 'sala' | 'acasa';
  /** Acasă: echipamentul declarat (regula 49); lipsă = gantere, bandă, corp, scaun (chestionarele vechi). */
  gear?: HomeGear[];
  /** Slăbire: ședința începe cu mers pe bandă înclinată (20 min în zilele de sus, 10 în cele de picioare + restul la final). */
  opener?: 'slabire';
  /**
   * Varianta scurtă (excepțiile de la regula 20, decizia proprietarului din 20.10.2026): restricție de siguranță sau
   * sugestie de recuperare, revenire după boală (febră), taper înainte de cursă, timpul declarat de sportiv sub 45 de
   * minute. Atunci: minimum 2 serii pe exercițiu și durata prescripției (ex. 25–30 min), nu „45 de minute fictive”.
   * Motivul se scrie în textul ședinței, ca refacerea sau deschiderea aplicației să nu restaureze seriile tăiate.
   */
  reduced?: { why: ReducedReason; minutes: number };
  /**
   * Sarcină sau primul an după naștere (intake.fitness.sarcina === 'da' sau intake.sarcina === 'da'; auditul v93, A105):
   * varianta prudentă, explicită — fără cardio înclinat de slăbire la început, fără exerciții culcat pe spate sau pe burtă
   * (AIRON nu știe săptămâna sarcinii, deci nu se presupune că e sub 16), efort la care vorbești ușor. Nu e o
   * prescripție medicală: recomandarea e coordonarea cu medicul sau moașa.
   */
  pregnancy?: boolean;
}

/** Motivele pentru care o ședință de forță poate coborî sub 45 de minute și 3 serii (decizia proprietarului, 20.10.2026). */
export type ReducedReason = 'siguranta' | 'boala' | 'taper' | 'timp';
export const REDUCED_LABEL: Record<ReducedReason, string> = {
  siguranta: 'recuperare / restricție de siguranță',
  boala: 'revenire după boală',
  taper: 'înainte de cursă',
  timp: 'timpul tău de azi',
};
/** În varianta scurtă: cel puțin 2 serii pe exercițiu (nu 3) și cel puțin 15 minute. */
export const MIN_REDUCED_SETS = 2;
const MIN_REDUCED_MINUTES = 15;
const REDUCED_WARMUP = { min: 5, text: '5 min de mișcare ușoară (mers vioi sau bicicletă staționară), rotiri de umeri și șolduri, apoi o serie ușoară la primul exercițiu (nu se numără)' };

/** Ce știe ecranul (sau pachetul) despre ziua ședinței: obiectivul și sporturile de anduranță din aceeași zi. */
export interface StrengthDayContext {
  goal?: string | null;
  sameDay?: string[];
}

export interface Rx {
  ex: Exercise;
  sets: number;
  reps: string;
  rir: string;
  /** Pauza dintre seturi, secunde. */
  rest: number;
  completion?: boolean;
  /** Se poate sări (abdomenul de la final); cade primul când e puțin timp. */
  optional?: boolean;
  note?: string;
  /** Superserie: exercițiile cu aceeași literă se fac unul după altul, pauza vine după tot grupul. */
  ss?: string;
}

export interface Prescription {
  spec: StrengthSpec;
  session: StrengthSession;
  items: Rx[];
  /** Durata estimată, minute (încălzire + seturi + pauze + finalul de cardio), rotunjită la 5; cel puțin 45. */
  minutes: number;
  /** Ce s-a tăiat ca să încapă în timp și de ce. */
  trimmed: string[];
  notes: string[];
  /** Încălzirea (10 min), scrisă concret. */
  warmup: { min: number; text: string };
  /** Cardio la final (sau completarea până la 45 de minute); null când ședința are deja durata ei. */
  finisher: { min: number; text: string } | null;
}

const REST: Record<Role, number> = { main: 150, accessory: 90, carry: 75, core: 60 };
/**
 * Seriile (regula proprietarului, 19.10.2026): la fiecare exercițiu 3 sau 4 serii de lucru, în orice bloc, program și
 * situație (descărcare, picioare ușoare, timp scurt). Mai ușor înseamnă greutate mai mică și mai multe repetări în
 * rezervă, nu mai puține serii; când timpul e scurt cade un exercițiu întreg, nu o serie sub 3.
 */
export const MIN_WORK_SETS = 3;
export const MAX_WORK_SETS = 4;
/** Cel mult 10 serii de lucru pe același mușchi într-o ședință (peste, doar oboseală — cerința proprietarului). */
export const MAX_SETS_PER_MUSCLE = 10;
/** Nicio ședință de forță sub 45 de minute, cu încălzirea inclusă (regula proprietarului, 19.10.2026). */
export const MIN_STRENGTH_MINUTES = 45;
const WARMUP_MIN = 10;
const DEFAULT_WARMUP = '10 min de mișcare ușoară (bicicletă staționară, eliptică sau mers rapid), rotiri de umeri și șolduri, apoi 1–2 serii ușoare la primul exercițiu (nu se numără)';
const DEFAULT_FINISHER = 'cardio ușor la final (bicicletă staționară sau mers înclinat), ritm la care poți vorbi';

const clampSets = (items: Rx[]) => {
  for (const r of items) r.sets = Math.min(MAX_WORK_SETS, Math.max(MIN_WORK_SETS, r.sets));
};
export const primaryMuscle = (r: Rx) => r.ex.group.split(/[,(]/)[0]!.trim();
/** Plafonul pe mușchi: întâi seriile a 4-a dispar (de la coadă), apoi, dacă tot trece de 10, exercițiul de la coadă. */
function capPerMuscle(items: Rx[], dropped: string[]): Rx[] {
  const total = (g: string) => items.filter((r) => primaryMuscle(r) === g).reduce((n, r) => n + r.sets, 0);
  for (const g of new Set(items.map(primaryMuscle))) {
    for (let i = items.length - 1; i >= 0 && total(g) > MAX_SETS_PER_MUSCLE; i--) if (primaryMuscle(items[i]!) === g && items[i]!.sets > MIN_WORK_SETS) items[i]!.sets -= 1;
    for (let i = items.length - 1; i >= 0 && total(g) > MAX_SETS_PER_MUSCLE; i--) if (primaryMuscle(items[i]!) === g) dropped.push(items.splice(i, 1)[0]!.ex.name.toLowerCase());
  }
  return items;
}

function rirFor(spec: StrengthSpec): string {
  if (isFitnessSession(spec.session)) return spec.block === 'acomodare' || spec.recovery ? '3–4' : '2–3';
  if (spec.block === 'acomodare') return spec.week <= 2 ? '3–4' : '3';
  if (spec.block === 'precursa') return '3–4';
  if (spec.block === 'mentinere') return '3';
  if (spec.recovery) return '3';
  if (spec.block === 'baza' && spec.week === 1) return '3';
  return '2–3';
}

// ——— Durata unei serii (auditul v93, A52): din structura repetărilor, nu din media cifrelor ———
// Reperele (estimări de produs AIRON, nu măsurători): o repetare controlată ~3 s; o repetare cu menținere = 2 s de
// mișcare + secundele ținute; o repetare „rapidă” ~1,5 s; un pas ~1,5 s (la mersul fandat ~2,5 s); un puls ~1,2 s;
// „lent” ~5 s. Pe o parte („pe picior”, „/braț”, „pe fiecare parte”) seria se face de două ori, cu ~15 s la schimbare.
const REP_SEC = 3;
const HOLD_MOVE_SEC = 2;
const FAST_SEC = 1.5;
const STEP_SEC = 1.5;
const LUNGE_STEP_SEC = 2.5;
const PULSE_SEC = 1.2;
const SLOW_SEC = 5;
const LIGHT_SEC = 2.5;
const mean = (a: number, b?: number) => (b == null || Number.isNaN(b) ? a : (a + b) / 2);
const num = (m: RegExpExecArray) => mean(Number(m[1]), m[2] ? Number(m[2]) : undefined);

/** Câte părți are seria: 2 la exercițiile pe o parte (dacă repetările nu sunt deja totalul pe ambele părți). */
export function setSides(r: { reps: string; ex: { unilateral?: boolean } }): 1 | 2 {
  const t = r.reps.toLowerCase();
  // „20 (10 pe fiecare picior)”, „10 pași stânga + 10 dreapta”, „o repetare = stânga + dreapta”: totalul e deja scris.
  if (/\(\s*\d+\s*(pe|\/)/.test(t) || /stânga\s*\+|o repetare = stânga/.test(t)) return 1;
  if (r.ex.unilateral || /pe fiecare (parte|picior|braț)|\/\s*(parte|picior|braț)|\bpe (picior|parte|braț)\b/.test(t)) return 2;
  return 1;
}

/**
 * Lucrul unei serii (s), pe o parte, pentru seria `i` (piramidele au repetări diferite pe serii). Exemple: „40, ții 3 s
 * la fiecare deschidere; la ultima ții 10 s” = 40 × (2 + 3) + 10 = 210 s (înainte: 53 s); „40: 30 cu 3 s ținut sus +
 * 10 rapide” = 30 × 5 + 10 × 1,5 = 165 s.
 */
export function setWorkSec(r: { reps: string }, i = 0): number {
  const t = (r.reps.split('—')[0] ?? r.reps).toLowerCase().trim();
  // Doar timp: „30–45 s”, „1 min ținut”, „20 s pe fiecare picior”.
  const time = /^(\d+)\s*(?:[–-]\s*(\d+))?\s*(s|sec|min)\b/.exec(t);
  if (time) return Math.round(num(time) * (time[3] === 'min' ? 60 : 1));
  // Distanță (transport): ~1 s pe metru.
  const dist = /^(\d+)\s*(?:[–-]\s*(\d+))?\s*m\b/.exec(t);
  if (dist) return Math.round(num(dist));
  // Piramidă: „20 / 15 / 12 / 8”, fiecare serie cu ținta ei.
  const pyr = /^(\d+(?:\s*\/\s*\d+){2,})/.exec(t);
  if (pyr) {
    const steps = pyr[1]!.split('/').map((x) => Number(x.trim()));
    return steps[Math.min(i, steps.length - 1)]! * REP_SEC;
  }
  // „la ultima (repetare) ții 10 s”: o singură menținere, la final.
  const lastHold = /la ultima(?: repetare)? ții (\d+)\s*s/.exec(t);
  const extra = lastHold ? Number(lastHold[1]) : 0;
  const body = t.replace(/la ultima(?: repetare)? ții \d+\s*s/, '');
  const times = /de (\d+) ori/.exec(body);
  const k = times ? Number(times[1]) : 1;
  // Pași: „10 pași stânga + 10 dreapta”, „4 pași stânga + 4 dreapta, de 5 ori”, „10 pași înainte + 10 înapoi”.
  if (/pași/.test(body)) {
    const steps = [...body.replace(/de \d+ ori/, '').matchAll(/(\d+)(?:\s*[–-]\s*(\d+))?/g)].map((m) => mean(Number(m[1]), m[2] ? Number(m[2]) : undefined));
    const per = /înainte|înapoi/.test(body) ? LUNGE_STEP_SEC : STEP_SEC;
    return Math.round(steps.reduce((a, b) => a + b, 0) * k * per + extra);
  }
  // Segmente: „30 cu 3 s ținut sus + 10 rapide”, „20 cu 3 s sus + 10 rapide”; altfel un singur segment.
  const segs = body.includes('+') ? body.replace(/^\d+\s*(pe picior)?\s*:/, '').split('+') : [body];
  let sec = 0;
  for (const seg of segs) {
    const n0 = /(\d+)(?:\s*[–-]\s*(\d+))?/.exec(seg);
    if (!n0) continue;
    const hold = /(?:cu|ții)\s*(\d+)\s*s\b|(\d+)\s*s\s*(?:ținut|sus)/.exec(seg);
    const h = hold ? Number(hold[1] ?? hold[2]) : 0;
    const per = h ? HOLD_MOVE_SEC + h : /rapid/.test(seg) ? FAST_SEC : /puls/.test(seg) ? PULSE_SEC : /lent/.test(seg) ? SLOW_SEC : /greutate mică/.test(seg) ? LIGHT_SEC : /o repetare = stânga/.test(seg) ? 2 * REP_SEC : REP_SEC;
    sec += num(n0) * per;
  }
  return Math.round(Math.max(10, sec) * k + extra);
}
const SIDE_SWITCH_SEC = 15;
/** În superserie, trecerea de la un exercițiu la următorul (~15 s); pauza întreagă vine după ultimul din grup. */
const SS_SWITCH_SEC = 15;
/** La fitness, schimbarea și reglarea aparatului și seriile de acomodare la fiecare exercițiu (~1,5 min). */
const FIT_SETUP_SEC = 90;

/** Durata (s) a unui exercițiu: fiecare serie = lucru (+ ambele părți la unilateral) + pauză (sau trecerea în superserie). */
function itemSec(r: Rx, lastInGroup: boolean): number {
  const sides = setSides(r);
  const rest = r.ss && !lastInGroup ? SS_SWITCH_SEC : r.rest;
  let sec = 0;
  for (let i = 0; i < r.sets; i++) sec += setWorkSec(r, i) * sides + (sides === 2 ? SIDE_SWITCH_SEC : 0) + rest;
  return sec;
}

/**
 * Seriile de lucru ale săptămânii (auditul v93, A52), cu convenția scrisă: mușchiul principal (primul din „group”)
 * primește 1 pe serie, ceilalți mușchi din „group” câte 0,5. E o convenție de numărare, nu o măsurătoare fiziologică.
 */
export function weekSetTotals(rxs: Pick<Prescription, 'items'>[]): { total: number; byMuscle: Record<string, number> } {
  const byMuscle: Record<string, number> = {};
  let total = 0;
  for (const p of rxs)
    for (const r of p.items) {
      total += r.sets;
      r.ex.group
        .split(',')
        .map((g) => g.replace(/\(.*$/, '').trim())
        .filter(Boolean)
        .forEach((g, k) => (byMuscle[g] = (byMuscle[g] ?? 0) + r.sets * (k === 0 ? 1 : 0.5)));
    }
  return { total, byMuscle };
}

/** Minutele de exerciții + încălzire (fără cardio-ul de final). */
export function estimateMinutes(items: Rx[], warmMin = WARMUP_MIN): number {
  const setup = items.filter((r) => r.ex.id.startsWith('fit-')).length * FIT_SETUP_SEC;
  const sec = items.reduce((n, r, i) => n + itemSec(r, !r.ss || items[i + 1]?.ss !== r.ss), 0);
  return warmMin + (sec + setup) / 60;
}

// ——— Începutul ședinței: bandă sau bicicletă, după obiectiv (cererea proprietarului, 19.10.2026) ———
//
// Ce spun studiile (raportat în CLAUDE.md, regula 25):
//  - ACSM: 5–10 minute de încălzire ușoară-moderată înainte de efort.
//  - Efortul aerob făcut imediat înaintea forței scade forța picioarelor (meta-analiza Sports Med 2022, 15 studii:
//    efect moderat; și sub 30 de minute; mai mare după bicicletă decât după alergare).
//  - Ordinea forță → aerob dă forță dinamică mai bună la picioare (+6,9%) și NU schimbă grăsimea corporală
//    (meta-analiza Eddens 2018). Deci cardio-ul lung la început nu aduce slăbire în plus, doar costă forță la picioare.
// De aici: la slăbire, 20 min de mers înclinat la început doar în zilele de sus (picioarele nu se antrenează atunci);
// în zilele de picioare 10 min la început și restul la final. La sportivii de anduranță, 5 min ușor, ca pornire, pe un
// aparat diferit de sportul zilei (fără alergare/bicicletă în plus), niciodată 30 de minute.

const ENDURANCE_GOALS = new Set(['70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton', '5k', '10k', 'inot-1500', 'inot-1900', 'inot-3800', 'bike-50', 'bike-100', 'bike-160', 'mers']);
const isEnduranceGoal = (g: string | null | undefined) => !!g && ENDURANCE_GOALS.has(g);
const RUN_GOALS_SET = new Set(['semimaraton', 'maraton', '5k', '10k']);
const BIKE_GOALS_SET = new Set(['bike-50', 'bike-100', 'bike-160']);
/** Ziua de picioare (pentru cât cardio încape la început). */
/**
 * Ziua de picioare (auditul v93, A104): din clasificarea ședinței (sessionKind, citită din regiunea exercițiilor, după
 * maparea numelor vechi), nu dintr-o listă paralelă de nume. Tot corpul se numără zi de picioare (10 min la început,
 * restul de cardio la final).
 */
const legsDay = (id: SessionId) => sessionKind(id) !== 'U';
/** Slăbire: cardio-ul de la final în zilele de picioare, când ședința nu are finalul ei (ex. varianta amplă A–D). */
const SLABIRE_FINISHER = { text: 'mers pe bandă înclinată, ritm la care poți vorbi (restul de cardio, după greutăți)', min: 10, max: 20 };
/** Cardio-ul de la final: în zilele de sus la slăbire nu există (s-a făcut la început); în rest, al ședinței. */
function finisherOf(spec: StrengthSpec, session: StrengthSession): StrengthSession['finisher'] {
  if (spec.pregnancy) return session.finisher ? { text: 'mers ușor pe teren plat sau bicicletă staționară, ritm la care vorbești ușor', min: session.finisher.min, max: session.finisher.max } : undefined;
  if (spec.opener === 'slabire') return legsDay(spec.session) ? (session.finisher ?? SLABIRE_FINISHER) : undefined;
  return session.finisher;
}
export const OPENER_INCLINE = 'mers pe bandă înclinată: pornești de la 5% înclinație și 5 km/h; respiri mai des, dar poți vorbi (ajustezi viteza, nu forțezi)';
const MOBILITY = 'rotiri de umeri și șolduri, fandări și genuflexiuni fără greutate, apoi 1–2 serii ușoare la primul exercițiu (nu se numără)';

/** Aparatul pentru pornire, fără să dubleze sportul de anduranță al zilei. */
export function warmupMachine(goal: string | null | undefined, sameDay: string[] = [], place?: 'sala' | 'acasa'): string {
  if (place === 'acasa') return 'mers vioi pe loc sau urcat ușor pe scări';
  const run = sameDay.includes('alergare');
  const bike = sameDay.includes('bicicleta');
  if (run && bike) return 'eliptică sau aparat de vâslit';
  if (run) return 'bicicletă staționară';
  if (bike) return 'bandă, mers vioi (fără alergare)';
  if (goal && RUN_GOALS_SET.has(goal)) return 'bicicletă staționară';
  if (goal && BIKE_GOALS_SET.has(goal)) return 'bandă, mers vioi';
  if (goal === 'mers') return 'bandă, mers vioi';
  return 'bicicletă staționară sau bandă (mers vioi)';
}

/** Minutele de cardio la început (inclusă în încălzire). */
function openerMin(spec: StrengthSpec, ctx?: StrengthDayContext): number {
  if (spec.opener === 'slabire') return legsDay(spec.session) ? 10 : 20;
  return isEnduranceGoal(ctx?.goal) ? 5 : 0;
}

/** Încălzirea completă: cardio la început (după obiectiv) + mobilitate; minutele intră în durata ședinței. */
function warmupOf(spec: StrengthSpec, session: StrengthSession, ctx?: StrengthDayContext): { min: number; text: string } {
  // Modulul de întreținere (fizioterapeut) și varianta scurtă: pornire scurtă, fără cardio lung la început.
  if (session.maintenance) return { min: 2, text: '2 min de mișcare ușoară pe loc (mers, rotiri de umeri și glezne)' };
  if (spec.reduced) return REDUCED_WARMUP;
  // Partea de după cardio din încălzirea ședinței (activare, serii ușoare); cardio-ul îl dă obiectivul.
  const tail = session.warmup && /^\d+ min [^,]*,/.test(session.warmup) ? session.warmup.replace(/^\d+ min [^,]*,\s*(apoi\s*)?/, '') : MOBILITY;
  // Sarcină / postpartum: pornire pe teren plat, fără înclinație și fără gâfâit (A105).
  if (spec.pregnancy) return { min: WARMUP_MIN, text: `10 min mers vioi pe teren plat sau bicicletă staționară, ritm la care vorbești ușor (fără înclinație); apoi ${tail}` };
  if (spec.opener === 'slabire') {
    const n = openerMin(spec, ctx);
    const where = spec.place === 'acasa' ? 'mers vioi în pantă sau pe scări (acasă nu ai bandă), ritm la care poți vorbi' : OPENER_INCLINE;
    return { min: n + 5, text: `${n} min ${where}${legsDay(spec.session) ? '; restul de cardio la final, ca picioarele să fie proaspete la greutăți' : ''}; apoi 5 min: ${tail}` };
  }
  if (isEnduranceGoal(ctx?.goal)) {
    return { min: WARMUP_MIN, text: `5 min ${warmupMachine(ctx?.goal, ctx?.sameDay, spec.place)}, ușor, doar ca să pornească corpul (nu e antrenament de anduranță); apoi 5 min: ${tail}` };
  }
  return { min: WARMUP_MIN, text: session.warmup ?? DEFAULT_WARMUP };
}

/** Seriile de bază pe rol și bloc, înainte de plafon: principalele 4 în blocurile de construire, restul 3. */
function baseSets(r: Rx, spec: StrengthSpec): number {
  const light = spec.block === 'acomodare' || spec.block === 'mentinere' || spec.block === 'precursa' || spec.block === 'consolidare' || spec.block === 'evaluare' || spec.recovery;
  return r.ex.role === 'main' && !light ? 4 : 3;
}

/** Prescripția întreagă pentru blocul și săptămâna date, fără limită de timp. */
export function prescribeFull(spec0: StrengthSpec, ctx?: StrengthDayContext): Prescription {
  // Sarcină / postpartum: fără cardio înclinat de slăbire la început, chiar dacă obiectivul salvat e slăbirea (A105).
  const spec: StrengthSpec = spec0.pregnancy && spec0.opener ? (({ opener: _o, ...rest }) => rest)(spec0) : spec0;
  if (isMaintenanceSession(spec.session)) return prescribeMaintenance(spec, ctx);
  return reduce(pregnancySafe(isFitnessSession(spec.session) ? prescribeFitness(spec, ctx) : prescribeGym(spec, ctx), ctx));
}

/**
 * Sarcină / postpartum (A105): exercițiile culcat pe spate sau pe burtă ies din ședință (varianta prudentă, fără să se
 * presupună săptămâna sarcinii), iar ședința spune explicit regulile de oprire.
 */
function pregnancySafe(p: Prescription, ctx?: StrengthDayContext): Prescription {
  if (!p.spec.pregnancy) return p;
  const out = p.items.filter((r) => !r.ex.lying);
  const gone = p.items.filter((r) => r.ex.lying).map((r) => r.ex.name.toLowerCase());
  const notes = [...p.notes, `sarcină sau primul an după naștere: varianta prudentă — fără cardio înclinat la început, fără exerciții culcat pe spate sau pe burtă${gone.length ? ` (scoase azi: ${gone.join(', ')})` : ''}; greutăți cu care vorbești ușor, fără să-ți ții respirația; te oprești la durere, sângerare, amețeală sau presiune în bazin și întrebi medicul sau moașa`];
  for (const r of out) if (r.ss && out.filter((x) => x.ss === r.ss).length < 2) delete r.ss;
  return finish(p.spec, p.session, out, p.trimmed, notes, Infinity, ctx);
}

/** Ședințele de anduranță și Push / Pull / Picioare (catalogul de sală). */
function prescribeGym(spec: StrengthSpec, ctx?: StrengthDayContext): Prescription {
  const session = SESSIONS[spec.session];
  const rir = rirFor(spec);
  const notes: string[] = [];
  const all = sessionExercises(session, spec.variant ?? 0);
  // Acasă (regula 22, și la bărbați): fiecare exercițiu de sală trece la echivalentul de acasă, cu doza lui; fără
  // echivalent nu se activează; două exerciții cu același echivalent rămân unul.
  const missingHome: string[] = [];
  const ids: string[] = [];
  for (const id of all) {
    const placed = forPlace(id, spec.place, spec.gear);
    if (!placed) missingHome.push(CATALOG[id]!.name.toLowerCase());
    else if (!ids.includes(placed)) ids.push(placed);
  }
  if (spec.place === 'acasa') notes.push(`${homeNote(spec.gear)}; exercițiile de sală sunt înlocuite cu echivalentele lor, cu repetările lor${missingHome.length ? `; fără variantă acasă: ${missingHome.join(', ')} — nu e inclus` : ''}`);
  let items: Rx[] = ids.map((id, k) => {
    const ex = CATALOG[id]!;
    return { ex, sets: ex.sets, reps: ex.reps, rir, rest: REST[ex.role], ...(session.slots && k === ids.length - 1 && ex.region === 'core' ? { optional: true, note: 'opțional' } : {}) };
  });
  for (const r of items) r.sets = baseSets(r, spec);

  // Pliometria (Llanos-Lagos și colab. 2024): doar în ziua de picioare a sportivilor de anduranță, din blocurile de
  // forță / integrare / consolidare, imediat după încălzire; nu cu picioarele protejate.
  // Auditul v93, A55: condiția e scrisă — fără sarcină/postpartum, fără durere de tendon sau gambă; altfel se sare.
  if (spec.session === 'fullA' && (spec.block === 'forta' || spec.block === 'integrare' || spec.block === 'consolidare') && (spec.legs ?? 'normal') === 'normal' && !(spec as { pregnancy?: boolean }).pregnancy) {
    const pg = CATALOG['legs-pogo']!;
    items.unshift({ ex: pg, sets: 3, reps: pg.reps, rir, rest: 60, note: 'înaintea greutăților, cât ești proaspăt; doar fără durere la tendonul lui Ahile, gambă sau genunchi — dacă ai, sari peste' });
  }
  if (spec.block === 'forta' && items[0]?.ex.role === 'main' && !items[0].ex.unilateral) {
    items[0].reps = '5–8';
    notes.push('la primul exercițiu: greutate mai mare, 5–8 repetări, doar dacă execuția rămâne curată; altfel rămâi la repetările obișnuite');
  }
  if (spec.block === 'acomodare') notes.push('fără istoric de greutăți: prima dată alegi greutatea din mers — una cu care faci repetările cerute și simți că mai puteai câteva');
  if (spec.block === 'evaluare') notes.push('compari cu data trecută: la aceeași greutate, câte repetări îți ies acum');
  if (spec.block === 'precursa') notes.push('aproape de cursă: aceleași 3 serii, cu greutăți cu ~20% mai mici; pleci de la sală proaspăt');
  if (spec.recovery) notes.push('săptămână mai ușoară: aceleași 3 serii pe exercițiu, cu greutăți cu ~10–15% mai mici și 3 repetări în rezervă');

  // Picioarele: ușoare înaintea unei ședințe-cheie (greutăți mai mici, nu mai puține serii), deloc lângă cursă.
  if (spec.legs === 'fara') {
    items = items.filter((r) => r.ex.region !== 'legs');
    notes.push('fără picioare: e aproape cursa');
  } else if (spec.legs === 'usor') {
    for (const r of items) if (r.ex.region === 'legs') r.rir = '4';
    notes.push('picioare ușoare: mâine ai un antrenament important — aceleași 3 serii, cu greutăți mai mici (4 repetări în rezervă)');
  }

  if (session.slots) {
    notes.push('exercițiile se schimbă de la o ședință la alta; un exercițiu revine cam la a treia ședință de același tip, iar atunci pornești de la greutatea notată data trecută');
    if (spec.block !== 'acomodare' && spec.block !== 'mentinere' && spec.block !== 'precursa') notes.push('cum crești: când faci numărul maxim de repetări la toate seriile, pui greutatea imediat următoare data viitoare când revine exercițiul');
  }
  clampSets(items);
  const dropped: string[] = [];
  items = capPerMuscle(items, dropped);
  return reduce(finish(spec, session, items, [], notes, Infinity, ctx));
}

/**
 * Varianta scurtă (spec.reduced, decizia proprietarului 20.10.2026): seriile coboară până la 2 (la siguranță și boală
 * pornesc de la 2, la taper și timp de la cel mult 3), rezerva crește la siguranță/boală, iar motivul se scrie în
 * ședință. Durata o dă `prescribe` din minutele variantei, nu minimul de 45.
 */
function reduce(p: Prescription): Prescription {
  const r = p.spec.reduced;
  if (!r) return p;
  const gentle = r.why === 'siguranta' || r.why === 'boala';
  for (const it of p.items) {
    it.sets = gentle ? MIN_REDUCED_SETS : Math.min(it.sets, MIN_WORK_SETS);
    if (gentle) it.rir = '3–4';
  }
  for (const it of p.items) fitScheme(it);
  p.notes.push(`variantă scurtă (${REDUCED_LABEL[r.why]}): cel mult ${r.minutes} min, ${gentle ? '2 serii' : '2–3 serii'} pe exercițiu${gentle ? ', greutăți mai mici' : ''}; e excepția de la minimul de 45 de minute și 3 serii`);
  return finish(p.spec, p.session, p.items, p.trimmed, p.notes, Infinity);
}

/** Modulul de întreținere al fizioterapeutului: doza din modul (1–2 serii, rezervă 3–4), fără plafonul de 45 de minute. */
function prescribeMaintenance(spec: StrengthSpec, ctx?: StrengthDayContext): Prescription {
  const session = SESSIONS[spec.session];
  const items: Rx[] = session.exercises.map((id) => {
    const ex = CATALOG[id]!;
    const d = session.dose?.[id];
    return { ex, sets: d?.sets ?? ex.sets, reps: d?.reps ?? ex.reps, rir: '3–4', rest: d?.rest ?? ex.rest ?? REST[ex.role] };
  });
  const notes = ['modul de întreținere (fizioterapeut): înlocuiește exerciții mici din sală, nu se adaugă peste; crește un singur element după două ședințe fără durere (ex. +2 repetări)', 'nu e tratament: la durere nouă sau care crește te oprești și spui în formularul de seară'];
  return finish(spec, session, items, [], notes, Infinity, ctx);
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;
const FINISHER_SHORT = 5;

/** Încălzirea și finalul: ședința are cel puțin 45 de minute cu tot cu încălzirea; finalul de cardio completează. */
/** Piramida scrisă pe serii („20 / 15 / 12 / 8”) are atâtea trepte câte serii rămân (după plafon sau tăieri). */
function fitScheme(r: Rx): void {
  const m = /^(\s*\d+(?:\s*\/\s*\d+){2,})(.*)$/.exec(r.reps);
  if (!m) return;
  const steps = m[1]!.split('/').map((x) => x.trim());
  if (steps.length > r.sets) r.reps = steps.slice(0, r.sets).join(' / ') + m[2];
}

function finish(spec: StrengthSpec, session: StrengthSession, items: Rx[], trimmed: string[], notes: string[], limit = Infinity, ctx?: StrengthDayContext): Prescription {
  for (const r of items) fitScheme(r);
  const warm = warmupOf(spec, session, ctx);
  const work = Math.ceil(estimateMinutes(items, warm.min));
  // Excepțiile (varianta scurtă, modulul de întreținere): durata e a conținutului, fără completare până la 45 de minute.
  if (spec.reduced || session.maintenance) return { spec, session, items, minutes: roundUp5(work), trimmed, notes, warmup: warm, finisher: null };
  // Slăbire, zi de sus: cardio-ul s-a făcut la început; la final rămâne doar ce trebuie până la 45 de minute.
  const fin = finisherOf(spec, session);
  let finMin = 0;
  if (fin) {
    // Cu timp scurt, finalul de cardio scade până la 5 minute: întâi exercițiile.
    const floor = trimmed.length || work + fin.min > limit ? FINISHER_SHORT : fin.min;
    finMin = Math.min(fin.max, Math.max(floor, MIN_STRENGTH_MINUTES - work));
  } else if (MIN_STRENGTH_MINUTES - work >= 5) finMin = MIN_STRENGTH_MINUTES - work;
  const minutes = Math.max(MIN_STRENGTH_MINUTES, roundUp5(work + finMin));
  // Rotunjirea în sus la 5 minute intră în finalul de cardio (când există), ca durata să fie suma părților; sub 5
  // minute de diferență fără cardio propriu, intră în pauze și încălzire.
  if (finMin) finMin = minutes - work;
  return {
    spec,
    session,
    items,
    minutes,
    trimmed,
    notes,
    warmup: warm,
    finisher: finMin ? { min: finMin, text: fin?.text ?? DEFAULT_FINISHER } : null,
  };
}

/**
 * Fitness: doza din tabelul ședinței (structura antrenoarei), ajustată pe etapă — mereu 3–4 serii pe exercițiu:
 *  - acomodare și revizuire: 3 serii, greutăți ușoare, 3–4 repetări în rezervă (înveți execuția);
 *  - construire, progres: doza din tabel (3–4 serii, piramide cu greutatea crescută);
 *  - consolidare (săpt. 13–16): varietate controlată, un exercițiu schimbat cu unul asemănător;
 *  - menținere: 3 serii, fără escaladare.
 */
function prescribeFitness(spec0: StrengthSpec, ctx?: StrengthDayContext): Prescription {
  const spec = { ...spec0, session: LEGACY_FIT[spec0.session as FitnessSessionId] ?? spec0.session };
  const session = SESSIONS[spec.session];
  const rir = rirFor(spec);
  const notes: string[] = [];
  const wide = isWideSession(spec.session);
  const vt = session.variants?.[(spec.variant ?? 0) % session.variants.length];
  const dose = vt?.dose ?? session.dose;
  let ids = [...(vt?.exercises ?? session.exercises)];
  let swapped: [string, string] | null = null;
  if (spec.block === 'consolidare') {
    const sw = FITNESS_SWAPS.find(([from, to]) => ids.includes(from) && !ids.includes(to));
    if (sw) {
      ids = ids.map((x) => (x === sw[0] ? sw[1] : x));
      swapped = sw;
    }
  }
  const missingHome: string[] = [];
  const seenHome = new Set<string>();
  let items: Rx[] = ids.flatMap((id) => {
    const placed = forPlace(id, spec.place, spec.gear);
    if (!placed) {
      missingHome.push(CATALOG[id]!.name.toLowerCase());
      return [];
    }
    // Acasă, două exerciții de sală pot avea același echivalent: rămâne o singură dată.
    // (Și o rezervă care e deja în ședință — ex. îndreptări pe un picior în loc de flexiile cu bandă — nu se repetă.)
    if (seenHome.has(placed)) return [];
    seenHome.add(placed);
    const ex = CATALOG[placed]!;
    const d = dose?.[swapped && id === swapped[1] ? swapped[0] : id];
    // Înlocuit acasă (auditul v93, A55/A60): repetările și pauza vin din exercițiul nou, nu se copiază „30” sau piramida
    // exercițiului de sală (ex. pod de fesieri pe un picior: 20 pe picior, nu 30 moștenite de la hiperextensii).
    if (placed !== id) return [{ ex, sets: d?.sets ?? ex.sets, reps: ex.reps, rir, rest: ex.rest ?? REST[ex.role], ...(d?.ss ? { ss: d.ss } : {}) }];
    return [{ ex, sets: d?.sets ?? ex.sets, reps: d?.reps ?? ex.reps, rir, rest: d?.rest ?? ex.rest ?? REST[ex.role], ...(d?.ss ? { ss: d.ss } : {}) }];
  });
  if (spec.place === 'acasa') notes.push(`${homeNote(spec.gear)}; exercițiile de sală sunt înlocuite cu echivalentele lor, cu repetările lor`);
  if (missingHome.length) notes.push(`fără variantă acasă pentru: ${missingHome.join(', ')} — nu e inclus`);
  if (swapped) notes.push(`varietate controlată: ${CATALOG[swapped[1]]!.name.toLowerCase()} în loc de ${CATALOG[swapped[0]]!.name.toLowerCase()}; cauți din nou greutatea (kilogramele nu se transferă de la un exercițiu la altul)`);
  const light = spec.block === 'acomodare' || spec.block === 'mentinere' || spec.recovery || spec.transition;
  if (light) for (const r of items) r.sets = MIN_WORK_SETS;
  if (spec.block === 'acomodare') {
    notes.push(spec.week <= 2 ? 'învățare: 3 serii pe exercițiu, cu greutăți ușoare — te oprești când mai aveai 3–4 repetări; notează greutățile folosite' : 'consolidare: rămân 3 serii; progresezi în control și repetări');
    notes.push('fără istoric de greutăți: alegi greutatea cu care faci repetările fără să mergi până la limită');
  } else if (spec.transition) notes.push(wide ? 'prima săptămână cu patru ședințe A–D: 3 serii la toate; doza de construire vine după, dacă merge bine' : 'prima săptămână cu mai multe zile: 3 serii la toate exercițiile; ședința în plus adaugă serii pe săptămână, așa că restul crește abia după ce o ții');
  if (spec.block === 'mentinere') notes.push('menținere: 3 serii, păstrezi performanța, nu trebuie să crești');
  if (spec.recovery) {
    for (const r of items) r.rir = '3–4';
    notes.push('revizuire: oboseala sau performanța în scădere cer greutăți mai mici și oprit mai departe de limită, temporar (seriile rămân 3)');
  }
  if (items.some((r) => r.ss)) notes.push('superserie: exercițiile cu aceeași literă le faci unul după altul, fără pauză între ele; pauza (1–2 min) vine după ultimul din grup');
  if (items.some((r) => /crești greutatea/.test(r.reps))) notes.push('la seriile cu repetări din ce în ce mai puține (20 / 15 / 12 / 8) crești greutatea de la o serie la alta doar dacă seria de dinainte a ieșit curat și mai aveai cel puțin o repetare; altfel păstrezi greutatea (sau o scazi). Pauza 1–2 min, nu mai mult');
  if (spec.block !== 'acomodare' && spec.block !== 'mentinere') notes.push('cum crești: când faci numărul maxim de repetări la toate seriile, de două ori la rând, pui greutatea imediat următoare');
  clampSets(items);
  const dropped: string[] = [];
  items = capPerMuscle(items, dropped);
  return finish(spec, session, items, [], notes, Infinity, ctx);
}

/**
 * Ședința potrivită în timpul dat (cel puțin 45 de minute). Ordinea tăierilor când timpul e scurt: opționalele, seria a
 * 4-a a accesoriilor, apoi accesoriile întregi (izolările întâi, transportul, trunchiul), seria a 4-a a principalelor,
 * apoi a doua mișcare de același tip. Niciodată sub 3 serii pe exercițiu; pauzele nu se scurtează. Când timpul e mai
 * mult decât conținutul, nu se adaugă volum: finalul de cardio aduce ședința la cel puțin 45 de minute.
 */
export function prescribe(spec: StrengthSpec, minutes: number, ctx?: StrengthDayContext): Prescription {
  const p = prescribeFull(spec, ctx);
  // Modulul de întreținere are doza lui (12–20 min): nu se lungește și nu se taie după minutele din calendar.
  if (p.session.maintenance) return p;
  // Varianta scurtă: limita e cea a variantei (cel puțin 15 min), nu minimul de 45; altfel regula 20 rămâne exact cum e.
  const reduced = spec.reduced;
  const limit = reduced ? Math.max(MIN_REDUCED_MINUTES, Math.min(reduced.minutes, minutes)) : Math.max(MIN_STRENGTH_MINUTES, minutes);
  const minSets = reduced ? MIN_REDUCED_SETS : MIN_WORK_SETS;
  const items = p.items.map((r) => ({ ...r }));
  const trimmed: string[] = [];
  const minFinisher = !reduced && finisherOf(spec, p.session) ? FINISHER_SHORT : 0;
  const fits = () => (reduced ? roundUp5(estimateMinutes(items, p.warmup.min)) : Math.ceil(estimateMinutes(items, p.warmup.min)) + minFinisher) <= limit;
  const removeWhere = (pred: (r: Rx) => boolean, why: (r: Rx) => string) => {
    for (let i = items.length - 1; i >= 0 && !fits(); i--) {
      if (items.length > 1 && pred(items[i]!)) {
        trimmed.push(why(items[i]!));
        items.splice(i, 1);
      }
    }
  };
  removeWhere((r) => !!r.completion, (r) => `completarea ${r.ex.name.toLowerCase()}`);
  removeWhere((r) => !!r.optional, (r) => r.ex.name.toLowerCase());
  for (let i = items.length - 1; i >= 0 && !fits(); i--) {
    const r = items[i]!;
    if (r.ex.role !== 'main' && r.sets > MIN_WORK_SETS) {
      r.sets -= 1;
      trimmed.push(`seria a 4-a la ${r.ex.name.toLowerCase()}`);
    }
  }
  // Întâi exercițiile pentru un mușchi lucrat deja de alt exercițiu (ședința rămâne completă: la picioare rămân și
  // adductorii, abductorii, gambele), apoi seria a 4-a la principale, abia apoi exercițiile unice.
  const covered = (r: Rx) => items.filter((x) => x !== r && primaryMuscle(x) === primaryMuscle(r)).length > 0;
  removeWhere((r) => r.ex.role === 'accessory' && covered(r), (r) => r.ex.name.toLowerCase());
  for (let i = items.length - 1; i >= 0 && !fits(); i--) {
    const r = items[i]!;
    if (r.sets > MIN_WORK_SETS) {
      r.sets -= 1;
      trimmed.push(`seria a 4-a la ${r.ex.name.toLowerCase()}`);
    }
  }
  // Doar în varianta scurtă: seria a 3-a cade (întâi la exercițiile mici, apoi la principale), până la 2 pe exercițiu.
  for (const role of reduced ? (['accessory', 'carry', 'core', 'main'] as Role[]) : []) {
    for (let i = items.length - 1; i >= 0 && !fits(); i--) {
      const r = items[i]!;
      if (r.ex.role === role && r.sets > minSets) {
        r.sets -= 1;
        trimmed.push(`seria a 3-a la ${r.ex.name.toLowerCase()}`);
      }
    }
  }
  removeWhere((r) => r.ex.role === 'accessory', (r) => r.ex.name.toLowerCase());
  removeWhere((r) => r.ex.role === 'carry', (r) => r.ex.name.toLowerCase());
  removeWhere((r) => r.ex.role === 'core', (r) => r.ex.name.toLowerCase());
  const pattern = (r: Rx) => r.ex.id.split('-')[0];
  while (!fits() && items.length > 1) {
    let i = items.length - 1;
    for (let j = items.length - 1; j >= 0; j--) {
      if (items.filter((x) => pattern(x) === pattern(items[j]!)).length > 1) {
        i = j;
        break;
      }
    }
    trimmed.push(items.splice(i, 1)[0]!.ex.name.toLowerCase());
  }
  // O superserie rămasă cu un singur exercițiu nu mai e superserie.
  for (const r of items) if (r.ss && items.filter((x) => x.ss === r.ss).length < 2) delete r.ss;
  const notes = [...p.notes];
  if (trimmed.length) notes.push(`ca să încapă în ${limit} min, azi sari peste: ${trimmed.join(', ')} (pauzele rămân întregi, seriile rămân minimum ${minSets})`);
  return finish(spec, p.session, items, trimmed, notes, limit, ctx);
}


// ——— Textul din plan (citit de oameni și de cod) ———

const OPENER_TAG = 'cardio înclinat la început';
const GEAR_TAG = 'echipament';
/** „acasă (echipament: gantere, reformer)” → ['gantere', 'reformer']; fără paranteză = nedeclarat. */
function parseGear(text: string): HomeGear[] | undefined {
  const m = new RegExp(`acasă \\(${GEAR_TAG}: ([^)]*)\\)`).exec(text);
  if (!m) return undefined;
  return m[1]!.split(',').map((x) => x.trim()).filter((x): x is HomeGear => (HOME_GEAR as string[]).includes(x));
}
const PREGNANCY_TAG = 'sarcină / postpartum';
const LEGS_TEXT: Record<Exclude<LegsMode, 'normal'>, string> = { usor: 'picioare ușoare', fara: 'fără picioare' };

/** „Push A · Bază, săpt. 2/4 · 2–3 repetări în rezervă · descărcare”. */
export function strengthStructure(spec: StrengthSpec): string {
  const parts = [SESSIONS[spec.session].name, ...(isSplitSession(spec.session) || (SESSIONS[spec.session].variants && spec.variant != null) ? [`varianta ${(spec.variant ?? 0) + 1}`] : []), `${BLOCK_LABEL[spec.block]}, săpt. ${spec.week}/${spec.len}`, `${rirFor(spec)} repetări în rezervă`];
  if (spec.recovery) parts.push('descărcare');
  if (spec.transition) parts.push('trecere');
  if (spec.legs && spec.legs !== 'normal') parts.push(LEGS_TEXT[spec.legs]);
  if (spec.place === 'acasa') parts.push(spec.gear ? `acasă (${GEAR_TAG}: ${spec.gear.join(', ') || 'nimic'})` : 'acasă');
  if (spec.opener === 'slabire') parts.push(OPENER_TAG);
  if (spec.reduced) parts.push(`variantă scurtă ${spec.reduced.minutes} min (${REDUCED_LABEL[spec.reduced.why]})`);
  if (spec.pregnancy) parts.push(PREGNANCY_TAG);
  return parts.join(' · ');
}

export function parseStrength(structure: string | null | undefined): StrengthSpec | null {
  if (!structure) return null;
  const parts = structure.split(' · ');
  const session = (Object.values(SESSIONS).find((s) => s.name === parts[0] || (s.aliases ?? []).includes(parts[0] ?? '')) ?? null)?.id;
  if (!session) return null;
  let variant: number | undefined;
  const v = /^varianta (\d+)$/.exec(parts[1] ?? '');
  if (v) {
    variant = Number(v[1]) - 1;
    parts.splice(1, 1);
  }
  const m = /^(.+), săpt\. (\d+)\/(\d+)$/.exec(parts[1] ?? '');
  if (!m) return null;
  const block = (Object.entries(BLOCK_LABEL).find(([, l]) => l === m[1]) ?? [])[0] as Block | undefined;
  if (!block) return null;
  const rest = parts.slice(2);
  const legs: LegsMode = rest.includes(LEGS_TEXT.fara) ? 'fara' : rest.includes(LEGS_TEXT.usor) ? 'usor' : 'normal';
  const red = rest.map((x) => /^variantă scurtă (\d+) min \((.+)\)$/.exec(x)).find(Boolean);
  const home = rest.find((x) => x === 'acasă' || x.startsWith('acasă ('));
  const why = red ? ((Object.entries(REDUCED_LABEL).find(([, l]) => l === red[2]) ?? [])[0] as ReducedReason | undefined) : undefined;
  return { session, block, week: Number(m[2]), len: Number(m[3]), recovery: rest.includes('descărcare'), legs, ...(rest.includes('trecere') ? { transition: true } : {}), ...(variant != null ? { variant } : {}), ...(home ? { place: 'acasa' as const, ...(parseGear(home) ? { gear: parseGear(home)! } : {}) } : {}), ...(rest.includes(OPENER_TAG) ? { opener: 'slabire' as const } : {}), ...(red && why ? { reduced: { why, minutes: Number(red[1]) } } : {}), ...(rest.includes(PREGNANCY_TAG) ? { pregnancy: true } : {}) };
}

/** Numele ședinței din textul din plan (și pentru planurile vechi „Push 1 · …”). */
export function sessionName(structure: string | null | undefined): string | null {
  const s = parseStrength(structure);
  if (s) return SESSIONS[s.session].name;
  const first = (structure ?? '').split(' · ')[0] ?? '';
  return /^(Push|Pull|Picioare|Brațe|Legs|Tot corpul|[FABCLU][1-3] |[ABCD] (Picioare|Superior|Fesieri))/.test(first) ? first : null;
}

export const STRENGTH_RULES: { t: string; d: string }[] = [
  { t: 'Structura', d: 'După câte ședințe ai pe săptămână: una = tot corpul; două = o zi de picioare și una pentru partea de sus; trei sau mai multe = Push (piept, umeri, triceps), Pull (spate, biceps), Picioare, pe rând. În afară de ziua de tot corpul, picioarele nu se combină cu partea de sus.' },
  { t: 'Durata', d: 'Cel puțin 45 de minute cu tot cu încălzirea. Încălzire: 10 minute de mișcare ușoară, apoi 1–2 serii ușoare la primul exercițiu (nu se numără). Excepții: după febră, la recuperare slabă sau durere, înainte de cursă și când spui că ai mai puțin timp — atunci varianta scurtă, cu cel puțin 2 serii pe exercițiu.' },
  { t: 'Serii', d: '3 sau 4 serii de lucru la fiecare exercițiu, mereu. În săptămânile ușoare scade greutatea, nu numărul de serii. Cel mult 10 serii pe același mușchi într-o ședință.' },
  { t: 'Cât de greu', d: 'Te oprești din serie când mai aveai încă 2–3 repetări bune în tine (la început 3–4). Nu mergi până nu mai poți ridica deloc.' },
  { t: 'Pauze', d: 'Cam 2–3 minute la primele exerciții (cele grele) și 1–2 minute la restul. Dacă încă gâfâi, mai stai puțin.' },
  { t: 'Cum crești', d: 'Notezi greutatea și repetările. Data viitoare încerci o repetare în plus. Când faci numărul maxim de repetări la toate seriile, de două ori la rând, pui greutatea imediat următoare. „Am făcut cum scrie” confirmă ședința, dar pentru creștere scrii măcar o dată valorile reale.' },
  { t: 'Exerciții diferite', d: 'Push, Pull și Picioare au de fiecare dată alte exerciții sau alte aparate. Fiecare exercițiu revine cam la a treia ședință de același tip; kilogramele de la un aparat nu se transferă la altul.' },
  { t: 'Durere', d: 'Durere nouă sau ascuțită: oprești exercițiul și spui în formularul de seară. Durere în piept, amețeală sau lipsă de aer neobișnuită: te oprești și mergi la medic.' },
];
