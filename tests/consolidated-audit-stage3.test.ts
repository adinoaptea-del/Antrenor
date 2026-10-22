// Auditul consolidat (22.10.2026), etapa 3: rutarea și doza. Probele complete (toate profilurile) sunt în
// scripts/probes (duration-arith, start-dose, coverage, week-table); aici rulează un subset, ca regresie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, ageCapped } from '../src/calendar/generate.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import { durationMismatch, stepsTotal } from '../src/calendar/duration-check.js';
import { shortenWorkout } from '../src/calendar/validate.js';
import { demonstrated } from '../src/calendar/demonstrated.js';
import { routeTrace } from '../src/agents/runner.js';
import { decisionRecord } from '../server/_lib/agents.js';
import { input } from '../scripts/audit-profiles.js';
import { addDays } from '../src/util/dates.js';
import type { PlannedWorkout, Sport } from '../src/types.js';

const W = (o: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'x', date: '2026-11-03', sport: 'alergare', type: 'calitate', plannedMinutes: 40, targetZones: [3], key: true, status: 'planificat', ...o });

test('T04: aritmetica pașilor — exemplul auditului (10 + 5 × 3 + 4 × 2 + 7 = 40; 6 repetări = 45, nu 40)', () => {
  const steps = (n: number) => [
    { label: 'Încălzire', text: '10 min ușor' },
    { label: 'Principal', text: `${n} × 3 min în Z4; între ele 2 min trap ușor` },
    { label: 'Revenire', text: '7 min foarte ușor' },
    { label: 'Plafon', text: 'pulsul nu trece de 170 bpm' },
  ];
  assert.equal(stepsTotal(steps(5)), 40);
  assert.equal(stepsTotal(steps(6)), 45);
  assert.equal(durationMismatch(W({ plannedMinutes: 40 }), steps(6)), 5, 'nepotrivirea e detectată');
});

test('T04/T05: pe planurile generate (subset de profiluri), suma pașilor = durata din calendar; la fel după „am doar 30 min”', () => {
  const bad: string[] = [];
  for (const goal of ['70.3', '10k', 'maraton', 'bike-100', 'semimaraton'] as const)
    for (const age of [35, 60])
      for (const level of ['debutant', 'avansat'] as const) {
        const r = generatePlan(input({ goal, sex: 'm', age, level, intens: 'toate' }));
        if (!r.ok) continue;
        for (const w of r.weeks.flatMap((x) => x.workouts)) {
          const d = durationMismatch(w, detailSteps(w, { age }));
          if (d) bad.push(`${goal}/${age}/${level} ${w.sport}/${w.type} ${w.plannedMinutes}: ${d > 0 ? '+' : ''}${d} | ${w.structure}`);
          if (w.plannedMinutes >= 40 && w.sport !== 'inot' && w.type !== 'forta' && w.type !== 'odihna') {
            const s = shortenWorkout(w, 30);
            const d2 = durationMismatch(s, detailSteps(s, { age }));
            if (d2) bad.push(`scurtat ${w.sport}/${w.type} ${w.plannedMinutes}→30: ${d2} | ${s.structure}`);
          }
        }
      }
  assert.deepEqual(bad.slice(0, 10), []);
});

