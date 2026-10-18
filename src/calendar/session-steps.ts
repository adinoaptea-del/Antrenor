// Pașii concreți ai unei ședințe, calculați din aceeași structură ca durata din plan.
// Înotul: metri exacți, repetări și pauze; durata e estimată din ritm (și etichetată așa), nu invers. Fără prag
// de înot (CSS) nu se prescrie înot continuu: repetări scurte, cu pauză.
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

export function stridesStep(s: { n: number; sec: number }): Step {
  return { label: 'Accelerări', text: `${s.n} × ${s.sec} s rapid dar relaxat (nu sprint), cu ~1 min trap ușor sau mers între ele` };
}

/** Reperul tehnic al zilei: unul singur, familiar, rotit după dată (variație fără noutate permanentă). */
export function swimCue(date: string): string {
  const cues = ['respirație pe ambele părți, la 3 brațe', 'catch-up: un braț așteaptă celălalt în față', 'alunecare lungă după fiecare braț, corpul drept', 'expiri complet în apă, inspiri scurt lateral'];
  const d = Number(date.slice(8, 10)) || 0;
  return cues[d % cues.length]!;
}

/**
 * Setul de înot pentru minutele din plan. Ritmul ușor: CSS + 15 s/100 m dacă e testat, altfel 2:45/100 m (presupunere
 * prudentă de început, declarată). Întoarce pașii, metrii totali și minutele estimate.
 */
export function swimSet(input: { type: string; minutes: number; css: number | null; date: string }): { steps: Step[]; meters: number; estMin: number } {
  const easy = input.css ? input.css + 15 : 165; // s/100 m
  const budget = Math.max(10, input.minutes) * 60;
  const repSec = (dist: number, rest: number, pace = easy) => (dist / 100) * pace + rest;
  const short = input.minutes < 25;
  // Încălzire și revenire, fixe.
  const warm = short ? { n: 2, d: 50, r: 20 } : { n: 4, d: 50, r: 15 };
  const coolM = short ? 50 : 100;
  let used = warm.n * repSec(warm.d, warm.r) + repSec(coolM, 0, easy + 15);
  const steps: Step[] = [{ label: 'Încălzire', text: `${warm.n} × ${warm.d} m ușor, ${warm.r} s pauză la perete` }];
  let meters = warm.n * warm.d + coolM;
  const left = Math.max(0, budget - used);

  if (input.type === 'tehnica') {
    // Blocuri de 4 × 25 m exercițiu + 4 × 25 m înot cu reperul, 20 s pauză.
    const block = 4 * repSec(25, 20, easy + 20) + 4 * repSec(25, 20);
    const k = Math.max(1, Math.floor(left / block));
    used += k * block;
    meters += k * 200;
    steps.push({ label: 'Tehnică', text: `${k > 1 ? `${k} runde: ` : ''}4 × 25 m exercițiu cu reperul zilei (${swimCue(input.date)}), 20 s pauză, apoi 4 × 25 m înot normal păstrând reperul, 20 s pauză` });
  } else if (input.type === 'calitate' && input.css) {
    const rep = repSec(100, 20, input.css);
    const k = Math.max(2, Math.min(10, Math.floor(left / rep)));
    used += k * rep;
    meters += k * 100;
    steps.push({ label: 'Principal', text: `${k} × 100 m la ritmul pragului (${Math.floor(input.css / 60)}:${String(input.css % 60).padStart(2, '0')}/100 m), 20 s pauză` });
  } else {
    // Ușor / lung: cu CSS, 100 m cu 15 s pauză; fără CSS, 50 m cu 30 s (fără înot continuu prescris).
    const d = input.css ? 100 : 50;
    const r = input.css ? 15 : 30;
    const k = Math.max(2, Math.floor(left / repSec(d, r)));
    used += k * repSec(d, r);
    meters += k * d;
    steps.push({ label: 'Principal', text: `${k} × ${d} m ușor, ${r} s pauză${input.type === 'calitate' ? ' (fără prag de înot testat, nu facem bucăți rapide)' : ''}; poți vorbi după fiecare repetare` });
  }
  steps.push({ label: 'Revenire', text: `${coolM} m foarte ușor, orice stil` });
  const estMin = Math.round(used / 60);
  steps.push({ label: 'Total', text: `${fmtM(meters)} m în bazin de 25 m · durata ≈ ${estMin} min, estimată din ritm${input.css ? ' (CSS testat)' : ' (fără test de înot: ritm presupus 2:45/100 m)'}` });
  return { steps, meters, estMin };
}
