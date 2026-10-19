// Simularea programului de fitness pentru femei (26 de săptămâni), pe motorul real: exemple generate pentru 2, 3 și 4
// zile (standard și varianta amplă A–D), progresie, stagnare, scădere, durere, menținere, ședințe ratate, timp redus,
// prezență și oboseală, plus simularea longitudinală. Nimic nu e scris de mână despre un plan anume.
// Rulare: npx tsx scripts/simulate-fitness.ts <director-ieșire>   (opțional TESTS_TAP=<fișier tap> pentru rezultatele testelor)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generatePlan } from '../src/calendar/generate.js';
import { adapt } from '../src/calendar/adapt.js';
import { fitnessProfile, fitnessWeeks, unlockedDays, wideEligible, fitnessWeekAction, type FitnessIntake } from '../src/strength/fitness.js';
import { BLOCK_LABEL, parseStrength, prescribe, prescribeFull, SESSIONS, type Prescription, type StrengthSpec } from '../src/strength/ppl.js';
import { suggest, type StrengthLogEntry } from '../src/strength/log.js';
import { runLongitudinal } from '../src/sim/longitudinal.js';
import { input } from './audit-profiles.js';
import { weekday } from '../src/util/dates.js';
import type { FreeBlock, PlannedWorkout } from '../src/types.js';

