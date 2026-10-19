// Simulatorul temporal cerut în auditul de simulări live (secțiunea 06), pe ACELAȘI motor ca aplicația, offline:
// profiluri sintetice, evenimente datate, zile virtuale. Nu atinge producția și nu schimbă ceasul serverului.
// Rulare: npx tsx scripts/simulate-live.ts [fișier.json]
import { writeFileSync } from 'node:fs';
import { generatePlan } from '../src/calendar/generate.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import { coherenceIssues } from '../src/calendar/coherence.js';
import { applyAway, easyWorkout } from '../src/calendar/actions.js';
import { carryAdjustments, planSignature, weekTotals } from '../src/calendar/regen-carry.js';
import { activeRestriction } from '../src/calendar/safety.js';
import { decideDay } from '../src/calendar/day.js';
import { outcomeFeedback, type Outcome } from '../src/calendar/outcomes.js';
import { objectiveReadiness } from '../src/collector/readiness.js';
import { dedupeActivities } from '../src/collector/packet.js';
import { runLongitudinal } from '../src/sim/longitudinal.js';
import { decideFamily, FAMILIES } from '../src/calendar/progression.js';
import { input, type Profile } from './audit-profiles.js';
import { fitnessProfile } from '../src/strength/fitness.js';
import { HOME_EQUIP, parseStrength, prescribe } from '../src/strength/ppl.js';
import { adapt } from '../src/calendar/adapt.js';
import type { PlannedWorkout } from '../src/types.js';

type Row = { caz: string; asteptat: string; observat: string; rezultat: 'TRECUT' | 'EȘUAT' | 'NEIMPLEMENTAT' };
const rows: Row[] = [];
const add = (caz: string, asteptat: string, observat: string, ok: boolean | null) => rows.push({ caz, asteptat, observat, rezultat: ok == null ? 'NEIMPLEMENTAT' : ok ? 'TRECUT' : 'EȘUAT' });
const AT = '2026-10-19T08:00:00Z';

// Profilul din audit: bărbat 46, 10 km, luni/marți/joi/sâmbătă 06–08, 4 h.
const tenK = { ...input({ goal: '10k', sex: 'm', age: 46, level: 'intermediar', intens: 'toate', hours: 4 }), freeBlocks: [0, 1, 3, 5].map((day) => ({ day: day as 0, startMin: 360, endMin: 480 })) };
const base = generatePlan(tenK);
if (!base.ok) throw new Error(base.reason);
const all = base.weeks.flatMap((w) => w.workouts);

// 1. Execuții tolerate → progres justificat.
const succ = runLongitudinal(tenK, 8, 7, 'succes', '2026-12-28');
add('Zilele 1–7 (și mai departe): execuții tolerate', 'progres justificat, nu doar reduceri', `trepte: ${JSON.stringify(succ.steps)}; atinse: ${Object.entries(succ.reached).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}`, succ.steps.progress > 0 && succ.violations.length === 0);

// 2. O zi obosită vs. 3–5 zile obosite.
const q = all.find((w) => w.type === 'calitate')!;
const prev = all.filter((w) => w.date < q.date).slice(-3);
const one: Outcome[] = [{ workoutId: prev[2]!.id, date: prev[2]!.date, status: 'ratat', motiv: 'oboseala' }];
const many: Outcome[] = prev.map((w) => ({ workoutId: w.id, date: w.date, status: 'ratat' as const, motiv: 'oboseala' as const }));
const today = prev[2]!.date;
const f1 = outcomeFeedback(all, one, one[0]!, today, AT);
const f3 = outcomeFeedback(all, many, many[2]!, today, AT);
add('O zi obosită, apoi 3 zile obosite', 'episodul izolat păstrează planul; persistența ușurează, cu dovezi; fără diagnostic', `1 zi: ${f1.decision}; 3 zile: ${f3.decision} (${f3.changed[0]?.note ?? 'nicio ședință grea în 7 zile'})`, f1.decision === 'pastrat' && (f3.decision === 'modificat' || /nicio ședință grea|nu ai nicio/.test(f3.message)) && !/diagnostic/i.test(f3.message));

// 3. O ședință ratată din lipsă de timp.
const ft = outcomeFeedback(all, [{ ...one[0]!, motiv: 'timp' }], { ...one[0]!, motiv: 'timp' }, today, AT);
add('1 ședință ratată din lipsă de timp', 'fără incapacitate inventată, fără dublare, explică', ft.message, ft.decision === 'pastrat' && /nu o recuperăm prin dublare/i.test(ft.message) && /nu înseamnă că nu poți/.test(ft.message));

