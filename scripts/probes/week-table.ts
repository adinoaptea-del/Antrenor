// A3 (auditul consolidat): TOATE săptămânile unui plan, nu doar câteva — faza, descărcarea, ținta și orele planificate,
// ieșirile lungi și volumul pe sport, cu variația față de săptămâna anterioară. Fără un procent „sigur” impus: tabelul
// arată salturile, iar regula care le produce e citată din cod. Rulare: npx tsx scripts/probes/week-table.ts [obiectiv] [nivel] [vârsta] [ore]
import { generatePlan } from '../../src/calendar/generate.js';
import { input, type Level } from '../audit-profiles.js';
import type { Goal } from '../../src/calendar/phases.js';

const goal = (process.argv[2] ?? '70.3') as Goal;
const level = (process.argv[3] ?? 'debutant') as Level;
const age = Number(process.argv[4] ?? 35);
const hours = process.argv[5] ? Number(process.argv[5]) : undefined;
const r = generatePlan(input({ goal, sex: 'm', age, level, intens: 'toate', hours }));
if (!r.ok) {
  console.log('plan refuzat:', r.reason);
  process.exit(0);
}
const sum = (ws: { sport: string; plannedMinutes: number; status: string }[], sp: string) => ws.filter((x) => x.sport === sp && x.status !== 'anulat_sistem').reduce((n, x) => n + x.plannedMinutes, 0);
const longOf = (ws: { sport: string; type: string; plannedMinutes: number }[], sp: string) => Math.max(0, ...ws.filter((x) => x.sport === sp && (x.type === 'lung' || x.type === 'brick')).map((x) => x.plannedMinutes));
const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '—');
console.log(`| Săpt. | Început | Fază | Desc. | Țintă h | Plan h | Δ plan | Alergare min | Δ | Lungă alerg. | Δ | vs. max 30 z | Bicicletă min | Lungă bic. | Înot min |`);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
let prev: { h: number; run: number; lr: number } | null = null;
const longs: number[] = [];
let maxSpike = 0;
r.weeks.forEach((w, i) => {
  const run = sum(w.workouts, 'alergare');
  const lr = longOf(w.workouts, 'alergare');
  // Ieșirea lungă față de cea mai lungă din cele 4 săptămâni anterioare (~30 de zile, cum măsoară cohorta din 2025).
  const max30 = Math.max(0, ...longs.slice(-4));
  const spike = lr && max30 ? Math.round(((lr - max30) / max30) * 100) : null;
  if (spike != null) maxSpike = Math.max(maxSpike, spike);
  longs.push(lr);
  console.log(`| ${i + 1} | ${w.weekStart} | ${w.phase} | ${w.recovery ? 'da' : ''} | ${w.targetHours} | ${w.plannedHours} | ${prev ? pct(w.plannedHours, prev.h) : '—'} | ${run} | ${prev ? pct(run, prev.run) : '—'} | ${lr || '—'} | ${prev && lr && prev.lr ? pct(lr, prev.lr) : '—'} | ${spike == null ? '—' : `${spike > 0 ? '+' : ''}${spike}%`} | ${sum(w.workouts, 'bicicleta')} | ${longOf(w.workouts, 'bicicleta') || '—'} | ${sum(w.workouts, 'inot')} |`);
  prev = { h: w.plannedHours, run, lr };
});
console.log(`\nCel mai mare salt al ieșirii lungi față de cea mai lungă din ultimele 4 săptămâni: +${maxSpike}% (informativ; nu e un prag validat pentru minute, vezi raportul).`);
