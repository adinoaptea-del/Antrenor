// BIBLIOTECA DE ANTRENAMENTE a antrenorilor pe sport. Metode cunoscute și folosite în practica antrenorilor de
// amatori, cu numele lor, scopul, când se folosesc (fază) și cum se dozează. Antrenorul (agentul) alege de aici, adaptat
// la nivelul și obiectivul sportivului; nu inventează structuri și nu „împrumută” ședințe din alt sport.
//
// Sursele de principiu (nu citate la fiecare rând): Jack Daniels (zonele E/M/T/I/R, „Daniels' Running Formula”),
// Pete Pfitzinger („Faster Road Racing”, „Advanced Marathoning”: ieșirile lungi cu ritm de maraton, tempo-urile),
// Renato Canova (bucăți lungi la ritm de cursă ±, pentru maraton), Bart Yasso (800-urile pentru maraton),
// NTNU/Helgerud 2007 (4×4 la 90–95% FCmax), Stephen Seiler (distribuția polarizată 80/20), Swim Smooth (CSS și seturile
// pe CSS), Joe Friel („The Triathlete's Training Bible”: zonele pe bicicletă, brick-urile), Andy Coggan (sweet spot,
// 88–94% FTP), Hunter Allen & Coggan (zonele de putere). Ce nu e aici nu e „interzis”, dar antrenorul trebuie să spună
// de unde vine și de ce e potrivit acum.

import type { Phase, Sport } from '../types.js';
import type { GoalKind } from '../calendar/phases.js';

export interface LibraryWorkout {
  id: string;
  sport: Exclude<Sport, 'forta'>;
  nume: string;
  /** Metoda sau autorul de la care vine. */
  sursa: string;
  /** Ce dezvoltă. */
  scop: string;
  /** Pentru ce obiective are sens. */
  obiective: ('5k' | '10k' | 'semimaraton' | 'maraton' | 'tri' | 'inot' | 'bike')[];
  /** În ce faze se folosește. */
  faze: Phase[];
  /** Cum se face, scris pentru sportiv (cu ritmurile ca referințe la zonele/ritmul lui, nu cifre fixe). */
  cum: string;
  /** Doza și progresia, pe scurt. */
  doza: string;
  /** Când NU se dă. */
  nu_cand?: string;
}

