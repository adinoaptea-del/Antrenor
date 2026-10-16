// Rularea piramidei: Fiziolog → (antrenorul sportului, Nutriționist, Fizio, Minte, după rutare) → verificare → Head coach.
// Modelul primește promptul agentului ca system și pachetul ca mesaj; răspunde doar JSON pe schema cerută.
// Nimic din ce scrie un agent nu ajunge la sportiv fără verificarea mecanică (verify.ts).

import type { Packet } from '../collector/packet.js';
import type { AdaptEvent } from '../calendar/adapt.js';
import type { Sport } from '../types.js';
import { HEAD_SCHEMA, SPECIALIST_SCHEMA, type HeadResponse } from './schema.js';
import { AGENTS, getPath, numbersIn, verifyResponse, type SpecialistResponse, type VerifiedResponse } from './verify.js';

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
  fiziolog: string;
  antrenor_comun: string;
  antrenor_inot: string;
  antrenor_bicicleta: string;
  antrenor_alergare: string;
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
}

// ---------- clientul Anthropic (Messages API, răspuns structurat) ----------

export function anthropicClient(apiKey: string, fetchImpl: typeof fetch = fetch): ModelClient {
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
      const data = (await res.json()) as { content: { type: string; text?: string }[]; stop_reason?: string };
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

const COACH_OF: Record<string, AgentName | null> = { inot: 'antrenor_inot', bicicleta: 'antrenor_bicicleta', alergare: 'antrenor_alergare', forta: null };

export function route(p: Packet): AgentName[] {
  const out = new Set<AgentName>(['fiziolog']);
  const sunday = p.meta.zi_saptamana === 'duminica';
  const ultim = p.antrenament_ultim;
  const pain = (ultim?.durere.scor ?? 0) >= 3 || /dur(e|o)r/i.test(ultim?.comentariu ?? '');

  if (p.meta.eveniment === 'dimineata') {
    const sport = p.plan_azi?.sport;
    const coach = sport ? COACH_OF[sport] : null;
    if (coach) out.add(coach);
    if (sport === 'forta') out.add('fizioterapeut');
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
    const SPORT = { inot: 'ÎNOT', bicicleta: 'BICICLETĂ', alergare: 'ALERGARE' }[sport] ?? sport.toUpperCase();
    const common = prompts.antrenor_comun.replace(/<SPORT>/g, SPORT).replace(/<sport>/g, sport);
    const own = prompts[agent as 'antrenor_inot' | 'antrenor_bicicleta' | 'antrenor_alergare'];
    return `${common}\n${own}\n\n${prompts.format}`;
  }
  return `${prompts[agent as Exclude<AgentName, 'antrenor_inot' | 'antrenor_bicicleta' | 'antrenor_alergare'>]}\n\n${prompts.format}`;
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
  else if (decision === 'stop') lines.push('Azi: oprire. Vorbește cu un medic / cardiolog / fizioterapeut.');
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
    ev.push({ kind: 'neplanificat', activity: { id: `${u.sport}-${u.data}`, date: u.data, sport: u.sport, minutes: u.durata, distanceKm: u.distanta ?? null }, rpe: u.rpe ?? null, tip: u.tip_neplanificat });
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
  const missingBasics = p.somn.durata_min == null || p.hrv.azi == null;
  let out: HeadResponse['decizie'] = 'galben';
  if (v && (v.verdict === 'verde' || v.verdict === 'galben' || v.verdict === 'rosu' || v.verdict === 'stop')) out = v.verdict;
  else if (v?.verdict === 'ok') out = 'verde';
  else if (v?.verdict === 'atentie') out = 'galben';
  if (missingBasics && RANK[out] < RANK.galben) out = 'galben';
  return out;
}

export async function runPyramid(input: RunInput, client: ModelClient): Promise<RunResult> {
  const { packet, prompts, models } = input;
  const routed = route(packet);
  const specialists: VerifiedResponse[] = [];

  // 1. Fiziologul primul: verdictul lui intră în pachet pentru ceilalți.
  const physRaw = await client.json<SpecialistResponse>({
    model: models.specialist,
    system: specialistSystem('fiziolog', prompts),
    user: specialistUser('fiziolog', packet, input.files.fiziolog),
    schema: SPECIALIST_SCHEMA,
  });
  const phys = verifyResponse({ ...physRaw, agent: 'fiziolog' }, packet);
  specialists.push(phys);
  let decision = physVerdict(phys, packet);
  const packetWithVerdict: Packet = { ...packet, verdict_fiziolog: decision };

  // 2. Restul, în paralel, cu verdictul Fiziologului în pachet.
  const others = routed.filter((a) => a !== 'fiziolog');
  const results = await Promise.all(
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
  specialists.push(...results);
  if (specialists.some((s) => s.verdict === 'stop')) decision = 'stop';

  // 3. Head coach, cu rândurile deja marcate; textul lui se verifică și el, o dată cu reîncercare.
  let head = await client.json<HeadResponse>({ model: models.head, system: prompts.head_coach, user: headUser(packetWithVerdict, specialists, input.journal), schema: HEAD_SCHEMA, maxTokens: 2000 });
  let headWarnings = [...verifyHeadText(head.mesaj, packetWithVerdict, specialists), ...verifyHeadText(head.memento, packetWithVerdict, specialists)];
  if (RANK[head.decizie] < RANK[decision]) headWarnings.push(`decizia head coach-ului (${head.decizie}) e mai permisivă decât a Fiziologului (${decision}); se păstrează ${decision}`);
  let fallbackUsed = false;
  if (headWarnings.length) {
    const retry = await client.json<HeadResponse>({
      model: models.head,
      system: prompts.head_coach,
      user: `${headUser(packetWithVerdict, specialists, input.journal)}\n\n=== VERIFICAREA PRIMEI VARIANTE A RESPINS ===\n${headWarnings.join('\n')}\nRescrie fără aceste cifre sau cu câmpul lor corect. Decizia nu poate fi mai permisivă decât ${decision}.`,
      schema: HEAD_SCHEMA,
      maxTokens: 2000,
    });
    const again = [...verifyHeadText(retry.mesaj, packetWithVerdict, specialists), ...verifyHeadText(retry.memento, packetWithVerdict, specialists)];
    if (again.length === 0 && RANK[retry.decizie] >= RANK[decision]) {
      head = retry;
      headWarnings = [];
    } else {
      fallbackUsed = true;
      head = {
        decizie: decision,
        mesaj: fallbackMessage(packetWithVerdict, decision, specialists),
        memento: `Ziua ${packet.meta.data}: pregătirea continuă.`,
        jurnal: [...head.jurnal, `head coach respins de două ori la verificare: ${again.join('; ') || headWarnings.join('; ')}; mesaj din cod`],
        intrebare: null,
      };
      headWarnings = again.length ? again : headWarnings;
    }
  }
  if (RANK[head.decizie] > RANK[decision]) decision = head.decizie; // head coach-ul poate fi doar mai strict
  head = { ...head, decizie: decision };

  return { routed, specialists, head, headWarnings, events: eventsFrom(packetWithVerdict, decision), decision, fallbackUsed };
}
