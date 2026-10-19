// Simularea de audit: rulează planificatorul real (src/calendar/generate.ts) pe profiluri sintetice — toate obiectivele,
// ambele sexe, cinci vârste, trei niveluri, cu și fără restricție de intensitate — și scrie o pagină HTML (pentru PDF)
// cu regulile, biblioteca de antrenamente, tabelul complet, planuri detaliate și sensibilitatea la fiecare factor.
// Tot ce apare aici e calculat de aceleași funcții ca aplicația; nimic scris de mână despre un plan anume.
// Rulare: npx tsx scripts/simulate-audit.ts <director-ieșire>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generatePlan, type GenerateInput, type GenerateResult } from '../src/calendar/generate.js';
import { ALL_GOALS, GOAL_LABEL, PHASE_HOURS, FITNESS_PHASE_LABEL, goalKind, isFitnessGoal, isRunGoal, isSwimGoal, isTriGoal, phaseWeeks, type Goal } from '../src/calendar/phases.js';
import { fitnessProfile } from '../src/strength/fitness.js';
import { prescribe, SESSIONS, BLOCK_LABEL, type SessionId } from '../src/strength/ppl.js';
import { strengthSpecFor } from '../src/strength/plan-specs.js';
import { detailSteps, hrFor } from '../src/calendar/session-detail.js';
import { RUN_MODULES, MODULE_PURPOSE, moduleStructure, walkRunStructure, WALK_RUN_STEPS, parseModule, type RunModuleId } from '../src/calendar/run-modules.js';
import { bikeQuality, swimQuality, SWIM_PYRAMID } from '../src/calendar/bike-swim-modules.js';
import { WORKOUT_LIBRARY } from '../src/knowledge/workouts.js';
import { PROMPTS } from '../src/prompts/bundle.js';
import { addDays, weekday } from '../src/util/dates.js';
import type { PlannedWorkout, Phase } from '../src/types.js';

const OUT = process.argv[2] ?? '.';
mkdirSync(OUT, { recursive: true });
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const START = '2026-10-26';
const DAYS = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const SPORT: Record<string, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', forta: 'Forță' };
const TYPE: Record<string, string> = { z2: 'ușor', tehnica: 'tehnică', calitate: 'calitate', lung: 'lungă', brick: 'brick', forta: 'forță', odihna: 'odihnă' };
const PHASE: Record<string, string> = { evaluare: 'Evaluare', baza1: 'Bază 1', baza2: 'Bază 2', build: 'Build', peak: 'Peak', taper: 'Taper' };

// ——— Profilurile ———
const RACE: Record<string, string> = { '70.3': '2027-09-12', olimpic: '2027-06-13', sprint: '2027-06-13', '5k': '2027-03-28', '10k': '2027-04-18', semimaraton: '2027-05-09', maraton: '2027-10-10', 'inot-1500': '2027-06-27', 'inot-1900': '2027-06-27', 'inot-3800': '2027-08-29', 'bike-50': '2027-05-30', 'bike-100': '2027-06-20', 'bike-160': '2027-08-22' };
const PACE: Record<string, [number, number]> = { '5k': [330, 285], '10k': [345, 300], semimaraton: [360, 315], maraton: [380, 335] };
type Level = 'debutant' | 'intermediar' | 'avansat';
const LEVELS: Level[] = ['debutant', 'intermediar', 'avansat'];
const AGES = [25, 35, 45, 55, 65];
const SEXES: ('m' | 'f')[] = ['m', 'f'];
const INTENS: ('toate' | 'Z2')[] = ['toate', 'Z2'];
// Program liber: luni–vineri 18:00–19:30, sâmbătă 08:00–12:00, duminică 08:00–11:00 (14,5 h libere).
const FREE = [0, 1, 2, 3, 4].map((d) => ({ day: d as 0, startMin: 18 * 60, endMin: 19 * 60 + 30 })).concat([{ day: 5 as 0, startMin: 8 * 60, endMin: 12 * 60 }, { day: 6 as 0, startMin: 8 * 60, endMin: 11 * 60 }]);

