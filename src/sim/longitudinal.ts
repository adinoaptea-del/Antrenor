// Simularea longitudinală (auditul T11): nu doar calendarul generat, ci cum se schimbă el zi de zi, prin aceleași reguli
// de adaptare ca pe server (src/calendar/adapt.ts), când sportivul ratează, obosește, se îmbolnăvește, face ceva în afara
// planului, are o durere sau revine după pauză. Fiecare eveniment sosește de DOUĂ ori (reîncercare, două surse): ca pe
// server, cheia evenimentului îl aplică o singură dată.
//
// După fiecare eveniment se verifică invariantele:
//  - trecutul nu se rescrie;
//  - ce s-a ratat nu se recuperează (nicio ședință viitoare nu crește peste plan, nimic nu se dublează pe o zi);
//  - cel mult două ședințe active pe zi și o singură ședință-cheie;
//  - ședințele rămân coerente (durată, pași, plafon, capacitatea la înot).
// Scenariul e determinist (aceeași sămânță = același rezultat), ca să poată fi comparat între versiuni.

import { adapt, eventKey, type AdaptEvent } from '../calendar/adapt.js';
import { generatePlan, type GenerateInput } from '../calendar/generate.js';
import { coherenceIssues } from '../calendar/coherence.js';
import { detailSteps } from '../calendar/session-detail.js';
import { isActiveWorkout, type Color, type PlannedWorkout } from '../types.js';
import { addDays, weekday } from '../util/dates.js';

export interface LongitudinalResult {
  ok: boolean;
  log: { date: string; what: string; changes: string[] }[];
  violations: string[];
  /** Ședințe făcute / ratate / parțiale în perioada simulată. */
  counts: { done: number; missed: number; partial: number; duplicatesIgnored: number };
  plan0Minutes: number;
  planMinutes: number;
}

