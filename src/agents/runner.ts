// Rularea piramidei: Fiziolog → (antrenorul sportului, Nutriționist, Fizio, Minte, după rutare) → verificare → Head coach.
// Modelul primește promptul agentului ca system și pachetul ca mesaj; răspunde doar JSON pe schema cerută.
// Nimic din ce scrie un agent nu ajunge la sportiv fără verificarea mecanică (verify.ts).

import type { Packet } from '../collector/packet.js';
import type { AdaptEvent } from '../calendar/adapt.js';
import type { Sport } from '../types.js';
import { HEAD_SCHEMA, SPECIALIST_SCHEMA, type HeadResponse } from './schema.js';
import { AGENTS, getPath, measurementClaims, numbersIn, verifyResponse, type SpecialistResponse, type VerifiedResponse } from './verify.js';

export type AgentName = (typeof AGENTS)[number];

export interface ModelRequest {
  model: string;
  system: string;
  user: string;
  schema: object;
  maxTokens?: number;
}

export interface ModelClient {
  json<T>(req: ModelRequest): Promise<T>;
}

export interface Prompts {
  head_coach: string;
  format: string;
  /** Ghidul echipei: ce e cursa și cum arată anul de pregătire; îl primesc head coach-ul și antrenorii de sport. */
  ghid?: string;
  fiziolog: string;
  antrenor_comun: string;
  antrenor_inot: string;
  antrenor_bicicleta: string;
  antrenor_alergare: string;
  antrenor_forta?: string;
  nutritionist: string;
  fizioterapeut: string;
  minte: string;
}

export interface RunInput {
  packet: Packet;
  /** Fișierele agenților (fiziolog.md, inot.md …), maximum 30 de rânduri fiecare. */
  files: Partial<Record<AgentName, string>>;
  /** jurnal.md: ultimele 14 zile. */
  journal: string[];
  prompts: Prompts;
  models: { specialist: string; head: string };
}

export interface RunResult {
  routed: AgentName[];
  specialists: VerifiedResponse[];
  head: HeadResponse;
  headWarnings: string[];
  /** Evenimentele pentru calendarul viu, derivate determinist din verdict și pachet (nu din textul head coach-ului). */
  events: AdaptEvent[];
  decision: HeadResponse['decizie'];
  fallbackUsed: boolean;
  /** Apelurile de model care au căzut (timeout, JSON invalid…); protecția și mesajul din cod au mers mai departe. */
  failures: string[];
}

// ---------- clientul Anthropic (Messages API, răspuns structurat) ----------

