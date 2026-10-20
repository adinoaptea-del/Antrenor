// Auditul v93 — scoruri și indicatori de progres (A69–A76, T49–T51) și cele trei constatări noi de la verificare:
// „Pregătit: 0%” din veriga „Cumul”, două scoruri pentru aceeași ședință (pachet vs tabel), criteriul de zonă care nu
// se aplică niciodată fără zone (evaluare parțială vizibilă).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTENSITY_UNKNOWN, blocksFromStream, evaluationLabel, plannedBlocks, scoreMatches, scoreWorkout } from '../src/scoring/score.js';
import { matchActivities } from '../src/scoring/match.js';
import { readyLabel, readyView } from '../src/bar/ready-view.js';
import { raceReady } from '../src/bar/race-ready.js';
import { overallReady, sportReadiness } from '../src/bar/sport-readiness.js';
import { computeBar } from '../src/bar/bar.js';
import { METRICS } from '../src/bar/metrics.js';
import { computeBadges, is4x4 } from '../src/badges/badges.js';
import { cheerFor } from '../src/cheers.js';
import { FAMILIES, decideFamily } from '../src/calendar/progression.js';
import { buildPacket } from '../src/collector/packet.js';
import type { CollectorInput, EveningForm, SourceActivity } from '../src/collector/types.js';
import type { Activity, PlannedWorkout } from '../src/types.js';

