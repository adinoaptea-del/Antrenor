// Auditul F55 (19.10.2026): fitness acasă (gantere + bandă) nu primește aparate; o singură durată pe toate ecranele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, HOME_EQUIP, SESSIONS, isFitnessSession, parseStrength, prescribe, strengthStructure, type Block } from '../src/strength/ppl.js';
import { generatePlan } from '../src/calendar/generate.js';
import { fitnessProfile } from '../src/strength/fitness.js';
import { adapt } from '../src/calendar/adapt.js';
import { addDays } from '../src/util/dates.js';

const GYM = /aparat|cablu|helcometru|presă|bară|bancă|Smith|scripete|pec deck/i;
const FIT = (Object.keys(SESSIONS) as (keyof typeof SESSIONS)[]).filter(isFitnessSession);
const BLOCKS: Block[] = ['acomodare', 'construire', 'progres', 'consolidare', 'tranzitie', 'mentinere'];

test('F01: acasă, nicio ședință de fitness, în niciun bloc, nu cere aparat, cablu, bară sau bancă — nici în alternative', () => {
  for (const id of FIT)
    for (const block of BLOCKS)
      for (const minutes of [45, 60, 90]) {
        const p = prescribe({ session: id, block, week: 2, len: 4, place: 'acasa' }, minutes);
        assert.ok(p.items.length > 0, `${id} ${block}`);
        for (const r of p.items) {
          assert.ok((r.ex.equip ?? ['?' as never]).every((e) => HOME_EQUIP.includes(e)), `${id} ${block}: ${r.ex.id} ${r.ex.equip}`);
          assert.doesNotMatch(`${r.ex.name} ${r.ex.alt} ${r.ex.cue} ${r.ex.setup ?? ''}`, GYM, `${id}: ${r.ex.id}`);
        }
      }
});

test('F01: la sală rămân exercițiile de sală; schimbarea acasă/sală schimbă efectiv selecția', () => {
  const gym = prescribe({ session: 'l1', block: 'construire', week: 2, len: 4 }, 90).items.map((r) => r.ex.id);
  const home = prescribe({ session: 'l1', block: 'construire', week: 2, len: 4, place: 'acasa' }, 90).items.map((r) => r.ex.id);
  assert.ok(gym.includes('fit-leg-press') && gym.includes('fit-squat'));
  assert.notDeepEqual(gym, home);
  assert.ok(home.includes('fit-h-goblet'));
  const up = prescribe({ session: 'u2', block: 'construire', week: 2, len: 4, place: 'acasa' }, 90).items.map((r) => r.ex.id);
  assert.ok(up.includes('fit-h-floor-press') && up.includes('fit-h-db-fly'));
});

test('F01: planul generat pentru „acasă” scrie locul în ședință și se citește înapoi', () => {
  const r = generatePlan({ startDate: '2026-10-26', raceDate: addDays('2026-10-26', 26 * 7), goal: 'fit-masa', freeBlocks: [0, 2, 4].map((day) => ({ day: day as 0, startMin: 18 * 60, endMin: 18 * 60 + 60 })), sportHours: 3, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age: 55, sex: 'f' }, fitness: fitnessProfile('fit-masa', { experienta: 'incepatoare', zile: 3, minute: 45, acces: 'acasa', miscare: 'sedentara' }) });
  assert.ok(r.ok);
  if (!r.ok) return;
  const all = r.weeks.flatMap((w) => w.workouts);
  assert.ok(all.length > 0 && all.every((w) => parseStrength(w.structure)!.place === 'acasa'));
  for (const w of all) for (const it of prescribe(parseStrength(w.structure)!, w.plannedMinutes).items) assert.ok(it.ex.equip!.every((e) => HOME_EQUIP.includes(e)), it.ex.id);
  assert.equal(parseStrength(strengthStructure({ session: 'f1', block: 'acomodare', week: 1, len: 4, place: 'acasa' }))!.place, 'acasa');
});

test('F02: după febră, durata din calendar = durata prescripției (o singură cifră pe toate ecranele)', () => {
  const w = { id: 'f', date: '2026-10-26', sport: 'forta' as const, type: 'forta' as const, plannedMinutes: 60, targetZones: [], key: false, status: 'planificat' as const, structure: strengthStructure({ session: 'l1', block: 'acomodare', week: 1, len: 4, place: 'acasa' }) };
  const r = adapt([w], { kind: 'febra', date: '2026-10-19' }, { today: '2026-10-19', freeBlocks: [], recentKeyScores: [] });
  const x = r.plan[0]!;
  const rx = prescribe(parseStrength(x.structure)!, x.plannedMinutes);
  assert.equal(x.plannedMinutes, rx.minutes);
  // Forța nu scade sub 45 de minute și sub 3 serii: după febră devine ușoară (greutăți mai mici), nu mai scurtă.
  assert.equal(x.plannedMinutes, 45);
  assert.ok(parseStrength(x.structure)!.recovery && rx.items.every((r) => r.sets >= 3));
  assert.match(x.note ?? '', /doar dacă dimineața nu mai ai febră/);
});

test('Toate exercițiile de fitness au echipamentul declarat', () => {
  for (const ex of Object.values(CATALOG)) if (ex.id.startsWith('fit-')) assert.ok(ex.equip && ex.equip.length, ex.id);
});