// 4. 2–3 ratate pentru oboseală → nu avansează; reevaluează doza.
const lf = runLongitudinal(tenK, 8, 7, 'stagnare', '2026-12-28');
add('2–3 ședințe ratate / prost tolerate', 'nu avansează automat la modulul mai greu', `progres: ${lf.steps.progress}, păstrat: ${lf.steps.keep}, regres: ${lf.steps.regress}`, lf.steps.progress === 0);

// 5. 7–14 zile fără antrenament.
const back = runLongitudinal(tenK, 8, 7, 'revenire', '2026-12-28');
add('Pauză lungă, apoi revenire', 'la revenire recalibrează, nu reia orbește', `recalibrări: ${back.steps.recalibrate}; regula: >21 de zile fără expunere pe familie`, back.steps.recalibrate > 0);
{
  const fam = FAMILIES.find((x) => x.id === 'T')!;
  const done = { date: '2026-11-02', step: 1, ex: { workoutId: 'a', color: 'verde' as const, rpe: 5, pain: 0 } };
  const ill = { date: '2026-11-06', step: 1, ex: { workoutId: 'b', color: null, outcome: { status: 'ratat' as const, motiv: 'boala' as const } } };
  const busy = { date: '2026-11-06', step: 1, ex: { workoutId: 'b', color: null, outcome: { status: 'ratat' as const, motiv: 'timp' as const } } };
  const a1 = decideFamily(fam, [done, ill], 1, '2026-11-14');
  const a2 = decideFamily(fam, [done, busy], 1, '2026-11-14');
  add('12 zile fără antrenament: din boală vs. din lipsă de timp', 'reluarea depinde de cauză; nu reia orbește', `boală → ${a1.decision} (${a1.evidence}); timp → ${a2.decision} (${a2.evidence})`, a1.decision === 'recalibrate' && a2.decision === 'keep');
}

// 6. Feedback lipsă / întârziat.
const nf = runLongitudinal(tenK, 8, 7, 'fara-feedback', '2026-12-28');
const late = runLongitudinal(tenK, 8, 7, 'intarziat', '2026-12-28');
add('Feedback lipsă', 'necunoscut ≠ fără durere; nu avansează', `progres: ${nf.steps.progress}`, nf.steps.progress === 0);
add('Feedback întârziat', 'același rezultat ca la timp, fără dublare', `trepte la timp: ${JSON.stringify(succ.reached)}; întârziat: ${JSON.stringify(late.reached)}; dubluri ignorate: ${late.counts.duplicatesIgnored}`, JSON.stringify(late.reached) === JSON.stringify(succ.reached));

// 7. Readiness scăzut / puls crescut (date sintetice cu referință personală), separat de chestionar.
const low = objectiveReadiness({ hrv: 28, hrvBaseline: 45, rhr: 62, rhrBaseline: 52, resp: null, respBaseline: null, sleepMin: 330, recovery: null } as never);
add('HRV scăzut + puls de repaus crescut', 'scor obiectiv separat de chestionar, cu referința personală', `scor obiectiv ${low.scor}/100 (HRV 28 vs 45, puls 62 vs 52, somn 5,5 h)`, low.scor != null && low.scor < 60);

// 8. Alertă de ritm neregulat de la ceas.
add('Alertă de ritm neregulat + readiness bun', 'alerta nu e anulată de scor; traseu de reevaluare', 'importul alertelor de ritm de pe ceas nu există; doar simptomul declarat în formular e tratat (stop azi, apoi galben până la evaluare)', null);

// 9. Ziua următoare după Stop.
const mornings = [{ date: '2026-11-01', semnale: { simptom_cardiac: true } }];
const d2 = activeRestriction({ today: '2026-11-02', morning: { date: '2026-11-02', semnale: { simptom_cardiac: false } }, evenings: [], mornings });
add('Ziua de după un simptom cardiac (test intens programat)', 'restricția persistă; testul intens nu e eligibil; fără aviz inventat', `${d2?.verdict}: ${d2?.reason}`, d2?.verdict === 'galben' && /fără teste/.test(d2.reason));

// 10. Ceasul înainte/după feedback + retry; două activități reale.
const a = { id: 'g1', source: 'garmin', externalId: 'g1', date: '2026-11-03', sport: 'alergare', minutes: 40, startLocal: '07:00' };
const dup = dedupeActivities([a, { ...a, id: 'g1b', source: 'apple', externalId: 'a1' }] as never);
const two = dedupeActivities([a, { ...a, id: 'g2', externalId: 'g2', startLocal: '18:00', minutes: 30 }] as never);
add('Aceeași activitate de două ori + retry; două activități reale', 'aceeași nu se dublează; două reale nu se contopesc', `duplicat → ${dup.length}; două reale → ${two.length}`, dup.length === 1 && two.length === 2);

