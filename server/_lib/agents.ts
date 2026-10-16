import { recordUsage } from './usage.js';
// Rularea agenților pentru un sportiv: pachet → piramidă → mesaje, jurnal, fișiere, calendar viu, readiness.
import { ENV } from './env.js';
import { insert, insertIgnore, one, remove, select, upsert } from './db.js';
import { collect, loadUser, toWorkoutRow } from './collect.js';
import { buildPacket, type Packet } from '../../src/collector/packet.js';
import { anthropicClient, runPyramid, type AgentName, type ModelClient, type RunResult } from '../../src/agents/runner.js';
import { PROMPTS } from '../../src/prompts/bundle.js';
import { adapt, eventKey, type AdaptContext, type AdaptEvent } from '../../src/calendar/adapt.js';
import type { PlannedWorkout } from '../../src/types.js';
import { addDays, localDayStartUtc } from '../../src/util/dates.js';

const FILE_MAX_LINES = 30;

async function loadAgentFiles(userId: string): Promise<Partial<Record<AgentName, string>>> {
  const rows = await select<{ agent: AgentName; content: string }>('agent_files', { user_id: `eq.${userId}` });
  return Object.fromEntries(rows.map((r) => [r.agent, r.content]));
}

async function loadJournal(userId: string, today: string): Promise<string[]> {
  const rows = await select<{ date: string; entry: string }>('journal', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -14)}` }, { order: 'date.asc', limit: 200 });
  return rows.map((r) => `${r.date}: ${r.entry}`);
}

async function loadSchedules(userId: string) {
  const rows = await select<{ day: number; start_min: number; end_min: number }>('schedules', { user_id: `eq.${userId}` });
  return rows.map((r) => ({ day: r.day as 0 | 1 | 2 | 3 | 4 | 5 | 6, startMin: r.start_min, endMin: r.end_min }));
}

async function recentKeyScores(userId: string, today: string) {
  const rows = await select<{ color: 'verde' | 'galben' | 'portocaliu' | 'rosu' | 'gri' | 'albastru' | 'asteptare'; workouts_planned: { date: string; is_key: boolean } }>('scores', { user_id: `eq.${userId}` }, { select: 'color,workouts_planned!inner(date,is_key)', limit: 100 });
  return rows.filter((r) => r.workouts_planned.is_key && r.workouts_planned.date >= addDays(today, -14)).map((r) => ({ date: r.workouts_planned.date, color: r.color }));
}

export interface AgentsOutcome {
  packetId: string;
  decision: RunResult['decision'];
  message: string;
  memento: string;
  changes: string[];
  routed: AgentName[];
  rejected: number;
  fallbackUsed: boolean;
}

/**
 * Un eveniment complet pentru un sportiv. Fără force, nu rulează din nou dacă azi (ziua locală a sportivului) există
 * deja un mesaj pentru eveniment; un pachet rămas de la o rulare căzută nu blochează reluarea.
 */
export async function runAgents(userId: string, today: string, event: 'dimineata' | 'dupa_antrenament' | 'saptamanal', force = false): Promise<AgentsOutcome | null> {
  const user = await loadUser(userId);
  const dayStart = localDayStartUtc(today, user.tz || 'Europe/Bucharest');
  if (!force) {
    const existing = await one<{ id: string }>('messages', { user_id: `eq.${userId}`, kind: `eq.${event}`, created_at: `gte.${dayStart}` });
    if (existing) return null;
  }
  const { input, planId } = await collect(userId, today, event);
  const packet: Packet = buildPacket(input);
  const [packetRow] = await insert<{ id: string }>('packets', { user_id: userId, event, packet });
  const packetId = packetRow!.id;

  const [files, journal] = await Promise.all([loadAgentFiles(userId), loadJournal(userId, today)]);
  const usageWrites: Promise<void>[] = [];
  // Fără cheie de model, piramida merge oricum: protecția și mesajul vin din cod.
  let client: ModelClient;
  try {
    client = anthropicClient(ENV.modelKey(), fetch, (model, u) => usageWrites.push(recordUsage(userId, `agenti:${event}`, model, u)));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    client = { json: () => Promise.reject(err) };
  }
  const result = await runPyramid({ packet, files, journal, prompts: PROMPTS, models: { specialist: ENV.modelSpecialist(), head: ENV.modelHead() } }, client);

  await Promise.all(usageWrites);

  // Calendarul viu întâi: protecția (stop, febră, durere) nu depinde de salvarea textelor de mai jos.
  const changes = planId && result.events.length ? await applyPlanEvents(userId, today, planId, input.plan, result.events) : [];

  // Răspunsurile, cu starea fiecărui rând.
  await insert(
    'agent_outputs',
    result.specialists.map((s) => ({ packet_id: packetId, user_id: userId, agent: s.agent, verdict: s.verdict, output: s, rejected: s.ce.filter((i) => i.stare === 'respins').length, model: ENV.modelSpecialist() })),
  );
  await insert('agent_outputs', { packet_id: packetId, user_id: userId, agent: 'head_coach', verdict: result.decision, output: { ...result.head, avertismente: result.headWarnings, fallback: result.fallbackUsed }, rejected: result.headWarnings.length, model: ENV.modelHead() });

  // Fișierele agenților: „pentru_viitor” se adaugă, maximum 30 de rânduri (cele mai vechi cad).
  for (const s of result.specialists) {
    if (!s.pentru_viitor || s.pentru_viitor === '-') continue;
    const agent = s.agent as AgentName;
    const lines = (files[agent] ?? '').split('\n').filter((l: string) => l.trim());
    lines.push(`${today}: ${s.pentru_viitor}`);
    await upsert('agent_files', { user_id: userId, agent, content: lines.slice(-FILE_MAX_LINES).join('\n'), updated_at: new Date().toISOString() }, 'user_id,agent');
  }

  // Jurnal.
  const entries = [...result.head.jurnal, ...result.failures.map((f) => `model căzut: ${f}`), ...result.specialists.flatMap((s) => s.ce.filter((i) => i.stare === 'respins').map((i) => `respins: ${s.agent} - ${i.text} (${i.motiv})`)), ...result.specialists.flatMap((s) => s.avertismente.map((a) => `avertisment: ${s.agent} - ${a}`))];
  if (entries.length) await insert('journal', entries.map((e) => ({ user_id: userId, date: today, entry: e })));

  // Mesajele către sportiv.
  await insert('messages', { user_id: userId, packet_id: packetId, kind: event, body: result.head.mesaj, decision: result.decision });
  if (event === 'dimineata' && result.head.memento) await insert('messages', { user_id: userId, packet_id: packetId, kind: 'memento', body: result.head.memento, decision: null });

  // Readiness-ul zilei.
  if (event === 'dimineata') {
    await upsert(
      'readiness_daily',
      { user_id: userId, date: today, verdict: result.decision, reason: result.specialists.find((s) => s.agent === 'fiziolog')?.ce.find((i) => i.stare === 'acceptat')?.text ?? null, hrv: packet.hrv.azi, hrv_baseline: packet.hrv.baseline60, rhr: packet.puls_repaus.azi, sleep_min: packet.somn.durata_min, hooper_sum: packet.readiness.hooper.suma, acwr: packet.incarcare.acwr, tsb: packet.incarcare.tsb },
      'user_id,date',
    );
  }

  return { packetId, decision: result.decision, message: result.head.mesaj, memento: result.head.memento, changes, routed: result.routed, rejected: result.specialists.reduce((n, s) => n + s.ce.filter((i) => i.stare === 'respins').length, 0), fallbackUsed: result.fallbackUsed };
}

/**
 * Aplică evenimentele pe planul activ, o singură dată fiecare: cheia evenimentului se rezervă în agent_events
 * (unică pe sportiv) înainte de schimbare și se eliberează dacă scrierea pică, ca o reîncercare să poată reface pasul.
 */
export async function applyPlanEvents(userId: string, today: string, planId: string, current: PlannedWorkout[], events: AdaptEvent[]): Promise<string[]> {
  const ctx: AdaptContext = { today, freeBlocks: await loadSchedules(userId), recentKeyScores: await recentKeyScores(userId, today) };
  const changes: string[] = [];
  let plan = current;
  for (const ev of events) {
    const key = eventKey(ev);
    const claimed = await claimEvent(userId, key);
    if (!claimed) continue;
    const before = new Map(plan.map((w) => [w.id, JSON.stringify(w)]));
    const r = adapt(plan, ev, ctx);
    const changed = r.plan.filter((w) => before.get(w.id) !== JSON.stringify(w));
    try {
      if (changed.length) await upsert('workouts_planned', changed.map((w) => toWorkoutRow(w, userId, planId)), 'id');
    } catch (e) {
      await remove('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}` }).catch(() => undefined);
      throw e;
    }
    plan = r.plan;
    changes.push(...r.changes);
  }
  if (changes.length) await insert('journal', changes.map((c) => ({ user_id: userId, date: today, entry: `calendar: ${c}` })));
  return changes;
}

/** true = evenimentul e nou și a fost rezervat; false = a fost deja aplicat. Fără tabelă (schemă veche): se aplică. */
async function claimEvent(userId: string, key: string): Promise<boolean> {
  try {
    const rows = await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key');
    return rows.length > 0;
  } catch {
    return true;
  }
}