/** onUsage: tokenii consumați de fiecare apel (pentru costul real). */
export function anthropicClient(apiKey: string, fetchImpl: typeof fetch = fetch, onUsage?: (model: string, usage: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }) => void): ModelClient {
  return {
    async json<T>(req: ModelRequest): Promise<T> {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: req.model,
          // Plafon larg: modelul poate gândi înainte de răspuns, iar gândirea consumă din max_tokens.
          max_tokens: Math.max(req.maxTokens ?? 0, 16000),
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          output_config: { format: { type: 'json_schema', schema: req.schema } },
        }),
      });
      if (!res.ok) throw new Error(`model ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { content: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
      if (data.usage) onUsage?.(req.model, data.usage);
      const text = data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (!text) throw new Error(`model: răspuns fără text (${data.stop_reason ?? 'necunoscut'})`);
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`model: răspuns incomplet (${data.stop_reason ?? 'necunoscut'})`);
      }
    },
  };
}

// ---------- rutarea ----------

const COACH_OF: Record<string, AgentName | null> = { inot: 'antrenor_inot', bicicleta: 'antrenor_bicicleta', alergare: 'antrenor_alergare', forta: 'antrenor_forta' };

export function route(p: Packet): AgentName[] {
  const out = new Set<AgentName>(['fiziolog']);
  const sunday = p.meta.zi_saptamana === 'duminica';
  const ultim = p.antrenament_ultim;
  const pain = (ultim?.durere.scor ?? 0) >= 3 || /dur(e|o)r/i.test(ultim?.comentariu ?? '');

  if (p.meta.eveniment === 'dimineata') {
    // Toate ședințele zilei, nu doar cea principală: două sporturi azi = doi antrenori.
    const sports = new Set([p.plan_azi?.sport, ...(p.plan_azi_toate ?? []).map((w) => w.sport)].filter(Boolean));
    for (const sport of sports) {
      const coach = COACH_OF[sport as string];
      if (coach) out.add(coach);
    }
    if (sports.has('forta')) out.add('fizioterapeut');
    out.add('nutritionist');
    if ((p.readiness.hooper.stres ?? 0) >= 5) out.add('minte');
  } else if (p.meta.eveniment === 'dupa_antrenament') {
    const coach = ultim ? COACH_OF[ultim.sport] : null;
    if (coach) out.add(coach);
    if (ultim?.sport === 'forta') out.add('fizioterapeut');
    if (p.plan_maine) out.add('nutritionist');
    if (ultim?.comentariu || ultim?.fata_de_asteptari === 'mai_greu') out.add('minte');
  } else {
    for (const a of AGENTS) out.add(a);
  }
  if (pain || sunday) out.add('fizioterapeut');
  if (sunday) out.add('minte');
  return [...out];
}

// ---------- prompturi ----------

function specialistSystem(agent: AgentName, prompts: Prompts): string {
  if (agent.startsWith('antrenor_')) {
    const sport = agent.replace('antrenor_', '');
    const SPORT = { inot: 'ÎNOT', bicicleta: 'BICICLETĂ', alergare: 'ALERGARE', forta: 'FORȚĂ' }[sport] ?? sport.toUpperCase();
    const common = prompts.antrenor_comun.replace(/<SPORT>/g, SPORT).replace(/<sport>/g, sport);
    const own = prompts[agent as 'antrenor_inot' | 'antrenor_bicicleta' | 'antrenor_alergare' | 'antrenor_forta'] ?? '';
    return `${common}\n${own}\n\n${prompts.ghid ?? ''}\n\n${prompts.format}`;
  }
  return `${prompts[agent as Exclude<AgentName, 'antrenor_inot' | 'antrenor_bicicleta' | 'antrenor_alergare' | 'antrenor_forta'>]}\n\n${prompts.format}`;
}

function specialistUser(agent: AgentName, p: Packet, file: string | undefined): string {
  const fileName = `${agent.replace('antrenor_', '')}.md`;
  return [`=== FIȘIERUL TĂU (${fileName}) ===`, file?.trim() || '(gol: prima rulare)', '', `=== PACHETUL DE DATE (${p.meta.eveniment}, ${p.meta.data}) ===`, JSON.stringify(p, null, 1)].join('\n');
}

function headUser(p: Packet, specialists: VerifiedResponse[], journal: string[]): string {
  return [
    `=== PACHETUL DE DATE (${p.meta.eveniment}, ${p.meta.data}) ===`,
    JSON.stringify(p, null, 1),
    '',
    '=== RĂSPUNSURILE SPECIALIȘTILOR, VERIFICATE MECANIC ===',
    JSON.stringify(specialists, null, 1),
    '',
    '=== jurnal.md (ultimele 14 zile) ===',
    journal.length ? journal.join('\n') : '(gol)',
  ].join('\n');
}

// ---------- verificarea textului liber al head coach-ului ----------

function flattenNumbers(obj: unknown, out: number[] = []): number[] {
  if (typeof obj === 'number') out.push(obj);
  else if (typeof obj === 'string') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(obj);
    if (m) out.push(Number(m[1]), Number(m[2]), Number(m[1]) * 60 + Number(m[2]));
    else for (const n of numbersIn(obj)) out.push(n);
  } else if (Array.isArray(obj)) obj.forEach((x) => flattenNumbers(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => flattenNumbers(x, out));
  return out;
}

/** Fiecare număr din text trebuie să existe în pachet sau într-un rând acceptat al unui specialist. */
export function verifyHeadText(text: string, packet: Packet, specialists: VerifiedResponse[]): string[] {
  const allowed = flattenNumbers(packet);
  for (const s of specialists) for (const item of s.ce) if (item.stare === 'acceptat') for (const c of item.cifre ?? []) if (typeof c.valoare === 'number') allowed.push(c.valoare);
  for (const s of specialists) for (const m of s.mese) allowed.push(...numbersIn(m));
  const problems: string[] = [];
  // Măsurătorile sportivului („pulsul tău 62”, „48 ms”) trebuie să existe în pachet, nu doar la specialiști ca regulă.
  const packetNums = flattenNumbers(packet);
  for (const n of measurementClaims(text)) {
    if (!packetNums.some((v) => Math.abs(v - n) < 0.051)) problems.push(`măsurătoare fără sursă în pachet: ${n}`);
  }
  for (const n of numbersIn(text)) {
    if (!allowed.some((v) => Math.abs(v - n) < 0.051)) problems.push(`număr fără sursă în pachet sau la specialiști: ${n}`);
  }
  // Câmpurile citate între paranteze trebuie să existe.
  for (const m of text.matchAll(/\[([a-z_][a-z0-9_.]*)\]/gi)) {
    const { found } = getPath(packet, m[1]!);
    if (!found) problems.push(`câmp inexistent citat: ${m[1]}`);
  }
  return problems;
}

/** Mesaj construit din cod când head coach-ul nu trece verificarea de două ori: doar verdictul și rândurile acceptate. */
export function fallbackMessage(p: Packet, decision: HeadResponse['decizie'], specialists: VerifiedResponse[]): string {
  const lines: string[] = [];
  const label = { verde: 'verde', galben: 'galben', rosu: 'roșu', stop: 'stop' }[decision];
  lines.push(`Decizia: ${label}.`);
  if (decision === 'rosu') lines.push('Azi: fără antrenament.');
  else if (decision === 'stop') lines.push(safetyLine(p) ? 'Azi: oprire.' : 'Azi: oprire. Vorbește cu un medic înainte să reiei antrenamentele.');
  else if (p.plan_azi) lines.push(`Azi: ${p.plan_azi.sport} ${p.plan_azi.tip} ${p.plan_azi.durata_planificata} min${decision === 'galben' ? ', Z1–Z2' : ''}.`);
  for (const s of specialists) for (const item of s.ce) if (item.stare === 'acceptat') lines.push(`${s.agent}: ${item.text}`);
  return lines.slice(0, 12).join('\n');
}

// ---------- evenimentele pentru calendarul viu ----------

export function eventsFrom(p: Packet, decision: HeadResponse['decizie']): AdaptEvent[] {
  const ev: AdaptEvent[] = [];
  if (p.semnale.febra) ev.push({ kind: 'febra', date: p.meta.data });
  if (decision !== 'verde') ev.push({ kind: 'readiness', date: p.meta.data, verdict: decision });
  const d = p.antrenament_ultim?.durere;
  if (d?.scor != null && d.scor >= 3) ev.push({ kind: 'durere', date: p.antrenament_ultim!.data, score: d.scor, loc: d.loc ?? 'nespecificat' });
  const u = p.antrenament_ultim;
  if (u && !u.in_plan && u.tip_neplanificat && u.tip_neplanificat !== 'altceva') {
    ev.push({ kind: 'neplanificat', activity: { id: `${u.sport}-${u.data}-${u.durata}`, date: u.data, sport: u.sport, minutes: u.durata, distanceKm: u.distanta ?? null }, rpe: u.rpe ?? null, tip: u.tip_neplanificat });
  }
  // Creșterea o decide regula (pachetul), nu modelul: doar duminica, doar pe o zi verde.
  if (p.meta.eveniment === 'saptamanal' && decision === 'verde' && p.progres?.eligibil) {
    const restricted = (Object.entries(p.incarcare.acwr_sport) as [Sport, number | null][]).filter(([, v]) => v != null && v >= 1.3).map(([k]) => k);
    ev.push({ kind: 'progres', date: p.meta.data, restricted });
  }
  return ev;
}

// ---------- rularea ----------

const RANK: Record<HeadResponse['decizie'], number> = { verde: 0, galben: 1, rosu: 2, stop: 3 };

function physVerdict(v: VerifiedResponse | undefined, p: Packet): HeadResponse['decizie'] {
  // Culoarea zilei = starea ta din datele de sănătate (inimă, respirație, recuperare, somn), apoi cum te simți.
  // Încărcarea, ora de culcare etc. sunt observații în mesaj, nu schimbă culoarea. Excepții: stop (simptome, febră),
  // boală sau durere mare = roșu.
  const raw = p.readiness.verdict_cod?.verdict ?? 'galben';
  let out: HeadResponse['decizie'] = raw === 'portocaliu' ? 'galben' : raw;
  if (v?.verdict === 'stop' || p.semnale.febra === true || p.semnale.simptom_cardiac === true) return 'stop';
  if (p.semnale.boala === true || (p.antrenament_ultim?.durere.scor ?? 0) >= 5) out = 'rosu';
  return out;
}

/** Verdictul de siguranță calculat doar din cod (febră, simptom cardiac, boală, durere): nu depinde de niciun apel AI. */
export function safetyDecision(p: Packet): HeadResponse['decizie'] {
  return physVerdict(undefined, p);
}

/** Rândul de siguranță scris din cod, pus în mesaj oricum ar arăta textul modelului. */
export function safetyLine(p: Packet): string | null {
  if (p.semnale.simptom_cardiac === true) return 'Ai raportat un simptom cardiac: azi nu te antrenezi. Cere o evaluare medicală azi. Dacă ai durere în piept, leșin, lipsă de aer sau palpitații care nu trec, sună la 112.';
  if (p.semnale.febra === true) return 'Ai febră: azi și următoarele două zile fără antrenament; apoi o săptămână doar ușor. Dacă febra nu scade sau apar dureri în piept ori lipsă de aer, mergi la medic.';
  return null;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * Nu aruncă la erorile modelului (timeout, JSON invalid, specialist indisponibil): verdictul de siguranță vine din cod
 * înaintea oricărui apel, iar mesajul cade pe varianta din cod. Erorile ajung în `failures` (jurnal).
 */
export async function runPyramid(input: RunInput, client: ModelClient): Promise<RunResult> {
  const { packet, prompts, models } = input;
  const routed = route(packet);
  const specialists: VerifiedResponse[] = [];
  const failures: string[] = [];
  const safe = safetyDecision(packet);

  // 1. Fiziologul primul: verdictul lui intră în pachet pentru ceilalți. Poate doar înăspri verdictul din cod.
  let phys: VerifiedResponse | undefined;
  try {
    const physRaw = await client.json<SpecialistResponse>({
      model: models.specialist,
      system: specialistSystem('fiziolog', prompts),
      user: specialistUser('fiziolog', packet, input.files.fiziolog),
      schema: SPECIALIST_SCHEMA,
    });
    phys = verifyResponse({ ...physRaw, agent: 'fiziolog' }, packet);
    specialists.push(phys);
  } catch (e) {
    failures.push(`fiziolog: ${errText(e)}`);
  }
  let decision = physVerdict(phys, packet);
  if (RANK[decision] < RANK[safe]) decision = safe;
  const packetWithVerdict: Packet = { ...packet, verdict_fiziolog: decision };

  // 2. Restul, în paralel, cu verdictul Fiziologului în pachet. Unul căzut nu le oprește pe celelalte.
  const others = routed.filter((a) => a !== 'fiziolog');
  const settled = await Promise.allSettled(
    others.map(async (agent) => {
      const raw = await client.json<SpecialistResponse>({
        model: models.specialist,
        system: specialistSystem(agent, prompts),
        user: specialistUser(agent, packetWithVerdict, input.files[agent]),
        schema: SPECIALIST_SCHEMA,
      });
      return verifyResponse({ ...raw, agent }, packetWithVerdict);
    }),
  );
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') specialists.push(r.value);
    else failures.push(`${others[i]}: ${errText(r.reason)}`);
  });
  if (specialists.some((s) => s.verdict === 'stop')) decision = 'stop';

  const fallbackHead = (why: string): HeadResponse => ({
    decizie: decision,
    mesaj: fallbackMessage(packetWithVerdict, decision, specialists),
    memento: `Ziua ${packet.meta.data}: pregătirea continuă.`,
    jurnal: [why],
    intrebare: null,
  });

  // 3. Head coach, cu rândurile deja marcate; textul lui se verifică și el, o dată cu reîncercare.
  const headSystem = `${prompts.head_coach}\n\n${prompts.ghid ?? ''}`;
  let head: HeadResponse;
  let headWarnings: string[] = [];
  let fallbackUsed = false;
  try {
    head = await client.json<HeadResponse>({ model: models.head, system: headSystem, user: headUser(packetWithVerdict, specialists, input.journal), schema: HEAD_SCHEMA, maxTokens: 2000 });
    headWarnings = [...verifyHeadText(head.mesaj, packetWithVerdict, specialists), ...verifyHeadText(head.memento, packetWithVerdict, specialists)];
    if (RANK[head.decizie] < RANK[decision]) headWarnings.push(`decizia head coach-ului (${head.decizie}) e mai permisivă decât a Fiziologului (${decision}); se păstrează ${decision}`);
  } catch (e) {
    failures.push(`head_coach: ${errText(e)}`);
    head = fallbackHead(`head coach indisponibil (${errText(e)}); mesaj din cod`);
    fallbackUsed = true;
  }
  if (!fallbackUsed && headWarnings.length) {
    let again: string[] = headWarnings;
    let retry: HeadResponse | null = null;
    try {
      retry = await client.json<HeadResponse>({
        model: models.head,
        system: headSystem,
        user: `${headUser(packetWithVerdict, specialists, input.journal)}\n\n=== VERIFICAREA PRIMEI VARIANTE A RESPINS ===\n${headWarnings.join('\n')}\nRescrie fără aceste cifre sau cu câmpul lor corect. Decizia nu poate fi mai permisivă decât ${decision}.`,
        schema: HEAD_SCHEMA,
        maxTokens: 2000,
      });
      again = [...verifyHeadText(retry.mesaj, packetWithVerdict, specialists), ...verifyHeadText(retry.memento, packetWithVerdict, specialists)];
    } catch (e) {
      failures.push(`head_coach (reîncercare): ${errText(e)}`);
    }
    if (retry && again.length === 0 && RANK[retry.decizie] >= RANK[decision]) {
      head = retry;
      headWarnings = [];
    } else {
      fallbackUsed = true;
      head = { ...fallbackHead(`head coach respins de două ori la verificare: ${again.join('; ')}; mesaj din cod`), jurnal: [...head.jurnal, `head coach respins de două ori la verificare: ${again.join('; ')}; mesaj din cod`] };
      headWarnings = again;
    }
  }
  // Culoarea o dau datele de sănătate; head coach-ul o poate schimba doar în stop (siguranță).
  if (head.decizie === 'stop') decision = 'stop';
  const line = safetyLine(packetWithVerdict);
  head = { ...head, decizie: decision, mesaj: line && !head.mesaj.includes(line) ? `${line}\n${head.mesaj}` : head.mesaj };

  return { routed, specialists, head, headWarnings, events: eventsFrom(packetWithVerdict, decision), decision, fallbackUsed, failures };
}
