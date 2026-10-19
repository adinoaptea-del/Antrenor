// Fișa (contractul) fiecărui modul din bibliotecă: cine îl poate primi, ce tip de dovadă îl susține, ce îl înlocuiește
// când sportivul nu e eligibil sau ziua nu permite, și cum se judecă execuția. Sunt CERINȚE DE PRODUS AIRON care fac
// deciziile verificabile — nu praguri medicale validate.
//
// Tipul dovezii: „cercetare” = studiu controlat / review (populația studiului poate diferi de sportiv!); „ghid” =
// recomandare de antrenorat sau a unei organizații; „regula” = regulă internă AIRON (decizie de proiectare).
// Testul tests/contracts.test.ts verifică faptul că fiecare modul din bibliotecă are fișă.

export interface ModuleContract {
  versiune: string;
  revizuit: string;
  dovada: 'cercetare' | 'ghid' | 'regula';
  /** Populația pentru care e gândit / studiat. */
  populatie: string;
  /** Condițiile de eligibilitate (nivel, istoric, capacitate, restricții). Ce lipsește → alternativa. */
  eligibil: string;
  /** Varianta mai simplă, verificată în contextul zilei (nu aleasă orbește). */
  alternativa: string;
  /** Cum se judecă execuția față de scop (nu „mai tare = mai bine”). */
  evaluare: string;
}

const V = '1.1';
const R = '2026-10-19';
const c = (dovada: ModuleContract['dovada'], populatie: string, eligibil: string, alternativa: string, evaluare: string): ModuleContract => ({ versiune: V, revizuit: R, dovada, populatie, eligibil, alternativa, evaluare });

const EASY_EVAL = 'făcută dacă durata e aproape de plan și efortul a rămas conversațional; mai rapid nu e mai bine.';
const QUALITY_EVAL = 'făcută dacă repetările au fost la efortul cerut și ultimele nu s-au destrămat; peste țintă = prea tare, nu mai bine.';

