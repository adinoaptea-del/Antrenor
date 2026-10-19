// Pașii concreți ai unei ședințe, calculați din aceeași structură ca durata din plan.
// Înotul: metri exacți, repetări și pauze; durata e estimată din ritm (și etichetată așa), nu invers.
// Capacitatea (cât înoată fără oprire, declarat sau măsurat) limitează FIECARE segment: încălzirea, setul și revenirea.
// Pragul de înot (CSS) e altceva: fără el nu se dă ritm, dar se poate înota continuu cât a demonstrat sportivul.
// Pauza e „pauză după repetare” (nu „plecare la fiecare N s”): durata se calculează cu ritmul + pauza.
// Alergarea ușoară cu accelerări: accelerările sunt un pas separat, iar minutele lor se scad din partea ușoară, ca
// suma pașilor să rămână durata din plan.

export interface Step {
  label: string;
  text: string;
}

const fmtM = (m: number) => (m >= 1000 ? `${Math.floor(m / 1000)}.${String(m % 1000).padStart(3, '0')}` : String(m));

/** „N accelerări de S s” din structură. */
export function parseStrides(structure: string | null | undefined): { n: number; sec: number } | null {
  const m = /(\d+)\s*accelerări de\s*(\d+)\s*s/.exec(structure ?? '');
  return m ? { n: Number(m[1]), sec: Number(m[2]) } : null;
}

/** Minutele accelerărilor, cu ~1 min ușor după fiecare. */
export const stridesMinutes = (s: { n: number; sec: number }) => Math.ceil((s.n * (s.sec + 60)) / 60);

/** Încălzirea și revenirea alergării ușoare pentru minutele date (aceeași regulă în pași și în rezumat). */
export function easyWarmCool(m: number): { warm: number; cool: number } {
  return { warm: m >= 45 ? 10 : m >= 30 ? Math.max(5, Math.round(m * 0.2)) : Math.floor(m / 3), cool: m >= 30 ? 5 : Math.floor(m / 6) };
}

/**
 * Câte accelerări încap: partea ușoară rămâne cel puțin ~45% din ședință; altfel mai puține (minimum 3) sau deloc.
 * Folosită și la rezumat (structura din plan), și la pași — ca să spună același număr (L-SIM-07).
 */
export function fitStrides(m: number, planned: { n: number; sec: number } | null): { n: number; sec: number } | null {
  if (!planned) return null;
  const { warm, cool } = easyWarmCool(m);
  let s: { n: number; sec: number } | null = planned;
  while (s && s.n > 3 && m - warm - cool - stridesMinutes(s) < Math.ceil(m * 0.45)) s = { ...s, n: s.n - 1 };
  if (s && m - warm - cool - stridesMinutes(s) < Math.ceil(m * 0.45)) s = null;
  return s;
}

export function stridesStep(s: { n: number; sec: number }): Step {
  return { label: 'Accelerări', text: `${s.n} × ${s.sec} s rapid dar relaxat (nu sprint), cu ~1 min trap ușor sau mers între ele` };
}

/** Reperul tehnic al zilei: unul singur, familiar, rotit după dată (variație fără noutate permanentă). */
export function swimCue(date: string): string {
  // Exerciții de explorare, rotite: fără evaluare tehnică nu pretindem că repară un defect anume.
  const cues = ['expiri complet în apă, inspiri scurt lateral, pe partea comodă', 'catch-up: un braț așteaptă celălalt în față', 'alunecare lungă după fiecare braț, corpul drept', 'picioare din șold, glezne relaxate (cu placa dacă ai)'];
  const d = Number(date.slice(8, 10)) || 0;
  return cues[d % cues.length]!;
}

/**
 * Setul de înot pentru minutele din plan. Ritmul ușor: CSS + 15 s/100 m dacă e testat, altfel 2:45/100 m (presupunere
 * prudentă de început, declarată). Întoarce pașii, metrii totali și minutele estimate.
 */
/**
 * Cel mai lung segment fără oprire permis: ce a demonstrat / declarat sportivul. Necunoscut: repetări de 25 m cu pauză
 * (o lungime de bazin) — o structură de familiarizare, NU o capacitate atribuită sportivului.
 */
export function swimMaxSegment(continuousM: number | null | undefined): number {
  if (continuousM == null) return 25;
  return Math.max(25, continuousM);
}