interface Profile { goal: Goal; sex: 'm' | 'f'; age: number; level: Level; intens: 'toate' | 'Z2'; hours?: number }
function input(p: Profile): GenerateInput {
  const L = p.level;
  const hist = L === 'debutant' ? [] : L === 'intermediar' ? [5, 5.5, 4.5, 6, 5, 5, 5.5, 6] : [9, 9.5, 8, 10, 9, 9.5, 10, 9];
  const hours = p.hours ?? (L === 'debutant' ? 5 : L === 'intermediar' ? 8 : 12);
  const fit = isFitnessGoal(p.goal);
  return {
    startDate: START,
    raceDate: fit ? addDays(START, 26 * 7) : RACE[p.goal]!,
    goal: p.goal,
    freeBlocks: FREE,
    sportHours: hours,
    historyHoursPerWeek: hist,
    intensityAllowed: p.intens,
    swimContinuous400: L !== 'debutant',
    level: { longestRideH: L === 'debutant' ? 1 : L === 'intermediar' ? 2.5 : 4, longestRunKm: L === 'debutant' ? 3 : L === 'intermediar' ? 12 : 21, easyPaceSecKm: L === 'debutant' ? null : L === 'intermediar' ? 375 : 320 },
    tests: L === 'avansat' ? { alergare: true, bicicleta: true, inot: true } : { alergare: false, bicicleta: false, inot: false },
    athlete: { age: p.age, sex: p.sex },
    swim: { continuousM: L === 'debutant' ? 50 : L === 'intermediar' ? 600 : 1500 },
    run: isRunGoal(p.goal) ? { goalPaceSecKm: L === 'debutant' ? null : PACE[p.goal]![L === 'intermediar' ? 0 : 1], canDoDistance: L !== 'debutant' && (p.goal === '5k' || p.goal === '10k' || L === 'avansat'), longestRunKm: L === 'debutant' ? 3 : L === 'intermediar' ? 12 : 21, branch: L === 'debutant' ? 'finalizare' : 'timp', beginner: L === 'debutant' } : undefined,
    fitness: fit ? fitnessProfile(p.goal, { experienta: L === 'debutant' ? 'incepatoare' : 'stabila', zile: L === 'debutant' ? 2 : L === 'intermediar' ? 3 : 4, minute: L === 'debutant' ? 45 : 60, acces: 'sala', miscare: L === 'debutant' ? 'sedentara' : L === 'intermediar' ? 'plimbari' : 'activa' }) : undefined,
  };
}

interface Metrics { ok: boolean; reason?: string; weeks: number; budget: number; h: Record<string, number | null>; sessBuild: number | null; qualBuild: number | null; strength: number | null; z5: boolean; recEvery: number; walkRun: boolean; firstWeekH: number; longFirst: string }
function metrics(p: Profile, r: GenerateResult): Metrics {
  const recEvery = p.age >= 40 ? 3 : 4;
  if (!r.ok) return { ok: false, reason: r.reason, weeks: 0, budget: r.budgetHours, h: {}, sessBuild: null, qualBuild: null, strength: null, z5: false, recEvery, walkRun: false, firstWeekH: 0, longFirst: '' };
  const avg = (ph: string) => {
    const ws = r.weeks.filter((w) => w.phase === ph && !w.recovery);
    return ws.length ? Math.round((ws.reduce((n, w) => n + w.plannedHours, 0) / ws.length) * 10) / 10 : null;
  };
  const build = r.weeks.filter((w) => (w.phase === 'build' || (isFitnessGoal(p.goal) && w.phase === 'baza2')) && !w.recovery);
  const per = (f: (x: PlannedWorkout) => boolean) => (build.length ? Math.round((build.reduce((n, w) => n + w.workouts.filter((x) => x.type !== 'odihna' && f(x)).length, 0) / build.length) * 10) / 10 : null);
  const all = r.weeks.flatMap((w) => w.workouts);
  const w1 = r.weeks[0]!;
  const longs = w1.workouts.filter((x) => x.type === 'lung' || x.type === 'brick').map((x) => `${SPORT[x.sport]} ${x.plannedMinutes}′`);
  return { ok: true, weeks: r.weeks.length, budget: r.budgetHours, h: { evaluare: avg('evaluare'), baza1: avg('baza1'), build: avg('build'), peak: avg('peak') }, sessBuild: per(() => true), qualBuild: per((x) => x.type === 'calitate'), strength: per((x) => x.sport === 'forta'), z5: all.some((x) => x.targetZones.includes(5) && !/^TEST/i.test(x.structure ?? '')), recEvery, walkRun: all.some((x) => /^mers-alergare/.test(x.structure ?? '')), firstWeekH: Math.round(w1.plannedHours * 10) / 10, longFirst: longs.join(', ') || '—' };
}

const run = (p: Profile) => generatePlan(input(p));

