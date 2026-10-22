import type { Execution } from '../../src/calendar/progression.js';
import { buildMe } from './me.js';
import { messageMatches } from '../../src/calendar/day.js';
import { withOriginal } from '../../src/calendar/actions.js';
import { recordUsage } from './usage.js';
import { hasConsent } from './consent.js';
// Rularea agenților pentru un sportiv: pachet → piramidă → mesaje, jurnal, fișiere, calendar viu, readiness.
import { ENV } from './env.js';
import { insert, insertIgnore, one, remove, select, upsert } from './db.js';
import { collect, loadActivities, loadUser, toWorkoutRow } from './collect.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import { matchActivities } from '../../src/scoring/match.js';
import { buildPacket, type Packet } from '../../src/collector/packet.js';
import { loadStoredScores } from './score.js';
import { anthropicClient, runMainCoach, runPyramid, type AgentName, type ModelClient, type RunResult } from '../../src/agents/runner.js';
import { PROMPTS } from '../../src/prompts/bundle.js';
import { adapt, eventKey, type AdaptContext, type AdaptEvent } from '../../src/calendar/adapt.js';
import type { PlannedWorkout } from '../../src/types.js';
import { addDays, localDayStartUtc } from '../../src/util/dates.js';

import { AiSkip, contextHash, manualCap, manualDecision, manualRunsToday, recordManualRun, sameContextAsLastMessage } from './ai-budget.js';

const FILE_MAX_LINES = 30;

async function loadAgentFiles(userId: string): Promise<Partial<Record<AgentName, string>>> {
  const rows = await select<{ agent: AgentName; content: string }>('agent_files', { user_id: `eq.${userId}` });
  return Object.fromEntries(rows.map((r) => [r.agent, r.content]));
}

/**
 * Auditul consolidat, B4: filtrul se aplică în interogare și se iau cele mai NOI 200 de intrări (date.desc), apoi
 * lista se întoarce în ordine cronologică. Înainte, limita se aplica pe cele mai vechi, iar declarațiile de azi
 * puteau lipsi din context exact când jurnalul era plin.
 */
