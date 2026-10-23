// Regula 49 (23.10.2026): fitness acasă după echipamentul declarat — reformer, saltea, gantere, fără bandă.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, SESSIONS, homeEquip, isFitnessSession, parseStrength, prescribe, strengthStructure, type Block, type HomeGear } from '../src/strength/ppl.js';
import { fitnessProfile, withHome } from '../src/strength/fitness.js';
import { generatePlan } from '../src/calendar/generate.js';
import { addDays } from '../src/util/dates.js';

const FIT = (Object.keys(SESSIONS) as (keyof typeof SESSIONS)[]).filter(isFitnessSession);
const BLOCKS: Block[] = ['acomodare', 'construire', 'progres', 'consolidare', 'mentinere'];
const FRIEND: HomeGear[] = ['gantere', 'saltea', 'reformer'];

test('Reformer + saltea + gantere, fără bandă: nicio ședință nu cere bandă; picioarele și spatele trec pe reformer', () => {
  const used = new Set<string>();
  for (const session of FIT)
    for (const block of BLOCKS)
      for (const minutes of [45, 60, 90]) {
        const p = prescribe({ session, block, week: 2, len: 4, place: 'acasa', gear: FRIEND }, minutes);
        assert.ok(p.items.length > 0, `${session} ${block}`);
        for (const r of p.items) {
          assert.ok((r.ex.equip ?? []).every((e) => homeEquip(FRIEND).includes(e)), `${session} ${block}: ${r.ex.id} ${r.ex.equip}`);
          assert.ok(!(r.ex.equip ?? []).includes('banda'), `${session}: ${r.ex.id} cere bandă`);
          used.add(r.ex.id);
        }
        // Regula 20: 3–4 serii, picioarele nu stau cu partea de sus.
        for (const r of p.items) assert.ok(r.sets >= 3 && r.sets <= 4, `${session} ${block}: ${r.ex.id} ${r.sets}`);
        const regions = new Set(p.items.map((r) => r.ex.region).filter((x) => x !== 'core' && x !== 'carry'));
        if (!['f1', 'f2', 'ft'].includes(session)) assert.ok(!(regions.has('legs') && regions.has('upper')), `${session}: ${[...regions]}`);
      }
  for (const id of ['fit-r-footwork', 'fit-r-ham-curl', 'fit-r-side-abduction', 'fit-r-pulling-straps']) assert.ok(used.has(id), `${id} folosit`);
  const note = prescribe({ session: 'l1', block: 'construire', week: 2, len: 4, place: 'acasa', gear: FRIEND }, 60).notes.join(' ');
  assert.match(note, /reformer/);
  assert.match(note, /arcurile sunt greutatea/);
});

test('Fără bandă și fără reformer: exercițiile cu bandă au variante cu greutatea corpului, nu dispar în tăcere', () => {
  const p = prescribe({ session: 'l2', block: 'construire', week: 2, len: 4, place: 'acasa', gear: ['gantere'] }, 75);
  assert.ok(p.items.every((r) => !(r.ex.equip ?? []).includes('banda')));
  assert.ok(p.items.length >= 3);
  const none = prescribe({ session: 'u1', block: 'construire', week: 2, len: 4, place: 'acasa', gear: [] }, 60);
  assert.ok(none.items.length >= 3, 'doar greutatea corpului: tot o ședință');
  assert.ok(none.items.every((r) => (r.ex.equip ?? []).every((e) => e === 'corp' || e === 'scaun')));
});

test('Nedeclarat (chestionarele vechi): rămâne ca înainte — gantere și bandă', () => {
  const a = prescribe({ session: 'l2', block: 'construire', week: 2, len: 4, place: 'acasa' }, 75).items.map((r) => r.ex.id);
  assert.ok(a.some((id) => CATALOG[id]!.equip?.includes('banda')));
  assert.ok(!a.some((id) => id.startsWith('fit-r-')));
});

test('Sarcină / postpartum cu reformer: exercițiile culcat pe spate sau pe burtă ies', () => {
  const p = prescribe({ session: 'l1', block: 'construire', week: 2, len: 4, place: 'acasa', gear: FRIEND, pregnancy: true }, 60);
  assert.ok(p.items.every((r) => !r.ex.lying));
});

test('Echipamentul se scrie în ședință, se citește înapoi, iar ecranul ia mereu cel declarat acum', () => {
  const spec = { session: 'l1' as const, block: 'construire' as const, week: 2, len: 4, recovery: false, place: 'acasa' as const, gear: FRIEND };
  const text = strengthStructure(spec);
  assert.match(text, /acasă \(echipament: gantere, saltea, reformer\)/);
  const back = parseStrength(text);
  assert.deepEqual(back?.gear, FRIEND);
  assert.equal(back?.place, 'acasa');
  assert.deepEqual(withHome(back!, { acces: 'acasa', echipament: ['banda'] }).gear, ['banda']);
  assert.equal(withHome({ ...back!, place: undefined, gear: undefined }, { acces: 'sala' }).place, undefined);
  const old = parseStrength(strengthStructure({ ...spec, gear: undefined }));
  assert.equal(old?.place, 'acasa');
  assert.equal(old?.gear, undefined);
});

test('Planul generat pentru prietena cu reformer nu conține bandă și are ședințe pe reformer', () => {
  const r = generatePlan({ startDate: '2026-10-26', raceDate: addDays('2026-10-26', 26 * 7), goal: 'fit-tonifiere', freeBlocks: [0, 2, 4].map((day) => ({ day: day as 0, startMin: 18 * 60, endMin: 18 * 60 + 75 })), sportHours: 4, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age: 34, sex: 'f' }, fitness: fitnessProfile('fit-tonifiere', { experienta: 'stabila', zile: 3, minute: 60, acces: 'acasa', echipament: FRIEND, miscare: 'activa' }) });
  assert.ok(r.ok);
  if (!r.ok) return;
  const strength = r.weeks.flatMap((w) => w.workouts).filter((w) => w.type === 'forta');
  assert.ok(strength.length > 0);
  let reformer = 0;
  for (const w of strength) {
    const spec = parseStrength(w.structure ?? '');
    assert.deepEqual(spec?.gear, FRIEND, w.structure ?? '');
    const p = prescribe(spec!, w.plannedMinutes);
    assert.ok(p.items.every((x) => !(x.ex.equip ?? []).includes('banda')));
    if (p.items.some((x) => x.ex.equip?.includes('reformer'))) reformer++;
    assert.ok(w.plannedMinutes >= 45, `${w.plannedMinutes}`);
  }
  assert.ok(reformer > 0);
});