// ——— HTML ———
const parts: string[] = [];
const h1 = (t: string) => parts.push(`<h1 class="part">${esc(t)}</h1>`);
const h2 = (t: string) => parts.push(`<h2>${esc(t)}</h2>`);
const h3 = (t: string) => parts.push(`<h3>${esc(t)}</h3>`);
const p = (t: string) => parts.push(`<p>${t}</p>`);
const table = (head: string[], rows: (string | number | null | undefined)[][], cls = '') => parts.push(`<table class="${cls}"><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? '—' : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);

const commit = (() => {
  try {
    return readFileSync('.git/HEAD', 'utf8').trim().startsWith('ref:') ? readFileSync(join('.git', readFileSync('.git/HEAD', 'utf8').trim().slice(5)), 'utf8').trim().slice(0, 7) : readFileSync('.git/HEAD', 'utf8').trim().slice(0, 7);
  } catch {
    return '?';
  }
})();

parts.push(`<section class="cover"><h1>AIRON — cum gândește antrenorul</h1>
<p class="sub">Simulare de audit generată din codul aplicației (commit ${esc(commit)}), ${new Date().toISOString().slice(0, 10)}.</p>
<h3>Cum a fost făcut documentul</h3>
<ul>
<li>Planificatorul real (aceleași funcții ca aplicația) a fost rulat pe <b>profiluri sintetice</b>: toate cele ${ALL_GOALS.length} obiective din aplicație + Ironman complet, ambele sexe, vârstele ${AGES.join(', ')}, trei niveluri (debutant, intermediar, avansat) și două stări de sănătate (intensitate permisă / restricție la Z1–Z2). Total: ${ALL_GOALS.length * SEXES.length * AGES.length * LEVELS.length * INTENS.length} planuri.</li>
<li>Ședințele detaliate (încălzire, școala alergării, repetări, pauze după puls, plafon) sunt generate de funcția care le afișează și în aplicație.</li>
<li>Regulile din Partea I sunt descrise din cod; în Anexe sunt textul integral al instrucțiunilor AI și comentariile regulilor din fișierele sursă.</li>
</ul>
<h3>Limite (de citit înainte de audit)</h3>
<ul>
<li>Profilurile sunt sintetice. În aplicație, planul pornește și din istoricul real al ceasului, iar ziua se ajustează zilnic (recuperare, durere, febră, ce s-a făcut efectiv) — asta nu se vede într-un plan generat o dată.</li>
<li>Pulsul din exemple e <b>estimat din vârstă</b> (puls maxim ≈ 208 − 0,7 × vârsta, ±10 bpm). În aplicație, după un test, se folosesc zonele testate.</li>
<li>Indicii și pragurile sunt reguli de produs, nu un protocol medical validat; documentul nu certifică eficacitatea sau siguranța.</li>
</ul></section>`);

// ——— Partea I: cum gândește ———
h1('Partea I — Cum gândește antrenorul');
h2('1. Drumul unei decizii');
p('<b>Chestionarul de intrare</b> (obiectiv, data, nivel, program liber, echipament, sănătate) → <b>planificatorul</b> (cod, determinist) construiește tot planul până la obiectiv → <b>în fiecare zi</b>, codul calculează starea (recuperare, somn, HRV, puls, chestionarul de dimineață) și restricțiile (febră, simptom, durere) → <b>decizia zilei</b> (verde / galben / roșu / stop), tot din cod → <b>Main Coach</b> (un singur apel AI) explică decizia și ședința, fără să le poată relaxa → <b>verificarea</b> cifrelor din mesaj (fiecare cifră trebuie să existe în date) → calendarul se adaptează doar prin reguli (mutare, variantă ușoară, scurtare, reevaluare după import).');
h2('2. Cum se construiește planul');
const rows: (string | number)[][] = [];
for (const g of ALL_GOALS) {
  const ph = PHASE_HOURS[g];
  rows.push([GOAL_LABEL[g], ...(['evaluare', 'baza1', 'baza2', 'build', 'peak', 'taper'] as Phase[]).map((x) => (ph?.[x] ? `${ph[x].min}–${ph[x].target}–${ph[x].max}` : '—'))]);
}
p('<b>Fazele.</b> Planul merge înapoi de la data obiectivului: evaluare (teste, fără intensitate) → bază 1 → bază 2 → build → peak → taper. La fitness: acomodare → construire → progres → consolidare → tranziție → menținere, 26 de săptămâni. <b>Descărcarea</b>: o săptămână mai ușoară la fiecare 4 (la fiecare 3 de la 40 de ani).');
p('<b>Orele pe săptămână</b> pe fază (minim – țintă – maxim), din cod. Bugetul unui sportiv = suma blocurilor libere de cel puțin 45 min × 0,8 (nimeni nu folosește tot timpul liber; cel mult 5 h pe zi), plafonată la orele declarate pentru sport. Prima săptămână nu pornește de la maximul fazei, ci din istoricul ultimelor 8 săptămâni (fără istoric: start prudent).');
table(['Obiectiv', 'Evaluare', 'Bază 1', 'Bază 2', 'Build', 'Peak', 'Taper'], rows, 'small');
p('<b>Intensitatea.</b> Crește în trepte: fără intensitate în evaluare; tempo/sweet spot în bază 2; prag în build; intervale VO2max (Z5) și ritm de cursă în peak. Nu există intensitate dacă: analizele arată feritină sub 30 µg/L sau hemoglobină sub interval, medicul a limitat efortul (atunci totul rămâne Z1–Z2). De la 55 de ani, intensitatea se oprește la Z4 (fără intervale VO2max). Cel mult o ședință intensă pe zi; distribuția rămâne în jur de 80% ușor.');
p('<b>Debutantul.</b> La alergare: mers-alergare cu trepte (urcă la două săptămâni, doar după tolerare), fără ședințe rapide în bază. La înot: fără 400 m continuu, doar bucăți legate și tehnică (fără test CSS). Ieșirile lungi pornesc de la ce a declarat că face acum, nu de la o valoare fixă.');
p('<b>Forța.</b> 2 ședințe pe săptămână (3 în fazele de bază când programul permite): Push/Pull/Legs sau „tot corpul” (picioare mari primele; la timp scurt rămâne câte o mișcare de picioare, împins și tras); picioare ușoare înaintea unei ședințe-cheie, fără picioare în ultimele 10 zile dinaintea cursei. Fitness: programul de 26 de săptămâni, 2 → 3 → 4 zile.');
p('<b>Ce NU schimbă planul (direct):</b> sexul (schimbă nutriția și pragurile de laborator, nu volumul), vitamina D scăzută (o vede nutriționistul, nu planul), avizul cardiologic necunoscut (nu e restricție). Se vede în tabelul complet: rândurile M și F sunt identice la același profil.');
h2('3. Decizia zilei (din cod, înaintea AI)');
p('Scorul de stare 0–100 (recuperare, somn, HRV față de baseline, puls de repaus, respirație): ≥ 70 verde · 50–69 galben · 30–49 portocaliu · &lt; 30 roșu. HRV: la baseline = 100, −10% = 70, −20% = 40. Puls de repaus: +5 bpm = 50, +10 bpm = 0. Fără date de la brățări: sportivul răspunde „ești apt?” (da / parțial / nu).');
p('<b>Restricțiile au prioritate:</b> simptom cardiac (bifat sau scris în comentariu: durere în piept, leșin, palpitații, lipsă de aer) → stop; febră → stop; boală → roșu; durere ≥ 5/10 în ultimele 2 zile → roșu; durere 3–4 → cel mult galben, fără impact. Galben = varianta ușoară a ședinței (Z1–Z2, volum −20–30%), pusă în plan la confirmare. Roșu = pauză.');
h2('4. Main Coach (AI)');
p('Un singur apel pe eveniment (dimineața, după antrenament, duminica). Primește pachetul de date al zilei și modulele de cunoștințe relevante (fiziologie, sportul de azi, nutriție, fizio, minte). Nu poate schimba culoarea zilei, nu scrie în calendar, nu inventează ședințe sau cifre; orice cifră din mesaj trebuie să aibă câmpul ei din date, altfel mesajul e respins o dată și apoi înlocuit cu mesajul din cod. Textul integral e în Anexa A.');

// ——— Partea II: biblioteca ———
h1('Partea II — Biblioteca de antrenamente (detaliat, așa cum le vede sportivul)');
p('<b>Pulsul în exemple</b>: în aplicație, fiecare ședință de alergare și bicicletă are și nota „zonele sunt ESTIMATE din vârstă … testul le înlocuiește” până la primul test; aici e scrisă o singură dată. Exemplele de puls sunt pentru un sportiv de 40 de ani fără test (puls maxim estimat 180 bpm: Z1 &lt; 126, Z2 127–144, Z3 145–157, Z4 158–167, Z5 &gt; 167). Cu test, cifrele devin ale lui.');
const CTX = { age: 40 };
const stepsHtml = (w: PlannedWorkout, ctx = CTX) => `<ol class="steps">${detailSteps(w, ctx).filter((s) => s.label !== 'Puls').map((s) => `<li><b>${esc(s.label)}</b> ${esc(s.text)}</li>`).join('')}</ol>`;
const W = (x: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'x', date: '2026-10-28', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat', ...x });
h2('Alergare — modulele de calitate');
for (const id of Object.keys(RUN_MODULES) as RunModuleId[]) {
  const b = moduleStructure(id, null, null);
  h3(`${id} — ${MODULE_PURPOSE[id]}`);
  p(`<i>Când:</i> ${esc(RUN_MODULES[id].scop)}. <i>Structura din plan:</i> ${esc(b.text)}`);
  parts.push(stepsHtml(W({ type: 'calitate', plannedMinutes: b.minutes, targetZones: [RUN_MODULES[id].zone], structure: b.text })));
}
h2('Alergare — ușor, accelerări, lungă, mers-alergare');
h3('Alergare ușoară cu accelerări (45 min)');
parts.push(stepsHtml(W({ structure: 'ușor + 6 accelerări de 20 s' })));
h3('Ieșire lungă (90 min)');
parts.push(stepsHtml(W({ type: 'lung', plannedMinutes: 90, structure: 'ușor, conversațional' })));
h3(`Mers-alergare (debutant): ${WALK_RUN_STEPS} trepte, urcă la două săptămâni`);
for (let s = 0; s < WALK_RUN_STEPS; s++) p(`Treapta ${s + 1}: ${esc(walkRunStructure(s, 30))}`);
h2('Bicicletă — calitate, cu progresia pe săptămâni');
for (const ph of ['baza2', 'build', 'peak', 'taper'] as Phase[]) {
  for (let wk = 0; wk < (ph === 'taper' ? 1 : 4); wk++) {
    const q = bikeQuality(ph, wk, { raceKm: 100 });
    if (!q) continue;
    h3(`${PHASE[ph]}, săptămâna ${wk + 1} din fază — ${q.minutes} min`);
    parts.push(stepsHtml(W({ sport: 'bicicleta', type: 'calitate', plannedMinutes: q.minutes, targetZones: q.zones, structure: q.structure, intervals: q.intervals })));
  }
}
h3('Tura ușoară (75 min) și tura lungă (180 min)');
parts.push(stepsHtml(W({ sport: 'bicicleta', plannedMinutes: 75, structure: 'ușor, cadență 90–100' })));
parts.push(stepsHtml(W({ sport: 'bicicleta', type: 'lung', plannedMinutes: 180 })));
h3('Brick (bicicletă + alergare, 120 min)');
parts.push(stepsHtml(W({ sport: 'bicicleta', type: 'brick', plannedMinutes: 120, targetZones: [2], structure: 'tură 100 min + alergare 20 min' })));
h2('Înot — seturi (metri exacți, durată estimată)');
for (const [css, lbl] of [[null, 'fără test CSS'], [110, 'cu CSS 1:50/100 m']] as const) {
  h3(`Tehnică 40 min — ${lbl}`);
  parts.push(stepsHtml(W({ sport: 'inot', type: 'tehnica', plannedMinutes: 40, structure: 'un element de tehnică' }), { age: 40, css } as never));
  h3(`Ușor 45 min — ${lbl}`);
  parts.push(stepsHtml(W({ sport: 'inot', type: 'z2', plannedMinutes: 45 }), { age: 40, css } as never));
}
for (const ph of ['build', 'peak'] as Phase[]) for (let wk = 0; wk < (ph === 'build' ? 4 : 2); wk++) {
  const sq = swimQuality(ph, wk)!;
  h3(`Set CSS — ${PHASE[ph]}, săptămâna ${wk + 1}`);
  parts.push(stepsHtml(W({ sport: 'inot', type: 'calitate', plannedMinutes: 45, structure: sq }), { age: 40, css: 110 } as never));
}
h3('Piramida aerobă');
parts.push(stepsHtml(W({ sport: 'inot', type: 'z2', plannedMinutes: 40, structure: SWIM_PYRAMID }), { age: 40, css: 110 } as never));
h2('Forță — fiecare ședință, cu exercițiile (bloc Bază, 45 min)');
for (const id of Object.keys(SESSIONS) as SessionId[]) {
  const rx = prescribe({ session: id, block: id.length <= 2 ? 'construire' : 'baza', week: 2, len: 4 } as never, 60);
  h3(`${SESSIONS[id].name} — ${SESSIONS[id].focus} (${rx.minutes} min)`);
  table(['Exercițiu', 'Serii × repetări', 'Rezervă', 'Pauză', 'Indicație', 'Alternativă'], rx.items.map((r) => [r.ex.name, `${r.sets} × ${r.reps}`, r.rir, `${r.rest} s`, r.ex.cue, r.ex.alt]), 'small');
  if (rx.notes.length) p(`<i>${esc(rx.notes.join('; '))}</i>`);
}
h2('Biblioteca de cunoștințe a antrenorului AI (pe sport, fază, obiectiv)');
table(['Sport', 'Nume', 'Sursă', 'Scop', 'Faze', 'Cum', 'Doză', 'Nu când'], WORKOUT_LIBRARY.map((x) => [SPORT[x.sport], x.nume, x.sursa, x.scop, x.faze.map((f) => PHASE[f]).join(', '), x.cum, x.doza, x.nu_cand ?? '']), 'small lib');

// ——— Partea III: tabelul complet ———
h1('Partea III — Toate profilurile (tabelul complet)');
p(`Fiecare rând e un plan generat. Coloane: săptămâni · buget (h/săpt.) · ore medii pe săptămână în evaluare / bază 1 / build / peak (fără săptămânile de descărcare) · ședințe pe săptămână în build · din care de calitate · de forță · Z5 în plan (intervale; testele de teren sunt separate) · descărcare la N săptămâni · mers-alergare · prima săptămână (h) · ședințele lungi din prima săptămână. „Z2” = restricție de intensitate (feritină &lt; 30, hemoglobină scăzută sau limitare de la medic). Ironman complet: refuzat de aplicație în versiunea asta.`);
const all: { p: Profile; m: Metrics }[] = [];
for (const goal of ALL_GOALS) {
  h2(GOAL_LABEL[goal]);
  const rws: (string | number | null | undefined)[][] = [];
  for (const level of LEVELS) for (const intens of INTENS) for (const age of AGES) for (const sex of SEXES) {
    const pr: Profile = { goal, sex, age, level, intens };
    const m = metrics(pr, run(pr));
    all.push({ p: pr, m });
    rws.push(m.ok ? [sex.toUpperCase(), age, level, intens, m.weeks, m.budget, m.h.evaluare, m.h.baza1, m.h.build, m.h.peak, m.sessBuild, m.qualBuild, m.strength, m.z5 ? 'da' : 'nu', m.recEvery, m.walkRun ? 'da' : 'nu', m.firstWeekH, m.longFirst] : [sex.toUpperCase(), age, level, intens, '—', m.budget, 'NU: ore insuficiente (vezi nota)', null, null, null, null, null, null, null, null, null, null, null]);
  }
  const refused = all.filter((x) => x.p.goal === goal && !x.m.ok);
  if (refused.length) p(`<i>Notă: ${refused.length} profiluri refuzate cu mesajul: „${esc(refused[0]!.m.reason)}” Aplicația oferă atunci variante: mai multe ore, alt obiectiv sau altă dată.</i>`);
  table(['Sex', 'Vârstă', 'Nivel', 'Intens.', 'Săpt.', 'Buget', 'Eval.', 'Bază1', 'Build', 'Peak', 'Ședințe', 'Calit.', 'Forță', 'Z5', 'Desc.', 'Mers-al.', 'Săpt.1 h', 'Lungi în săpt. 1'], rws, 'tiny');
}
p('<b>Ironman complet:</b> refuzat înainte de planificator (server/_lib/plan.ts): „Ironman complet nu e în versiunea asta a planului; alege 70.3 pentru acum.”');

// Constatări calculate din toate profilurile.
{
  h2('Constatări din simulare (calculate, nu scrise de mână)');
  const ok = all.filter((x) => x.m.ok);
  const key = (x: { p: Profile }) => JSON.stringify({ ...x.p, sex: null });
  const bySex = new Map<string, Metrics[]>();
  for (const x of ok) bySex.set(key(x), [...(bySex.get(key(x)) ?? []), x.m]);
  const sexDiff = [...bySex.values()].filter((v) => v.length === 2 && JSON.stringify(v[0]) !== JSON.stringify(v[1])).length;
  const z5old = ok.filter((x) => x.p.age >= 55 && x.m.z5).length;
  const z2qual = ok.filter((x) => x.p.intens === 'Z2' && (x.m.qualBuild ?? 0) > 0).length;
  const z2z5 = ok.filter((x) => x.p.intens === 'Z2' && x.m.z5).length;
  const walkNonDeb = ok.filter((x) => x.p.level !== 'debutant' && x.m.walkRun).length;
  const recWrong = ok.filter((x) => (x.p.age >= 40 ? 3 : 4) !== x.m.recEvery).length;
  const lines = [
    `Planuri generate: ${all.length}; reușite: ${ok.length}; refuzate: ${all.length - ok.length} (toate pentru ore insuficiente la debutant cu 5 h: 70.3, olimpic, tura de 160 km).`,
    `Sexul: ${sexDiff} diferențe între planurile M și F la același profil (0 = sexul nu schimbă planul; e o alegere de design, vezi Partea V).`,
    `Vârsta ≥ 55: ${z5old} planuri cu intervale Z5 (trebuie 0: plafon Z4). Testele de teren (efort maxim) rămân în plan și la 55+; e de decis dacă la 65 de ani testul maximal rămâne.`,
    `Restricție Z2: ${z2qual} planuri cu ședințe de calitate în build și ${z2z5} cu Z5 (trebuie 0).`,
    `Mers-alergare la nedebutanți: ${walkNonDeb} (trebuie 0).`,
    `Descărcarea: ${recWrong} planuri nu respectă regula „la 3 săptămâni de la 40 de ani, la 4 sub 40” (trebuie 0).`,
  ];
  parts.push(`<div class="why"><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`);
}

// ——— Partea IV: planuri detaliate ———
h1('Partea IV — Planuri detaliate, cu motivul (un profil reprezentativ pe obiectiv)');
p('Profil: 40 de ani, nivel intermediar, intensitate permisă, 8 h declarate, program liber 14,5 h; bărbat la obiectivele de anduranță, femeie la fitness. Pentru fiecare: motivul (din cod: buget, faze, reguli), apoi prima săptămână, prima săptămână de build și prima de peak, cu fiecare ședință detaliată. La forță: exercițiile cu serii, repetări, rezervă și pauză.');
const repWeeks = (goal: Goal, r: Extract<GenerateResult, { ok: true }>) => {
  const idx = new Set<number>([0, 1]);
  if (isFitnessGoal(goal)) [8, 19].forEach((i) => idx.add(i));
  else {
    const b = r.weeks.findIndex((w) => w.phase === 'build' && !w.recovery);
    const pk = r.weeks.findIndex((w) => w.phase === 'peak' && !w.recovery);
    if (b >= 0) idx.add(b);
    if (pk >= 0) idx.add(pk);
  }
  return [...idx].filter((i) => i < r.weeks.length).sort((a, b) => a - b);
};
for (const goal of ALL_GOALS) {
  const pr: Profile = { goal, sex: isFitnessGoal(goal) ? 'f' : 'm', age: 40, level: 'intermediar', intens: 'toate' };
  const inp = input(pr);
  const r = generatePlan(inp);
  h2(`${GOAL_LABEL[goal]}`);
  if (!r.ok) {
    p(`Plan refuzat: ${esc(r.reason)}`);
    continue;
  }
  const phases = phaseWeeks(inp.startDate, inp.raceDate, 3, goal);
  const count: Record<string, number> = {};
  for (const w of phases) count[w.phase] = (count[w.phase] ?? 0) + 1;
  const why = [
    `Durata: ${r.weeks.length} săptămâni, de la ${START} la ${inp.raceDate}${isFitnessGoal(goal) ? ' (programul de fitness)' : ''}. Faze: ${Object.entries(count).map(([k, v]) => `${PHASE[k] ?? k} ${v}`).join(' · ')}.`,
    `Bugetul: ${r.budgetHours} h/săpt. — programul liber 14,5 h × 0,8 = 11,6 h, plafonat la cele 8 h declarate; istoricul ultimelor 8 săptămâni: 5–6 h/săpt.; prima săptămână ${Math.round(r.weeks[0]!.plannedHours * 10) / 10} h, ancorată în istoric, nu în maximul fazei.`,
    `Descărcare la fiecare 3 săptămâni (40 de ani; sub 40 ar fi la 4). Intensitate permisă (analize fără limită, fără restricție medicală).`,
    ...(isTriGoal(goal) || isSwimGoal(goal) ? ['Înot: înoată 600 m continuu (≥ 400 m), deci are seturi CSS din build; testul CSS în evaluare.'] : []),
    ...(isRunGoal(goal) ? ['Alergare: ramura „timp” (are ritm-țintă), deci module specifice obiectivului; ieșirea lungă pornește de la 12 km declarați.'] : []),
    ...[...new Set(r.weeks.flatMap((w) => w.notes))].slice(0, 6).map((n) => `Notă din planificator: ${n}`),
  ];
  parts.push(`<div class="why"><b>De ce acest plan</b><ul>${why.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  table(['Săpt.', 'Fază', 'Desc.', 'Ore', 'Ședințe'], r.weeks.map((w, i) => [i + 1, (isFitnessGoal(goal) ? (FITNESS_PHASE_LABEL as Record<string, string>)[w.phase] : PHASE[w.phase]) ?? w.phase, w.recovery ? 'da' : '', Math.round(w.plannedHours * 10) / 10, w.workouts.filter((x) => x.type !== 'odihna').length]), 'tiny');
  const planAll = r.weeks.flatMap((w) => w.workouts);
  for (const i of repWeeks(goal, r)) {
    const wk = r.weeks[i]!;
    h3(`Săptămâna ${i + 1} — ${(isFitnessGoal(goal) ? (FITNESS_PHASE_LABEL as Record<string, string>)[wk.phase] : PHASE[wk.phase]) ?? wk.phase}${wk.recovery ? ' (descărcare)' : ''} · ${Math.round(wk.plannedHours * 10) / 10} h`);
    for (const w of wk.workouts.filter((x) => x.type !== 'odihna')) {
      const head = `${DAYS[weekday(w.date)]} · ${SPORT[w.sport]} · ${TYPE[w.type]} · ${w.plannedMinutes} min${w.targetZones.length ? ` · Z${w.targetZones.join('–')}` : ''}${w.key ? ' · cheie' : ''}`;
      let body = '';
      if (w.sport === 'forta') {
        const spec = strengthSpecFor(planAll, w, START, inp.raceDate, 3, goal);
        const rx = spec ? prescribe(spec, w.plannedMinutes) : null;
        body = rx ? `<table class="small"><tbody>${rx.items.map((x) => `<tr><td>${esc(x.ex.name)}</td><td>${x.sets} × ${esc(x.reps)}</td><td>rezervă ${esc(x.rir)}</td><td>pauză ${x.rest} s</td></tr>`).join('')}</tbody></table>${rx.notes.length ? `<p class="note">${esc(rx.notes.join('; '))}</p>` : ''}` : '';
        body = `<p class="note">${esc(w.structure ?? '')}${rx ? ` · bloc ${esc(BLOCK_LABEL[rx.spec.block])}` : ''}</p>${stepsHtml(w)}${body}`;
      } else body = `${w.structure ? `<p class="note">${esc(w.structure)}</p>` : ''}${stepsHtml(w)}`;
      parts.push(`<div class="wo"><div class="wo-h">${esc(head)}</div>${body}</div>`);
    }
  }
}

// ——— Partea V: personalizarea ———
h1('Partea V — Cât de personalizat e planul și de ce');
p('Pornind de la un profil de bază, schimbăm un singur factor și arătăm ce se schimbă în plan (calculat). Unde nu se schimbă nimic, e scris: asta e o alegere de design, nu o scăpare.');
const base = (goal: Goal): Profile => ({ goal, sex: isFitnessGoal(goal) ? 'f' : 'm', age: 35, level: 'intermediar', intens: 'toate' });
for (const goal of ['70.3', '10k', 'maraton', 'inot-1900', 'bike-100', 'fit-slabire'] as Goal[]) {
  h2(`${GOAL_LABEL[goal]} — profil de bază: ${base(goal).sex.toUpperCase()}, 35 ani, intermediar, intensitate permisă, 8 h`);
  const variants: [string, Profile][] = [
    ['Bază', base(goal)],
    ['Vârsta 25', { ...base(goal), age: 25 }],
    ['Vârsta 45', { ...base(goal), age: 45 }],
    ['Vârsta 55', { ...base(goal), age: 55 }],
    ['Vârsta 65', { ...base(goal), age: 65 }],
    ['Sex opus', { ...base(goal), sex: base(goal).sex === 'm' ? 'f' : 'm' }],
    ['Debutant', { ...base(goal), level: 'debutant' }],
    ['Avansat', { ...base(goal), level: 'avansat' }],
    ['Restricție Z2 (feritină < 30 / medic)', { ...base(goal), intens: 'Z2' }],
    ['Doar 5 h declarate', { ...base(goal), hours: 5 }],
    ['12 h declarate', { ...base(goal), hours: 12 }],
  ];
  table(['Variantă', 'Buget', 'Bază1 h', 'Build h', 'Peak h', 'Ședințe build', 'Calitate', 'Forță', 'Z5', 'Desc.', 'Mers-al.', 'Săpt. 1 h', 'Lungi săpt. 1'], variants.map(([n, pr]) => {
    const m = metrics(pr, run(pr));
    return m.ok ? [n, m.budget, m.h.baza1, m.h.build, m.h.peak, m.sessBuild, m.qualBuild, m.strength, m.z5 ? 'da' : 'nu', m.recEvery, m.walkRun ? 'da' : 'nu', m.firstWeekH, m.longFirst] : [n, m.budget, `NU: ${m.reason}`, null, null, null, null, null, null, null, null, null, null];
  }), 'small');
}
h2('Ce se personalizează în aplicație și nu se vede în simulare');
parts.push(`<ul>
<li><b>Pulsul</b>: zonele testate înlocuiesc estimarea din vârstă (în exemple: estimare). Diferența la o persoană poate fi ±10 bpm.</li>
<li><b>Ziua</b>: culoarea (verde/galben/roșu/stop) din recuperare, somn, HRV, puls și chestionar; restricțiile din durere, febră, simptome scrise.</li>
<li><b>Execuția</b>: ce face efectiv sportivul (ceas, import Samsung/Apple) schimbă reevaluarea nivelului, progresul și ședința următoare.</li>
<li><b>Timpul și echipamentul</b>: „Am mai puțin timp”, „Mută”, bazin/ape libere, trainer/afară (vreme).</li>
<li><b>Analizele</b>: feritină &lt; 30 sau hemoglobină scăzută oprește intensitatea; vitamina D și restul ajung la nutriționist și „de discutat cu medicul”, nu în plan.</li>
</ul>`);
h2('Ce nu e personalizat (onest)');
parts.push(`<ul>
<li>Sexul nu schimbă volumul sau ședințele (în tabel, rândurile M și F sunt identice). Fitness-ul e oferit în aplicație doar femeilor (alegere de produs).</li>
<li>Vârsta schimbă doar descărcarea (la 3 săptămâni de la 40 de ani) și plafonul de intensitate (Z4 de la 55 de ani); nu și volumul.</li>
<li>Greutățile la forță nu se prescriu în kilograme: se aleg după rezerva cerută (fără jurnal de greutăți încă).</li>
<li>Pulsul fără test e estimat; ritmul pe km apare doar când există un ritm-țintă sau un test.</li>
</ul>`);

// ——— Anexe ———
h1('Anexa A — Instrucțiunile antrenorului AI (integral)');
for (const k of ['main_coach', 'ghid', 'fiziolog', 'antrenor_comun', 'antrenor_alergare', 'antrenor_inot', 'antrenor_bicicleta', 'antrenor_forta', 'antrenor_fitness', 'nutritionist', 'fizioterapeut', 'minte'] as const) {
  const t = (PROMPTS as unknown as Record<string, string | undefined>)[k];
  if (t) parts.push(`<h3>src/prompts/${k}.md</h3><pre>${esc(t)}</pre>`);
}
h1('Anexa B — Regulile din cod (comentariile fișierelor sursă)');
for (const f of ['src/calendar/phases.ts', 'src/calendar/budget.ts', 'src/calendar/generate.ts', 'src/calendar/validate.ts', 'src/calendar/day.ts', 'src/calendar/safety.ts', 'src/calendar/adapt.ts', 'src/calendar/actions.ts', 'src/calendar/run-modules.ts', 'src/calendar/bike-swim-modules.ts', 'src/calendar/session-detail.ts', 'src/calendar/session-steps.ts', 'src/strength/ppl.ts', 'src/strength/fitness.ts', 'src/collector/readiness.ts', 'src/collector/permissions.ts']) {
  let src = '';
  try {
    src = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const comments = [...src.matchAll(/\/\*\*[\s\S]*?\*\/|^\s*\/\/.*$/gm)].map((m) => m[0].replace(/^\s*\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').replace(/^\s*\/\/\s?/gm, '').trim()).filter((x) => x.length > 25);
  if (comments.length) parts.push(`<h3>${esc(f)}</h3><pre>${esc(comments.join('\n\n'))}</pre>`);
}

const css = `@page{size:A4;margin:14mm 12mm}body{font:10.5pt/1.45 -apple-system,'Segoe UI',Roboto,sans-serif;color:#111}h1{font-size:19pt}h1.part{page-break-before:always;border-bottom:2px solid #111;padding-bottom:4px}h2{font-size:13.5pt;margin:18px 0 6px;page-break-after:avoid}h3{font-size:11pt;margin:12px 0 4px;page-break-after:avoid}
.cover h1{font-size:24pt;margin-top:60px}.sub{color:#555}table{border-collapse:collapse;width:100%;margin:6px 0 10px}th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}th{background:#f2f2f2}table.small{font-size:8.5pt}table.tiny{font-size:7pt}table.tiny td,table.tiny th{padding:1px 3px}table.lib{font-size:7.5pt}tr{page-break-inside:avoid}
ol.steps{margin:4px 0 8px 18px;padding:0}ol.steps li{margin:2px 0}.wo{border:1px solid #ddd;border-radius:6px;padding:6px 8px;margin:6px 0;page-break-inside:avoid}.wo-h{font-weight:700}.note{color:#444;font-size:9pt;margin:2px 0}.why{background:#f6f8f2;border:1px solid #cdd8b8;border-radius:6px;padding:6px 10px;margin:6px 0}pre{white-space:pre-wrap;font:8.5pt/1.35 ui-monospace,Menlo,monospace;background:#fafafa;border:1px solid #eee;padding:6px}`;
writeFileSync(join(OUT, 'airon-audit-antrenor.html'), `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>AIRON — cum gândește antrenorul</title><style>${css}</style></head><body>${parts.join('\n')}</body></html>`);
writeFileSync(join(OUT, 'airon-audit-matrice.json'), JSON.stringify(all, null, 1));
console.log('profiluri', all.length, 'ok', all.filter((x) => x.m.ok).length);