export const JOURNAL_FILTER = '(entry.like.calendar*,entry.like.declarat*de*sportiv*,entry.like.plecat*,entry.like.migrare*)'; // fără spații în URL; filtrul exact rămâne journalForAI
async function loadJournal(userId: string, today: string): Promise<string[]> {
  const rows = await select<{ date: string; entry: string }>('journal', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -14)}`, or: JOURNAL_FILTER }, { order: 'date.desc,created_at.desc', limit: 200 });
  return recentJournal(rows, 200);
}

/** Cele mai noi `max` intrări permise, în ordine cronologică (rândurile vin de la cea mai nouă). */
export function recentJournal(newestFirst: { date: string; entry: string }[], max: number): string[] {
  return newestFirst
    .filter((r) => journalForAI(r.entry))
    .slice(0, max)
    .reverse()
    .map((r) => `${r.date}: ${r.entry}`);
}

/**
 * Auditul v93, A15: la model ajung doar intrările scrise de cod (calendarul, declarațiile sportivului, plecările,
 * migrările), nu textul liber scris de model, textele respinse sau eșecurile — altfel o „amintire” fără dovezi
 * se întoarce în prompt ca fapt.
 */
export function journalForAI(entry: string): boolean {
  return /^(calendar|declarat de sportiv|plecat |migrare )/.test(entry);
}

export async function loadSchedules(userId: string) {
  const rows = await select<{ day: number; start_min: number; end_min: number }>('schedules', { user_id: `eq.${userId}` });
  return rows.map((r) => ({ day: r.day as 0 | 1 | 2 | 3 | 4 | 5 | 6, startMin: r.start_min, endMin: r.end_min }));
}

async function recentKeyScores(userId: string, today: string) {
  const rows = await select<{ color: 'verde' | 'galben' | 'portocaliu' | 'rosu' | 'gri' | 'albastru' | 'asteptare'; workouts_planned: { date: string; is_key: boolean } }>('scores', { user_id: `eq.${userId}` }, { select: 'color,workouts_planned!inner(date,is_key)', limit: 100 });
  return rows.filter((r) => r.workouts_planned.is_key && r.workouts_planned.date >= addDays(today, -14)).map((r) => ({ date: r.workouts_planned.date, color: r.color }));
}

/**
 * Auditul v93, A13: urma deciziei pe rulare, fără schemă nouă (în agent_outputs.output): modul, cine a fost rutat,
 * decizia din cod și cea finală, evenimentele (cu propunerea și dovezile ei), ce a respins verificarea, eșecurile
 * modelului și ce s-a schimbat efectiv în calendar.
 */
export function decisionRecord(result: RunResult, codeDecision: unknown, changes: string[]) {
  return {
    mod: result.mode ?? 'piramida',
    rutati: result.routed,
    decizie_cod: codeDecision,
    decizie_finala: result.decision,
    evenimente: result.events,
    respinse: result.headWarnings,
    esecuri_model: result.failures,
    fallback: result.fallbackUsed,
    schimbari_calendar: changes,
  };
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
export async function runAgents(userId: string, today: string, event: 'dimineata' | 'dupa_antrenament' | 'saptamanal', force = false, opts: { manual?: boolean } = {}): Promise<AgentsOutcome | null> {
  if (!(await hasConsent(userId))) return null;
  const user = await loadUser(userId);
  const dayStart = localDayStartUtc(today, user.tz || 'Europe/Bucharest');
  if (!force) {
    const existing = await one<{ id: string }>('messages', { user_id: `eq.${userId}`, kind: `eq.${event}`, created_at: `gte.${dayStart}` });
    if (existing) return null;
  }
  // Idempotență (auditul de coaching, Q13): două rulări simultane (cron + buton, retry) nu produc două mesaje și nu
  // aplică de două ori evenimentele. Încuietoarea e atomică (insert ignorat la dublură) și expiră după 10 minute.
  const lockKey = `run:${event}:${today}`;
  if (!(await acquireLock(userId, lockKey, 10 * 60_000))) return null;
  try {
    return await runAgentsLocked(userId, today, event, force, opts.manual === true);
  } finally {
    await releaseLock(userId, lockKey);
  }
}

async function runAgentsLocked(userId: string, today: string, event: 'dimineata' | 'dupa_antrenament' | 'saptamanal', force: boolean, manual = false): Promise<AgentsOutcome | null> {
  const user = await loadUser(userId);
  const { input, planId } = await collect(userId, today, event);
  // Scorurile salvate (aceleași ca pe ecrane): pachetul nu calculează altă culoare pentru aceeași ședință (auditul v93, T51).
  input.storedScores = await loadStoredScores(userId).catch(() => null);
  const packet: Packet = buildPacket(input);
  // Aplicația și antrenorul se pun de acord: antrenorul primește decizia zilei luată de aplicație din toate datele.
  const me = await buildMe(userId, today).catch(() => null);
  if (me?.day && !me.day.ask) packet.decizia_aplicatiei = { nivel: me.day.level, titlu: me.day.title, ce_faci: me.day.action, motiv: forAI(me.day.reason) };
  if (event === 'dimineata' && !force && me?.day?.ask) return null;
  // Dimineața fără date de la brățări și fără răspunsul sportivului: nu scriem un mesaj pe o culoare ghicită.
  // Aplicația îl întreabă dacă e apt; după răspuns, mesajul se cere din aplicație.
  if (event === 'dimineata' && !force && packet.readiness.verdict_cod.intrebare) return null;
  const [files, journal] = await Promise.all([loadAgentFiles(userId), loadJournal(userId, today)]);
  // B3: versiunea contextului; o cerere manuală pe același context nu cheamă modelul, iar plafonul zilnic e pe server.
  const hash = contextHash({ packet, journal, event, files, models: { specialist: ENV.modelSpecialist(), head: ENV.modelHead(), mode: ENV.agentMode() } });
  if (manual) {
    const dayStart = localDayStartUtc(today, user.tz || 'Europe/Bucharest');
    const d = manualDecision({ used: await manualRunsToday(userId, today), cap: manualCap(), sameContextAsLastMessage: await sameContextAsLastMessage(userId, event, dayStart, hash) });
    if (!d.run) throw new AiSkip(d.message);
    await recordManualRun(userId, today, event);
  }
  const [packetRow] = await insert<{ id: string }>('packets', { user_id: userId, event, packet, context_hash: hash });
  const packetId = packetRow!.id;

  const usageWrites: Promise<void>[] = [];
  // Fără cheie de model, piramida merge oricum: protecția și mesajul vin din cod.
  let client: ModelClient;
  try {
    client = anthropicClient(ENV.modelKey(), fetch, (model, u) => usageWrites.push(recordUsage(userId, `agenti:${event}`, model, u)));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    client = { json: () => Promise.reject(err) };
  }
  const runInput = { packet, files, journal, prompts: PROMPTS, models: { specialist: ENV.modelSpecialist(), head: ENV.modelHead() } };
  const result = ENV.agentMode() === 'piramida' ? await runPyramid(runInput, client) : await runMainCoach(runInput, client);

  await Promise.all(usageWrites);

  // Calendarul viu întâi: protecția (stop, febră, durere) nu depinde de salvarea textelor de mai jos.
  const changes = planId && result.events.length ? await applyPlanEvents(userId, today, planId, input.plan, result.events) : [];

  // Răspunsurile, cu starea fiecărui rând.
  await insert(
    'agent_outputs',
    result.specialists.map((s) => ({ packet_id: packetId, user_id: userId, agent: s.agent, verdict: s.verdict, output: s, rejected: s.ce.filter((i) => i.stare === 'respins').length, model: ENV.modelSpecialist() })),
  );
  await insert('agent_outputs', { packet_id: packetId, user_id: userId, agent: 'head_coach', verdict: result.decision, output: { ...result.head, avertismente: result.headWarnings, fallback: result.fallbackUsed, decision_record: decisionRecord(result, packet.decizia_aplicatiei ?? null, changes) }, rejected: result.headWarnings.length, model: ENV.modelHead() });

  // Fișierele agenților: „pentru_viitor” se adaugă, maximum 30 de rânduri (cele mai vechi cad).
  for (const s of result.specialists) {
    if (!s.pentru_viitor || s.pentru_viitor === '-') continue;
    const agent = s.agent as AgentName;
    const lines = (files[agent] ?? '').split('\n').filter((l: string) => l.trim());
    lines.push(`${today}: ${s.pentru_viitor}`);
    await upsert('agent_files', { user_id: userId, agent, content: lines.slice(-FILE_MAX_LINES).join('\n'), updated_at: new Date().toISOString() }, 'user_id,agent');
  }

  // Jurnal.
  const entries = [...result.head.jurnal.map((j) => `ai: ${j}`), ...result.failures.map((f) => `model căzut: ${f}`), ...result.specialists.flatMap((s) => s.ce.filter((i) => i.stare === 'respins').map((i) => `respins: ${s.agent} - ${i.text} (${i.motiv})`)), ...result.specialists.flatMap((s) => s.avertismente.map((a) => `avertisment: ${s.agent} - ${a}`))];
  if (entries.length) await insert('journal', entries.map((e) => ({ user_id: userId, date: today, entry: e })));

  // Mesajele către sportiv.
  await insert('messages', { user_id: userId, packet_id: packetId, kind: event, body: result.head.mesaj, decision: result.decision });
  if (event === 'dimineata' && result.head.memento) await insert('messages', { user_id: userId, packet_id: packetId, kind: 'memento', body: result.head.memento, decision: null });

  // Readiness-ul zilei.
  if (event === 'dimineata') {
    await upsert(
      'readiness_daily',
      { user_id: userId, date: today, verdict: result.decision, reason: result.specialists.find((s) => s.agent === 'fiziolog')?.ce.find((i) => i.stare === 'acceptat')?.text ?? (me?.day?.reason ? forAI(me.day.reason) : null) /* A15: în modul main, motivul din cod */, hrv: packet.hrv.azi, hrv_baseline: packet.hrv.baseline60, rhr: packet.puls_repaus.azi, sleep_min: packet.somn.durata_min, hooper_sum: packet.readiness.hooper.suma, acwr: packet.incarcare.acwr, tsb: packet.incarcare.tsb },
      'user_id,date',
    );
  }

  return { packetId, decision: result.decision, message: result.head.mesaj, memento: result.head.memento, changes, routed: result.routed, rejected: result.specialists.reduce((n, s) => n + s.ce.filter((i) => i.stare === 'respins').length, 0), fallbackUsed: result.fallbackUsed };
}

/**
 * Aplică evenimentele pe planul activ, o singură dată fiecare: cheia evenimentului se rezervă în agent_events
 * (unică pe sportiv) înainte de schimbare și se eliberează dacă scrierea pică, ca o reîncercare să poată reface pasul.
 */
export async function applyPlanEvents(userId: string, today: string, planId: string, current: PlannedWorkout[], events: AdaptEvent[], doneIds?: string[], executions?: Execution[]): Promise<string[]> {
  // Ce s-a făcut deja (are activitate asociată) nu se mai anulează și nu se mai schimbă.
  const done = doneIds ?? (await executedIds(userId, today, current));
  const ctx: AdaptContext = { today, freeBlocks: await loadSchedules(userId), recentKeyScores: await recentKeyScores(userId, today), done, ...(executions ? { executions } : {}) };
  const changes: string[] = [];
  let plan = current;
  for (const ev of events) {
    const key = eventKey(ev);
    // Auditul v93, A22: rezervare în doi pași — marcajul „gata” se scrie doar după ce planul e salvat; o rezervare
    // rămasă neterminată (proces oprit) se poate relua după 10 minute, nu se pierde.
    const claimed = await claimPlanEvent(userId, key);
    if (!claimed) continue;
    const before = new Map(plan.map((w) => [w.id, JSON.stringify(w)]));
    const r = adapt(plan, ev, ctx);
    const at = new Date().toISOString();
    const prevById = new Map(plan.map((w) => [w.id, w]));
    const changed = r.plan.filter((w) => before.get(w.id) !== JSON.stringify(w)).map((w) => (prevById.has(w.id) ? withOriginal(prevById.get(w.id)!, w, at) : w));
    const changedIds = new Map(changed.map((w) => [w.id, w]));
    r.plan = r.plan.map((w) => changedIds.get(w.id) ?? w);
    try {
      if (changed.length) await upsert('workouts_planned', changed.map((w) => toWorkoutRow(w, userId, planId)), 'id');
      await insertIgnore('agent_events', { user_id: userId, event_key: `${key}:ok` }, 'user_id,event_key').catch(() => undefined);
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

/** De când se scrie marcajul „gata” (v101). */
const TWO_PHASE_SINCE = '2026-10-20T15:00:00Z';

/** Tabela lipsește (schemă veche): atunci, și doar atunci, evenimentul se aplică fără registru. */
const missingTable = (e: unknown) => /does not exist|relation .*agent_events|PGRST20[45]/i.test(e instanceof Error ? e.message : String(e));

/**
 * true = evenimentul e nou și a fost rezervat; false = a fost deja aplicat. Auditul v93, A22: o eroare de bază de date
 * NU mai înseamnă „aplică” (ar dubla efectul); doar lipsa tabelei (schemă veche) se tratează ca înainte.
 */
export async function claimEvent(userId: string, key: string): Promise<boolean> {
  try {
    const rows = await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key');
    return rows.length > 0;
  } catch (e) {
    return missingTable(e);
  }
}

/** Rezervarea unui eveniment de plan: nouă → da; „gata” → nu; rezervată dar neterminată de peste 10 min → se reia. */
export async function claimPlanEvent(userId: string, key: string): Promise<boolean> {
  try {
    if ((await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key')).length) return true;
    if (await one('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}:ok` })) return false;
    const old = await one<{ applied_at: string }>('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}` });
    // Rezervările de dinainte de registrul în doi pași (fără marcaj „gata”) s-au aplicat cu vechea regulă: rămân aplicate.
    if (old && Date.parse(old.applied_at) < Date.parse(TWO_PHASE_SINCE)) return false;
    if (old && Date.now() - Date.parse(old.applied_at) > 10 * 60 * 1000) {
      await remove('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}` });
      return (await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key')).length > 0;
    }
    return false;
  } catch (e) {
    return missingTable(e);
  }
}

/** Încuietoare pe (sportiv, cheie): true dacă am luat-o; una mai veche de `staleMs` se consideră rămasă de la o rulare căzută. */
export async function acquireLock(userId: string, key: string, staleMs: number): Promise<boolean> {
  try {
    const rows = await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key');
    if (rows.length > 0) return true;
    const old = await one<{ applied_at: string }>('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}` });
    if (old && Date.now() - Date.parse(old.applied_at) > staleMs) {
      await remove('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}` });
      return (await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key')).length > 0;
    }
    return false;
  } catch {
    return true;
  }
}
export async function releaseLock(userId: string, key: string): Promise<void> {
  await remove('agent_events', { user_id: `eq.${userId}`, event_key: `eq.${key}` }).catch(() => undefined);
}

/** Ședințele din ultimele zile care au deja activitate asociată (aceeași asociere ca la scor). */
export async function executedIds(userId: string, today: string, plan: PlannedWorkout[]): Promise<string[]> {
  const acts = dedupeActivities(await loadActivities(userId, addDays(today, -3)));
  return matchActivities(plan.filter((w) => w.date <= today && w.date >= addDays(today, -3)), acts, today)
    .matches.filter((m) => m.activity)
    .map((m) => m.planned.id);
}

/** Fără cifrele de efort (TRIMP) în textul trimis la AI: pot veni din activități pe care AI-ul n-are voie să le vadă. */
function forAI(t: string | null): string | null {
  return t ? t.replace(/\s*\([^)]*TRIMP[^)]*\)/g, '') : null;
}

/**
 * Dacă decizia aplicației s-a schimbat după mesajul de azi (date noi, formular, activitate), mesajul se rescrie,
 * o singură dată pe fiecare decizie nouă. Așa ce scrie antrenorul e mereu ce decide aplicația.
 */
export async function realign(userId: string, today: string): Promise<boolean> {
  const me = await buildMe(userId, today);
  if (!me.day || me.day.ask) return false;
  const latest = me.messages.find((m) => m.kind !== 'memento' && m.decision && Date.parse(m.createdAt) >= Date.parse(localDayStartUtc(today, me.user.tz || 'Europe/Bucharest')));
  if (!latest || messageMatches(latest.decision, me.day)) return false;
  if (!(await claimEvent(userId, `realiniere:${today}:${me.day.level}:${me.day.title}`))) return false;
  await runAgents(userId, today, 'dimineata', true);
  return true;
}