// 11. Refacere după fiecare eveniment: pauză + „Fă-o ușoară” rămân; previzualizare = activare.
const wk = all.filter((w) => w.date >= '2026-10-26' && w.date < '2026-11-02');
const sat = wk.find((w) => w.type === 'lung')!;
const old = wk.map((w) => (w.id === sat.id ? easyWorkout(w, AT) : w));
const away = { dela: '2026-10-27', panala: '2026-10-29', ce: 'nimic' as const };
let cand = generatePlan(tenK);
if (!cand.ok) throw new Error('x');
let fut: PlannedWorkout[] = cand.weeks.flatMap((w) => w.workouts).filter((w) => w.date >= '2026-10-26');
const ch = new Map(applyAway(fut, away, '2026-10-19', AT).map((w) => [w.id, w]));
fut = fut.map((w) => ch.get(w.id) ?? w);
const carried = carryAdjustments(fut, old, '2026-10-26', '2026-10-19', AT);
const t1 = weekTotals(carried.workouts, '2026-10-26', '2026-11-02');
const again = carryAdjustments(fut, carried.workouts.filter((w) => w.date < '2026-11-02'), '2026-10-26', '2026-10-19', AT);
add('Refacere după pauză + reducere manuală', 'aceleași restricții și adaptări; previzualizare = activare; a doua refacere identică', `${t1.sessions} ședințe, ${t1.hours} h; păstrat: ${carried.kept.join(' | ')}; amprentă stabilă: ${planSignature(carried.workouts) === planSignature(again.workouts)}`, carried.kept.length === 1 && planSignature(carried.workouts) === planSignature(again.workouts));

// 12. Obiectiv aproape vs. îndepărtat.
const near = generatePlan({ ...tenK, raceDate: '2026-11-08' });
const far = generatePlan(tenK);
add('Obiectiv foarte aproape vs. îndepărtat', 'fără probabilități inventate; explică dacă e nevoie de altă dată', `aproape: ${near.ok ? 'plan generat' : near.reason}; departe: ${far.ok ? `${far.weeks.length} săptămâni` : far.reason}`, !near.ok && far.ok);

// Zi obosită fără ședințe (T02).
const rest = decideDay({ state: { verdict: 'rosu', motiv: 'cum te simți azi (24/28) coboară ziua la rosu' }, readiness: null, restriction: null, todayPlan: [] });
add('Oboseală mare într-o zi de pauză', 'explică: azi era deja pauză, planul rămâne, se reevaluează', rest?.action ?? '—', /era deja pauză/.test(rest?.action ?? ''));

// Matricea multi-profil: coerență (rezumat = pași), buget respectat, fără erori.
const matrix: { p: Profile; label: string }[] = [
  { p: { goal: 'fit-tonifiere', sex: 'f', age: 30, level: 'intermediar', intens: 'toate' }, label: 'fitness femeie 30' },
  { p: { goal: 'fit-slabire', sex: 'f', age: 52, level: 'debutant', intens: 'toate' }, label: 'fitness femeie 52' },
  { p: { goal: '5k', sex: 'm', age: 24, level: 'intermediar', intens: 'toate' }, label: '5 km / 24' },
  { p: { goal: '10k', sex: 'm', age: 46, level: 'debutant', intens: 'toate', hours: 4 }, label: '10 km / 46' },
  { p: { goal: 'semimaraton', sex: 'f', age: 62, level: 'intermediar', intens: 'toate' }, label: 'semimaraton / 62' },
  { p: { goal: 'maraton', sex: 'm', age: 40, level: 'avansat', intens: 'toate' }, label: 'maraton / 40' },
  { p: { goal: '70.3', sex: 'm', age: 36, level: 'intermediar', intens: 'toate' }, label: '70.3 / 36' },
  { p: { goal: 'bike-160', sex: 'm', age: 45, level: 'intermediar', intens: 'toate' }, label: 'bicicletă 160 / 45' },
  { p: { goal: 'inot-1900', sex: 'f', age: 55, level: 'intermediar', intens: 'toate' }, label: 'înot 1.900 / 55' },
];
for (const { p, label } of matrix) {
  const inp = input(p);
  const r = generatePlan(inp);
  if (!r.ok) {
    add(`Profil: ${label}`, 'plan coerent, în buget', r.reason, false);
    continue;
  }
  const ws = r.weeks.flatMap((w) => w.workouts);
  const issues = ws.flatMap((w) => coherenceIssues(w, detailSteps(w, { age: p.age })));
  const cap = Math.round(r.budgetHours * 60);
  const over = r.weeks.filter((w) => w.workouts.reduce((n, x) => n + x.plannedMinutes, 0) > cap).length;
  add(`Profil: ${label}`, 'rezumat = pași; nicio săptămână peste buget', `${r.weeks.length} săpt., ${ws.length} ședințe; nepotriviri: ${issues.length}; săptămâni peste ${r.budgetHours} h: ${over}`, issues.length === 0 && over === 0);
}