export const WORKOUT_LIBRARY: LibraryWorkout[] = [
  // ——— ALERGARE ———
  { id: 'run-strides', sport: 'alergare', nume: 'Accelerări (strides)', sursa: 'Daniels (R pace), practică generală', scop: 'economie de alergare, viteză de picioare, fără oboseală', obiective: ['5k', '10k', 'semimaraton', 'maraton', 'tri'], faze: ['evaluare', 'baza1', 'baza2', 'build', 'peak', 'taper'], cum: 'La finalul unei alergări ușoare: 4–8 × 20 s accelerat progresiv până la ritm de 1.500 m, nu sprint; mers/trap 60 s între.', doza: 'de 1–2 ori pe săptămână, tot anul; nu se numără ca intensitate.' },
  { id: 'run-progression', sport: 'alergare', nume: 'Alergare progresivă', sursa: 'practica antrenorilor (Canova „progressive run”)', scop: 'rezistență la ritm fără stresul intervalelor', obiective: ['5k', '10k', 'semimaraton', 'maraton', 'tri'], faze: ['baza1', 'baza2'], cum: 'Primele două treimi ușor (Z2), apoi ritmul crește treptat până la ritm de semimaraton (Z3) în ultimele 10–15 min. Nu se termină în sprint.', doza: 'o dată la două săptămâni în bază; 40–60 min.' },
  { id: 'run-tempo', sport: 'alergare', nume: 'Tempo (prag)', sursa: 'Daniels (T pace ≈ ritmul pe o oră de cursă)', scop: 'pragul lactic: ritmul pe care-l ții mult', obiective: ['10k', 'semimaraton', 'maraton', 'tri'], faze: ['baza1', 'baza2', 'build'], cum: '20–40 min continuu la ritm de prag (Z3–Z4, „confortabil de greu”, poți spune 2–3 cuvinte), sau 2–3 × 10–15 min cu 2–3 min ușor între (cruise intervals).', doza: 'o dată pe săptămână; de la 20 min continuu spre 40, sau de la 2×10 la 3×15.' },
  { id: 'run-fartlek', sport: 'alergare', nume: 'Fartlek pe timp', sursa: 'școala scandinavă; varianta Sang (pauza la trap)', scop: 'intensitate variată, controlată, fără pistă', obiective: ['5k', '10k', 'semimaraton', 'tri'], faze: ['baza2', 'build'], cum: '8 × 3 min tare (Z3–Z4), 1 min trap ușor între; pauza nu e oprire. Prima repetare puțin mai ușor, ultimele cele mai bune.', doza: 'o dată pe săptămână în baza2, alternând cu tempo-ul.' },
  { id: 'run-4x4', sport: 'alergare', nume: '4×4 norvegian', sursa: 'NTNU, Helgerud et al. 2007', scop: 'VO2max (motorul)', obiective: ['5k', '10k', 'semimaraton', 'tri'], faze: ['build', 'peak'], cum: '4 × 4 min la 90–95% din FCmax (Z5, „nu poți vorbi”), 3 min trap ușor între; încălzire 10–15 min, revenire 10 min.', doza: 'o dată pe săptămână, cel mult 8–10 săptămâni la rând; apoi pauză de VO2max.', nu_cand: 'fără aviz cardiologic; peste 55 de ani se preferă pragul (Z4).' },
  { id: 'run-5k-reps', sport: 'alergare', nume: 'Repetări la ritm de 5 km', sursa: 'Daniels (I pace), practica de 5 km', scop: 'ritmul de cursă pe 5 km devine „normal”', obiective: ['5k'], faze: ['build', 'peak'], cum: '5–6 × 1.000 m (sau 6 × 3 min) la ritmul-țintă de 5 km, 2 min trap ușor între; în peak 4 × 4 min la același ritm, 3 min între.', doza: 'o dată pe săptămână, alternând cu tempo-ul; volumul la ritm de cursă 4–6 km pe ședință.' },
  { id: 'run-10k-reps', sport: 'alergare', nume: 'Bucăți la ritm de 10 km', sursa: 'Pfitzinger („Faster Road Racing”), Daniels (I/T)', scop: 'rezistență la ritmul de 10 km', obiective: ['10k'], faze: ['build', 'peak'], cum: '4 × 6 min (≈ 1,5 km) la ritmul-țintă de 10 km, 2 min ușor între; în peak 3 × 8 min, 3 min între; sau 5 × 1 km cu 90 s.', doza: 'o dată pe săptămână; 6–8 km la ritm de cursă pe ședință la vârf.' },
  { id: 'run-hm-blocks', sport: 'alergare', nume: 'Bucăți la ritm de semimaraton', sursa: 'Pfitzinger, Canova', scop: 'ritmul de semimaraton ținut mult', obiective: ['semimaraton'], faze: ['build', 'peak'], cum: '3 × 12 min la ritm de semimaraton, 3 min ușor între; spre peak 2 × 20 min sau 3 × 15.', doza: 'o dată pe săptămână; până la 10–12 km la ritm de cursă pe ședință.' },
  { id: 'run-mp-long', sport: 'alergare', nume: 'Ieșirea lungă cu ritm de maraton', sursa: 'Pfitzinger („Advanced Marathoning”), Canova', scop: 'specific maraton: ritm de cursă pe picioare obosite', obiective: ['maraton'], faze: ['build', 'peak'], cum: 'Ieșire lungă ușoară cu ultimele 30 min (spre peak 40–60 min, sau 2 × 20 min) la ritm de maraton. Hrănire ca în cursă.', doza: 'la două săptămâni; cea mai lungă ieșire 30–32 km / cel mult 3 h.' },
  { id: 'run-yasso', sport: 'alergare', nume: 'Yasso 800', sursa: 'Bart Yasso', scop: 'reper pentru maraton, viteză controlată', obiective: ['maraton'], faze: ['build', 'peak'], cum: '10 × 800 m în „minutele:secundele” timpului-țintă de maraton (3:30 h → 3:30 min pe 800 m), cu pauză egală la trap. Se pornește de la 4–5 repetări.', doza: 'o dată la două săptămâni; 10 repetări la vârf.' },
  { id: 'run-long-alt', sport: 'alergare', nume: 'Ieșirea lungă alternată', sursa: 'practica Sang (scalată)', scop: 'volum fără oboseală cumulată', obiective: ['5k', '10k', 'semimaraton', 'maraton', 'tri'], faze: ['baza1', 'baza2', 'build', 'peak'], cum: 'O săptămână ieșirea e scurtă și constantă (~85%), următoarea plină, cu finalul progresiv (ultimele 15–20 min în partea de sus a Z2). Nu se pornește tare.', doza: '+10 min pe săptămâna „plină”; plafonul fazei nu se depășește.' },
  { id: 'run-hills', sport: 'alergare', nume: 'Repetări în deal', sursa: 'Lydiard (hill phase), practică generală', scop: 'forță specifică, economie, fără impactul vitezei pe plat', obiective: ['5k', '10k', 'semimaraton', 'maraton', 'tri'], faze: ['baza1', 'baza2'], cum: '6–10 × 45–60 s în urcare moderată (5–7%), efort de Z4, coborâre la pas/trap ca pauză. Postură dreaptă, pas scurt.', doza: 'o dată pe săptămână în bază, în locul fartlek-ului; 6 → 10 repetări.', nu_cand: 'tendon ahilean sau gambă sensibile.' },
  // ——— ÎNOT ———
  { id: 'swim-technique', sport: 'inot', nume: 'Un element de tehnică', sursa: 'Swim Smooth, Total Immersion (principii)', scop: 'o singură corecție până apare în date', obiective: ['inot', 'tri'], faze: ['evaluare', 'baza1', 'baza2', 'build', 'peak', 'taper'], cum: 'Încălzire ușoară, apoi 8–12 × 50 m cu UN accent (expir complet sub apă; cap jos, șolduri sus; întinderea brațului înainte; respirație bilaterală), pauză 20 s. Finalul 200 m liber, ușor.', doza: 'fiecare ședință de înot are un element; același 2–3 săptămâni.' },
  { id: 'swim-linked', sport: 'inot', nume: 'Bucăți legate (spre 400 m fără oprire)', sursa: 'progresia pentru începători, practică', scop: 'a înota continuu, fără panică, până la 400 m', obiective: ['inot', 'tri'], faze: ['evaluare', 'baza1', 'baza2'], cum: 'Seturi de lungimea pe care o ții acum fără oprire (ex. 75 m), pauză până respiri liniștit; ultimul set încearcă +25 m. Ritm lent, respirație expirată complet.', doza: 'de 2–3 ori pe săptămână; +25–50 m la distanța legată, pe săptămână.' },
  { id: 'swim-css-test', sport: 'inot', nume: 'Testul CSS', sursa: 'Swim Smooth (Critical Swim Speed)', scop: 'ritmul de prag la înot, pentru seturi', obiective: ['inot', 'tri'], faze: ['evaluare', 'baza2', 'build'], cum: 'Încălzire; 400 m cât de tare poți constant; 5 min pauză; 200 m cât de tare poți. CSS (s/100 m) = (T400 − T200) / 2.', doza: 'la 6–8 săptămâni, doar dacă înoți 400 m fără oprire.' },
  { id: 'swim-css-set', sport: 'inot', nume: 'Set CSS', sursa: 'Swim Smooth', scop: 'prag și ritm constant', obiective: ['inot', 'tri'], faze: ['baza2', 'build', 'peak'], cum: '10 × 100 m la ritmul CSS cu 15 s pauză (sau 6 × 200 m cu 20 s); ritmul egal de la prima la ultima repetare, nu „tare apoi moale”.', doza: 'o dată pe săptămână; 1.000 → 1.600 m la CSS.', nu_cand: 'fără 400 m continuu; fără aviz cardiologic.' },
  { id: 'swim-pyramid', sport: 'inot', nume: 'Piramidă aerobă', sursa: 'practică generală', scop: 'rezistență cu variație', obiective: ['inot', 'tri'], faze: ['baza1', 'baza2', 'build'], cum: '100-200-300-200-100 m la ritm ușor-moderat (CSS + 10 s/100 m), pauză 20–30 s. Respirație la 3 brațe.', doza: 'o dată pe săptămână în locul înotului continuu, când ședința e monotonă.' },
  { id: 'swim-long', sport: 'inot', nume: 'Înotul lung continuu', sursa: 'practică generală', scop: 'distanța obiectivului fără oprire, ritm constant', obiective: ['inot', 'tri'], faze: ['baza2', 'build', 'peak'], cum: 'Cea mai lungă bucată de până acum + 100 m, ritm ușor (CSS + 10–15 s/100 m), apoi 200 m ușor. Spre peak: distanța obiectivului (sau de cursă) dintr-o bucată.', doza: 'o dată pe săptămână; +100 m sau +5 min pe săptămână.' },
  { id: 'swim-ow', sport: 'inot', nume: 'Ape libere: orientare și start', sursa: 'practica triatlonului', scop: 'confort în apă deschisă', obiective: ['inot', 'tri'], faze: ['build', 'peak'], cum: 'Doar însoțit: 3 × 300 m cu privire la 6 brațe spre un reper; 4 × 50 m start cu accelerare 15 brațe apoi ritm. Costumul neopren de probă.', doza: 'de 2–4 ori înainte de cursă, când apa permite.', nu_cand: 'singur, fără geamandură sau însoțitor.' },
  // ——— BICICLETĂ ———
  { id: 'bike-z2', sport: 'bicicleta', nume: 'Tura ușoară cu cadență', sursa: 'Friel, Seiler (baza polarizată)', scop: 'baza aerobă și economia de pedalare', obiective: ['bike', 'tri'], faze: ['evaluare', 'baza1', 'baza2', 'build', 'peak', 'taper'], cum: '60–90 min Z2 (poți vorbi), cadență 90–100; opțional 6 × 1 min la cadență 110 (fără să sari în șa).', doza: 'de 1–2 ori pe săptămână, tot anul.' },
  { id: 'bike-sst', sport: 'bicicleta', nume: 'Sweet spot', sursa: 'Coggan (88–94% FTP)', scop: 'FTP cu oboseală mică', obiective: ['bike', 'tri'], faze: ['baza2', 'build'], cum: '2–3 × 10–20 min la 88–94% FTP (Z3 sus, „greu dar stabil”), 5 min ușor între; fără putere: pulsul de prag minus 5–10 bătăi.', doza: 'o dată pe săptămână; 3×10 → 2×20 → 3×15.' },
  { id: 'bike-threshold', sport: 'bicicleta', nume: 'Prag (FTP)', sursa: 'Allen & Coggan', scop: 'puterea pe o oră', obiective: ['bike', 'tri'], faze: ['build'], cum: '2 × 15–20 min la 95–100% FTP (Z4), 5 min ușor între. Cadență naturală, poziție de cursă.', doza: 'o dată pe săptămână în build; nu lângă 4×4 la alergare în aceeași zi.', nu_cand: 'fără aviz cardiologic.' },
  { id: 'bike-over-under', sport: 'bicicleta', nume: 'Over-under', sursa: 'practica antrenorilor de ciclism', scop: 'toleranță la variațiile de ritm (dealuri, vânt)', obiective: ['bike', 'tri'], faze: ['build', 'peak'], cum: '3 × 9 min: alternezi 2 min la 95% FTP cu 1 min la 105% FTP, 5 min ușor între.', doza: 'o dată la două săptămâni în locul pragului.', nu_cand: 'fără aviz cardiologic.' },
  { id: 'bike-vo2', sport: 'bicicleta', nume: '4×4 pe bicicletă', sursa: 'NTNU (adaptat la bicicletă)', scop: 'VO2max', obiective: ['bike', 'tri'], faze: ['peak'], cum: '4 × 4 min la 110–120% FTP (Z5), 3 min ușor între.', doza: 'o dată pe săptămână, 4–6 săptămâni.', nu_cand: 'fără aviz cardiologic; peste 55 de ani se preferă pragul.' },
  { id: 'bike-long', sport: 'bicicleta', nume: 'Tura lungă cu hrănire', sursa: 'Friel', scop: 'rezistență și hrănirea din cursă', obiective: ['bike', 'tri'], faze: ['baza1', 'baza2', 'build', 'peak'], cum: 'Z2 constant, 60–90 g carbohidrați pe oră după prima oră, 500–750 ml lichid pe oră; ultimele 20 min la ritmul-obiectiv.', doza: '+15 min pe săptămână; plafonul fazei nu se depășește.' },
  { id: 'bike-brick', sport: 'bicicleta', nume: 'Brick (bicicletă + alergare)', sursa: 'Friel, practica triatlonului', scop: 'picioarele învață să alerge după bicicletă', obiective: ['tri'], faze: ['baza2', 'build', 'peak'], cum: 'Tura lungă Z2, apoi alergare în cel mult 10 min: 15 → 45 min, primele 5 min ușor, cadență înaltă.', doza: 'la 1–2 săptămâni din baza2; 15 → 45 min alergare.' },
];

/** Biblioteca potrivită unui sport, unui fel de obiectiv și unei faze — textul pe care îl primește antrenorul. */
export function libraryFor(sport: Sport, kind: GoalKind | null, goal: string | null, phase: Phase): LibraryWorkout[] {
  if (sport === 'forta') return [];
  const tag = kind === 'tri' ? 'tri' : kind === 'swim' ? 'inot' : kind === 'bike' ? 'bike' : (goal as '5k' | '10k' | 'semimaraton' | 'maraton' | null);
  return WORKOUT_LIBRARY.filter((w) => w.sport === sport && w.faze.includes(phase) && (tag ? w.obiective.includes(tag) : true));
}

export function libraryText(items: LibraryWorkout[]): string {
  if (!items.length) return '';
  return items.map((w) => `- ${w.nume} (${w.sursa}) — ${w.scop}. Cum: ${w.cum} Doza: ${w.doza}${w.nu_cand ? ` NU când: ${w.nu_cand}` : ''}`).join('\n');
}
