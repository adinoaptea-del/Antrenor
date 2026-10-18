import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPacket } from '../src/collector/packet.js';
import type { CollectorInput } from '../src/collector/types.js';
import { eventsFrom, route, runPyramid, verifyHeadText, type ModelClient, type ModelRequest } from '../src/agents/runner.js';
import type { HeadResponse } from '../src/agents/schema.js';
import type { SpecialistResponse } from '../src/agents/verify.js';
import { PROMPTS } from '../src/prompts/bundle.js';
import { activities, wellness } from './fixtures/cuza_2026-10-16.js';
import type { PlannedWorkout } from '../src/types.js';

const plan: PlannedWorkout[] = [
  { id: 'v', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [1, 2], key: false, status: 'planificat' },
  { id: 's', date: '2026-10-17', sport: 'bicicleta', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat' },
];
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
  aviz: { cardiolog: 'nu', intensitate_permisa: 'Z2' },
};

/** Model fals: răspunde după agentul din system prompt; înregistrează cererile. */
function fakeModel(overrides: Partial<Record<string, (req: ModelRequest) => unknown>> = {}) {
  const calls: ModelRequest[] = [];
  const client: ModelClient = {
    async json<T>(req: ModelRequest): Promise<T> {
      calls.push(req);
      const agent = /Esti HEAD COACH|Ești HEAD COACH/.test(req.system) ? 'head' : /FIZIOLOG/.test(req.system) ? 'fiziolog' : /ALERGARE/.test(req.system) ? 'antrenor_alergare' : /NUTRITIONIST/.test(req.system) ? 'nutritionist' : /FIZIOTERAPEUT/.test(req.system) ? 'fizioterapeut' : /MINTE/.test(req.system) ? 'minte' : 'alt';
      if (overrides[agent]) return overrides[agent]!(req) as T;
      if (agent === 'head') {
        const head: HeadResponse = { decizie: 'verde', mesaj: 'Decizia: verde. HRV 27,9 ms [hrv.azi].\nAzi: alergare Z2 40 min [plan_azi.durata_planificata].', memento: 'Puls de repaus 67 [puls_repaus.azi], cel mai mic din săptămână.', jurnal: ['2026-10-16 verde'], intrebare: null };
        return head as T;
      }
      const resp: SpecialistResponse =
        agent === 'fiziolog'
          ? { agent: 'fiziolog', verdict: 'verde', ce: [{ text: 'HRV 27,9 ms peste media 24,1', cifre: [{ valoare: 27.9, camp: 'hrv.azi' }, { valoare: 24.1, camp: 'hrv.media7' }] }], pentru_viitor: '-', lipseste: ['zone.data_test'] }
          : agent === 'antrenor_alergare'
            ? { agent: 'antrenor_alergare', verdict: 'ok', ce: [{ text: 'Alergare 40 min Z1–Z2, pe vorbit', cifre: [{ valoare: 40, camp: 'plan_azi.durata_planificata' }] }], pentru_viitor: 'prima zi', lipseste: ['zone.alergare.fc_z1_z5'] }
            : agent === 'nutritionist'
              ? { agent: 'nutritionist', verdict: 'ok', ce: [{ text: 'Zi ușoară: 3–5 g/kg la 72,5 kg', cifre: [{ valoare: 3, camp: 'regula' }, { valoare: 5, camp: 'regula' }, { valoare: 72.5, camp: 'corp.greutate_media7' }] }], mese: ['ovăz cu iaurt'], pentru_viitor: '-', lipseste: ['nutritie_ieri'] }
              : { agent: agent as SpecialistResponse['agent'], verdict: 'tacere', ce: [], pentru_viitor: '-', lipseste: [] };
      return resp as T;
    },
  };
  return { client, calls };
}