test('T04: defectele găsite de probă rămân reparate', () => {
  // 1) Alergarea ușoară cu nota „testul e ședința grea” afișa protocolul testului (15 + 30 + 5 = 50 min în 30).
  const easy = W({ type: 'z2', key: false, targetZones: [2], plannedMinutes: 30, structure: 'ușor, RPE 2–3: săptămâna asta testul e ședința grea' });
  assert.ok(!detailSteps(easy, { age: 35 }).some((s) => s.label === 'Testul'));
  assert.equal(stepsTotal(detailSteps(easy, { age: 35 })), 30);
  // 2) Testul de bicicletă scurtat sub minimul lui (35 min) rămânea test de 35 în 30: devine ședință ușoară, spusă.
  const bikeTest = shortenWorkout(W({ sport: 'bicicleta', plannedMinutes: 55, structure: 'TEST: 25 min încălzire, 20 min cât de tare poți constant (FTP ≈ 95% din puterea medie, ESTIMARE; fără putere: pulsul mediu), 10 min ușor' }), 30);
  assert.equal(bikeTest.type, 'z2');
  assert.match(bikeTest.structure ?? '', /prea scurt pentru testul de 20 min/);
  // 3) Intervalele 30/15 scurtate la 30 min păstrau 2 serii întregi (38 min de pași).
  const si = shortenWorkout(W({ sport: 'bicicleta', plannedMinutes: 45, targetZones: [4, 5], structure: '2 serii × 10 × (30 s tare / 15 s ușor), 3 min ușor între serii — intervale scurte 30/15' }), 30);
  assert.equal(stepsTotal(detailSteps(si, { age: 35 })), 30, si.structure ?? '');
  // 4) Modulul M de 65 min avea pași de 62 (timpul de peste +10 min la revenire se pierdea); V5 de 37 avea 36,5.
  for (const [mins, structure] of [
    [65, 'M · 15 min încălzire ușoară + 2 × (12 min de maraton realist, RPE 5–6 + 3 min ușor) + 20 min revenire'],
    [37, 'V5 · 12 min încălzire ușoară + 6 × (1 min alert controlat, RPE 7–8 + 1:30 min ușor) + 11 min revenire'],
  ] as const)
    assert.equal(stepsTotal(detailSteps(W({ plannedMinutes: mins, structure }), { age: 35 })), mins, structure);
});

const TODAY = '2026-10-25';
function history(sport: Sport, per: number, min: number, long = 0) {
  const out: { date: string; sport: Sport; minutes: number }[] = [];
  for (let w = 0; w < 6; w++) {
    for (let i = 0; i < per; i++) out.push({ date: addDays(TODAY, -(w * 7 + 1 + i * 2)), sport, minutes: min });
    if (long) out.push({ date: addDays(TODAY, -(w * 7 + 6)), sport, minutes: long });
  }
  return out;
}