// Auditul F55: femeie 55, fitness acasă (gantere + bandă), 3 zile dorite, 35 min, începătoare. Planul complet: nimic de
// sală în nicio ședință din 26 de săptămâni, aceeași durată în calendar și în prescripție, apoi febră → aceeași regulă.
{
  // Regula proprietarului (19.10.2026): nicio ședință sub 45 de minute. Ferestre de 35 min = plan refuzat, cu motiv.
  const short = generatePlan({ ...input({ goal: 'fit-masa', sex: 'f', age: 55, level: 'debutant', intens: 'toate' }), freeBlocks: [0, 2, 4].map((day) => ({ day: day as 0, startMin: 19 * 60, endMin: 19 * 60 + 35 })), fitness: fitnessProfile('fit-masa', { experienta: 'incepatoare', zile: 3, minute: 45, acces: 'acasa', miscare: 'sedentara' }) });
  add('F55 ferestre de 35 min', 'fără plan sub 45 de minute, cu motiv', short.ok ? 'plan generat' : short.reason, !short.ok && /45 de minute/.test(short.reason));
  const fin = { ...input({ goal: 'fit-masa', sex: 'f', age: 55, level: 'debutant', intens: 'toate' }), freeBlocks: [0, 2, 4].map((day) => ({ day: day as 0, startMin: 19 * 60, endMin: 19 * 60 + 50 })), fitness: fitnessProfile('fit-masa', { experienta: 'incepatoare', zile: 3, minute: 45, acces: 'acasa', miscare: 'sedentara' }) };
  const r = generatePlan(fin);
  if (!r.ok) add('F55 fitness acasă', 'plan eligibil', r.reason, false);
  else {
    const ws = r.weeks.flatMap((w) => w.workouts);
    const gym = ws.flatMap((w) => prescribe(parseStrength(w.structure)!, w.plannedMinutes).items.filter((it) => !(it.ex.equip ?? []).every((e) => HOME_EQUIP.includes(e))).map((it) => `${w.date} ${it.ex.name}`));
    const mismatch = ws.filter((w) => prescribe(parseStrength(w.structure)!, w.plannedMinutes).minutes !== w.plannedMinutes);
    add('F55 fitness acasă: echipament', 'zero exerciții cu aparat/cablu/bară/bancă în 26 de săptămâni', `${ws.length} ședințe; exerciții de sală: ${gym.length}${gym.length ? ` (${gym.slice(0, 2).join('; ')})` : ''}`, gym.length === 0);
    add('F55 fitness acasă: o singură durată', 'durata din calendar = durata prescripției, la fiecare ședință', `nepotriviri: ${mismatch.length} din ${ws.length}`, mismatch.length === 0);
    const after = adapt(ws.filter((w) => w.date < '2026-11-10'), { kind: 'febra', date: '2026-10-26' }, { today: '2026-10-26', freeBlocks: [], recentKeyScores: [] }).plan.filter((w) => w.status !== 'anulat_sistem' && w.note?.includes('febr'));
    const bad = after.filter((w) => prescribe(parseStrength(w.structure)!, w.plannedMinutes).minutes !== w.plannedMinutes);
    add('F55 febră: ședințele de după', 'forță ușoară (greutăți mai mici, ≥ 45 min, 3 serii), aceeași durată în calendar și detaliu; mesaj condiționat', `${after.length} ședințe ușurate; nepotriviri: ${bad.length}; nota: „${after[0]?.note ?? '—'}”`, after.length > 0 && bad.length === 0 && after.every((w) => w.plannedMinutes >= 45 && parseStrength(w.structure)!.recovery) && /doar dacă/.test(after[0]!.note ?? ''));
  }
}

const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`${r.rezultat.padEnd(13)} ${r.caz}\n              ${r.observat}`);
console.log(`\n${rows.filter((r) => r.rezultat === 'TRECUT').length} trecute, ${rows.filter((r) => r.rezultat === 'EȘUAT').length} eșuate, ${rows.filter((r) => r.rezultat === 'NEIMPLEMENTAT').length} neimplementate`);
