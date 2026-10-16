import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canaryPassed, numbersIn, verifyResponse, type SpecialistResponse } from '../src/agents/verify.js';

const packet = {
  hrv: { azi: 27.9, media7: 24.4, baseline60: 25.4, sd60: 6.63 },
  somn: { durata: '6:26', ora_culcare: '01:08', media7_durata: '7:01' },
  incarcare: { acwr: 1.68, ore_7z: { inot: 2.8, alergare: 2.9 } },
  readiness: { hooper: { somn: null } },
  ultima_alergare: { pace_mediu: '7:35', fc_medie: 142 },
};

describe('verificarea mecanică', () => {
  it('acceptă un rând în care fiecare număr are câmpul lui cu aceeași valoare', () => {
    const r = verifyResponse(
      { agent: 'fiziolog', verdict: 'verde', ce: [{ text: 'HRV 27,9 ms, peste media de 24,4', cifre: [{ valoare: 27.9, camp: 'hrv.azi' }, { valoare: 24.4, camp: 'hrv.media7' }] }], pentru_viitor: '-', lipseste: ['readiness.hooper.somn'] },
      packet,
    );
    assert.equal(r.ce[0]!.stare, 'acceptat');
    assert.deepEqual(r.lipseste, ['readiness.hooper.somn']);
    assert.equal(r.avertismente.length, 0);
    assert.equal(r.valid, true);
  });

  it('respinge numerele rotunjite („~140” când pachetul are 142) și numerele fără câmp', () => {
    const r = verifyResponse(
      { agent: 'minte', verdict: 'ok', ce: [{ text: 'ritmul de miercuri, FC ~140', cifre: [{ valoare: 140, camp: 'ultima_alergare.fc_medie' }] }, { text: 'culcare după 3 nopți grele', cifre: [] }], pentru_viitor: '-', lipseste: [] },
      packet,
    );
    assert.equal(r.ce[0]!.stare, 'respins');
    assert.match(r.ce[0]!.motiv!, /în pachet 142/);
    assert.equal(r.ce[1]!.stare, 'respins');
    assert.match(r.ce[1]!.motiv!, /număr fără câmp: 3/);
  });

  it('respinge un câmp inexistent și un câmp null citat ca valoare', () => {
    const r = verifyResponse(
      { agent: 'fiziolog', verdict: 'galben', ce: [{ text: 'puls 71', cifre: [{ valoare: 71, camp: 'puls_repaus.azi' }] }, { text: 'hooper somn 4', cifre: [{ valoare: 4, camp: 'readiness.hooper.somn' }] }], pentru_viitor: '-', lipseste: [] },
      packet,
    );
    assert.match(r.ce[0]!.motiv!, /câmp inexistent/);
    assert.match(r.ce[1]!.motiv!, /null/);
  });

  it('prescripțiile și pragurile de regulă trec fără câmp de date, dacă sunt marcate', () => {
    const r = verifyResponse(
      { agent: 'antrenor_alergare', verdict: 'ok', ce: [{ text: 'Încălzire 10 min, apoi 22 min Z1–Z2', cifre: [{ valoare: 10, camp: 'prescriptie' }, { valoare: 22, camp: 'prescriptie' }] }, { text: 'ACWR 1,68 peste pragul de 1,5', cifre: [{ valoare: 1.68, camp: 'incarcare.acwr' }, { valoare: 1.5, camp: 'regula' }] }], pentru_viitor: '-', lipseste: [] },
      packet,
    );
    assert.equal(r.ce[0]!.stare, 'acceptat');
    assert.equal(r.ce[1]!.stare, 'acceptat');
  });

  it('tăcerea golește „ce”, iar „lipseste” greșit devine avertisment, nu respingere', () => {
    const r = verifyResponse(
      { agent: 'antrenor_inot', verdict: 'tacere', ce: [{ text: 'orice', cifre: [] }], pentru_viitor: 'forță 40 min ieri, fără RPE', lipseste: ['hrv.azi', 'nu.exista'] },
      packet,
    );
    assert.equal(r.ce.length, 0);
    assert.equal(r.lipseste.length, 0);
    assert.equal(r.avertismente.length, 3);
  });

  it('duratele „6:26” și zonele „Z1–Z2” nu sunt numere de verificat', () => {
    assert.deepEqual(numbersIn('somn 6:26 față de 7:01, Z1–Z2, 40 min'), [40]);
  });

  it('testul-canar: câmpul anulat trebuie să ajungă la „lipseste”, nu citat', () => {
    const good: SpecialistResponse = { agent: 'fiziolog', verdict: 'galben', ce: [], pentru_viitor: '-', lipseste: ['hrv.azi'] };
    const bad: SpecialistResponse = { agent: 'fiziolog', verdict: 'verde', ce: [{ text: 'HRV 27,9', cifre: [{ valoare: 27.9, camp: 'hrv.azi' }] }], pentru_viitor: '-', lipseste: [] };
    assert.equal(canaryPassed(good, 'hrv.azi'), true);
    assert.equal(canaryPassed(bad, 'hrv.azi'), false);
  });
});
