// Proba T02 / „început prea blând” (auditul consolidat): o singură intrare schimbată pe rând, prima săptămână pe sport.
// Date sintetice. Rulare: npx tsx scripts/probes/start-dose.ts
import { generatePlan, ageCapped, type GenerateInput } from '../../src/calendar/generate.js';
import { demonstrated } from '../../src/calendar/demonstrated.js';
import { input } from '../audit-profiles.js';
import { addDays } from '../../src/util/dates.js';
import type { Sport } from '../../src/types.js';

const TODAY = '2026-10-25';
/** 6 săptămâni de activități: `per` pe săptămână, `min` minute, plus o ieșire lungă `long` (0 = fără). */
function history(sport: Sport, per: number, min: number, long = 0) {
  const out: { date: string; sport: Sport; minutes: number }[] = [];
  for (let w = 0; w < 6; w++) {
    for (let i = 0; i < per; i++) out.push({ date: addDays(TODAY, -(w * 7 + 1 + i * 2)), sport, minutes: min });
    if (long) out.push({ date: addDays(TODAY, -(w * 7 + 6)), sport, minutes: long });
  }
  return out;
}

function week1(inp: GenerateInput) {
  const r = generatePlan(inp);
  if (!r.ok) return { err: r.reason };
  const w = r.weeks[0]!;
  const by: Record<string, string> = {};
  for (const sp of ['inot', 'bicicleta', 'alergare', 'forta'] as Sport[]) {
    const xs = w.workouts.filter((x) => x.sport === sp && x.status !== 'anulat_sistem');
    if (xs.length) by[sp] = `${xs.length}× [${xs.map((x) => `${x.plannedMinutes}${x.type === 'lung' ? 'L' : x.type === 'calitate' ? 'Q' : ''}`).join(',')}]`;
  }
  const q = r.weeks.slice(0, 12).flatMap((x) => x.workouts).filter((x) => x.type === 'calitate');
  return { ore: w.plannedHours, by, maxZona: Math.max(0, ...q.flatMap((x) => x.targetZones)), teste: q.filter((x) => /^TEST/.test(x.structure ?? '')).length, note: w.notes.filter((n) => /Doza|peste media|istoric|declarat|Volumul pornește|plafon/i.test(n)).slice(0, 2) };
}

const show = (label: string, inp: GenerateInput) => console.log(label.padEnd(58), JSON.stringify(week1(inp)));

console.log('1) 10 km, aceeași persoană: fără activități vs 3 × 70 min ușor/săpt. + 90 min lung, ultimele 6 săpt.');
const base10 = input({ goal: '10k', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' });
show('   fără activități importate', { ...base10, demonstrated: demonstrated([], TODAY) });
// Istoricul de ore e calculat de server din aceleași activități: 3 × 70 + 90 = 5 h/săpt.
show('   3 × 70 min + 90 min, tolerate (istoric 5 h/săpt.)', { ...base10, historyHoursPerWeek: [5, 5, 5, 5, 5, 5], demonstrated: demonstrated(history('alergare', 3, 70, 90), TODAY) });

console.log('2) debutant 10 km fără istoric: 5 h libere vs 14 h libere (timpul liber nu e capacitate)');
const deb = input({ goal: '10k', sex: 'f', age: 30, level: 'debutant', intens: 'toate' });
show('   5 h libere', { ...deb, sportHours: 5 });
show('   14 h libere', { ...deb, sportHours: 14 });

console.log('3) 70.3, 35 ani, nivel inegal: alergător bun, înotător slab (50 m), bicicletă medie');
const tri = input({ goal: '70.3', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' });
show('   inegal (înot 50 m, alergare 3 × 60 + 100)', { ...tri, swim: { continuousM: 50 }, swimContinuous400: false, demonstrated: demonstrated([...history('alergare', 3, 60, 100), ...history('bicicleta', 2, 60)], TODAY) });
show('   egal (înot 1500 m, aceleași altele)', { ...tri, swim: { continuousM: 1500 }, swimContinuous400: true, demonstrated: demonstrated([...history('alergare', 3, 60, 100), ...history('bicicleta', 2, 60), ...history('inot', 2, 45)], TODAY) });

console.log('4) vârsta: 60 ani antrenat (9 h/săpt.) vs 30 ani sedentar; plafonul de vârstă cu/fără aviz');
const old = input({ goal: '10k', sex: 'm', age: 60, level: 'avansat', intens: 'toate' });
show('   60 ani antrenat, fără aviz declarat', old);
show('   60 ani antrenat, cu aviz cardiologic declarat', { ...old, vigorousCleared: true });
show('   60 ani sedentar, cu aviz', { ...input({ goal: '10k', sex: 'm', age: 60, level: 'debutant', intens: 'toate' }), vigorousCleared: true });
show('   30 ani sedentar', input({ goal: '10k', sex: 'm', age: 30, level: 'debutant', intens: 'toate' }));
console.log('   ageCapped: 60 antrenat fără aviz =', ageCapped(old), '| cu aviz =', ageCapped({ ...old, vigorousCleared: true }), '| 60 sedentar cu aviz =', ageCapped({ ...input({ goal: '10k', sex: 'm', age: 60, level: 'debutant', intens: 'toate' }), vigorousCleared: true }));