test('Început prea blând: alergătorul cu 3 × 70 min ușor + 90 min lung pornește din ce a tolerat, cu explicație', () => {
  const base = input({ goal: '10k', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' });
  const r = generatePlan({ ...base, historyHoursPerWeek: [5, 5, 5, 5, 5, 5], demonstrated: demonstrated(history('alergare', 3, 70, 90), TODAY) });
  assert.ok(r.ok);
  const w1 = r.weeks[0]!;
  const runs = w1.workouts.filter((x) => x.sport === 'alergare');
  const long = runs.find((x) => x.type === 'lung')!;
  const easy = runs.filter((x) => x.type === 'z2');
  assert.ok(easy.every((x) => x.plannedMinutes >= 60), 'ușoarele nu coboară sub durata obișnuită (60)');
  assert.ok(long.plannedMinutes >= 72 - 5 && long.plannedMinutes >= Math.max(...easy.map((x) => x.plannedMinutes)), `lunga (${long.plannedMinutes}) pornește din ~80% din 90 și nu e sub ușoare`);
  assert.ok(w1.notes.some((n) => /Doza de start din ce ai făcut: media ta măsurată e 5 h/.test(n)), 'diferența față de ce a tolerat e spusă');
});

test('Timpul liber nu e capacitate: debutantul fără istoric primește aceeași doză la 5 h și la 14 h libere', () => {
  const deb = input({ goal: '10k', sex: 'f', age: 30, level: 'debutant', intens: 'toate' });
  const a = generatePlan({ ...deb, sportHours: 5 });
  const b = generatePlan({ ...deb, sportHours: 14 });
  assert.ok(a.ok && b.ok);
  assert.equal(a.weeks[0]!.plannedHours, b.weeks[0]!.plannedHours);
});

test('Vârsta singură nu mai plafonează: 60 de ani antrenat cu aviz declarat — Z5 și teste; fără aviz sau sedentar — plafonat, cu motivul scris', () => {
  const trained = input({ goal: '70.3', sex: 'm', age: 60, level: 'avansat', intens: 'toate' });
  assert.equal(ageCapped(trained), true, 'fără aviz declarat: plafonat (prudent)');
  assert.equal(ageCapped({ ...trained, vigorousCleared: true }), false);
  assert.equal(ageCapped({ ...input({ goal: '70.3', sex: 'm', age: 60, level: 'debutant', intens: 'toate' }), vigorousCleared: true }), true, 'fără istoric de antrenament: plafonat');
  assert.equal(ageCapped(input({ goal: '70.3', sex: 'm', age: 35, level: 'debutant', intens: 'toate' })), false);
  const r = generatePlan({ ...trained, vigorousCleared: true });
  assert.ok(r.ok);
  const all = r.weeks.flatMap((w) => w.workouts);
  assert.ok(all.some((w) => w.targetZones.includes(5)) && all.some((w) => /^TEST/.test(w.structure ?? '')));
  const capped = generatePlan(input({ goal: '10k', sex: 'm', age: 60, level: 'intermediar', intens: 'toate' }));
  assert.ok(capped.ok);
  const plaf = capped.weeks.flatMap((w) => w.workouts).find((w) => /plafonat la Z4/.test(w.structure ?? ''));
  if (plaf) assert.match(plaf.structure!, /fără aviz cardiologic și istoric de antrenament regulat/);
});

test('Acoperire: minimul pe sport e plasat sau absența e spusă (subset de profiluri)', () => {
  const silent: string[] = [];
  for (const goal of ['70.3', 'olimpic', '10k', 'bike-100', 'inot-1900'] as const)
    for (const level of ['debutant', 'intermediar', 'avansat'] as const)
      for (const hours of [undefined, 4]) {
        const r = generatePlan(input({ goal, sex: 'f', age: 45, level, intens: 'toate', hours }));
        if (!r.ok) continue;
        const min: Partial<Record<Sport, number>> = goal === '10k' ? { alergare: 3, forta: 1 } : goal === 'bike-100' ? { bicicleta: 2, forta: 1 } : goal === 'inot-1900' ? { inot: 2, forta: 1 } : { inot: 2, bicicleta: 2, alergare: 2, forta: 1 };
        for (const w of r.weeks.filter((x) => x.phase !== 'taper'))
          for (const [sp, n] of Object.entries(min) as [Sport, number][]) {
            const got = w.workouts.filter((x) => x.sport === sp && x.status !== 'anulat_sistem').length + (sp === 'alergare' ? w.workouts.filter((x) => x.type === 'brick').length : 0);
            if (got < n && !w.notes.some((t) => t.includes(sp))) silent.push(`${goal}/${level}/${hours} ${w.weekStart} ${sp} ${got}/${n}`);
          }
      }
  assert.deepEqual(silent.slice(0, 10), []);
});

test('Rutare: urma spune cine e eligibil, cine e exclus și de ce; în modul Main Coach nu pretinde specialiști chemați', () => {
  const packet = { meta: { eveniment: 'dimineata', zi_saptamana: 'marti', sporturi: ['alergare', 'forta'] }, plan_azi: { sport: 'alergare' }, plan_azi_toate: [{ sport: 'alergare' }], readiness: { hooper: { stres: 2 } }, antrenament_ultim: null } as never;
  const t = routeTrace(packet);
  assert.ok(t.eligibili.includes('antrenor_alergare') && t.eligibili.includes('fiziolog'));
  const inot = t.exclusi.find((x) => x.agent === 'antrenor_inot');
  assert.match(inot?.motiv ?? '', /nu e în obiectivul sportivului/);
  assert.ok(t.exclusi.every((x) => x.motiv.length > 0));
  const rec = decisionRecord({ mode: 'main', routed: ['antrenor_alergare'], specialists: [], head: {} as never, headWarnings: [], events: [], decision: 'verde', fallbackUsed: false, failures: [] } as never, null, [], { versiuneContext: 'abc', rutare: t, modele: { specialist: 's', head: 'h' } });
  assert.deepEqual(rec.specialisti_chemati, []);
  assert.equal(rec.versiune_context, 'abc');
  assert.match(rec.regula_arbitraj, /din cod/);
});
