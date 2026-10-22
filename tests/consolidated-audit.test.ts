// Auditul consolidat (22.10.2026): blocantele B1 (textul AI vs calendar), B2 (stop AI fără dovadă), A1 (simptome
// cardiace). Reproducerile sunt cele ale auditului independent (probele ai-text, ai-stop, urgent), acum ca teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPacket } from '../src/collector/packet.js';
import { runMainCoach, AI_STOP_LINE } from '../src/agents/runner.js';
import { planContradictions } from '../src/agents/plan-claims.js';
import { PROMPTS } from '../src/prompts/bundle.js';
import { activeRestriction, urgentText } from '../src/calendar/safety.js';
import { activities, wellness } from './fixtures/cuza_2026-10-16.js';

const plan = [{ id: 'v', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [1, 2], key: false, status: 'planificat' }];
const packet = (nivel: 'verde' | 'galben') => {
  const p = buildPacket({
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
  } as never);
  p.decizia_aplicatiei = { nivel, titlu: `Azi ${nivel}`, ce_faci: 'Ședința din plan.', motiv: 'ok' } as never;
  return p;
};
const run = (p: ReturnType<typeof packet>, head: Record<string, unknown>) =>
  runMainCoach({ packet: p, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 's', head: 'h' } } as never, { async json() { return { memento: 'Odihnă bună.', jurnal: [], intrebare: null, propunere: null, ...head } as never; } } as never);

test('B1 / T03: prescripțiile care contrazic ședința zilei (Z2 40 min) sunt respinse — mesajul cade pe varianta din cod', async () => {
  for (const nivel of ['verde', 'galben'] as const) {
    for (const mesaj of ['Azi alergi 40 min în Z4, tempo susținut.', 'Azi faci intervale: 6 repetări de 3 min în Z5.', 'Sări peste ședința de azi, fă în schimb 2 ore de bicicletă.']) {
      const r = await run(packet(nivel), { decizie: nivel, mesaj });
      assert.equal(r.fallbackUsed, true, `${nivel}: „${mesaj}” trebuia respins`);
      assert.ok(!r.head.mesaj.includes(mesaj));
    }
  }
});

test('B1: negațiile, trecutul și ședința din plan trec (nu interzicem cuvinte)', async () => {
  const p = packet('galben');
  for (const mesaj of ['Azi alergi ușor 40 min, fără tempo și fără Z4.', 'Ieri ai făcut intervale în Z4; azi rămâi în Z2.', 'Azi: alergare ușoară în Z1–Z2, 40 min.', 'Nu forța: nu e zi de intervale.']) {
    assert.deepEqual(planContradictions(mesaj, p, 'galben'), [], mesaj);
  }
  // Ziua de calitate cu Z4 în plan: Z4 e permis pe o zi verde, nu pe una galbenă.
  const q = { ...p, plan_azi_toate: [{ id: 'q', sport: 'alergare' as const, tip: 'calitate', durata_planificata: 50, zone_tinta: [4], cheie: true }] };
  assert.deepEqual(planContradictions('Azi faci 4 × 6 min în Z4.', q as never, 'verde'), []);
  assert.ok(planContradictions('Azi faci 4 × 6 min în Z4.', q as never, 'galben').length > 0);
});

test('B2: „stop” cerut de model fără semnal în date nu anulează ziua; sportivul e întrebat de simptome', async () => {
  const r = await run(packet('verde'), { decizie: 'stop', mesaj: 'Azi te odihnești.' });
  assert.equal(r.decision, 'verde');
  assert.ok(!r.events.some((e) => e.kind === 'readiness'), 'nicio anulare a ședințelor');
  assert.ok(r.head.mesaj.includes(AI_STOP_LINE));
  assert.ok(r.head.jurnal.some((j) => /neaplicat/.test(j)));
  // Cu semnal real (simptom cardiac declarat) stopul vine din cod.
  const p = packet('verde');
  p.semnale.simptom_cardiac = true;
  const r2 = await run(p, { decizie: 'verde', mesaj: 'Azi te odihnești.' });
  assert.equal(r2.decision, 'stop');
});

test('A1 / T09: formulările obișnuite ale simptomelor sunt prinse; negațiile și persoana altcuiva nu', () => {
  for (const t of ['Mă doare în piept când urc scările', 'ma doare pieptul', 'am simțit o apăsare pe piept', 'durere toracică la final', 'am amețit și am văzut negru', 'pulsul a sărit la 220 și nu cobora', 'Nu am febră, dar mă doare în piept'])
    assert.ok(urgentText(t), t);
  for (const t of ['fără durere în piept', 'n-am avut palpitații', 'colegul a leșinat la finish', 'pulsul a crescut la 180 la final', 'mă doare piciorul'])
    assert.equal(urgentText(t), null, t);
});

test('A1: întrebarea structurată de seară (sau durerea „piept”) = stop azi, apoi doar ușor până la evaluarea declarată', () => {
  const ev = { date: '2026-10-16', durere: { scor: 0, loc: null }, comentariu: null, simptome_cardiace: true };
  assert.equal(activeRestriction({ today: '2026-10-16', morning: null, evenings: [ev] } as never)?.verdict, 'stop');
  assert.equal(activeRestriction({ today: '2026-10-18', morning: null, evenings: [ev], mornings: [] } as never)?.verdict, 'galben');
  const evaluated = activeRestriction({ today: '2026-10-19', morning: null, evenings: [ev], mornings: [{ date: '2026-10-18', semnale: { cardiac_evaluat: true } }] } as never);
  assert.equal(evaluated, null);
  const chest = { date: '2026-10-16', durere: { scor: 2, loc: 'piept' }, comentariu: null };
  assert.equal(activeRestriction({ today: '2026-10-16', morning: null, evenings: [chest] } as never)?.verdict, 'stop');
});