const today = '2026-10-20';
const W = (o: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'w', date: today, sport: 'alergare', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat', ...o });
const evening = (o: Partial<EveningForm>): EveningForm => ({ date: today, rpe: null, fata_de_asteptari: null, durere: { scor: null, loc: null }, ce_a_incurcat: null, fueling_conform: null, comentariu: null, ...o });

describe('Acasă: „Pregătit: 0%” din veriga „Cumul” (constatarea nouă 3, A74)', () => {
  it('înot 79, alergare 78, cumul 0, fără bicicletă: parțialul e 78, nu 0', () => {
    const r = { onTrack: null, ready: null, weakest: null, benchmarks: [], estimate: null, target: null, coverage: { withData: 2, total: 3, missing: ['Bicicletă'] }, links: [{ name: 'Înot', pct: 79, measured: '1.500 m', detail: '' }, { name: 'Bicicletă', pct: null, measured: null, detail: '' }, { name: 'Alergare', pct: 78, measured: '16 km', detail: '' }, { name: 'Cumul', pct: 0, measured: 'nicio zi cu mai multe sporturi', detail: '' }] };
    const v = readyView(r as never);
    assert.equal(v.pct, 78);
    assert.equal(v.partial, true);
    const label = readyLabel(v);
    assert.ok(label.includes('78/100'), label);
    assert.ok(!/0%|%/.test(label), `fără procent: ${label}`);
    assert.ok(label.includes('2 din 3 probe') && label.includes('fără bicicletă'), label);
  });
  it('din calculul real (raceReady): fără zi cu mai multe sporturi, cumulul e 0, dar Acasă arată veriga slabă dintre probe', () => {
    const acts: SourceActivity[] = [
      { id: 's1', source: 'strava', externalId: 's1', date: '2026-10-14', sport: 'inot', minutes: 40, distanceKm: 1.5, details: { continuousM: 1500 } } as SourceActivity,
      { id: 'r1', source: 'strava', externalId: 'r1', date: '2026-10-12', sport: 'alergare', minutes: 95, distanceKm: 14 },
    ];
    const r = raceReady({ goal: '70.3', today, acts, plan: [], fueledDates: [] });
    assert.equal(r.links.find((l) => l.name === 'Cumul')!.pct, 0);
    const v = readyView(r);
    const legs = r.links.filter((l) => l.name !== 'Cumul' && l.pct != null).map((l) => l.pct!);
    assert.equal(v.pct, Math.min(...legs));
    assert.ok(v.pct! > 0);
  });
  it('zi cu restricție: indicele nu e permisiune', () => {
    const v = readyView({ onTrack: null, ready: 60, weakest: 'Înot', benchmarks: [], estimate: null, target: null, coverage: { withData: 3, total: 3, missing: [] }, links: [] } as never);
    assert.ok(readyLabel(v, { restrictedToday: true }).includes('azi decide restricția'));
  });
});

describe('T51 — aceeași ședință, același scor în tabel și în pachetul AI (constatarea nouă 2, A71)', () => {
  const planned = W({ id: 'p60', plannedMinutes: 60 });
  const act: SourceActivity = { id: 'act10', source: 'strava', externalId: 'str10', date: today, sport: 'alergare', minutes: 10, distanceKm: 1.6 };
  const ev = evening({ activityId: 'str10', rpe: 3, ce_a_incurcat: 'timp' });
  const input: CollectorInput = {
    today,
    event: 'dupa_antrenament',
    athlete: { obiectiv: '70.3', goal: '70.3', raceDate: '2027-09-12', phase: 'baza1' },
    wellness: [],
    activities: [act],
    plan: [planned],
    zones: null,
    evenings: [ev],
    aviz: { cardiolog: 'nu', intensitate_permisa: 'Z2' },
  };
  it('10 din 60 min scurtată pentru timp: galben în ambele, aceeași eficiență, aceleași motive', () => {
    const table = scoreMatches(matchActivities([planned], [act as unknown as Activity], today).matches, [ev], today)[0]!.result;
    const p = buildPacket(input);
    const fp = p.antrenament_ultim!.fata_de_plan!;
    assert.equal(table.color, 'galben');
    assert.equal(fp.culoare, table.color);
    assert.equal(fp.eficienta, table.metrics.eficienta);
    assert.equal(fp.durata_pct, table.metrics.durationPct);
    assert.deepEqual(fp.motive, table.reasons);
  });
  it('pachetul citește scorul salvat când activitatea e aceeași', () => {
    const stored = { activityId: 'act10', color: 'verde' as const, reasons: ['salvat'], metrics: { durationPct: 16.7, zonePct: null, rpeDelta: null, pain: null, cardiacDriftPct: null, eficienta: 42 }, flags: { noQuestionnaire: false, noZoneData: true, cardiacDrift: false, escalate: false }, evaluare: null };
    const fp = buildPacket({ ...input, storedScores: { p60: stored } }).antrenament_ultim!.fata_de_plan!;
    assert.equal(fp.culoare, 'verde');
    assert.equal(fp.eficienta, 42);
    assert.equal(fp.sursa_scor, 'salvat');
    // Scor salvat pe altă activitate (veche): nu se folosește.
    const fp2 = buildPacket({ ...input, storedScores: { p60: { ...stored, activityId: 'alta' } } }).antrenament_ultim!.fata_de_plan!;
    assert.equal(fp2.sursa_scor, 'calculat');
  });
  it('indicele de pregătire din pachet = cel de pe Acasă (același metricId, aceeași valoare)', () => {
    const acts: SourceActivity[] = [act, { id: 'r2', source: 'strava', externalId: 'r2', date: '2026-10-12', sport: 'alergare', minutes: 95, distanceKm: 14 }];
    const p = buildPacket({ ...input, activities: acts });
    const home = readyView(raceReady({ goal: '70.3', today, acts, plan: [planned], fueledDates: [] }));
    assert.equal(p.pregatire_cursa!.metric_id, home.metricId);
    assert.equal(p.pregatire_cursa!.indice, home.pct);
    assert.equal(p.pregatire_cursa!.versiune, METRICS.pregatire_cursa.version);
    assert.ok(p.pregatire_proba.every((x) => x.metric_id === 'pregatire_proba'));
  });
});

describe('A72 — fără date de intensitate: evaluare parțială, nu „zonă respectată”', () => {
  const planned = W({ plannedMinutes: 50 });
  const act: Activity = { id: 'a', date: today, sport: 'alergare', minutes: 50, timeInZonesMin: null };
  it('culoarea poate rămâne verde, dar eticheta „parțial — intensitate necunoscută” e printre primele două motive', () => {
    const r = scoreWorkout({ planned, activity: act, questionnaire: { rpe: 4, painScore: 0 }, today });
    assert.equal(r.color, 'verde');
    assert.equal(r.flags.intensityUnknown, true);
    assert.ok(r.reasons.slice(0, 2).some((x) => x.startsWith(INTENSITY_UNKNOWN)), r.reasons.join(' | '));
    assert.ok(!r.reasons[0]!.includes('zone în țintă'));
    assert.equal(r.evaluare!.facut, true);
    assert.equal(r.evaluare!.conformScop, null);
    assert.equal(r.evaluare!.tolerat, true);
    assert.equal(r.evaluare!.partial, true);
    assert.match(evaluationLabel(r.evaluare)!, /conform scopului: necunoscut/);
  });
  it('fără chestionar: „bine tolerat” e necunoscut, nu presupus', () => {
    const r = scoreWorkout({ planned, activity: { ...act, timeInZonesMin: { 2: 45, 3: 5 } }, today });
    assert.equal(r.evaluare!.tolerat, null);
    assert.equal(r.evaluare!.conformScop, true);
  });
  it('oprită din cauza durerii: textul spune decizie de siguranță, nu eșec', () => {
    const r = scoreWorkout({ planned: W({}), activity: { ...act, minutes: 20 }, questionnaire: { rpe: 5, painScore: 6 }, today });
    assert.equal(r.flags.stoppedForPain, true);
    assert.ok(r.reasons[0]!.includes('nu eșec'));
  });
});

describe('T49 / A69 — timpul în zonă pe bloc (T1: 15 min de lucru din 40)', () => {
  const t1 = W({ type: 'calitate', plannedMinutes: 40, targetZones: [3], key: true, intervals: { count: 3, minutes: 5, zone: 3 }, structure: 'încălzire 10 min ușor, 3 × 5 min la prag cu 2 min 30 s ușor, revenire 10 min' });
  const zoneTop: [number, number, number, number] = [130, 145, 160, 175];
  it('blocurile planificate: încălzire 10, 3 × 5 lucru, pauze, revenire 10', () => {
    const b = plannedBlocks(t1)!;
    assert.equal(b.filter((x) => x.kind === 'lucru').length, 3);
    assert.equal(b[0]!.minutes, 10);
    assert.equal(b.at(-1)!.minutes, 10);
    assert.equal(b.reduce((n, x) => n + x.minutes, 0), 40);
  });
  it('executat exact: verde pe blocul de lucru (latența pulsului exclusă), nu galben 37,5%', () => {
    const layout = plannedBlocks(t1)!;
    const samples: { sec: number; hr: number }[] = [];
    let t = 0;
    for (const b of layout) {
      for (let s = 0; s < b.minutes * 60; s++) samples.push({ sec: t + s, hr: b.kind === 'lucru' ? (s < 60 ? 140 : 155) : 120 });
      t += b.minutes * 60;
    }
    const blocks = blocksFromStream(samples, layout, zoneTop);
    const r = scoreWorkout({ planned: t1, activity: { id: 'a', date: today, sport: 'alergare', minutes: 40, blocks }, questionnaire: { rpe: 7, painScore: 0 }, today });
    assert.equal(r.metrics.zoneBasis, 'blocuri');
    assert.equal(r.metrics.zonePct, 100);
    assert.equal(r.color, 'verde');
  });
  it('doar zone pe toată ședința (fără blocuri): neevaluată, nu 37,5% galben', () => {
    const r = scoreWorkout({ planned: t1, activity: { id: 'a', date: today, sport: 'alergare', minutes: 40, timeInZonesMin: { 1: 10, 2: 15, 3: 15 } }, questionnaire: { rpe: 7, painScore: 0 }, today });
    assert.notEqual(r.metrics.zonePct, 37.5);
    assert.equal(r.metrics.zonePct, null);
    assert.equal(r.flags.intensityUnknown, true);
    assert.notEqual(r.color, 'galben');
  });
});

describe('A70 — durata activă vs totală: aceeași ședință, același scor la orice furnizor', () => {
  it('Strava (moving 50, elapsed 58) și Whoop (start–stop 58) dau aceeași durată și culoare', () => {
    const planned = W({ plannedMinutes: 60 });
    const strava = { id: 's', date: today, sport: 'alergare', minutes: 50, details: { movingMin: 50, elapsedMin: 58 } } as Activity;
    const whoop: Activity = { id: 'w', date: today, sport: 'alergare', minutes: 58 };
    const a = scoreWorkout({ planned, activity: strava, questionnaire: { rpe: 4 }, today });
    const b = scoreWorkout({ planned, activity: whoop, questionnaire: { rpe: 4 }, today });
    assert.equal(a.metrics.durationPct, b.metrics.durationPct);
    assert.equal(a.color, b.color);
    assert.equal(a.metrics.activeMin, 50);
  });
  it('opririle nu sunt „peste plan”: 140 total, 110 activ la 120 planificat nu e galben pentru durată', () => {
    const r = scoreWorkout({ planned: W({ sport: 'bicicleta', plannedMinutes: 120 }), activity: { id: 'b', date: today, sport: 'bicicleta', minutes: 110, details: { movingMin: 110, elapsedMin: 140 } } as Activity, questionnaire: { rpe: 4 }, today });
    assert.ok(!r.reasons.some((x) => x.includes('peste 115%')), r.reasons.join(' | '));
  });
});

describe('T50 / A71 — 10 minute din 60, motiv timp', () => {
  const r = scoreWorkout({ planned: W({ plannedMinutes: 60 }), activity: { id: 'a', date: today, sport: 'alergare', minutes: 10 }, questionnaire: { rpe: 3, painScore: 0, whatInterfered: 'timp' }, today });
  it('feedback pozitiv (varianta respectată, culoare neutră), fără volum inventat', () => {
    assert.equal(r.color, 'galben');
    assert.equal(r.flags.logistic, true);
    assert.equal(r.evaluare!.conformVarianta, true);
    assert.equal(r.evaluare!.conformScop, null);
    assert.equal(r.metrics.dozaEfectivaMin, 10);
    assert.ok(r.metrics.eficienta! <= 50, `eficiența pe doza reală: ${r.metrics.eficienta}`);
    assert.ok(r.reasons.some((x) => x.includes('10 din 60 min')));
  });
  it('nu promovează treapta', () => {
    const T = FAMILIES.find((f) => f.id === 'T')!;
    const ex = (d: string) => ({ date: d, step: 0, ex: { workoutId: d, color: r.color, rpe: 3, pain: 0, shortenedForTime: true } });
    assert.notEqual(decideFamily(T, [ex('2026-10-06'), ex('2026-10-13')], 1, today).decision, 'progress');
  });
});

describe('A73 / A74 — registrul indicatorilor, fără renormalizare, necunoscut = necunoscut', () => {
  it('trei familii, fiecare cu id, nume, algoritm, versiune, explicație; niciuna nu e „șansă”', () => {
    for (const m of Object.values(METRICS)) {
      assert.ok(m.id && m.name && m.algorithm && m.version && m.explanation);
      assert.equal(m.kind, 'indice');
      assert.ok(!/șans/i.test(m.name));
    }
    assert.notEqual(METRICS.pregatire_cursa.name, METRICS.pregatire_proba.name);
  });
  it('media probelor e null cât lipsește o probă (nu 0 fiziologic)', () => {
    const rs = sportReadiness('70.3', [{ id: 'r', source: 'strava', externalId: 'r', date: '2026-10-12', sport: 'alergare', minutes: 90, distanceKm: 15 }], today);
    assert.equal(overallReady(rs), null);
  });
  it('înot fără ture și fără declarație: indicele probei e necunoscut, nu calculat doar din volum', () => {
    const rs = sportReadiness('70.3', [{ id: 's', source: 'apple', externalId: 's', date: '2026-10-12', sport: 'inot', minutes: 45, distanceKm: 1.6 }], today);
    assert.equal(rs.find((x) => x.sport === 'inot')!.value, null);
  });
  it('bara internă: fără renormalizare pe componentele cu date', () => {
    const b = computeBar({ today, activities: [{ id: 'r', date: '2026-10-12', sport: 'alergare', minutes: 90, distanceKm: 18, color: 'verde' }], plannedColorsLast4Weeks: [], openFlags: [], goal: '70.3' });
    assert.equal(b.total, null);
  });
});

describe('A75 — insigne din dovezi potrivite', () => {
  const plan4: PlannedWorkout[] = [W({ id: 'q', date: '2026-10-13', type: 'calitate', plannedMinutes: 45, targetZones: [4], key: true, structure: '4 × 4 min în Z4, 3 min ușor între' })];
  const base = { today, goal: '70.3', planStart: '2026-09-07', raceDate: null, plan: plan4, redDays: [], morningDays: [], raceActivityIds: [] as string[], zonesTested: true, efficiencyPct: [] };
  it('12 min de Z4+ pe toată ședința, fără blocuri: nu e 4×4', () => {
    const r = computeBadges({ ...base, acts: [{ id: 'a', date: '2026-10-13', sport: 'alergare', minutes: 45, timeInZonesMin: { 2: 25, 4: 14, 5: 6 } }] });
    assert.equal(r.badges.find((b) => b.id === '4x4')!.earnedAt, null);
  });
  it('patru blocuri reale de 4 min în Z4: 4×4', () => {
    const rep = { kind: 'lucru' as const, minutes: 4, zonesMin: { 3: 1, 4: 3 } };
    const blocks = [{ kind: 'incalzire' as const, minutes: 12, zonesMin: { 1: 6, 2: 6 } }, rep, rep, rep, rep, { kind: 'revenire' as const, minutes: 8, zonesMin: { 1: 8 } }];
    assert.equal(is4x4(blocks), true);
    const r = computeBadges({ ...base, acts: [{ id: 'a', date: '2026-10-13', sport: 'alergare', minutes: 45, blocks }] });
    assert.equal(r.badges.find((b) => b.id === '4x4')!.earnedAt, '2026-10-13');
  });
  it('„Finisher” doar cu cursa declarată, nu cu un antrenament în ziua cursei', () => {
    const race = '2026-10-18';
    const acts: Activity[] = [{ id: 'r', date: race, sport: 'alergare', minutes: 50, distanceKm: 10 }];
    const b = { ...base, goal: '10k', raceDate: race, plan: [], acts };
    assert.equal(computeBadges(b).badges.find((x) => x.id === 'finisher')!.earnedAt, null);
    assert.equal(computeBadges({ ...b, raceActivityIds: ['r'] }).badges.find((x) => x.id === 'finisher')!.earnedAt, race);
  });
});

describe('A72 / A92 + regula 26 — fără laudă pentru depășire când există durere raportată', () => {
  const x = { sport: 'alergare' as const, name: 'Cuza', minutes: 70, km: 12, nThisSport14: 1, seed: 'w1' };
  it('peste plan cu durere 4/10: fără felicitare', () => {
    assert.equal(cheerFor({ ...x, ratio: 1.3, pain: 4 }), null);
  });
  it('peste plan fără durere: felicitarea „peste” rămâne (tierul proprietarului)', () => {
    assert.equal(cheerFor({ ...x, ratio: 1.3, pain: 0 })!.tier, 'peste');
  });
  it('execuție fixă cu durere: regula 26 nu se schimbă aici (doar depășirea nu se laudă)', () => {
    assert.equal(cheerFor({ ...x, ratio: 1, pain: 4 })!.tier, 'fix');
  });
});