const OUT = process.argv[2] ?? '.';
mkdirSync(OUT, { recursive: true });
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parts: string[] = [];
const h1 = (t: string) => parts.push(`<h1 class="part">${esc(t)}</h1>`);
const h2 = (t: string) => parts.push(`<h2>${esc(t)}</h2>`);
const h3 = (t: string) => parts.push(`<h3>${esc(t)}</h3>`);
const p = (t: string) => parts.push(`<p>${t}</p>`);
const table = (head: string[], rows: (string | number | null | undefined)[][], cls = '') => parts.push(`<table class="${cls}"><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? '—' : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
const DAYS = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const START = '2026-10-26';
const RACE = '2027-04-26';
// Program liber: în fiecare zi 17:00–19:00 (fereastra nu limitează alegerea zilelor).
const FREE: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d as 0, startMin: 17 * 60, endMin: 19 * 60 }));
const commit = (() => {
  try {
    const head = readFileSync('.git/HEAD', 'utf8').trim();
    return head.startsWith('ref:') ? readFileSync(join('.git', head.slice(5)), 'utf8').trim().slice(0, 7) : head.slice(0, 7);
  } catch {
    return '?';
  }
})();

interface Case { title: string; intake: FitnessIntake; unlocked?: 2 | 3 | 4; why: string }
const CASES: Case[] = [
  { title: 'Două zile — începătoare, 45 min, sedentară', intake: { experienta: 'incepatoare', zile: 2, minute: 45, acces: 'sala', miscare: 'sedentara' }, why: 'F1/F2 tot corpul; acomodare cu o serie în prima săptămână.' },
  { title: 'Trei zile — bază stabilă, 60 min, plimbări', intake: { experienta: 'stabila', zile: 3, minute: 60, acces: 'sala', miscare: 'plimbari' }, why: 'A3/B3/C3 de la început (bază stabilă: până la trei zile din prima săptămână).' },
  { title: 'Patru zile standard — bază stabilă, 45 min, prezență deja demonstrată la 4 zile', intake: { experienta: 'stabila', zile: 4, minute: 45, acces: 'sala', miscare: 'plimbari' }, unlocked: 4, why: 'L1/U1/L2/U2: patru zile, dar 45 min nu ajung pentru A–D (55–70 min).' },
  { title: 'Patru zile, varianta amplă A–D — bază stabilă, antrenament regulat acum, 60 min', intake: { experienta: 'stabila', zile: 4, minute: 60, acces: 'sala', miscare: 'activa' }, why: 'Eligibilă pentru A–D: nu e începătoare, are ≥ 55 min, se antrenează deja regulat (patru zile de la început).' },
];

const planFor = (c: Case) => {
  const f = { ...fitnessProfile('fit-tonifiere', c.intake), ...(c.unlocked ? { unlocked: c.unlocked } : {}) };
  const r = generatePlan({ startDate: START, raceDate: RACE, goal: 'fit-tonifiere', freeBlocks: FREE, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, fitness: f });
  if (!r.ok) throw new Error(r.reason);
  return { f, weeks: r.weeks, fw: fitnessWeeks(f, r.weeks.length) };
};

const rxHtml = (rx: Prescription) =>
  `<table class="small"><thead><tr><th>Exercițiu</th><th>Serii × repetări</th><th>Rezervă</th><th>Pauză</th><th>Scop</th><th>Reglare</th><th>Execuție</th><th>Greșeli frecvente</th><th>Alternativă</th></tr></thead><tbody>${rx.items
    .map((r) => `<tr><td>${esc(r.ex.name)}<br><span class="id">${esc(r.ex.id)}</span></td><td>${r.sets} × ${esc(r.reps)}</td><td>${esc(r.rir)}</td><td>${r.rest} s</td><td>${esc(r.ex.purpose ?? r.ex.group)}</td><td>${esc(r.ex.setup ?? '—')}</td><td>${esc(r.ex.cue)}</td><td>${esc(r.ex.mistakes ?? '—')}</td><td>${esc(r.ex.alt)} (recalibrat)</td></tr>`)
    .join('')}</tbody></table>${rx.notes.length ? `<p class="note">${esc(rx.notes.join(' · '))}</p>` : ''}`;

// ——— Copertă ———
parts.push(`<section class="cover"><h1>AIRON — Fitness pentru femei, 26 de săptămâni</h1>
<p class="sub">Integrarea programului din 19.10.2026 în motorul existent · simulare generată din cod (commit ${esc(commit)}), ${new Date().toISOString().slice(0, 10)}</p>
<ul>
<li>Un singur motor: aceleași funcții ca aplicația (src/strength/ppl.ts, src/strength/fitness.ts, src/calendar/fitness-plan.ts, src/calendar/adapt.ts, src/strength/log.ts). F1/F2, A3/B3/C3 și L1/U1/L2/U2 rămân; A–D e o doză alternativă pentru profilul eligibil.</li>
<li>Încărcările nu sunt inventate: în exemple apar doar serii, repetări, rezervă și pauze. Kilogramele din simulările de progresie sunt valori de test, marcate ca atare.</li>
<li>Pragurile (80% prezență, 55 min pentru A–D, două expuneri pentru creștere) sunt reguli de produs, nu praguri fiziologice validate.</li>
</ul></section>`);

// ——— Partea I: ce s-a implementat ———
h1('Partea I — Ce s-a implementat în cod');
table(['Cerință din program', 'Implementare (fișier · funcție)', 'Test'], [
  ['A–D ca doză alternativă, nu înlocuire', 'ppl.ts · SESSIONS.fa–fd (fitX), FITNESS_ROTATION_WIDE; fitness.ts · wideEligible: nu începătoare, fără sarcină/postpartum, ≥ 55 min', 'fitness-program: „A–D doar pentru profilul eligibil”'],
  ['Începătoarea nu primește automat 4 zile', 'fitness.ts · startDays / daysAt / unlockedDays: +1 zi după 3 săptămâni la rând cu ≥ 80% prezență; reevaluare duminica (server/cron/evening.ts)', 'test 1, „frecvența”'],
  ['Săpt. 1–4: două serii, rezervă 3–4; din 5: doza de construire', 'ppl.ts · prescribeFitness (A–D)', 'exemplele din Partea II'],
  ['Puncte de evaluare 4, 8, …, 24, nu descărcări obligatorii', 'fitness.ts · evaluation; recovery doar din date (adapt.ts · applyReview la bilanț obosit)', '„punctele de evaluare”'],
  ['Varietate controlată (13–16)', 'ppl.ts · FITNESS_SWAPS: un element echivalent pe ședință, cu notă de recalibrare', '„varietatea controlată”'],
  ['Stabilizare (21–24), test de menținere (25–26)', 'ppl.ts · prescribeFitness: fără escaladare, apoi 3 → 2 serii; log.ts · suggest({maintain})', 'test 8'],
  ['Progresie dublă din date reale', 'log.ts · suggest: capătul de sus în toate seriile la două expuneri la rând → cel mai mic pas; jurnal cu repetări pe serie (12/12/11)', 'test 3'],
  ['Fără kilograme inventate', 'log.ts · suggest (prima / fara-kg); StrengthLog.tsx: kg goale permise', 'test 2'],
  ['Stagnare și scădere', 'log.ts · suggest: aceleași repetări → fără creștere; scădere de două ori → o serie mai puțin, rezervă 3–4', '„stagnare”'],
  ['Simptomele opresc progresia', 'log.ts · suggest({pain}); StrengthLog.tsx · recentPain (durere ≥ 3/10 în 7 zile)', 'test 6'],
  ['Durata include ambele părți', 'ppl.ts · itemSec: lucru × 2 + schimbarea părții la unilateral; reglarea aparatului la fiecare exercițiu', 'test 4'],
  ['Zi ratată: fără dublare', 'adapt.ts · forta-ratat: rotația continuă în sloturile rămase ale săptămânii; server/_lib/react.ts · missedStrength (dimineața)', 'test 5 + longitudinal'],
  ['Timp redus: ședință coerentă', 'ppl.ts · prescribe: pleacă accesoriile, apoi seriile lor; pauzele și principalele rămân', 'test 7'],
  ['Home: nume + durată estimată', 'Home.tsx: „Picioare și fesieri · aproximativ 60 min”', 'captura din aplicație'],
  ['Fișa exercițiului', 'ppl.ts · Exercise.purpose/setup/mistakes + exercise_id; WorkoutSheet.tsx: scop, reglare, execuție, greșeli, alternativă, rezervă, pauză, „pe fiecare parte”, ultima execuție din jurnal', '—'],
], 'small');

// ——— Partea II: exemple ———
h1('Partea II — Exemple generate: 2, 3 și 4 zile');
for (const c of CASES) {
  const { f, weeks, fw } = planFor(c);
  h2(c.title);
  p(`${esc(c.why)} Eligibilă pentru A–D: <b>${wideEligible(f) ? 'da' : 'nu'}</b>. Zilele din calendar: alese din ferestrele libere, cât mai depărtate.`);
  table(['Săpt.', 'Etapa', 'Evaluare', 'Zile', 'Ședințe', 'Minute (total)', 'Ce face săptămâna'], weeks.map((w, i) => [i + 1, `${BLOCK_LABEL[fw[i]!.block]} ${fw[i]!.blockWeek}/${fw[i]!.blockLen}`, fw[i]!.evaluation ? 'da' : '', w.workouts.length, w.workouts.map((x) => `${DAYS[weekday(x.date)]}: ${SESSIONS[parseStrength(x.structure)!.session].name} (${x.plannedMinutes}′)`).join('; '), w.workouts.reduce((n, x) => n + x.plannedMinutes, 0), fitnessWeekAction(i + 1, fw[i]!.variant)]), 'tiny');
  for (const wi of [0, 4, 12, 24]) {
    const w = weeks[wi];
    if (!w) continue;
    h3(`Săptămâna ${wi + 1} — ${BLOCK_LABEL[fw[wi]!.block]}`);
    for (const x of w.workouts) {
      const spec = parseStrength(x.structure)!;
      const rx = prescribe(spec, x.plannedMinutes);
      parts.push(`<div class="wo"><div class="wo-h">${esc(DAYS[weekday(x.date)])} · ${esc(SESSIONS[spec.session].name)} · aproximativ ${x.plannedMinutes} min${SESSIONS[spec.session].estimate ? ` (programul: ${esc(SESSIONS[spec.session].estimate)})` : ''}</div>${rxHtml(rx)}</div>`);
    }
  }
}

// ——— Partea III: progresie ———
h1('Partea III — Progres, stagnare, scădere, durere, menținere');
p('Sugestia pentru data următoare la hip thrust (3 × 8–12, rezervă 2–3), după fiecare ședință notată în jurnal. Kilogramele sunt valori de test.');
const L = (reps: number[][], kg: (number | null)[] | number | null): StrengthLogEntry[] => reps.map((r, i) => ({ date: `2026-11-${String(2 + i * 4).padStart(2, '0')}`, exercise: 'fit-hip-thrust', sets: r.map((n) => ({ kg: Array.isArray(kg) ? kg[i] ?? null : kg, reps: n })), rir: 2, source: 'ajustat' }));
const scen: { title: string; reps: number[][]; kg?: (number | null)[] | number | null; opts?: { pain?: boolean; maintain?: boolean } }[] = [
  { title: 'Progres (exemplul din program)', reps: [[10, 9, 8], [11, 10, 9], [12, 12, 11], [12, 12, 12], [12, 12, 12]] },
  { title: 'După increment (42,5 kg): revine spre 8–10', reps: [[12, 12, 12], [12, 12, 12], [9, 8, 8], [10, 9, 8]], kg: [40, 40, 42.5, 42.5] },
  { title: 'Stagnare', reps: [[10, 10, 9], [10, 10, 9], [10, 10, 9], [10, 10, 9]] },
  { title: 'Scădere două ședințe la rând', reps: [[12, 11, 10], [11, 10, 9], [10, 9, 8]] },
  { title: 'Capătul de sus atins, dar durere raportată', reps: [[12, 12, 12], [12, 12, 12]], opts: { pain: true } },
  { title: 'Menținere (săpt. 21+)', reps: [[12, 12, 12], [12, 12, 12]], opts: { maintain: true } },
  { title: 'Fără kilograme notate („am făcut cum scrie” pe aparat fără cifre)', reps: [[12, 12, 12], [12, 12, 12]], kg: null },
];
for (const s of scen) {
  h3(s.title);
  const log = L(s.reps, 'kg' in s ? s.kg! : 40);
  table(['După ședința', 'Notat', 'Sugestia pentru data următoare', 'Tip'], log.map((_, i) => {
    const r = suggest('fit-hip-thrust', '8–12', '2–3', log.slice(0, i + 1), s.opts);
    return [i + 1, r.last, r.today, r.kind];
  }), 'small');
}

// ——— Partea IV: ratat, timp redus, prezență, oboseală ———
h1('Partea IV — Antrenamente ratate, timp redus, prezență, oboseală');
{
  const { weeks } = planFor(CASES[3]!);
  const all = weeks.flatMap((w) => w.workouts);
  const week = weeks[5]!.workouts;
  h2('Ședință ratată (A, luni) în săptămâna 6, varianta A–D');
  const r = adapt(all, { kind: 'forta-ratat', workoutId: week[0]!.id }, { today: week[1]!.date, freeBlocks: FREE, recentKeyScores: [] });
  const after = new Map(r.plan.map((w) => [w.id, w]));
  table(['Zi', 'Înainte', 'După'], week.map((w) => [DAYS[weekday(w.date)], `${SESSIONS[parseStrength(w.structure)!.session].name} (${w.plannedMinutes}′)`, w.id === week[0]!.id ? 'ratată (trecut, rămâne cum era)' : `${SESSIONS[parseStrength(after.get(w.id)!.structure)!.session].name} (${after.get(w.id)!.plannedMinutes}′)`]), 'small');
  p(`Ce a schimbat codul: ${esc(r.changes.join('; '))}. Numărul de ședințe al săptămânii nu crește; săptămâna următoare pornește iar de la A.`);

  h2('Timp redus — ședința A (construire)');
  const spec: StrengthSpec = { session: 'fa', block: 'construire', week: 2, len: 4 };
  table(['Minute disponibile', 'Durata estimată', 'Ce rămâne', 'Ce pleacă'], [90, 60, 50, 45, 35, 30].map((m) => {
    const rx = prescribe(spec, m);
    return [m, rx.minutes, rx.items.map((x) => `${x.ex.name} ${x.sets}×`).join('; '), rx.trimmed.join('; ') || '—'];
  }), 'small');
  p('Pauzele nu se scurtează; pleacă întâi seriile accesoriilor, apoi accesoriile, trunchiul la urmă; mișcările principale rămân. Patru ședințe nu se înghesuie în două.');

  h2('Prezența decide frecvența (începătoare care a ales 4 zile)');
  const f = { days: 4 as const, beginner: true };
  const traj: [string, { planned: number; done: number }[]][] = [
    ['bună: 2/2 timp de 3 săptămâni, apoi 3/3 timp de 3', [...Array(3).fill({ planned: 2, done: 2 }), ...Array(3).fill({ planned: 3, done: 3 })]],
    ['bună la început, apoi 2/3', [...Array(3).fill({ planned: 2, done: 2 }), ...Array(6).fill({ planned: 3, done: 2 })]],
    ['slabă: 1 din 2', Array(12).fill({ planned: 2, done: 1 })],
    ['o săptămână ratată la mijloc', [{ planned: 2, done: 2 }, { planned: 2, done: 2 }, { planned: 2, done: 0 }, ...Array(3).fill({ planned: 2, done: 2 })]],
  ];
  table(['Traiectorie', 'Zile deblocate'], traj.map(([t, w]) => [t, unlockedDays(f, w)]), 'small');

  h2('Oboseală la bilanțul de duminică → revizuire în săptămâna următoare');
  const sunday = '2026-12-06';
  const rr = adapt(all, { kind: 'bilant', date: sunday, obosit: true, motiv: 'energie 2/5' }, { today: sunday, freeBlocks: FREE, recentKeyScores: [] });
  const nxt = rr.plan.filter((w) => w.date > sunday && w.date <= '2026-12-13');
  for (const w of nxt) {
    const before = all.find((x) => x.id === w.id)!;
    const a = prescribeFull(parseStrength(before.structure)!);
    const b = prescribeFull(parseStrength(w.structure)!);
    parts.push(`<p>${esc(DAYS[weekday(w.date)])} · ${esc(SESSIONS[b.spec.session].name)}: serii ${a.items.reduce((n, x) => n + x.sets, 0)} → ${b.items.reduce((n, x) => n + x.sets, 0)}, rezervă ${esc(a.items[0]!.rir)} → ${esc(b.items[0]!.rir)}</p>`);
  }
}

// ——— Partea V: longitudinal ———
h1('Partea V — Simularea longitudinală (8 săptămâni)');
p('Aceeași simulare ca la celelalte sporturi (src/sim/longitudinal.ts): ședințe ratate (sala ratată ieri → rotația continuă a doua zi), parțiale, zi galbenă și roșie, febră, efort neplanificat, durere, pauză de 10 zile și revenire, bilanț; fiecare eveniment livrat de două ori. Invariante: trecutul nu se rescrie, nimic nu crește peste plan și nu se adaugă, cel mult o ședință de sală pe zi.');
{
  const rows: (string | number)[][] = [];
  for (const goal of ['fit-tonifiere', 'fit-slabire', 'fit-intretinere'] as const) for (const level of ['debutant', 'intermediar', 'avansat'] as const) {
    const r = runLongitudinal(input({ goal, sex: 'f', age: 30, level, intens: 'toate' }));
    rows.push([goal, level, r.violations.length ? `${r.violations.length}: ${r.violations[0]}` : '0', `${r.counts.done} / ${r.counts.partial} / ${r.counts.missed}`, r.log.filter((l) => /rotația/.test(l.what)).length, r.counts.duplicatesIgnored, `${Math.round(r.plan0Minutes / 6) / 10} → ${Math.round(r.planMinutes / 6) / 10}`]);
  }
  table(['Obiectiv', 'Nivel (2 / 3 / 4 zile)', 'Încălcări', 'Făcute / parțiale / ratate', 'Rotații continuate', 'Dubluri ignorate', 'Ore în 8 săpt.: plan → după'], rows, 'small');
}

// ——— Partea VI: teste și limite ———
h1('Partea VI — Teste și ce nu e implementat');
const tap = process.env.TESTS_TAP ? readFileSync(process.env.TESTS_TAP, 'utf8') : '';
if (tap) {
  const lines = [...tap.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)].map((m) => [m[1] === 'ok' ? 'trece' : 'PICĂ', m[2]!]);
  const total = /# pass (\d+)/.exec(tap)?.[1];
  const fail = /# fail (\d+)/.exec(tap)?.[1];
  p(`Testele programului de fitness (tests/fitness-program.test.ts, tests/fitness.test.ts). Suita completă a aplicației: ${esc(total ?? '?')} trec, ${esc(fail ?? '?')} pică.`);
  table(['Rezultat', 'Test'], lines, 'small');
}
h2('Ce nu e implementat (onest)');
parts.push(`<ul>
<li>Demonstrații video verificate pentru exerciții: nu există; aplicația spune asta și descrie execuția în text.</li>
<li>Importul programului antrenoarei (săptămânile din material): nu e importat; materialul are săptămâni incomplete și o duplicare, iar documentul cere deduplicare și identificarea fiecărei mișcări înainte.</li>
<li>Preferințele de exerciții ale sportivei (ex. „prefer genuflexiunea la presă”): nu se pot alege încă din aplicație; alternativele sunt afișate, dar alegerea nu se salvează.</li>
<li>Cardio-ul rămâne recomandare săptămânală în text (efort și testul vorbirii), nu ședință în calendar și nu intră în bugetul de timp al ședinței de sală.</li>
<li>Durerea oprește progresia când e raportată în formularul de seară (≥ 3/10); nu există încă un câmp de simptom per exercițiu în jurnal.</li>
<li>Stagnarea și scăderea sunt detectate per exercițiu, din jurnal; nu există încă o revizuire automată a întregii săptămâni pe baza jurnalului (revizuirea vine din bilanțul de duminică).</li>
<li>Sarcina și postpartum rămân pe ramura existentă (două zile, fără ramura de slăbire), nu un program dedicat.</li>
</ul>`);

const css = `@page{size:A4;margin:14mm 12mm}body{font:10.5pt/1.45 -apple-system,'Segoe UI',Roboto,sans-serif;color:#111}h1{font-size:19pt}h1.part{page-break-before:always;border-bottom:2px solid #111;padding-bottom:4px}h2{font-size:13.5pt;margin:18px 0 6px;page-break-after:avoid}h3{font-size:11pt;margin:12px 0 4px;page-break-after:avoid}.cover h1{font-size:24pt;margin-top:60px}.sub{color:#555}table{border-collapse:collapse;width:100%;margin:6px 0 10px}th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}th{background:#f2f2f2}table.small{font-size:8pt}table.tiny{font-size:7pt}tr{page-break-inside:avoid}.wo{border:1px solid #ddd;border-radius:6px;padding:6px 8px;margin:6px 0;page-break-inside:avoid}.wo-h{font-weight:700;margin-bottom:4px}.note{color:#444;font-size:8.5pt;margin:2px 0}.id{color:#888;font:7pt ui-monospace,monospace}`;
writeFileSync(join(OUT, 'airon-fitness-26.html'), `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>AIRON — fitness 26 de săptămâni</title><style>${css}</style></head><body>${parts.join('\n')}</body></html>`);
console.log('ok');