/** Repetarea cea mai potrivită sub capacitate (25 / 50 / 100 / 200 / 400 m). */
const fitRep = (want: number, cap: number) => [400, 200, 100, 50, 25].find((d) => d <= want && d <= cap) ?? 25;

/**
 * Plafonul de volum al setului principal (auditul v2, V2-10): capacitatea pe o repetare nu dovedește toleranța la multe
 * lungimi. Cu volumul recent măsurat (cea mai mare ședință din ultimele 4 săptămâni) — cel mult +10%; fără el, la
 * capacitate mică sau necunoscută, un plafon prudent de produs. Nu umplem toate minutele dintr-un ritm presupus.
 */
export function swimMainCap(cap: number | null, recentMaxM: number | null | undefined): number {
  if (recentMaxM && recentMaxM > 0) return Math.round((recentMaxM * 1.1) / 25) * 25;
  if (cap == null || cap < 100) return 300;
  if (cap < 400) return 600;
  return Infinity;
}

export function swimSet(input: { type: string; minutes: number; css: number | null; date: string; structure?: string | null; continuousM?: number | null; recentMaxM?: number | null }): { steps: Step[]; meters: number; estMin: number } {
  const easy = input.css ? input.css + 15 : 165; // s/100 m
  // Cu CSS testat, 400 m au fost înotați deja fără oprire (testul).
  const cap = swimMaxSegment(input.continuousM ?? (input.css ? 400 : null));
  const budget = Math.max(10, input.minutes) * 60;
  const repSec = (dist: number, rest: number, pace = easy) => (dist / 100) * pace + rest;
  const short = input.minutes < 25;
  // Încălzire și revenire: în bucăți care nu depășesc capacitatea.
  const wd = fitRep(50, cap);
  const warm = { n: short ? 2 : (wd === 25 ? 6 : 4), d: wd, r: wd === 25 ? 20 : 15 };
  const coolTotal = short ? 50 : 100;
  const cd = fitRep(coolTotal, cap);
  const coolN = Math.max(1, Math.round(coolTotal / cd));
  const coolM = coolN * cd;
  let used = warm.n * repSec(warm.d, warm.r) + coolN * repSec(cd, coolN > 1 ? 15 : 0, easy + 15);
  const steps: Step[] = [{ label: 'Încălzire', text: `${warm.n} × ${warm.d} m ușor, ${warm.r} s pauză la perete` }];
  let meters = warm.n * warm.d + coolM;
  const left = Math.max(0, budget - used);

  if (input.continuousM == null && !input.css) {
    steps.push({ label: 'Evaluare', text: 'o dată, ușor: înoți cât poți fără oprire (fără grabă, oprești când obosești) și notezi distanța; ea devine capacitatea ta declarată și de la ea pornesc ședințele. Dacă nu te simți sigur în apă, rămâi la lungimi cu pauză.' });
  }
  const reps = /(\d+) × (\d+) m[^,]*, (\d+) s pauză/.exec(input.structure ?? '');
  const css = input.css;
  if (input.type === 'calitate' && reps) {
    // Setul din plan (progresia săptămânii): repetări, metri, pauză — repetarea nu depășește capacitatea.
    let [n, d, r] = [Number(reps[1]), Number(reps[2]), Number(reps[3])];
    if (d > cap) {
      const d2 = fitRep(d, cap);
      n = Math.max(2, Math.round((n * d) / d2));
      d = d2;
    }
    const pace = css ?? easy - 10;
    used += n * repSec(d, r, pace);
    meters += n * d;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    steps.push({ label: 'Principal', text: `${n} × ${d} m ${css ? `la ${fmt((css * d) / 100)} pe repetare (CSS ${fmt(css)}/100 m, reper ajustabil, nu ritm de cursă automat)` : 'susținut, controlat (efort 6–7 din 10), același ritm la toate'}, ${r} s pauză după fiecare${/obiectiv/.test(input.structure ?? '') ? '; ritmul de cursă' : ''}` });
  } else if (/continuu/.test(input.structure ?? '') && cap >= 400) {
    // Continuitate (auditul v2, V2-09): ținta propusă e cel mult +10% față de capacitatea demonstrată, rotunjită ÎN JOS
    // la lungimea bazinului (25 m) — 800 m → 875 m, nu 900 m (+12,5%). Ținta nu e realizare: dacă te oprești, porțiunea
    // devine fragmentată, iar ce contează e distanța până la prima oprire.
    const room = Math.floor((left / easy) * 100 / 25) * 25;
    const target = Math.floor((cap * 1.1) / 25) * 25;
    const block = Math.max(Math.min(cap, room), Math.min(room, target));
    used += repSec(block, 0);
    meters += block;
    const pct = Math.round(((block - cap) / cap) * 1000) / 10;
    steps.push({ label: 'Principal', text: `țintă propusă: ${block} m continuu (capacitatea demonstrată: ${cap} m${block > cap ? `; +${pct.toLocaleString('ro-RO')}%` : ''}), ușor-moderat, ritm pe care îl poți ține. Dacă te oprești, nu e eșec: notezi distanța până la prima oprire — aia e capacitatea de azi, restul e înot fragmentat` });
    // Timpul rămas: bucăți ușoare de 100–200 m, ca durata să fie cea din plan (volumul total ≠ porțiunea continuă).
    const rest = budget - used;
    const d = fitRep(200, cap);
    const k = Math.floor(rest / repSec(d, 20));
    if (k >= 2) {
      used += k * repSec(d, 20);
      meters += k * d;
      steps.push({ label: 'Apoi', text: `${k} × ${d} m ușor, 20 s pauză după fiecare` });
    }
  } else if (/^piramidă/.test(input.structure ?? '') && cap >= 100) {
    const top = cap >= 300 ? 300 : cap >= 200 ? 200 : 100;
    const half = top >= 300 ? [100, 200] : top >= 200 ? [100] : [50];
    const ladder = [...half, top, ...[...half].reverse()];
    used += ladder.reduce((n, d) => n + repSec(d, 25), 0);
    meters += ladder.reduce((a, b) => a + b, 0);
    steps.push({ label: 'Principal', text: `piramidă ${ladder.join('-')} m, ușor spre moderat${css ? ` (în jur de ${Math.floor((css + 10) / 60)}:${String((css + 10) % 60).padStart(2, '0')}/100 m)` : ''}, 20–30 s pauză după fiecare; respiri cum îți e comod` });
  } else if (input.type === 'tehnica') {
    // Blocuri de 4 × 25 m exercițiu + 4 × 25 m înot cu reperul, 20 s pauză.
    const block = 4 * repSec(25, 20, easy + 20) + 4 * repSec(25, 20);
    const k = Math.max(1, Math.floor(left / block));
    used += k * block;
    meters += k * 200;
    steps.push({ label: 'Tehnică', text: `${k > 1 ? `${k} runde: ` : ''}4 × 25 m exercițiu de explorare (${swimCue(input.date)}), 20 s pauză, apoi 4 × 25 m înot normal păstrând senzația, 20 s pauză. Exercițiile se rotesc; nu corectează un defect anume până nu te vede cineva înotând.` });
  } else if (input.type === 'calitate' && input.css) {
    const d = fitRep(100, cap);
    const rep = repSec(d, 20, input.css);
    const k = Math.max(2, Math.min(20, Math.floor(left / rep)));
    used += k * rep;
    meters += k * d;
    steps.push({ label: 'Principal', text: `${k} × ${d} m la ritmul pragului (${Math.floor(input.css / 60)}:${String(input.css % 60).padStart(2, '0')}/100 m), 20 s pauză după fiecare` });
  } else {
    // Ușor / lung: repetări cât permite capacitatea (cu sau fără CSS); pauza scade când repetarea e mai lungă.
    const d = fitRep(input.css ? 200 : 400, cap);
    const r = d >= 200 ? 20 : d >= 100 ? 15 : 30;
    const byTime = Math.max(2, Math.floor(left / repSec(d, r)));
    const capM = swimMainCap(input.continuousM ?? (input.css ? 400 : null), input.recentMaxM);
    const k = Math.max(2, Math.min(byTime, Math.floor(capM / d)));
    used += k * repSec(d, r);
    meters += k * d;
    steps.push({ label: 'Principal', text: `${k} × ${d} m ușor, ${r} s pauză după fiecare${input.type === 'calitate' ? ' (fără prag de înot testat, nu facem bucăți rapide)' : ''}; poți vorbi după fiecare repetare${k < byTime ? `. Volumul e plafonat la ${k * d} m (${input.recentMaxM ? 'cel mult +10% față de cea mai mare ședință recentă' : 'fără volum recent măsurat'}); dacă tehnica se strică mai devreme, ieși din apă — nu umpli timpul` : ''}` });
  }
  steps.push({ label: 'Revenire', text: coolN > 1 ? `${coolN} × ${cd} m foarte ușor, orice stil, 15 s pauză` : `${coolM} m foarte ușor, orice stil` });
  const estMin = Math.round(used / 60);
  const capNote = input.continuousM == null && !input.css ? ' · capacitatea fără oprire: NECUNOSCUTĂ (nu e declarată sau măsurată); lungimi de 25 m doar ca familiarizare' : ` · cea mai lungă porțiune propusă fără oprire: ${longestSegment(steps)} m`;
  steps.push({ label: 'Total', text: `${fmtM(meters)} m în bazin de 25 m · durata ≈ ${estMin} min, estimată din ritm${input.css ? ' (CSS testat)' : ' (fără test de înot: ritm presupus 2:45/100 m)'}${capNote}` });
  return { steps, meters, estMin };
}

