// Etapa 4 (auditul consolidat): cele patru profiluri sintetice, pe trei orizonturi (14 zile, 6 și 24 de săptămâni),
// prin simulatorul longitudinal (aceleași reguli de adaptare ca serverul, evenimente trimise de două ori), plus
// verificările specifice fiecărui profil. Date sintetice; timpul e simulat, nu ceasul producției.
// Rulare: npx tsx scripts/probes/personas.ts
import { runLongitudinal, type Scenario } from '../../src/sim/longitudinal.js';
import { generatePlan, type GenerateInput } from '../../src/calendar/generate.js';
import { detailSteps } from '../../src/calendar/session-detail.js';
import { durationMismatch } from '../../src/calendar/duration-check.js';
import { shortenWorkout } from '../../src/calendar/validate.js';
import { carryAdjustments, planSignature } from '../../src/calendar/regen-carry.js';
import { moveWorkout } from '../../src/calendar/actions.js';
import { fitnessProfile } from '../../src/strength/fitness.js';
import { input } from '../audit-profiles.js';
import { addDays } from '../../src/util/dates.js';

const START = '2026-10-26';
const personas: { id: string; what: string; inp: GenerateInput }[] = [
  {
    id: 'P1',
    what: '35 ani, Ironman 70.3, niveluri diferite pe probe (înot 50 m continuu, bicicletă medie, alergare bună)',
    inp: { ...input({ goal: '70.3', sex: 'm', age: 35, level: 'intermediar', intens: 'toate', hours: 10 }), swim: { continuousM: 50 }, swimContinuous400: false, level: { longestRideH: 2, longestRunKm: 16, easyPaceSecKm: 340 } },
  },
  {
    id: 'P2',
    what: '46 ani, 10 km în 56 min (5:36/km), istoric modest; capacitatea de acum 6:10/km',
    inp: { ...input({ goal: '10k', sex: 'f', age: 46, level: 'intermediar', intens: 'toate', hours: 4 }), historyHoursPerWeek: [2.5, 3, 2, 3, 2.5, 3, 2, 3], run: { goalPaceSecKm: 336, nowPaceSecKm: 370, canDoDistance: true, longestRunKm: 10, branch: 'timp', beginner: false } },
  },
  {
    id: 'P3',
    what: '30 ani, fitness: slăbire, 3 zile, uneori doar 30 min',
    inp: { ...input({ goal: 'fit-slabire', sex: 'f', age: 30, level: 'intermediar', intens: 'toate' }), fitness: fitnessProfile('fit-slabire', { experienta: 'stabila', zile: 3, minute: 60, acces: 'sala', miscare: 'plimbari' }) },
  },
  {
    id: 'P4',
    what: '60 ani, sportiv antrenat (9 h/săpt.), aviz cardiologic declarat; o zi de recuperare slabă',
    inp: { ...input({ goal: 'semimaraton', sex: 'm', age: 60, level: 'avansat', intens: 'toate' }), vigorousCleared: true },
  },
];

const horizons: [string, number][] = [['14 zile', 2], ['6 săptămâni', 6], ['24 de săptămâni', 24]];
const scenarios: Scenario[] = ['mixt', 'succes'];
console.log('| Profil | Orizont | Scenariu | Invariante | Făcute / ratate / parțiale | Duplicate ignorate | Plan min (start → după) | Trepte (progres/păstrat/regres/recalibrare) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const p of personas) {
  for (const [hl, wk] of horizons) for (const sc of scenarios) {
    const r = runLongitudinal(p.inp, wk, 7, sc, START);
    console.log(`| ${p.id} | ${hl} | ${sc} | ${r.ok && !r.violations.length ? 'OK' : `${r.violations.length} încălcări: ${r.violations.slice(0, 2).join('; ')}`} | ${r.counts.done} / ${r.counts.missed} / ${r.counts.partial} | ${r.counts.duplicatesIgnored} | ${r.plan0Minutes} → ${r.planMinutes} | ${r.steps.progress}/${r.steps.keep}/${r.steps.regress}/${r.steps.recalibrate} |`);
  }
}