export const CONTRACTS: Record<string, ModuleContract> = {
  // ——— Alergare ———
  'run-strides': c('ghid', 'alergători de orice nivel cu alergare ușoară tolerată', 'alergare ușoară de cel puțin 20 min tolerată; fără durere la impact', 'alergarea ușoară fără accelerări', 'relaxate, nu sprint; pulsul poate urca scurt — contează forma.'),
  'run-progression': c('ghid', 'alergători cu bază (≥ 3 ieșiri/săptămână)', 'bază stabilă de 3–4 săptămâni; fără restricție la Z2', 'alergare ușoară constantă', 'finalul controlat, fără sprint; dacă finalul a fost maximal, data viitoare mai prudent.'),
  'run-tempo': c('ghid', 'alergători antrenați (Daniels)', 'cel puțin o ședință controlată (T1) tolerată; intensitate permisă', 'T1 fragmentat sau ușor', QUALITY_EVAL),
  'run-fartlek': c('ghid', 'alergători recreaționali cu bază', 'bază de 4+ săptămâni; intensitate permisă', 'T1 sau ușor cu accelerări', QUALITY_EVAL),
  'run-walk': c('regula', 'debutanți, revenire după pauză sau accidentare', 'tolerează 30 min de mers', 'mers alert 30 min', 'treapta următoare doar după două expuneri bine tolerate, nu pentru că au trecut zile.'),
  'run-T1': c('regula', 'alergători recreaționali, orice distanță', 'bază stabilă și accelerări tolerate; intensitate permisă', 'ușor cu accelerări', QUALITY_EVAL),
  'run-T2': c('regula', 'alergători care au tolerat T1', 'T1 bine tolerat recent (nu automat săptămâna următoare)', 'T1', QUALITY_EVAL),
  'run-V5': c('regula', 'alergători cu obiectiv 5 km, ramura „timp”', 'bază consecventă, accelerări tolerate, fără restricție Z2; de la 55 de ani plafonat la Z4', 'T1', QUALITY_EVAL),
  'run-V10': c('regula', 'alergători cu obiectiv 10 km, ramura „timp”', 'doza mică (6 × 2 min) tolerată înainte de 4 × 5 min; istoric recent cu repetări similare', 'T2 sau T1', QUALITY_EVAL),
  'run-H': c('regula', 'alergători cu obiectiv semimaraton / triatlon', 'ieșire lungă de ≥ 75 min tolerată; ritm din date, nu cel dorit', 'T2', QUALITY_EVAL),
  'run-M': c('regula', 'alergători cu obiectiv maraton', 'ieșire lungă de ≥ 90 min tolerată; alimentarea exersată', 'T2 sau ieșire lungă ușoară', QUALITY_EVAL),
  'run-D1': c('regula', 'alergători cu ieșire lungă stabilă', 'tolerează 70 min ușor; înlocuiește ieșirea lungă, nu se adaugă', 'ieșirea lungă ușoară', QUALITY_EVAL),
  'run-subT': c('cercetare', 'alergători antrenați (studiile pe sub-prag); la amatori, adaptat', 'bază și tempo tolerat; nu debutanți; intensitate permisă', 'T1', QUALITY_EVAL),
  'run-4x4': c('cercetare', 'adulți sănătoși, moderat antrenați (Helgerud 2007)', 'aviz cardiologic; fără plafon Z4 (vârstă ≥ 55 sau restricție); nu debutanți; nu ramura „finalizare”', 'prag 5 × 6 min (Z4)', 'efortul 9/10 susținut în toate cele 4 repetări; dacă a patra s-a prăbușit, data viitoare mai prudent.'),
  'run-yasso': c('ghid', 'maratoniști cu bază', 'build/peak, alergător cu istoric de intervale', 'M sau T2', QUALITY_EVAL),
  'run-long-alt': c('ghid', 'orice alergător cu bază', 'ieșirea lungă precedentă tolerată; creșterea unei singure ieșiri contează mai mult decât procentul săptămânal (cohorta prospectivă de 5.205 alergători, 2025; asociere, nu prag)', 'ieșire lungă constantă, mai scurtă', EASY_EVAL),
  'run-hills': c('ghid', 'alergători cu bază', 'fără probleme la ahile / gambă; intensitate permisă', 'ușor cu accelerări pe plat', QUALITY_EVAL),
  // ——— Înot ———
  'swim-technique': c('ghid', 'orice înotător', 'fără condiții; segmentele nu depășesc ce înoată fără oprire', '—', 'exercițiile sunt explorare: fără evaluare video nu pretind să corecteze un defect anume.'),
  'swim-linked': c('regula', 'înotători care nu fac încă 400 m fără oprire', 'fiecare segment ≤ distanța demonstrată (+25 m la ultimul)', 'aceleași bucăți, mai scurte', 'contează cea mai lungă porțiune fără oprire, nu metrii totali.'),
  'swim-css-test': c('ghid', 'înotători care fac 400 m fără oprire', '400 m continuu demonstrat; intensitate permisă; NU se mută automat în ape libere', 'înot aerob ușor', 'rezultatul e un reper ESTIMAT și ajustabil, nu ritmul automat de cursă.'),
  'swim-css-set': c('ghid', 'înotători cu CSS', 'CSS testat; repetările ≤ capacitatea continuă', 'set aerob fără ritm', QUALITY_EVAL),
  'swim-css-prog': c('ghid', 'înotători cu CSS', 'setul anterior tolerat; repetările ≤ capacitatea continuă', 'setul anterior', QUALITY_EVAL),
  'swim-pyramid': c('ghid', 'înotători care fac ≥ 100 m fără oprire', 'vârful piramidei ≤ capacitatea continuă', 'repetări scurte ușoare', EASY_EVAL),
  'swim-long': c('regula', 'înotători cu obiectiv de distanță', 'distanța continuă crește cu ~10% față de cea demonstrată; volumul total ≠ cea mai lungă porțiune', 'bucăți legate', 'contează distanța fără oprire atinsă.'),
  'swim-ow': c('ghid', 'triatloniști / înotători de ape libere', 'doar însoțit; temperatura APEI, valurile, curenții, vizibilitatea și supravegherea verificate (nu temperatura aerului)', 'set în bazin cu privire înainte', 'confort și orientare, nu viteză.'),
  // ——— Bicicletă ———
  'bike-z2': c('ghid', 'orice ciclist', 'fără condiții', '—', EASY_EVAL),
  'bike-sst': c('ghid', 'cicliști cu bază', 'bază de 4+ săptămâni; intensitate permisă', 'tură Z2 cu cadență', QUALITY_EVAL),
  'bike-sst-prog': c('ghid', 'cicliști cu bază', 'treapta anterioară tolerată', 'treapta anterioară', QUALITY_EVAL),
  'bike-threshold': c('ghid', 'cicliști antrenați', 'sweet spot tolerat; FTP-ul e ESTIMAT (metodă și dată notate)', 'sweet spot', QUALITY_EVAL),
  'bike-over-under': c('ghid', 'cicliști antrenați', 'prag tolerat; intensitate permisă', 'prag 2 × 12 min', QUALITY_EVAL),
  'bike-vo2': c('cercetare', 'adulți moderat antrenați (adaptat de la alergare)', 'aviz; fără plafon Z4; nu debutanți', 'prag', QUALITY_EVAL),
  'bike-long': c('ghid', 'orice ciclist cu obiectiv de distanță', 'tura precedentă tolerată; încape în cel mai mare bloc liber (altfel se spune)', 'tură mai scurtă, aceeași hrănire', 'hrănirea exersată contează cât durata.'),
  'bike-3015': c('cercetare', '18 cicliști de ELITĂ (Rønnestad 2020) — nu populația amatorilor', 'istoric ≥ 6 h/săpt. sau test de bicicletă; fără plafon Z4; doar peak; opțiune, nu regula fazei', 'ritmul de obiectiv 3 × 15 min', 'dacă puterea scade mult în ultima serie, te oprești.'),
  'bike-brick': c('ghid', 'triatloniști', 'bicicleta și alergarea separat tolerate; alergarea după bicicletă crește doar după expuneri tolerate; nu se lungește ca să umple timpul', 'tura lungă fără alergare', 'primele minute de alergare controlate; tranziția exersată.'),
};