/** Cel mai lung segment fără oprire dintr-un set (pentru verificare și pentru afișare). */
export function longestSegment(steps: Step[]): number {
  let max = 0;
  for (const s of steps) {
    if (s.label === 'Total') continue;
    for (const m of s.text.matchAll(/(\d+)\s*×\s*(\d+)\s*m/g)) max = Math.max(max, Number(m[2]));
    for (const m of s.text.matchAll(/(?:^|[^×\d-])\s*(\d{2,4})\s*m (?:continuu|foarte ușor)/g)) max = Math.max(max, Number(m[1]));
    const pyr = /piramidă ([\d-]+) m/.exec(s.text);
    if (pyr) max = Math.max(max, ...pyr[1]!.split('-').map(Number));
  }
  return max;
}

/**
 * Înotul în ape libere: alt mediu, alte condiții de eligibilitate. Fără test maximal (nu se mută automat din bazin), fără
 * seturi cu perete; porțiunea continuă nu depășește ce ai demonstrat, iar condițiile se verifică înainte de intrare.
 */
export function openWaterSet(input: { type: string; minutes: number; structure?: string | null; continuousM?: number | null }): Step[] {
  if (input.continuousM == null) return [{ label: 'Ape libere', text: 'capacitatea ta fără oprire nu e cunoscută încă: ape libere doar după ce o stabilim în bazin (ședința de evaluare). Până atunci, ședința se face în bazin.' }];
  const cap = swimMaxSegment(input.continuousM);
  const checks = 'înainte să intri: temperatura APEI (nu a aerului), valurile și curentul, vizibilitatea, cine te supraveghează (însoțitor sau salvamar), costumul; dacă una nu e în regulă, faci ședința în bazin.';
  if (/TEST/i.test(input.structure ?? '')) return [{ label: 'Ape libere', text: 'testul de înot se face în bazin, nu în ape libere: acolo distanța și condițiile nu sunt măsurabile.' }, { label: 'Siguranță', text: checks }];
  if (cap < 200) return [{ label: 'Ape libere', text: `încă înoți ${cap} m fără oprire: în ape libere doar lângă mal, unde atingi fundul, cu însoțitor; altfel ședința rămâne în bazin.` }, { label: 'Siguranță', text: checks }];
  // Cât încape în timp la un ritm prudent (2:45/100 m), dar nu peste ce a demonstrat fără oprire.
  const block = Math.min(cap, Math.max(200, Math.round((input.minutes - 15) / 2.75) * 100));
  return [
    { label: 'Încălzire', text: '5 min înot ușor lângă mal, obișnuiești respirația cu apa rece; câteva expirații lungi sub apă' },
    { label: 'Principal', text: `până la ${block} m continuu, ușor-moderat, cu privirea înainte la fiecare 6–9 brațe spre un reper; dacă obosești, te oprești pe spate și respiri (nu e eșec)` },
    { label: 'Exerciții', text: '4 × 15 brațe mai repede, ca la start, apoi revii la ritm (doar dacă te simți sigur)' },
    { label: 'Revenire', text: '3–5 min foarte ușor spre mal' },
    { label: 'Siguranță', text: checks },
  ];
}