describe('runner · piramida', () => {
  it('dimineața rutează Fiziolog, antrenorul sportului din plan și Nutriționistul; nu și pe ceilalți', () => {
    const p = buildPacket(input);
    assert.deepEqual(route(p).sort(), ['antrenor_alergare', 'fiziolog', 'nutritionist']);
  });

  it('duminica și durerea ≥ 3 rutează Fizio și Minte', () => {
    const p = buildPacket({ ...input, today: '2026-10-18', evenings: [{ date: '2026-10-15', activityId: '24731779624', rpe: 7, fata_de_asteptari: 'la_fel', durere: { scor: 4, loc: 'genunchi' }, ce_a_incurcat: 'nimic', fueling_conform: 'da', comentariu: null }] });
    const r = route(p);
    assert.ok(r.includes('fizioterapeut'));
    assert.ok(r.includes('minte'));
  });

  it('rulează Fiziologul întâi, pune verdictul lui în pachetul celorlalți și cheamă head coach-ul o singură dată când totul trece', async () => {
    const { client, calls } = fakeModel();
    const r = await runPyramid({ packet: buildPacket(input), files: {}, journal: [], prompts: PROMPTS, models: { specialist: 'spec', head: 'head' } }, client);
    assert.equal(calls.length, 4); // fiziolog, alergare, nutritionist, head
    assert.match(calls[0]!.system, /FIZIOLOG/);
    assert.match(calls[1]!.user, /"verdict_fiziolog": "verde"/);
    assert.equal(r.decision, 'verde');
    assert.equal(r.headWarnings.length, 0);
    assert.equal(r.fallbackUsed, false);
    assert.equal(r.specialists.filter((s) => s.ce.every((i) => i.stare === 'acceptat')).length, 3);
  });

  it('boala bifată = roșu, oricât de bine ar arăta datele; head coach-ul nu poate fi mai permisiv', async () => {
    const { client } = fakeModel({
      head: () => ({ decizie: 'verde', mesaj: 'Decizia: verde.', memento: 'Ziua 1.', jurnal: [], intrebare: null }),
    });
    const packet = buildPacket({ ...input, morning: { ...input.morning!, semnale: { ...input.morning!.semnale, boala: true } } });
    const r = await runPyramid({ packet, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 'spec', head: 'head' } }, client);
    assert.equal(r.decision, 'rosu');
    assert.equal(r.head.decizie, 'rosu');
    assert.ok(r.events.some((e) => e.kind === 'readiness' && e.verdict === 'rosu'));
  });

  it('activitate în plus azi, ziua parțial acoperită: head coach-ul alege doar dintre variantele codului', async () => {
    const p0 = buildPacket(input);
    const cover = { date: '2026-10-16', facut: 60, planificat: 200, procent: 30, neechivalate: [], stare: 'partial' as const, implicit: 'ajunge', optiuni: [
      { id: 'scurt-v', text: 'alergare scurtată la 20 min', changes: [{ workoutId: 'v', action: 'scurteaza' as const, minutes: 20 }] },
      { id: 'ajunge', text: 'gata pe azi', changes: [{ workoutId: 'v', action: 'anuleaza' as const }] },
    ] };
    const packet = { ...p0, acoperire_azi: cover };
    const pick = (optiune: string) => fakeModel({ head: () => ({ decizie: 'verde', mesaj: 'Ok.', memento: 'Ziua 1.', jurnal: [], intrebare: null, optiune }) }).client;
    const a = await runPyramid({ packet, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 'spec', head: 'head' } }, pick('scurt-v'));
    const ev = a.events.find((e) => e.kind === 'acoperire');
    assert.ok(ev && ev.kind === 'acoperire' && ev.optiune.id === 'scurt-v');
    const b = await runPyramid({ packet, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 'spec', head: 'head' } }, pick('alerg 2 ore'));
    const ev2 = b.events.find((e) => e.kind === 'acoperire');
    assert.ok(ev2 && ev2.kind === 'acoperire' && ev2.optiune.id === 'ajunge', 'o variantă inventată nu trece: se aplică cea din cod');
  });

  it('o cifră inventată de head coach duce la reîncercare, apoi la mesajul din cod', async () => {
    let headCalls = 0;
    const { client } = fakeModel({
      head: () => {
        headCalls += 1;
        return { decizie: 'verde', mesaj: 'Decizia: verde. HRV 31 ms.', memento: 'x', jurnal: [], intrebare: null };
      },
    });
    const r = await runPyramid({ packet: buildPacket(input), files: {}, journal: [], prompts: PROMPTS, models: { specialist: 'spec', head: 'head' } }, client);
    assert.equal(headCalls, 2);
    assert.equal(r.fallbackUsed, true);
    assert.match(r.head.mesaj, /^Zi verde\. Faci antrenamentul din plan\./);
    assert.match(r.head.mesaj, /HRV 27,9/);
    assert.doesNotMatch(r.head.mesaj, /31/);
  });

  it('verifyHeadText acceptă cifrele din pachet și din rândurile acceptate, respinge restul și câmpurile inexistente', () => {
    const p = buildPacket(input);
    assert.deepEqual(verifyHeadText('HRV 27,9 ms [hrv.azi], somn 6:26 [somn.durata]', p, []), []);
    const bad = verifyHeadText('puls 71 [puls.azi]', p, []);
    // număr fără sursă + măsurătoare fără sursă în pachet + câmp inexistent
    assert.equal(bad.length, 3);
    assert.ok(bad.some((b) => b.startsWith('măsurătoare fără sursă')));
  });

  it('febra, durerea și cursa neplanificată devin evenimente pentru calendarul viu', () => {
    const p = buildPacket({
      ...input,
      today: '2026-10-12',
      plan: [],
      morning: { date: '2026-10-12', hooper: { somn: 5, oboseala: 5, stres: 4, dureri: 4 }, semnale: { boala: true, febra: true, deplasare: false, simptom_cardiac: false } },
      evenings: [{ date: '2026-10-11', activityId: '24681877392', rpe: 9, fata_de_asteptari: 'mai_greu', durere: { scor: 3, loc: 'gambă' }, ce_a_incurcat: 'nimic', fueling_conform: 'partial', comentariu: null, tip_neplanificat: 'cursa' }],
    });
    const ev = eventsFrom(p, 'rosu');
    assert.deepEqual(ev.map((e) => e.kind).sort(), ['durere', 'febra', 'readiness']); // neplanificatul îl aplică sincronizarea
  });
});

describe('roșu doar când e cu adevărat rău', () => {
  it('ACWR 1,5 + culcare târzie cu date de sănătate verzi = verde (încărcarea e sfat, nu culoare)', async () => {
    const { client } = fakeModel({
      fiziolog: () => ({ agent: 'fiziolog', verdict: 'rosu', ce: [{ text: 'ACWR 1,5', cifre: [{ valoare: 1.5, camp: 'regula' }] }], pentru_viitor: '-', lipseste: [] }),
      head: () => ({ decizie: 'galben', mesaj: 'Decizia: galben.', memento: 'Ziua 1.', jurnal: [], intrebare: null }),
    });
    const packet = { ...buildPacket(input), incarcare: { ...buildPacket(input).incarcare, acwr: 1.5 } };
    const r = await runPyramid({ packet, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 'spec', head: 'head' } }, client);
    assert.equal(r.decision, 'verde');
  });
});
