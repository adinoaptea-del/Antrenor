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
export type Equip = 'aparat' | 'cablu' | 'bara' | 'banca' | 'gantere' | 'banda' | 'corp' | 'scaun';
export const HOME_EQUIP: Equip[] = ['gantere', 'banda', 'corp', 'scaun'];
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
  /** Fișa exercițiului (fitness): ce lucrează, cum reglezi aparatul, greșelile frecvente. */
  purpose?: string;
  setup?: string;
  mistakes?: string;
}

export type FitnessSessionId = 'f1' | 'f2' | 'a3' | 'b3' | 'c3' | 'l1' | 'l2' | 'l3' | 'u1' | 'u2' | 'fa' | 'fb' | 'fc' | 'fd';
/** Bărbații (anduranță): Push / Pull / Picioare cu exerciții care se schimbă de la o ședință la alta. */
export type SplitSessionId = 'push' | 'pull' | 'legs';
export type SessionId = 'pushA' | 'pullA' | 'legsA' | 'pushB' | 'pullB' | 'legsB' | 'fullA' | 'fullB' | SplitSessionId | FitnessSessionId;

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
    E({ id: 'fit-hip-thrust', equip: ['aparat', 'bara', 'banca'], name: 'Hip thrust la aparat sau cu bara', group: 'fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'sprijin stabil; extensie din șold, fără să arcuiești spatele', alt: 'glute bridge încărcat' }),
    E({ id: 'fit-leg-press', equip: ['aparat'], name: 'Presă pentru picioare', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'mișcare confortabilă, cu bazinul stabil; nu forța adâncimea', alt: 'genuflexiune goblet la bancă' }),
    E({ id: 'fit-reverse-lunge', equip: ['corp', 'gantere'], name: 'Fandare înapoi cu sprijin', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, rest: 90, cue: 'control, sprijin dacă e nevoie; sarcina nu compromite echilibrul', alt: 'step-up pe treaptă joasă' }),
    E({ id: 'fit-leg-ext', equip: ['aparat'], name: 'Extensii genunchi la aparat', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'mișcare controlată, fără durere articulară', alt: 'presă cu mișcare prea scurtă' }),
    E({ id: 'fit-calf', equip: ['corp', 'scaun'], name: 'Ridicări pe vârfuri', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'mișcare fără durere, fără balans', alt: 'ridicări pe vârfuri din șezut' }),
    E({ id: 'fit-calf-seated', equip: ['aparat'], name: 'Ridicări pe vârfuri din șezut', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'cât poți fără durere, ritm controlat', alt: 'ridicări pe vârfuri din picioare' }),
    E({ id: 'fit-dead-bug', equip: ['corp'], name: 'Dead bug simplificat', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '6–8/parte', unilateral: true, rest: 50, cue: 'respirație confortabilă; cât controlezi', alt: 'Pallof press' }),
    E({ id: 'fit-rdl', equip: ['gantere'], name: 'Îndreptări românești cu gantere', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–10', rest: 120, cue: 'șoldurile merg înapoi; cobori doar până unde controlezi trunchiul', alt: 'glute bridge, iar aplecarea din șold se învață separat' }),
    E({ id: 'fit-leg-curl', equip: ['aparat'], name: 'Flexii femurali la aparat', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'bazin stabil, fără impuls', alt: 'flexii femurali culcat' }),
    E({ id: 'fit-step-up', equip: ['scaun', 'gantere'], name: 'Step-up pe treaptă joasă', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, rest: 90, cue: 'înălțimea care permite control; sprijin la nevoie', alt: 'fandare înapoi cu sprijin' }),
    E({ id: 'fit-kickback', equip: ['cablu'], name: 'Extensia șoldului la cablu (kickback)', group: 'fesieri', region: 'legs', role: 'accessory', sets: 2, reps: '12–15/picior', unilateral: true, rest: 75, cue: 'mișcare din șold, fără să arcuiești spatele', alt: 'extensie de șold cu bandă' }),
    E({ id: 'fit-abduction', equip: ['aparat'], name: 'Abducție șold la aparat sau cu bandă', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', rest: 75, cue: 'control, fără smucituri; banda nu e obligatorie', alt: 'abducție culcat pe o parte' }),
    E({ id: 'fit-lat', equip: ['aparat'], name: 'Tracțiuni la helcometru, priză confortabilă', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'tragi cu coatele spre șolduri, fără balans', alt: 'tracțiuni asistate' }),
    E({ id: 'fit-chest-press', equip: ['aparat'], name: 'Împins la aparat pentru piept', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'omoplații stabili, coborâre controlată', alt: 'flotări la suport înalt' }),
    E({ id: 'fit-row', equip: ['aparat', 'banca'], name: 'Ramat cu pieptul sprijinit', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'pieptul rămâne pe sprijin, pauză scurtă la final', alt: 'ramat la cablu' }),
    E({ id: 'fit-cable-row', equip: ['cablu'], name: 'Ramat la cablu, priză confortabilă', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'trunchiul fix, tragi cu coatele', alt: 'ramat cu pieptul sprijinit' }),
    E({ id: 'fit-incline', equip: ['banca', 'gantere'], name: 'Împins înclinat cu gantere sau la aparat', group: 'piept, umeri', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'banca puțin înclinată, coborâre controlată', alt: 'împins la aparat pentru piept' }),
    E({ id: 'fit-shoulder', equip: ['aparat'], name: 'Împins umeri la aparat, dacă nu doare', group: 'umeri', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'fără să arcuiești spatele; cobori cât nu doare', alt: 'împins landmine' }),
    E({ id: 'fit-pushup-high', equip: ['corp', 'scaun'], name: 'Flotări la suport înalt sau împins la aparat pentru piept', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'corpul drept; înălțimea suportului dă dificultatea', alt: 'împins la aparat pentru piept' }),
    E({ id: 'fit-lateral', equip: ['gantere'], name: 'Ridicări laterale cu gantere', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '12–15', rest: 75, cue: 'până la nivelul umerilor, fără balans', alt: 'ridicări laterale cu banda' }),
    E({ id: 'fit-triceps', equip: ['cablu'], name: 'Extensii triceps la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'coatele lângă corp', alt: 'extensii triceps la aparat' }),
    E({ id: 'fit-biceps', equip: ['gantere'], name: 'Flexii biceps cu gantere', group: 'biceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'coatele fixe, fără balans', alt: 'flexii cu banda (sub tălpi)' }),
    E({ id: 'fit-rev-fly', equip: ['aparat'], name: 'Reverse fly la aparat sau cu bandă', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 2, reps: '12–15', rest: 75, cue: 'brațele lungi, mișcarea din umăr', alt: 'fluturări inverse la cablu' }),
    E({ id: 'fit-pallof', equip: ['cablu'], name: 'Pallof press la cablu sau cu bandă', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '8–12/parte', unilateral: true, rest: 50, cue: 'bazinul și umerii nu se rotesc', alt: 'dead bug simplificat' }),
    // ——— Fitness, varianta amplă A–D (documentul „AIRON_Fitness_Femei_26_Saptamani”, 19.10.2026) ———
    E({ id: 'fit-bulgarian', equip: ['banca', 'gantere'], name: 'Bulgarian split squat', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, rest: 105, cue: 'sprijinul pentru echilibru e permis; coborâre controlată', alt: 'fandare înapoi cu sprijin', purpose: 'forță și control pe un picior, fesieri și coapse', setup: 'piciorul din spate pe o bancă de înălțimea genunchiului; distanța cât să cobori drept', mistakes: 'genunchiul din față cade spre interior; elan din trunchi; pas prea scurt' }),
    E({ id: 'fit-goblet', equip: ['gantere', 'banca'], name: 'Genuflexiune goblet la bancă', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 120, cue: 'gantera la piept, cobori controlat până atingi banca', alt: 'presă pentru picioare', purpose: 'genuflexiunea, cu adâncimea dată de bancă', setup: 'banca la înălțimea la care cobori cu spatele neutru', mistakes: 'te lași greu pe bancă; călcâiele se ridică' }),
    E({ id: 'fit-abduction-cable', equip: ['cablu'], name: 'Abducție la cablu', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', rest: 75, cue: 'piciorul pleacă lateral din șold, fără balans', alt: 'abducție la aparat', purpose: 'fesierul mijlociu, stabilitatea bazinului', setup: 'manșeta la gleznă, scripetele jos; te ții de aparat', mistakes: 'înclini trunchiul ca să ridici piciorul mai sus' }),
    E({ id: 'fit-db-press', equip: ['gantere', 'banca'], name: 'Împins cu gantere, bancă orizontală', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'omoplații strânși, coborâre controlată', alt: 'împins la aparat pentru piept', purpose: 'piept și triceps, cu stabilizare', setup: 'urci ganterele de pe genunchi în poziție, apoi te întinzi', mistakes: 'coatele larg la 90°; ganterele se lovesc sus' }),
    E({ id: 'fit-lateral-cable', equip: ['cablu'], name: 'Ridicări laterale la cablu', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', rest: 75, cue: 'ridici fără avânt, până la umăr', alt: 'ridicări laterale cu gantere', purpose: 'deltoidul lateral', setup: 'scripetele jos, mânerul în mâna opusă, lateral față de aparat', mistakes: 'ridici umărul spre ureche; balans din corp' }),
    E({ id: 'fit-lat-neutral', equip: ['aparat'], name: 'Helcometru, priză neutră', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '10–12', rest: 105, cue: 'tragi fără impuls și controlezi revenirea', alt: 'altă priză confortabilă', purpose: 'spatele (dorsalii), cu umerii într-o poziție comodă', setup: 'genunchii fixați sub pernă; mânerul neutru (palmele față în față)', mistakes: 'te lași pe spate ca să tragi; bara coboară la ceafă' }),
    E({ id: 'fit-hammer', equip: ['gantere'], name: 'Biceps hammer cu gantere', group: 'biceps, antebraț', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'încheietura neutră, cotul stabil', alt: 'flexii cu banda', purpose: 'biceps și antebraț', setup: 'în picioare sau așezată, ganterele cu palmele spre corp', mistakes: 'coatele pleacă în față; balans din spate' }),
    E({ id: 'fit-carry', equip: ['gantere'], name: 'Transport gantere (farmer carry)', group: 'trunchi, prindere', region: 'carry', role: 'carry', sets: 2, reps: '20–30 m', rest: 75, cue: 'mers stabil și respirație confortabilă', alt: 'alt exercițiu de trunchi, dacă spațiul nu permite distanța' }),
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
    E({ id: 'fit-lunge-walk', equip: ['gantere', 'corp'], name: 'Mers fandat (15 pași înainte, 15 înapoi)', group: 'fesieri, cvadriceps', region: 'legs', role: 'accessory', sets: 3, reps: '15 pași înainte + 15 înapoi', rest: 75, cue: 'pași lungi, trunchiul drept, genunchiul din spate aproape de sol', alt: 'fandări pe loc' }),
    E({ id: 'fit-rdl-bar', equip: ['bara'], name: 'Îndreptări românești cu bara', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 4, reps: '20 / 20 / 10 / 10 — crești la seriile de 10', rest: 120, cue: 'bara aproape de picioare, spatele drept; cobori până simți întinderea în spatele coapsei', alt: 'îndreptări românești cu gantere' }),
    E({ id: 'fit-h-db-fly', equip: ['gantere', 'corp'], name: 'Fluturări cu gantere de pe podea', group: 'piept', region: 'upper', role: 'accessory', sets: 3, reps: '15', rest: 60, cue: 'pe spate, coatele ușor îndoite; cobori până ating podeaua cu brațele', alt: 'flotări cu mâinile pe scaun' }),
    // ——— Fitness acasă: gantere, bandă, corp, scaun (auditul F55, F01). Nimic cu aparat, cablu, bară sau bancă. ———
    E({ id: 'fit-h-glute-bridge', equip: ['gantere', 'corp'], name: 'Pod de fesieri cu gantera pe bazin', group: 'fesieri', region: 'legs', role: 'main', sets: 2, reps: '10–15', rest: 105, cue: 'pe spate, tălpile pe podea; ridici bazinul strângând fesierii, ții o secundă sus', alt: 'pod de fesieri pe un picior, fără ganteră', purpose: 'fesierii mari', setup: 'gantera pe bazin, ținută cu ambele mâini; un prosop sub ea', mistakes: 'arcuiești spatele în loc să ridici din șold' }),
    E({ id: 'fit-h-goblet', equip: ['gantere', 'scaun'], name: 'Genuflexiune cu gantera la piept, până la scaun', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'cobori controlat până atingi scaunul, apoi urci împingând în călcâie', alt: 'genuflexiune fără greutate, până la scaun', purpose: 'coapse și fesieri', setup: 'scaun stabil în spate; gantera ținută vertical la piept', mistakes: 'te lași greu pe scaun; genunchii cad spre interior' }),
    E({ id: 'fit-h-split-squat', equip: ['gantere', 'corp'], name: 'Fandare statică cu gantere', group: 'cvadriceps, fesieri', region: 'legs', role: 'accessory', sets: 2, reps: '8–12/picior', unilateral: true, rest: 75, cue: 'un picior în față, unul în spate; cobori drept în jos și urci', alt: 'fandare statică fără greutate, cu mâna pe perete', purpose: 'coapse, pe un picior', setup: 'o ganteră în fiecare mână; sprijin de perete dacă ai nevoie', mistakes: 'genunchiul din față cade spre interior' }),
    E({ id: 'fit-h-band-curl', equip: ['banda'], name: 'Flexii femurali cu banda, culcat pe burtă', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '12–15', rest: 75, cue: 'aduci călcâiele spre fesieri, revii încet', alt: 'îndreptări românești pe un picior, fără greutate', purpose: 'spatele coapsei', setup: 'banda prinsă de un picior de masă sau de ușă, la nivelul gleznelor', mistakes: 'ridici bazinul de pe podea' }),
    E({ id: 'fit-h-band-kickback', equip: ['banda'], name: 'Extensia șoldului cu banda, în patru labe', group: 'fesieri', region: 'legs', role: 'accessory', sets: 2, reps: '12–15/picior', unilateral: true, rest: 75, cue: 'împingi piciorul în spate din șold, fără să arcuiești spatele', alt: 'aceeași mișcare fără bandă', setup: 'banda în jurul tălpii, capetele sub mâini', mistakes: 'arcuiești spatele; balans' }),
    E({ id: 'fit-h-band-abduction', equip: ['banda'], name: 'Abducție cu banda deasupra genunchilor', group: 'abductori (fesierul lateral)', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', rest: 75, cue: 'deschizi genunchii împotriva benzii, ții o secundă', alt: 'abducție culcat pe o parte, fără bandă', setup: 'așezată pe scaun sau în pod de fesieri; banda deasupra genunchilor', mistakes: 'deschizi cu smucituri' }),
    E({ id: 'fit-h-band-pulldown', equip: ['banda'], name: 'Tragere la piept cu banda prinsă sus', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '10–15', rest: 105, cue: 'tragi coatele în jos spre coaste, strângi omoplații', alt: 'ramat cu gantera, un braț', purpose: 'spatele (dorsalii)', setup: 'banda prinsă sus, de ușă (cu o ancoră de ușă); stai în genunchi', mistakes: 'te lași pe spate; ridici umerii' }),
    E({ id: 'fit-h-floor-press', equip: ['gantere', 'corp'], name: 'Împins cu gantere de pe podea', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'pe spate, cobori până atinge cotul podeaua ușor, apoi împingi', alt: 'flotări cu mâinile pe scaun', purpose: 'piept și triceps', setup: 'genunchii îndoiți, ganterele urcate de pe genunchi', mistakes: 'coatele la 90° de corp; lovești podeaua cu cotul' }),
    E({ id: 'fit-h-db-row', equip: ['gantere', 'scaun'], name: 'Ramat cu gantera, un braț, sprijin pe scaun', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12/braț', unilateral: true, rest: 90, cue: 'tragi gantera spre șold, fără să rotești trunchiul', alt: 'ramat cu banda', purpose: 'mijlocul spatelui', setup: 'o mână și un genunchi pe scaun, spatele drept', mistakes: 'tragi din biceps; rotești trunchiul' }),
    E({ id: 'fit-h-band-row', equip: ['banda'], name: 'Ramat cu banda, din șezut', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '10–15', rest: 90, cue: 'tragi mânerele spre burtă, strângi omoplații', alt: 'ramat cu gantera, un braț', purpose: 'mijlocul spatelui', setup: 'pe podea, banda în jurul tălpilor', mistakes: 'te lași pe spate; ridici umerii' }),
    E({ id: 'fit-h-pushup-incline', equip: ['corp', 'scaun'], name: 'Flotări cu mâinile pe scaun sau masă', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 90, cue: 'corpul drept; cobori pieptul spre margine și împingi', alt: 'flotări cu mâinile pe perete', purpose: 'piept, triceps', setup: 'scaun lipit de perete sau masă stabilă', mistakes: 'șoldurile cad; capul înainte' }),
    E({ id: 'fit-h-db-ohp', equip: ['gantere', 'scaun'], name: 'Împins cu gantere deasupra capului, pe scaun', group: 'umeri', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 90, cue: 'spatele drept; împingi în sus fără să te arcuiești', alt: 'același exercițiu cu banda sub tălpi', purpose: 'umerii', setup: 'pe scaun, ganterele la nivelul umerilor', mistakes: 'arcuiești spatele; cobori prea jos' }),
    E({ id: 'fit-h-db-triceps', equip: ['gantere'], name: 'Extensii triceps cu o ganteră deasupra capului', group: 'triceps', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'coatele spre tavan; cobori gantera în spatele capului și o urci', alt: 'extensii cu banda', setup: 'așezată, gantera ținută cu ambele mâini', mistakes: 'coatele se deschid larg' }),
    E({ id: 'fit-h-band-pullapart', equip: ['banda'], name: 'Desfacerea benzii în fața pieptului', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', rest: 60, cue: 'brațele întinse; deschizi banda până la piept, strângi omoplații', alt: 'fluturări inverse cu gantere ușoare, aplecată', setup: 'banda ținută la lățimea umerilor', mistakes: 'ridici umerii; îndoi coatele mult' }),
    E({ id: 'fit-h-band-pallof', equip: ['banda'], name: 'Pallof press cu banda', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '8–12/parte', unilateral: true, rest: 50, cue: 'împingi banda drept în față și nu lași trunchiul să se rotească', alt: 'dead bug', setup: 'banda prinsă lateral, la nivelul pieptului (ușă, picior de masă)', mistakes: 'te rotești după bandă' }),
    E({ id: 'fit-h-seated-calf', equip: ['gantere', 'scaun'], name: 'Ridicări pe vârfuri din șezut, gantera pe genunchi', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '12–15', rest: 60, cue: 'urci pe vârfuri, ții o secundă, cobori încet', alt: 'ridicări pe vârfuri din picioare, pe treaptă', setup: 'pe scaun; vârfurile pe o carte groasă', mistakes: 'ricoșezi jos' }),
    E({ id: 'fit-h-bulgarian', equip: ['gantere', 'scaun'], name: 'Fandare bulgărească cu piciorul din spate pe un scaun', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, rest: 105, cue: 'cobori drept în jos; sprijin de perete e permis', alt: 'fandare înapoi cu sprijin', purpose: 'fesieri și coapse, pe un picior', setup: 'scaun stabil, lipit de perete', mistakes: 'genunchiul din față cade spre interior' }),
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
  // Bărbații (anduranță): Push / Pull / Picioare în rotație, indiferent de numărul de ședințe pe săptămână; fiecare
  // poziție are trei variante cu exerciții și aparate diferite, ca ședințele să nu fie identice.
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
  // Ședințele vechi (planuri salvate înainte de 19.10.2026, combinau picioarele cu partea de sus): se citesc din plan,
  // dar prescripția lor e cea a ședinței noi echivalente (LEGACY_FIT); planul se rescrie la deschidere.
  f1: fit('f1', 'F1 Tot corpul', 'fesieri, coapse, împins, tras, trunchi', { 'fit-hip-thrust': 3 }),
  f2: fit('f2', 'F2 Tot corpul', 'posterior, fesieri, tras, împins, trunchi', { 'fit-rdl': 3 }),
  a3: fit('a3', 'A3 Fesieri și coapse', 'fesieri, coapse și trunchi superior', { 'fit-hip-thrust': 3 }),
  b3: fit('b3', 'B3 Partea superioară', 'partea superioară și femurali', { 'fit-lat': 3 }),
  c3: fit('c3', 'C3 Posterior și fesieri', 'posterior, fesieri și trunchi superior', { 'fit-rdl': 3 }),
  // Varianta amplă de patru zile (A–D): doza pentru sportiva eligibilă (experiență, timp ≥ 55 min, prezență
  // demonstrată la 4 zile), nu o înlocuire obligatorie a ședințelor L1/U1/L2/U2. Doza de construire; săpt. 1–4: 2 serii.
  fa: fitX('fa', 'A Picioare și fesieri', 'picioare și fesieri, accent genuflexiune', '55–70 min', { 'fit-hip-thrust': [3, '8–12', 120], 'fit-leg-press': [3, '8–12', 150], 'fit-bulgarian': [2, '8–10/picior', 105], 'fit-leg-curl': [2, '10–15', 90], 'fit-abduction': [2, '12–20', 75], 'fit-calf': [2, '10–15', 75], 'fit-pallof': [2, '8–12/parte', 50] }),
  fb: fitX('fb', 'B Superior, accent spate', 'spate, umeri, brațe', '45–60 min', { 'fit-lat': [3, '8–12', 120], 'fit-row': [3, '8–12', 120], 'fit-chest-press': [2, '8–12', 105], 'fit-lateral': [2, '12–20', 75], 'fit-rev-fly': [2, '12–20', 75], 'fit-biceps': [2, '10–15', 75], 'fit-triceps': [2, '10–15', 75] }),
  fc: fitX('fc', 'C Fesieri și lanț posterior', 'fesieri, femurali, trunchi', '50–65 min', { 'fit-rdl': [3, '8–10', 150], 'fit-hip-thrust': [2, '10–15', 120], 'fit-reverse-lunge': [2, '8–12/picior', 105], 'fit-leg-curl': [2, '10–15', 90], 'fit-calf-seated': [2, '12–15', 75], 'fit-dead-bug': [2, '6–10/parte', 50] }),
  fd: fitX('fd', 'D Superior, accent împins', 'piept, umeri, spate, brațe', '45–60 min', { 'fit-incline': [3, '8–12', 120], 'fit-cable-row': [3, '8–12', 120], 'fit-shoulder': [2, '8–12', 105], 'fit-lat-neutral': [2, '10–12', 105], 'fit-lateral': [2, '12–20', 75], 'fit-hammer': [2, '10–15', 75], 'fit-triceps': [2, '10–15', 75] }),
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
};

/** Exercițiul executabil la locul dat; null dacă nu există variantă (nu se activează un exercițiu imposibil). */
export function forPlace(id: string, place: 'sala' | 'acasa' | undefined): string | null {
  if (place !== 'acasa') return id;
  const h = HOME_SWAP[id] ?? id;
  const eq = CATALOG[h]?.equip;
  return eq && eq.every((e) => HOME_EQUIP.includes(e)) ? h : null;
}

function fit(id: FitnessSessionId, name: string, focus: string, dose: Record<string, number>): StrengthSession {
  return { id, name, focus, exercises: Object.keys(dose), completions: [], dose: Object.fromEntries(Object.entries(dose).map(([k, n]) => [k, { sets: n }])) };
}

export const FITNESS_ROTATION: Record<2 | 3 | 4, FitnessSessionId[]> = { 2: ['l1', 'u1'], 3: ['l1', 'u1', 'l2'], 4: ['l1', 'u1', 'l2', 'u2'] };
/** Ședințele vechi → cele noi (aceeași zi, fără picioare + partea de sus împreună). */
export const LEGACY_FIT: Partial<Record<FitnessSessionId, FitnessSessionId>> = { f1: 'l1', f2: 'u1', a3: 'l1', b3: 'u1', c3: 'l2' };
const FIT_LOWER: FitnessSessionId[] = ['l1', 'l2', 'l3'];
const FIT_UPPER: FitnessSessionId[] = ['u1', 'u2'];
/** Tiparul săptămânii: 2 zile = picioare, sus; 3 = picioare, sus, picioare; 4 = picioare, sus, picioare, sus. */
export const FIT_PATTERN: Record<number, ('L' | 'U')[]> = { 1: ['L'], 2: ['L', 'U'], 3: ['L', 'U', 'L'], 4: ['L', 'U', 'L', 'U'] };
/**
 * Rotația de fitness pe tot programul (nu doar în săptămână): zilele de picioare trec prin A → B → C, cele de sus prin
 * spate+biceps → piept+umeri+triceps, ca toate ședințele să apară și să nu se repete aceeași zi de la o săptămână la alta.
 */
export class FitnessRotator {
  private l = 0;
  private u = 0;
  private v: Record<string, number> = {};
  next(kind: 'L' | 'U'): { session: FitnessSessionId; variant?: number } {
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
export const isFitnessSession = (id: SessionId): id is FitnessSessionId => ['f1', 'f2', 'a3', 'b3', 'c3', 'l1', 'l2', 'l3', 'u1', 'u2', 'fa', 'fb', 'fc', 'fd'].includes(id);

export const PPL_ROTATION: SessionId[] = ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'];
export const FULL_ROTATION: SessionId[] = ['fullA', 'fullB'];
export const SPLIT_ROTATION: SplitSessionId[] = ['push', 'pull', 'legs'];
export const isLegsSession = (id: SessionId) => id === 'legsA' || id === 'legsB' || id === 'legs';

export interface SplitState {
  i: number;
  deferred: boolean;
  counts: Record<SplitSessionId, number>;
}
export const newSplitState = (): SplitState => ({ i: 0, deferred: false, counts: { push: 0, pull: 0, legs: 0 } });

/**
 * Următoarea ședință din rotația Push → Pull → Picioare. Picioarele nu cad în ajunul unei ședințe-cheie (trec la
 * următoarea zi de sală) și deloc în ultimele 10 zile dinaintea cursei. Varianta = a câta ședință de acel tip e.
 */
export function nextSplit(st: SplitState, legsBlocked: boolean, nearRace: boolean): { session: SplitSessionId; variant: number } {
  let session: SplitSessionId;
  if (st.deferred && !legsBlocked && !nearRace) {
    session = 'legs';
    st.deferred = false;
  } else {
    session = SPLIT_ROTATION[st.i++ % 3]!;
    if (session === 'legs' && (legsBlocked || nearRace)) {
      if (!nearRace) st.deferred = true;
      session = SPLIT_ROTATION[st.i++ % 3]!;
    }
  }
  return { session, variant: st.counts[session]++ };
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
  /** Fitness: prima săptămână cu mai multe zile (2 → 3 sau 3 → 4): volumul se distribuie, nu crește dintr-odată. */
  transition?: boolean;
  /** Push / Pull / Picioare: a câta ședință de acest tip (de la 0); alege exercițiile. */
  variant?: number;
  /** Fitness: unde se antrenează (acasă = doar gantere, bandă, corp, scaun). */
  place?: 'sala' | 'acasa';
  /** Slăbire: ședința începe cu mers pe bandă înclinată (20 min în zilele de sus, 10 în cele de picioare + restul la final). */
  opener?: 'slabire';
}

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

/** Timpul de lucru al unei serii (s), din repetările scrise: ~3 s pe repetare, între 30 și 90 s; „30–45 s” = timpul. */
function workSec(r: Rx): number {
  const sec = /(\d+)\s*s\b(?!\s*(ținut|sus|pauză))/.exec(r.reps);
  if (sec && !/rep/.test(r.reps) && /^\d+[–-]?\d*\s*s/.test(r.reps.trim())) return Math.min(90, Math.max(30, Number(sec[1])));
  const nums = (r.reps.split('—')[0] ?? r.reps).match(/\d+/g)?.map(Number).filter((n) => n > 0 && n <= 100) ?? [];
  const per = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 10;
  return Math.min(90, Math.max(30, per * 3));
}
const SIDE_SWITCH_SEC = 15;
/** În superserie, trecerea de la un exercițiu la următorul (~15 s); pauza întreagă vine după ultimul din grup. */
const SS_SWITCH_SEC = 15;
/** La fitness, schimbarea și reglarea aparatului și seriile de acomodare la fiecare exercițiu (~1,5 min). */
const FIT_SETUP_SEC = 90;

/** Durata (s) a unui exercițiu: fiecare serie = lucru (+ ambele părți la unilateral) + pauză (sau trecerea în superserie). */
function itemSec(r: Rx, lastInGroup: boolean): number {
  const uni = r.ex.unilateral && !/\(\d+\s*(pe|\/)/.test(r.reps);
  const rest = r.ss && !lastInGroup ? SS_SWITCH_SEC : r.rest;
  return r.sets * (workSec(r) * (uni ? 2 : 1) + (uni ? SIDE_SWITCH_SEC : 0) + rest);
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
const legsDay = (id: SessionId) => isLegsSession(id) || ['l1', 'l2', 'l3', 'fullA', 'f1', 'a3', 'b3'].includes(id);
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
  // Partea de după cardio din încălzirea ședinței (activare, serii ușoare); cardio-ul îl dă obiectivul.
  const tail = session.warmup && /^\d+ min [^,]*,/.test(session.warmup) ? session.warmup.replace(/^\d+ min [^,]*,\s*(apoi\s*)?/, '') : MOBILITY;
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
export function prescribeFull(spec: StrengthSpec, ctx?: StrengthDayContext): Prescription {
  if (isFitnessSession(spec.session)) return prescribeFitness(spec, ctx);
  const session = SESSIONS[spec.session];
  const rir = rirFor(spec);
  const notes: string[] = [];
  const ids = sessionExercises(session, spec.variant ?? 0);
  let items: Rx[] = ids.map((id, k) => {
    const ex = CATALOG[id]!;
    return { ex, sets: ex.sets, reps: ex.reps, rir, rest: REST[ex.role], ...(session.slots && k === ids.length - 1 && ex.region === 'core' ? { optional: true, note: 'opțional' } : {}) };
  });
  for (const r of items) r.sets = baseSets(r, spec);

  // Pliometria (Llanos-Lagos și colab. 2024): doar în ziua de picioare a sportivilor de anduranță, din blocurile de
  // forță / integrare / consolidare, imediat după încălzire; nu cu picioarele protejate.
  if (spec.session === 'fullA' && (spec.block === 'forta' || spec.block === 'integrare' || spec.block === 'consolidare') && (spec.legs ?? 'normal') === 'normal') {
    const pg = CATALOG['legs-pogo']!;
    items.unshift({ ex: pg, sets: 3, reps: pg.reps, rir, rest: 60, note: 'înaintea greutăților, cât ești proaspăt' });
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
  // Slăbire, zi de sus: cardio-ul s-a făcut la început; la final rămâne doar ce trebuie până la 45 de minute.
  const fin = spec.opener === 'slabire' && !legsDay(spec.session) ? null : session.finisher;
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
  let items: Rx[] = ids.flatMap((id) => {
    const placed = forPlace(id, spec.place);
    if (!placed) {
      missingHome.push(CATALOG[id]!.name.toLowerCase());
      return [];
    }
    // Acasă, două exerciții de sală pot avea același echivalent: rămâne o singură dată.
    if (placed !== id && ids.some((o) => o !== id && (forPlace(o, spec.place) === placed) && ids.indexOf(o) < ids.indexOf(id))) return [];
    const ex = CATALOG[placed]!;
    const d = dose?.[swapped && id === swapped[1] ? swapped[0] : id];
    return [{ ex, sets: d?.sets ?? ex.sets, reps: d?.reps ?? ex.reps, rir, rest: d?.rest ?? ex.rest ?? REST[ex.role], ...(d?.ss ? { ss: d.ss } : {}) }];
  });
  if (spec.place === 'acasa') notes.push('acasă: doar gantere, bandă și greutatea corpului (un scaun stabil ajută); exercițiile de sală sunt înlocuite cu echivalentele lor');
  if (missingHome.length) notes.push(`fără variantă acasă pentru: ${missingHome.join(', ')} — nu e inclus`);
  if (swapped) notes.push(`varietate controlată: ${CATALOG[swapped[1]]!.name.toLowerCase()} în loc de ${CATALOG[swapped[0]]!.name.toLowerCase()}; cauți din nou greutatea (kilogramele nu se transferă de la un exercițiu la altul)`);
  const light = spec.block === 'acomodare' || spec.block === 'mentinere' || spec.recovery || spec.transition;
  if (light) for (const r of items) r.sets = MIN_WORK_SETS;
  if (spec.block === 'acomodare') {
    notes.push(spec.week <= 2 ? 'învățare: 3 serii pe exercițiu, cu greutăți ușoare — te oprești când mai aveai 3–4 repetări; notează greutățile folosite' : 'consolidare: rămân 3 serii; progresezi în control și repetări');
    notes.push('fără istoric de greutăți: alegi greutatea cu care faci repetările fără să mergi până la limită');
  } else if (spec.transition) notes.push(wide ? 'prima săptămână cu patru ședințe A–D: 3 serii la toate; doza de construire vine după, dacă merge bine' : 'prima săptămână cu mai multe zile: 3 serii la toate; volumul crește apoi, nu dintr-odată');
  if (spec.block === 'mentinere') notes.push('menținere: 3 serii, păstrezi performanța, nu trebuie să crești');
  if (spec.recovery) {
    for (const r of items) r.rir = '3–4';
    notes.push('revizuire: oboseala sau performanța în scădere cer greutăți mai mici și oprit mai departe de limită, temporar (seriile rămân 3)');
  }
  if (items.some((r) => r.ss)) notes.push('superserie: exercițiile cu aceeași literă le faci unul după altul, fără pauză între ele; pauza (1–2 min) vine după ultimul din grup');
  if (items.some((r) => /crești greutatea/.test(r.reps))) notes.push('la seriile cu repetări din ce în ce mai puține (20 / 15 / 12 / 8) crești greutatea la fiecare serie; pauza 1–2 min, nu mai mult');
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
  const limit = Math.max(MIN_STRENGTH_MINUTES, minutes);
  const items = p.items.map((r) => ({ ...r }));
  const trimmed: string[] = [];
  const minFinisher = p.session.finisher && !(spec.opener === 'slabire' && !legsDay(spec.session)) ? FINISHER_SHORT : 0;
  const fits = () => Math.ceil(estimateMinutes(items, p.warmup.min)) + minFinisher <= limit;
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
  if (trimmed.length) notes.push(`ca să încapă în ${limit} min, azi sari peste: ${trimmed.join(', ')} (pauzele rămân întregi, seriile rămân minimum 3)`);
  return finish(spec, p.session, items, trimmed, notes, limit, ctx);
}


// ——— Textul din plan (citit de oameni și de cod) ———

const OPENER_TAG = 'cardio înclinat la început';
const LEGS_TEXT: Record<Exclude<LegsMode, 'normal'>, string> = { usor: 'picioare ușoare', fara: 'fără picioare' };

/** „Push A · Bază, săpt. 2/4 · 2–3 repetări în rezervă · descărcare”. */
export function strengthStructure(spec: StrengthSpec): string {
  const parts = [SESSIONS[spec.session].name, ...(isSplitSession(spec.session) || (SESSIONS[spec.session].variants && spec.variant != null) ? [`varianta ${(spec.variant ?? 0) + 1}`] : []), `${BLOCK_LABEL[spec.block]}, săpt. ${spec.week}/${spec.len}`, `${rirFor(spec)} repetări în rezervă`];
  if (spec.recovery) parts.push('descărcare');
  if (spec.transition) parts.push('trecere');
  if (spec.legs && spec.legs !== 'normal') parts.push(LEGS_TEXT[spec.legs]);
  if (spec.place === 'acasa') parts.push('acasă');
  if (spec.opener === 'slabire') parts.push(OPENER_TAG);
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
  return { session, block, week: Number(m[2]), len: Number(m[3]), recovery: rest.includes('descărcare'), legs, ...(rest.includes('trecere') ? { transition: true } : {}), ...(variant != null ? { variant } : {}), ...(rest.includes('acasă') ? { place: 'acasa' as const } : {}), ...(rest.includes(OPENER_TAG) ? { opener: 'slabire' as const } : {}) };
}

/** Numele ședinței din textul din plan (și pentru planurile vechi „Push 1 · …”). */
export function sessionName(structure: string | null | undefined): string | null {
  const s = parseStrength(structure);
  if (s) return SESSIONS[s.session].name;
  const first = (structure ?? '').split(' · ')[0] ?? '';
  return /^(Push|Pull|Picioare|Brațe|Legs|Tot corpul|[FABCLU][1-3] |[ABCD] (Picioare|Superior|Fesieri))/.test(first) ? first : null;
}

export const STRENGTH_RULES: { t: string; d: string }[] = [
  { t: 'Structura', d: 'Picioarele nu se combină niciodată cu partea de sus în aceeași ședință. Bărbați: Push (piept, umeri, triceps), Pull (spate, biceps), Picioare, pe rând.' },
  { t: 'Durata', d: 'Cel puțin 45 de minute cu tot cu încălzirea. Încălzire: 10 minute de mișcare ușoară, apoi 1–2 serii ușoare la primul exercițiu (nu se numără).' },
  { t: 'Serii', d: '3 sau 4 serii de lucru la fiecare exercițiu, mereu. În săptămânile ușoare scade greutatea, nu numărul de serii. Cel mult 10 serii pe același mușchi într-o ședință.' },
  { t: 'Cât de greu', d: 'Te oprești din serie când mai aveai încă 2–3 repetări bune în tine (la început 3–4). Nu mergi până nu mai poți ridica deloc.' },
  { t: 'Pauze', d: 'Cam 2–3 minute la primele exerciții (cele grele) și 1–2 minute la restul. Dacă încă gâfâi, mai stai puțin.' },
  { t: 'Cum crești', d: 'Notezi greutatea și repetările. Data viitoare încerci o repetare în plus. Când faci numărul maxim de repetări la toate seriile, pui greutatea imediat următoare.' },
  { t: 'Exerciții diferite', d: 'Push, Pull și Picioare au de fiecare dată alte exerciții sau alte aparate. Fiecare exercițiu revine cam la a treia ședință de același tip; kilogramele de la un aparat nu se transferă la altul.' },
  { t: 'Durere', d: 'Durere nouă sau ascuțită: oprești exercițiul și spui în formularul de seară. Durere în piept, amețeală sau lipsă de aer neobișnuită: te oprești și mergi la medic.' },
];
