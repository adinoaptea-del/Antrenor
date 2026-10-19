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
  /** Pauza dintre seturi (s), când exercițiul are pauza lui în program (fitness); altfel după rol. */
  rest?: number;
  /** Fișa exercițiului (fitness): ce lucrează, cum reglezi aparatul, greșelile frecvente. */
  purpose?: string;
  setup?: string;
  mistakes?: string;
}

export type FitnessSessionId = 'f1' | 'f2' | 'a3' | 'b3' | 'c3' | 'l1' | 'l2' | 'u1' | 'u2' | 'fa' | 'fb' | 'fc' | 'fd';
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
  dose?: Record<string, { sets: number; reps?: string; rest?: number }>;
  /** Durata estimată afișată (fitness, varianta amplă A–D), din programul de referință. */
  estimate?: string;
  /**
   * Push / Pull / Picioare (bărbați): fiecare poziție are un set de exerciții echivalente, cu aparate diferite; varianta
   * ședinței alege câte unul din fiecare. Ultima poziție (abdomen) e opțională și cade prima când e puțin timp.
   */
  slots?: string[][];
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
    E({ id: 'fit-hip-thrust', name: 'Hip thrust la aparat sau cu bara', group: 'fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'sprijin stabil; extensie din șold, fără să arcuiești spatele', alt: 'glute bridge încărcat' }),
    E({ id: 'fit-leg-press', name: 'Presă pentru picioare', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'mișcare confortabilă, cu bazinul stabil; nu forța adâncimea', alt: 'genuflexiune goblet la bancă' }),
    E({ id: 'fit-reverse-lunge', name: 'Fandare înapoi cu sprijin', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 1, reps: '8–10/picior', unilateral: true, rest: 90, cue: 'control, sprijin dacă e nevoie; sarcina nu compromite echilibrul', alt: 'step-up pe treaptă joasă' }),
    E({ id: 'fit-leg-ext', name: 'Extensii genunchi la aparat', group: 'cvadriceps', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'mișcare controlată, fără durere articulară', alt: 'presă cu mișcare prea scurtă' }),
    E({ id: 'fit-calf', name: 'Ridicări pe vârfuri', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'mișcare fără durere, fără balans', alt: 'ridicări pe vârfuri din șezut' }),
    E({ id: 'fit-calf-seated', name: 'Ridicări pe vârfuri din șezut', group: 'gambe', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'cât poți fără durere, ritm controlat', alt: 'ridicări pe vârfuri din picioare' }),
    E({ id: 'fit-dead-bug', name: 'Dead bug simplificat', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '6–8/parte', unilateral: true, rest: 50, cue: 'respirație confortabilă; cât controlezi', alt: 'Pallof press' }),
    E({ id: 'fit-rdl', name: 'Îndreptări românești cu gantere', group: 'femurali, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–10', rest: 120, cue: 'șoldurile merg înapoi; cobori doar până unde controlezi trunchiul', alt: 'glute bridge, iar aplecarea din șold se învață separat' }),
    E({ id: 'fit-leg-curl', name: 'Flexii femurali la aparat', group: 'femurali', region: 'legs', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'bazin stabil, fără impuls', alt: 'flexii femurali culcat' }),
    E({ id: 'fit-step-up', name: 'Step-up pe treaptă joasă', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, rest: 90, cue: 'înălțimea care permite control; sprijin la nevoie', alt: 'fandare înapoi cu sprijin' }),
    E({ id: 'fit-kickback', name: 'Extensia șoldului la cablu (kickback)', group: 'fesieri', region: 'legs', role: 'accessory', sets: 1, reps: '12–15/picior', unilateral: true, rest: 75, cue: 'mișcare din șold, fără să arcuiești spatele', alt: 'extensie de șold cu bandă' }),
    E({ id: 'fit-abduction', name: 'Abducție șold la aparat sau cu bandă', group: 'fesieri (lateral)', region: 'legs', role: 'accessory', sets: 1, reps: '12–20', rest: 75, cue: 'control, fără smucituri; banda nu e obligatorie', alt: 'abducție culcat pe o parte' }),
    E({ id: 'fit-lat', name: 'Tracțiuni la helcometru, priză confortabilă', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'tragi cu coatele spre șolduri, fără balans', alt: 'tracțiuni asistate' }),
    E({ id: 'fit-chest-press', name: 'Împins la aparat pentru piept', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'omoplații stabili, coborâre controlată', alt: 'flotări la suport înalt' }),
    E({ id: 'fit-row', name: 'Ramat cu pieptul sprijinit', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'pieptul rămâne pe sprijin, pauză scurtă la final', alt: 'ramat la cablu' }),
    E({ id: 'fit-cable-row', name: 'Ramat la cablu, priză confortabilă', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'trunchiul fix, tragi cu coatele', alt: 'ramat cu pieptul sprijinit' }),
    E({ id: 'fit-incline', name: 'Împins înclinat cu gantere sau la aparat', group: 'piept, umeri', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'banca puțin înclinată, coborâre controlată', alt: 'împins la aparat pentru piept' }),
    E({ id: 'fit-shoulder', name: 'Împins umeri la aparat, dacă nu doare', group: 'umeri', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'fără să arcuiești spatele; cobori cât nu doare', alt: 'împins landmine' }),
    E({ id: 'fit-pushup-high', name: 'Flotări la suport înalt sau împins la aparat pentru piept', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'corpul drept; înălțimea suportului dă dificultatea', alt: 'împins la aparat pentru piept' }),
    E({ id: 'fit-lateral', name: 'Ridicări laterale cu gantere', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '12–15', rest: 75, cue: 'până la nivelul umerilor, fără balans', alt: 'ridicări laterale la cablu' }),
    E({ id: 'fit-triceps', name: 'Extensii triceps la cablu', group: 'triceps', region: 'upper', role: 'accessory', sets: 1, reps: '10–15', rest: 75, cue: 'coatele lângă corp', alt: 'extensii triceps la aparat' }),
    E({ id: 'fit-biceps', name: 'Flexii biceps cu gantere', group: 'biceps', region: 'upper', role: 'accessory', sets: 1, reps: '10–15', rest: 75, cue: 'coatele fixe, fără balans', alt: 'flexii biceps la cablu' }),
    E({ id: 'fit-rev-fly', name: 'Reverse fly la aparat sau cu bandă', group: 'umăr posterior', region: 'upper', role: 'accessory', sets: 2, reps: '12–15', rest: 75, cue: 'brațele lungi, mișcarea din umăr', alt: 'fluturări inverse la cablu' }),
    E({ id: 'fit-pallof', name: 'Pallof press la cablu sau cu bandă', group: 'trunchi', region: 'core', role: 'core', sets: 2, reps: '8–12/parte', unilateral: true, rest: 50, cue: 'bazinul și umerii nu se rotesc', alt: 'dead bug simplificat' }),
    // ——— Fitness, varianta amplă A–D (documentul „AIRON_Fitness_Femei_26_Saptamani”, 19.10.2026) ———
    E({ id: 'fit-bulgarian', name: 'Bulgarian split squat', group: 'fesieri, coapse', region: 'legs', role: 'main', sets: 2, reps: '8–10/picior', unilateral: true, rest: 105, cue: 'sprijinul pentru echilibru e permis; coborâre controlată', alt: 'fandare înapoi cu sprijin', purpose: 'forță și control pe un picior, fesieri și coapse', setup: 'piciorul din spate pe o bancă de înălțimea genunchiului; distanța cât să cobori drept', mistakes: 'genunchiul din față cade spre interior; elan din trunchi; pas prea scurt' }),
    E({ id: 'fit-goblet', name: 'Genuflexiune goblet la bancă', group: 'cvadriceps, fesieri', region: 'legs', role: 'main', sets: 2, reps: '8–12', rest: 120, cue: 'gantera la piept, cobori controlat până atingi banca', alt: 'presă pentru picioare', purpose: 'genuflexiunea, cu adâncimea dată de bancă', setup: 'banca la înălțimea la care cobori cu spatele neutru', mistakes: 'te lași greu pe bancă; călcâiele se ridică' }),
    E({ id: 'fit-abduction-cable', name: 'Abducție la cablu', group: 'fesieri (lateral)', region: 'legs', role: 'accessory', sets: 2, reps: '12–20', rest: 75, cue: 'piciorul pleacă lateral din șold, fără balans', alt: 'abducție la aparat', purpose: 'fesierul mijlociu, stabilitatea bazinului', setup: 'manșeta la gleznă, scripetele jos; te ții de aparat', mistakes: 'înclini trunchiul ca să ridici piciorul mai sus' }),
    E({ id: 'fit-db-press', name: 'Împins cu gantere, bancă orizontală', group: 'piept, triceps', region: 'upper', role: 'main', sets: 2, reps: '8–12', rest: 105, cue: 'omoplații strânși, coborâre controlată', alt: 'împins la aparat pentru piept', purpose: 'piept și triceps, cu stabilizare', setup: 'urci ganterele de pe genunchi în poziție, apoi te întinzi', mistakes: 'coatele larg la 90°; ganterele se lovesc sus' }),
    E({ id: 'fit-lateral-cable', name: 'Ridicări laterale la cablu', group: 'umeri', region: 'upper', role: 'accessory', sets: 2, reps: '12–20', rest: 75, cue: 'ridici fără avânt, până la umăr', alt: 'ridicări laterale cu gantere', purpose: 'deltoidul lateral', setup: 'scripetele jos, mânerul în mâna opusă, lateral față de aparat', mistakes: 'ridici umărul spre ureche; balans din corp' }),
    E({ id: 'fit-lat-neutral', name: 'Helcometru, priză neutră', group: 'spate', region: 'upper', role: 'main', sets: 2, reps: '10–12', rest: 105, cue: 'tragi fără impuls și controlezi revenirea', alt: 'altă priză confortabilă', purpose: 'spatele (dorsalii), cu umerii într-o poziție comodă', setup: 'genunchii fixați sub pernă; mânerul neutru (palmele față în față)', mistakes: 'te lași pe spate ca să tragi; bara coboară la ceafă' }),
    E({ id: 'fit-hammer', name: 'Biceps hammer cu gantere', group: 'biceps, antebraț', region: 'upper', role: 'accessory', sets: 2, reps: '10–15', rest: 75, cue: 'încheietura neutră, cotul stabil', alt: 'flexii la cablu cu funie', purpose: 'biceps și antebraț', setup: 'în picioare sau așezată, ganterele cu palmele spre corp', mistakes: 'coatele pleacă în față; balans din spate' }),
    E({ id: 'fit-carry', name: 'Transport gantere (farmer carry)', group: 'trunchi, prindere', region: 'carry', role: 'carry', sets: 2, reps: '20–30 m', rest: 75, cue: 'mers stabil și respirație confortabilă', alt: 'alt exercițiu de trunchi, dacă spațiul nu permite distanța' }),
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

export const SESSIONS: Record<SessionId, StrengthSession> = {
  pushA: { id: 'pushA', name: 'Push A', focus: 'piept, umeri, triceps', exercises: ['push-db-bench', 'push-landmine', 'push-cable-fly', 'push-cable-lateral', 'push-rope-pushdown'], completions: [{ id: 'pull-chest-row', sets: 2 }, { id: 'legs-seated-curl', sets: 2 }] },
  pullA: { id: 'pullA', name: 'Pull A', focus: 'spate, umăr posterior, biceps', exercises: ['pull-lat-neutral', 'pull-chest-row', 'pull-rev-fly-machine', 'pull-db-hammer', 'pull-farmer'], completions: [{ id: 'push-db-bench', sets: 2 }, { id: 'legs-press', sets: 2 }] },
  legsA: { id: 'legsA', name: 'Legs A', focus: 'picioare, trunchi', exercises: ['legs-press', 'legs-db-rdl', 'legs-seated-curl', 'legs-standing-calf', 'legs-dead-bug'], completions: [], legSwap: 'legs-split-squat' },
  pushB: { id: 'pushB', name: 'Push B', focus: 'piept, umeri, triceps', exercises: ['push-db-incline', 'push-machine-shoulder', 'push-pushup', 'push-db-lateral', 'push-overhead-cable'], completions: [{ id: 'pull-cable-row-1arm', sets: 2 }, { id: 'legs-lying-curl', sets: 2 }] },
  pullB: { id: 'pullB', name: 'Pull B', focus: 'spate, umăr posterior, biceps', exercises: ['pull-assisted-pullup', 'pull-cable-row-1arm', 'pull-rev-fly-cable', 'pull-cable-curl', 'pull-suitcase'], completions: [{ id: 'push-db-incline', sets: 2 }, { id: 'legs-goblet', sets: 2 }] },
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
  // Cu două ședințe pe săptămână: tot corpul, din același catalog (alegerea AIRON; programul cere tot corpul, nu un PPL incomplet).
  fullA: { id: 'fullA', name: 'Tot corpul A', focus: 'picioare, împins, tras, trunchi', exercises: ['legs-press', 'legs-db-rdl', 'push-db-bench', 'pull-lat-neutral', 'push-cable-lateral', 'pull-farmer', 'legs-dead-bug'], completions: [] },
  fullB: { id: 'fullB', name: 'Tot corpul B', focus: 'picioare, tras, împins, trunchi', exercises: ['legs-goblet', 'legs-hip-thrust', 'legs-lying-curl', 'pull-chest-row', 'push-db-incline', 'pull-suitcase', 'legs-pallof'], completions: [] },
  // Fitness: două zile (F1/F2), trei zile (A3/B3/C3) sau patru zile (L1/U1/L2/U2) — variante alternative, nu cumulate.
  f1: fit('f1', 'F1 Tot corpul', 'fesieri, coapse, împins, tras, trunchi', { 'fit-hip-thrust': 2, 'fit-leg-press': 2, 'fit-chest-press': 2, 'fit-row': 2, 'fit-calf': 1, 'fit-dead-bug': 1 }),
  f2: fit('f2', 'F2 Tot corpul', 'posterior, fesieri, tras, împins, trunchi', { 'fit-rdl': 2, 'fit-step-up': 2, 'fit-lat': 2, 'fit-incline': 2, 'fit-leg-curl': 1, 'fit-pallof': 1 }),
  a3: fit('a3', 'A3 Fesieri și coapse', 'fesieri, coapse și trunchi superior', { 'fit-hip-thrust': 2, 'fit-leg-press': 2, 'fit-chest-press': 2, 'fit-row': 2, 'fit-calf': 1, 'fit-dead-bug': 1 }),
  b3: fit('b3', 'B3 Partea superioară', 'partea superioară și femurali', { 'fit-lat': 2, 'fit-shoulder': 2, 'fit-incline': 2, 'fit-cable-row': 2, 'fit-leg-curl': 2, 'fit-biceps': 1, 'fit-triceps': 1 }),
  c3: fit('c3', 'C3 Posterior și fesieri', 'posterior, fesieri și trunchi superior', { 'fit-rdl': 2, 'fit-step-up': 2, 'fit-kickback': 1, 'fit-abduction': 1, 'fit-cable-row': 2, 'fit-pushup-high': 2, 'fit-pallof': 1 }),
  l1: fit('l1', 'L1 Fesieri și coapse', 'fesieri și coapse', { 'fit-hip-thrust': 2, 'fit-leg-press': 2, 'fit-reverse-lunge': 1, 'fit-leg-ext': 2, 'fit-calf': 2, 'fit-dead-bug': 2 }),
  l2: fit('l2', 'L2 Posterior și fesieri', 'lanț posterior și fesieri', { 'fit-rdl': 2, 'fit-leg-curl': 2, 'fit-step-up': 1, 'fit-kickback': 1, 'fit-abduction': 1, 'fit-calf-seated': 2 }),
  u1: fit('u1', 'U1 Spate, piept, umeri', 'spate, piept, umeri', { 'fit-lat': 2, 'fit-chest-press': 2, 'fit-row': 2, 'fit-lateral': 2, 'fit-triceps': 1, 'fit-biceps': 1 }),
  u2: fit('u2', 'U2 Partea superioară și trunchi', 'partea superioară și trunchi', { 'fit-cable-row': 2, 'fit-incline': 2, 'fit-shoulder': 2, 'fit-rev-fly': 2, 'fit-pallof': 2, 'fit-carry': 2 }),
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

function fit(id: FitnessSessionId, name: string, focus: string, dose: Record<string, number>): StrengthSession {
  return { id, name, focus, exercises: Object.keys(dose), completions: [], dose: Object.fromEntries(Object.entries(dose).map(([k, n]) => [k, { sets: n }])) };
}

export const FITNESS_ROTATION: Record<2 | 3 | 4, FitnessSessionId[]> = { 2: ['f1', 'f2'], 3: ['a3', 'b3', 'c3'], 4: ['l1', 'u1', 'l2', 'u2'] };
export const FITNESS_ROTATION_WIDE: FitnessSessionId[] = ['fa', 'fb', 'fc', 'fd'];
export const isFitnessSession = (id: SessionId): id is FitnessSessionId => ['f1', 'f2', 'a3', 'b3', 'c3', 'l1', 'l2', 'u1', 'u2', 'fa', 'fb', 'fc', 'fd'].includes(id);

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
  acomodare: 'înveți aparatele, respirația și execuția; fără epuizare',
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
  if (isFitnessSession(spec.session)) return spec.block === 'acomodare' || spec.recovery ? '3–4' : '2–3';
  if (spec.block === 'acomodare') return spec.week <= 2 ? '3–4' : '3';
  if (spec.block === 'precursa') return '3–4';
  if (spec.block === 'mentinere') return '3';
  if (spec.recovery) return '3';
  if (spec.block === 'baza' && spec.week === 1) return '3';
  return '2–3';
}

/** Durata (s) a unui exercițiu: fiecare set = lucru + pauză; la unilateral, ambele părți. */
function itemSec(r: Rx): number {
  // Unilateral: o serie = ambele părți (lucru × 2) + schimbarea părții (~15 s); pauza vine după ambele.
  return r.sets * (WORK_SEC * (r.ex.unilateral ? 2 : 1) + (r.ex.unilateral ? SIDE_SWITCH_SEC : 0) + r.rest);
}
const SIDE_SWITCH_SEC = 15;

/** La fitness, schimbarea și reglarea aparatului și seriile de acomodare la fiecare exercițiu (~1,5 min). */
const FIT_SETUP_SEC = 90;

export function estimateMinutes(items: Rx[]): number {
  const setup = items.filter((r) => r.ex.id.startsWith('fit-')).length * FIT_SETUP_SEC;
  return WARMUP_MIN + (items.reduce((n, r) => n + itemSec(r), 0) + setup) / 60;
}

/** Prescripția întreagă pentru blocul și săptămâna date, fără limită de timp. */
export function prescribeFull(spec: StrengthSpec): Prescription {
  if (isFitnessSession(spec.session)) return prescribeFitness(spec);
  const session = SESSIONS[spec.session];
  const rir = rirFor(spec);
  const notes: string[] = [];
  const isPpl = !spec.session.startsWith('full');
  const ids = sessionExercises(session, spec.variant ?? 0);
  let items: Rx[] = ids.map((id, k) => {
    const ex = CATALOG[id]!;
    return { ex, sets: ex.sets, reps: ex.reps, rir, rest: REST[ex.role], ...(session.slots && k === ids.length - 1 && ex.region === 'core' ? { optional: true, note: 'opțional' } : {}) };
  });

  // Din bază, la Legs: două seturi din prima mișcare devin lucru unilateral (fandare / treaptă), fără volum în plus.
  if (session.legSwap && spec.block !== 'acomodare' && spec.block !== 'mentinere' && spec.block !== 'precursa') {
    const first = items[0]!;
    first.sets = Math.max(1, first.sets - 2);
    const sw = CATALOG[session.legSwap]!;
    items.splice(1, 0, { ex: sw, sets: 2, reps: sw.reps, rir, rest: REST.main, note: 'dacă e tolerat; altfel rămân seturile de la prima mișcare' });
  }

  // Pliometria (Llanos-Lagos și colab. 2024: forța grea + pliometria îmbunătățesc economia de alergare): la tot corpul,
  // din blocurile cu accent pe forță / integrare, imediat după încălzire, cu volum mic; nu cu picioarele protejate.
  if (!isPpl && (spec.block === 'forta' || spec.block === 'integrare' || spec.block === 'consolidare') && (spec.legs ?? 'normal') === 'normal') {
    const pg = CATALOG['legs-pogo']!;
    items.unshift({ ex: pg, sets: 2, reps: pg.reps, rir: rir, rest: 60, note: 'înaintea greutăților, cât ești proaspăt' });
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
  if (spec.block === 'forta' && items[0]?.reps === '5–8') notes.push('la primul exercițiu: greutate mai mare, 5–8 repetări, doar dacă execuția rămâne curată; altfel rămâi la repetările obișnuite');
  if (spec.block === 'acomodare') notes.push('fără istoric de greutăți: prima dată alegi greutatea din mers — una cu care faci repetările cerute și simți că mai puteai câteva');
  if (spec.block === 'evaluare') notes.push('compari cu data trecută: la aceeași greutate, câte repetări îți ies acum');

  // Descărcarea din planul de anduranță: aproximativ o treime din seturi mai puțin, efort mai moderat.
  if (spec.recovery) {
    for (const r of items) r.sets = Math.max(1, Math.round((r.sets * 2) / 3));
    notes.push('săptămână mai ușoară: cu o treime mai puține serii');
  }

  // Picioarele: ușoare înaintea unei ședințe-cheie, deloc în ultimele 10 zile dinaintea cursei.
  if (spec.legs === 'fara') {
    items = items.filter((r) => r.ex.region !== 'legs');
    notes.push('fără picioare: e aproape cursa');
  } else if (spec.legs === 'usor') {
    for (const r of items) if (r.ex.region === 'legs') {
      r.sets = 1;
      r.rir = '4';
    }
    notes.push('picioare ușoare: mâine ai un antrenament important');
  }

  if (session.slots) {
    notes.push('exercițiile se schimbă de la o ședință la alta; un exercițiu revine cam la a treia ședință de același tip, iar atunci pornești de la greutatea notată data trecută');
    if (spec.block !== 'acomodare' && spec.block !== 'mentinere' && spec.block !== 'precursa') notes.push('cum crești: când faci numărul maxim de repetări la toate seriile, pui greutatea imediat următoare data viitoare când revine exercițiul');
  }
  return { spec, session, items, minutes: roundUp5(estimateMinutes(items)), trimmed: [], notes };
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;

/**
 * Fitness: doza din tabelul ședinței, ajustată pe etapă.
 *  - ședințele standard (F, A3–C3, L/U): acomodare cu o serie în prima săptămână, apoi două la principale și una la
 *    accesorii; prima săptămână cu mai multe zile: accesoriile la o serie;
 *  - varianta amplă (A–D): săpt. 1–4 două serii pe exercițiu (rezervă 3–4), de la săpt. 5 doza de construire;
 *  - săpt. 13–16 (consolidare): varietate controlată, câte un exercițiu schimbat cu unul asemănător, cu greutatea căutată din nou;
 *  - menținere: fără escaladare; în ultimele două săptămâni, exercițiile cu trei serii trec la două (testezi doza de
 *    menținere);
 *  - revizuire (doar când datele arată oboseală): o treime din serii mai puțin și rezervă mai mare.
 */
function prescribeFitness(spec: StrengthSpec): Prescription {
  const session = SESSIONS[spec.session];
  const rir = rirFor(spec);
  const notes: string[] = [];
  const wide = isWideSession(spec.session);
  let ids = [...session.exercises];
  let swapped: [string, string] | null = null;
  if (spec.block === 'consolidare') {
    const sw = FITNESS_SWAPS.find(([from, to]) => ids.includes(from) && !ids.includes(to));
    if (sw) {
      ids = ids.map((x) => (x === sw[0] ? sw[1] : x));
      swapped = sw;
    }
  }
  const items: Rx[] = ids.map((id) => {
    const ex = CATALOG[id]!;
    const d = session.dose?.[swapped && id === swapped[1] ? swapped[0] : id];
    return { ex, sets: d?.sets ?? ex.sets, reps: d?.reps ?? ex.reps, rir, rest: d?.rest ?? ex.rest ?? REST[ex.role] };
  });
  if (swapped) notes.push(`varietate controlată: ${CATALOG[swapped[1]]!.name.toLowerCase()} în loc de ${CATALOG[swapped[0]]!.name.toLowerCase()}; cauți din nou greutatea (kilogramele nu se transferă de la un exercițiu la altul)`);
  if (spec.block === 'acomodare') {
    if (wide) {
      for (const r of items) r.sets = 2;
      notes.push(spec.week <= 2 ? 'învățare: două serii pe exercițiu, oprindu-te când mai aveai 3–4 repetări; notează setările aparatelor' : 'consolidare: rămân două serii; progresezi în control și repetări');
    } else if (spec.week === 1) {
      for (const r of items) r.sets = 1;
      notes.push('prima săptămână: o serie pe exercițiu poate fi suficientă; notează setările aparatelor');
    } else {
      for (const r of items) if (r.ex.role !== 'main') r.sets = 1;
      if (spec.week === 2) notes.push('două serii la exercițiile principale doar dacă prima săptămână a mers bine');
    }
    notes.push('fără istoric de greutăți: alegi greutatea cu care faci intervalul fără să mergi până la limită');
  } else if (spec.transition) {
    for (const r of items) if (r.ex.role !== 'main') r.sets = 1;
    notes.push(wide ? 'prima săptămână cu patru ședințe A–D: accesoriile la o serie; doza de construire vine după, dacă merge bine' : 'prima săptămână cu mai multe zile: accesoriile la o serie; volumul crește apoi, nu dintr-odată');
  }
  if (spec.block === 'mentinere') {
    if (spec.len - spec.week < 2) {
      for (const r of items) if (r.sets >= 3) r.sets = 2;
      notes.push('test de menținere: o serie mai puțin la exercițiile cu trei serii; urmărești dacă performanța se păstrează');
    } else notes.push('stabilizare: păstrezi performanța, nu trebuie să crești');
  }
  if (spec.recovery) {
    for (const r of items) r.sets = Math.max(1, Math.round((r.sets * 2) / 3));
    for (const r of items) r.rir = '3–4';
    notes.push('revizuire: oboseala sau performanța în scădere au cerut mai puține serii și oprit mai departe de limită, temporar');
  }
  if (spec.block !== 'acomodare' && spec.block !== 'mentinere') notes.push('cum crești: când faci numărul maxim de repetări la toate seriile, de două ori la rând, pui greutatea imediat următoare');
  return { spec, session, items, minutes: roundUp5(estimateMinutes(items)), trimmed: [], notes };
}

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
  removeWhere((r) => !!r.optional, (r) => r.ex.name.toLowerCase());
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
  // Tot nu încape: pleacă întâi a doua mișcare de același tip (picioare / împins / tras), ca o ședință de tot corpul
  // să păstreze câte o mișcare din fiecare; abia apoi ultimele, câte încap (minimum una).
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
  const notes = [...p.notes];
  if (trimmed.length) notes.push(`ca să încapă în ${minutes} min, azi sari peste: ${trimmed.join(', ')} (pauzele rămân întregi)`);
  return { ...p, items, minutes: roundUp5(estimateMinutes(items)), trimmed, notes };
}

// ——— Textul din plan (citit de oameni și de cod) ———

const LEGS_TEXT: Record<Exclude<LegsMode, 'normal'>, string> = { usor: 'picioare ușoare', fara: 'fără picioare' };

/** „Push A · Bază, săpt. 2/4 · 2–3 repetări în rezervă · descărcare”. */
export function strengthStructure(spec: StrengthSpec): string {
  const parts = [SESSIONS[spec.session].name, ...(isSplitSession(spec.session) ? [`varianta ${(spec.variant ?? 0) + 1}`] : []), `${BLOCK_LABEL[spec.block]}, săpt. ${spec.week}/${spec.len}`, `${rirFor(spec)} repetări în rezervă`];
  if (spec.recovery) parts.push('descărcare');
  if (spec.transition) parts.push('trecere');
  if (spec.legs && spec.legs !== 'normal') parts.push(LEGS_TEXT[spec.legs]);
  return parts.join(' · ');
}

export function parseStrength(structure: string | null | undefined): StrengthSpec | null {
  if (!structure) return null;
  const parts = structure.split(' · ');
  const session = (Object.values(SESSIONS).find((s) => s.name === parts[0]) ?? null)?.id;
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
  return { session, block, week: Number(m[2]), len: Number(m[3]), recovery: rest.includes('descărcare'), legs, ...(rest.includes('trecere') ? { transition: true } : {}), ...(variant != null ? { variant } : {}) };
}

/** Numele ședinței din textul din plan (și pentru planurile vechi „Push 1 · …”). */
export function sessionName(structure: string | null | undefined): string | null {
  const s = parseStrength(structure);
  if (s) return SESSIONS[s.session].name;
  const first = (structure ?? '').split(' · ')[0] ?? '';
  return /^(Push|Pull|Picioare|Brațe|Legs|Tot corpul|[FABCLU][1-3] |[ABCD] (Picioare|Superior|Fesieri))/.test(first) ? first : null;
}

export const STRENGTH_RULES: { t: string; d: string }[] = [
  { t: 'Cât de greu', d: 'Te oprești din serie când mai aveai încă 2–3 repetări bune în tine (la început 3–4). Nu mergi până nu mai poți ridica deloc.' },
  { t: 'Încălzire', d: '5–8 minute de mișcare ușoară, apoi 1–2 serii ușoare la primul exercițiu. Ele nu se numără.' },
  { t: 'Pauze', d: 'Cam 2–3 minute la primele exerciții (cele grele) și 1–2 minute la restul. Dacă încă gâfâi, mai stai puțin.' },
  { t: 'Cum crești', d: 'Notezi greutatea și repetările. Data viitoare încerci o repetare în plus. Când faci numărul maxim de repetări la toate seriile, pui greutatea imediat următoare.' },
  { t: 'Exerciții diferite', d: 'Push, Pull și Picioare au de fiecare dată alte exerciții sau alte aparate. Fiecare exercițiu revine cam la a treia ședință de același tip; kilogramele de la un aparat nu se transferă la altul.' },
  { t: 'Când scazi', d: 'Dacă nu mai iese numărul minim de repetări sau se strică execuția, scazi greutatea. Nu crești în aceeași zi și greutatea, și numărul de serii.' },
  { t: 'Durere', d: 'Durere nouă sau ascuțită: oprești exercițiul și spui în formularul de seară. Durere în piept, amețeală sau lipsă de aer neobișnuită: te oprești și mergi la medic.' },
];