console.log('\nVerificări specifice:');
// P1: probe la niveluri diferite, durate coerente, alimentare în ședințele lungi.
{
  const r = generatePlan(personas[0]!.inp);
  if (r.ok) {
    const all = r.weeks.flatMap((w) => w.workouts);
    const w1 = r.weeks[0]!.workouts;
    const by = (sp: string) => w1.filter((x) => x.sport === sp).map((x) => `${x.type}:${x.plannedMinutes}`).join(',');
    console.log(`P1 săpt. 1: înot [${by('inot')}], bicicletă [${by('bicicleta')}], alergare [${by('alergare')}]`);
    const swimSeg = detailSteps(w1.find((x) => x.sport === 'inot')!, { age: 35, swimContinuousM: 50 }).map((s) => s.text).join(' ');
    console.log(`P1 înot (capacitate 50 m): segmentele cele mai lungi din săpt. 1 → ${[...swimSeg.matchAll(/(\d+) × (\d+) m/g)].map((m) => m[2]).sort((a, b) => Number(b) - Number(a))[0]} m`);
    const longOnes = all.filter((x) => x.plannedMinutes >= 90 && (x.sport === 'bicicleta' || x.sport === 'alergare'));
    const fueled = longOnes.filter((x) => /carbohidrați/.test(detailSteps(x, { age: 35 }).map((s) => s.text).join(' ')));
    console.log(`P1 alimentare: ${fueled.length}/${longOnes.length} ședințe de bicicletă/alergare ≥ 90 min au alimentarea în pași`);
    console.log(`P1 durate: ${all.filter((x) => durationMismatch(x, detailSteps(x, { age: 35 }))).length} nepotriviri pași ≠ calendar din ${all.length} ședințe`);
  }
}
// P2: ritmul-țintă 5:36/km apare spre final; la început ritmul de acum; două zile ratate; „refă planul” păstrează mutarea.
{
  const r = generatePlan(personas[1]!.inp);
  if (r.ok) {
    const paces = r.weeks.map((w) => w.workouts.map((x) => /orientativ (\d+:\d{2})\/km/.exec(x.structure ?? '')?.[1]).find(Boolean)).filter(Boolean);
    console.log(`P2 ritm orientativ în module: primul ${paces[0]}, ultimul ${paces[paces.length - 1]} (ținta 5:36, acum 6:10)`);
    const plan = r.weeks.flatMap((w) => w.workouts);
    const today = r.weeks[2]!.weekStart;
    const mv = plan.find((x) => x.date > today && x.date < addDays(today, 7) && x.type === 'z2');
    if (mv) {
      const target = [1, 2, 3, 4, 5, 6].map((d) => addDays(r.weeks[2]!.weekStart, d)).find((d) => d > mv.date && !plan.some((x) => x.date === d));
      const moved = target ? (() => { try { return moveWorkout(plan, mv.id, target, today, `${today}T08:00:00Z`); } catch { return null; } })() : null;
      if (moved) {
        const old = plan.map((x) => (x.id === moved.id ? moved : x));
        const regen = generatePlan(personas[1]!.inp);
        if (regen.ok) {
          const c = carryAdjustments(regen.weeks.flatMap((w) => w.workouts), old, today, today, `${today}T09:00:00Z`);
          const sig1 = planSignature(c.workouts);
          const sig2 = planSignature(carryAdjustments(regen.weeks.flatMap((w) => w.workouts), old, today, today, `${today}T09:00:00Z`).workouts);
          console.log(`P2 „refă planul”: ajustări păstrate ${c.kept.length} (${c.kept[0] ?? '—'}), căzute ${c.dropped.length}; amprenta identică la a doua confirmare: ${sig1 === sig2}`);
        }
      }
    }
  }
}
// P3: ședințe complete, „am doar 30 min” pe sală.
{
  const r = generatePlan(personas[2]!.inp);
  if (r.ok) {
    const f = r.weeks.flatMap((w) => w.workouts).filter((x) => x.sport === 'forta');
    const s = shortenWorkout(f[3]!, 30);
    console.log(`P3: ${f.length} ședințe de sală în ${r.weeks.length} săptămâni; durate ${Math.min(...f.map((x) => x.plannedMinutes))}–${Math.max(...f.map((x) => x.plannedMinutes))} min; „am doar 30 min” → ${s.plannedMinutes} min („${(s.structure ?? '').slice(0, 90)}”)`);
  }
}
// P4: aceeași doză ca un sportiv de 35 de ani cu aceleași date? (diferența așteptată: descărcarea la 3 săptămâni)
{
  const a = generatePlan(personas[3]!.inp);
  const b = generatePlan({ ...personas[3]!.inp, athlete: { age: 35, sex: 'm' } });
  if (a.ok && b.ok) {
    const sum = (r: typeof a) => (r.ok ? Math.round(r.weeks.reduce((n, w) => n + w.plannedHours, 0)) : 0);
    const z5 = (r: typeof a) => (r.ok ? r.weeks.flatMap((w) => w.workouts).filter((x) => x.targetZones.includes(5)).length : 0);
    const rec = (r: typeof a) => (r.ok ? r.weeks.filter((w) => w.recovery).length : 0);
    console.log(`P4 60 vs 35 ani (aceleași date): ore totale ${sum(a)} vs ${sum(b)}; ședințe Z5 ${z5(a)} vs ${z5(b)}; săptămâni de descărcare ${rec(a)} vs ${rec(b)} (descărcarea la 3 săptămâni de la 40 de ani e singura regulă de vârstă rămasă)`);
  }
}
