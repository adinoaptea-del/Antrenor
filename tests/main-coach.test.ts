import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPacket } from '../src/collector/packet.js';
import type { CollectorInput } from '../src/collector/types.js';
import { runMainCoach, type ModelClient, type ModelRequest } from '../src/agents/runner.js';
import type { HeadResponse } from '../src/agents/schema.js';
import { PROMPTS } from '../src/prompts/bundle.js';
import { activities, wellness } from './fixtures/cuza_2026-10-16.js';
import type { PlannedWorkout } from '../src/types.js';

const plan: PlannedWorkout[] = [{ id: 'v', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [1, 2], key: false, status: 'planificat' }];
const input: CollectorInput = {
  today: '2026-10-16',
  event: 'dimineata',
  athlete: { obiectiv: 'Ironman 70.3 România, 2027-09-12', raceDate: '2027-09-12', phase: 'evaluare' },
  wellness,
  activities,
  plan,
  zones: null,
  morning: { date: '2026-10-16', hooper: { somn: 3, oboseala: 3, stres: 2, dureri: 2 }, semnale: { boala: false, febra: false, deplasare: false, simptom_cardiac: false } },
  evenings: [],
  load: { ctl: 27.2, atl: 29.2, tsb: -6.3, source: 'athletedata' },
  aviz: { cardiolog: 'necunoscut', intensitate_permisa: 'toate' },
};
const run = (client: ModelClient, packet = buildPacket(input)) => runMainCoach({ packet, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 's', head: 'h' } }, client);
const ok: HeadResponse = { decizie: 'verde', mesaj: 'Azi: alergare ușoară 40 min [plan_azi.durata_planificata].', memento: 'HRV 27,9 ms [hrv.azi].', jurnal: ['2026-10-16 verde'], intrebare: null };

describe('Main Coach (revizia 3)', () => {
  it('un singur apel AI, cu promptul Main Coach și modulele de azi (fără formatul piramidei)', async () => {
    const calls: ModelRequest[] = [];
    const r = await run({ async json<T>(req: ModelRequest) { calls.push(req); return ok as T; } });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.system, /MAIN COACH/);
    assert.match(calls[0]!.system, /MODUL: alergare/);
    assert.match(calls[0]!.system, /formatul lor nu se aplică/);
    assert.equal(r.mode, 'main');
    assert.equal(r.specialists.length, 0);
    assert.equal(r.fallbackUsed, false);
  });

  it('cifră fără câmp: o reîncercare, apoi mesajul din cod; nu se pierde decizia', async () => {
    let n = 0;
    const r = await run({ async json<T>() { n++; return { ...ok, mesaj: 'Ai făcut 123 km săptămâna asta.' } as T; } });
    assert.equal(n, 2);
    assert.equal(r.fallbackUsed, true);
    assert.ok(r.head.mesaj.length > 0);
  });

  it('modelul cade: decizia și mesajul vin din cod, fără apel suplimentar', async () => {
    const r = await run({ async json<T>(): Promise<T> { throw new Error('timeout'); } });
    assert.equal(r.fallbackUsed, true);
    assert.ok(r.failures.some((f) => /main_coach/.test(f)));
  });

  it('decizia nu poate fi mai permisivă decât a aplicației', async () => {
    const p = buildPacket(input);
    p.decizia_aplicatiei = { nivel: 'rosu', titlu: 'Azi pauză', ce_faci: 'Azi pauză: fără antrenament.', motiv: 'somn' };
    const r = await run({ async json<T>() { return ok as T; } }, p);
    assert.equal(r.decision, 'rosu');
    assert.equal(r.head.decizie, 'rosu');
  });

  it('promptul nu mai conține regulile contradictorii din audit', () => {
    const t = PROMPTS.main_coach!;
    assert.doesNotMatch(t, /se lasă moale|\bcerți\b|\bcerti când\b|Joi nu se negociază/i);
    assert.match(t, /galben → „Azi mai ușor/);
    assert.doesNotMatch(t, /Sportivul alege; tu îi spui/);
    assert.match(t, /„necunoscut” nu e aviz/);
  });
});