export function runLongitudinal(input: GenerateInput, weeks = 8, seed = 7): LongitudinalResult {
  const r = generatePlan(input);
  if (!r.ok) return { ok: false, log: [], violations: [r.reason], counts: { done: 0, missed: 0, partial: 0, duplicatesIgnored: 0 }, plan0Minutes: 0, planMinutes: 0 };
  const plan0 = r.weeks.flatMap((w) => w.workouts);
  const orig = new Map(plan0.map((w) => [w.id, w]));
  let plan = plan0.map((w) => ({ ...w }));
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const seen = new Set<string>();
  const done: string[] = [];
  const keyScores: { date: string; color: Color }[] = [];
  const log: LongitudinalResult['log'] = [];
  const violations: string[] = [];
  const counts = { done: 0, missed: 0, partial: 0, duplicatesIgnored: 0 };
  const age = input.athlete?.age ?? null;
  const swimCap = input.swim?.continuousM ?? null;
  const start = input.startDate;
  let missedThisWeek = 0;
  // Fitness: sala ratată ieri → a doua zi dimineață, rotația continuă (ca pe server, src/../react.ts missedStrength).
  const fitness = String(input.goal).startsWith('fit-');
  let missedYesterday: string[] = [];
  let lastActive = start;

  const deliver = (today: string, ev: AdaptEvent, what: string) => {
    // Două livrări ale aceluiași eveniment: a doua e ignorată de cheie (ca tabela de evenimente de pe server).
    for (let k = 0; k < 2; k++) {
      const key = eventKey(ev);
      if (seen.has(key)) {
        counts.duplicatesIgnored += 1;
        continue;
      }
      seen.add(key);
      const before = plan;
      const res = adapt(plan, ev, { today, freeBlocks: input.freeBlocks, recentKeyScores: keyScores.filter((x) => x.date <= today), done });
      plan = res.plan;
      log.push({ date: today, what, changes: res.changes });
      check(today, before, what);
    }
  };

  const check = (today: string, before: PlannedWorkout[], what: string) => {
    const prev = new Map(before.map((w) => [w.id, w]));
    for (const w of plan) {
      const p = prev.get(w.id);
      if (w.date < today && p && JSON.stringify(p) !== JSON.stringify(w)) violations.push(`${today} ${what}: trecutul rescris (${w.id})`);
      const o = orig.get(w.id.replace(/-mutat$/, ''));
      if (w.date >= today && isActiveWorkout(w) && o && w.plannedMinutes > Math.ceil(o.plannedMinutes * 1.1)) violations.push(`${today} ${what}: ${w.id} crește la ${w.plannedMinutes} min (planul avea ${o.plannedMinutes})`);
      if (w.date >= today && isActiveWorkout(w) && !o) violations.push(`${today} ${what}: ședință nouă ${w.id}`);
    }
    const byDay = new Map<string, PlannedWorkout[]>();
    for (const w of plan) if (w.date >= today && isActiveWorkout(w)) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
    for (const [d, ws] of byDay) {
      if (ws.length > 2) violations.push(`${today} ${what}: ${ws.length} ședințe pe ${d}`);
      if (ws.filter((x) => x.key).length > 1) violations.push(`${today} ${what}: două ședințe-cheie pe ${d}`);
    }
    for (const w of plan.filter((x) => x.date >= today && x.date <= addDays(today, 14) && isActiveWorkout(x))) {
      for (const i of coherenceIssues(w, detailSteps(w, { age, swimContinuousM: swimCap }), swimCap)) violations.push(`${today} ${what}: ${i}`);
    }
  };

  for (let i = 0; i < weeks * 7; i++) {
    const today = addDays(start, i);
    const pause = i >= 36 && i < 46; // 10 zile fără antrenament (concediu, boală)
    for (const id of missedYesterday) deliver(today, { kind: 'forta-ratat', workoutId: id }, 'sală ratată ieri: rotația continuă');
    missedYesterday = [];
    // Evenimentele programate ale scenariului.
    if (i === 9) deliver(today, { kind: 'readiness', date: today, verdict: 'galben', reason: 'somn scurt, HRV sub medie' }, 'oboseală: zi galbenă');
    if (i === 11) deliver(today, { kind: 'readiness', date: today, verdict: 'rosu', reason: 'HRV mult sub medie' }, 'oboseală: zi roșie');
    if (i === 15) deliver(today, { kind: 'febra', date: today }, 'febră');
    if (i === 23) {
      const legs = { id: `sim-forta-${today}`, date: today, sport: 'forta' as const, minutes: 90 };
      deliver(today, { kind: 'efort', activity: legs, rpe: 8, planned: false }, 'ședință grea de picioare, neplanificată (90 min, RPE 8)');
    }
    if (i === 25) {
      const run = { id: `sim-run-${today}`, date: today, sport: 'alergare' as const, minutes: 70, avgHr: 150 };
      deliver(today, { kind: 'neplanificat', activity: run, rpe: 6, tip: 'antrenament' }, 'alergare neplanificată de 70 min');
    }
    if (i === 30) deliver(today, { kind: 'durere', date: today, score: 5, loc: 'genunchi' }, 'durere 5/10 la genunchi');
    if (i === 46) deliver(today, { kind: 'revenire', date: today, zile: 10, dela: lastActive }, 'revenire după 10 zile de pauză');

    // Ședințele zilei: făcute, parțiale sau ratate (ratarea nu se recuperează: niciun eveniment nu le mută).
    for (const w of plan.filter((x) => x.date === today && isActiveWorkout(x))) {
      const x = rnd();
      if (pause || x < 0.15) {
        counts.missed += 1;
        missedThisWeek += 1;
        if (fitness && w.type === 'forta') missedYesterday.push(w.id);
        continue;
      }
      done.push(w.id);
      lastActive = today;
      if (x < 0.3) {
        counts.partial += 1;
        if (w.key) {
          keyScores.push({ date: today, color: 'portocaliu' });
          deliver(today, { kind: 'scor', workoutId: w.id, color: 'portocaliu' }, `ședință-cheie parțială (${w.sport} ${w.type})`);
        }
      } else {
        counts.done += 1;
        if (w.key) keyScores.push({ date: today, color: 'verde' });
      }
    }
    if (weekday(today) === 6) {
      if (missedThisWeek >= 2) deliver(today, { kind: 'bilant', date: today, obosit: true, motiv: `${missedThisWeek} ședințe ratate` }, `bilanț: ${missedThisWeek} ratate`);
      missedThisWeek = 0;
    }
  }
  const mins = (ws: PlannedWorkout[]) => ws.filter((w) => w.date < addDays(start, weeks * 7) && isActiveWorkout(w)).reduce((n, w) => n + w.plannedMinutes, 0);
  return { ok: violations.length === 0, log, violations, counts, plan0Minutes: mins(plan0), planMinutes: mins(plan) };
}
