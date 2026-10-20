// Verificarea mecanică a răspunsurilor specialiștilor: fiecare număr din „ce” trebuie să aibă perechea { valoare, camp }
// cu un câmp care există în pachet și are exact acea valoare. Rulează înaintea head coach-ului; el nu re-verifică.

export type Verdict = 'ok' | 'atentie' | 'stop' | 'tacere' | 'verde' | 'galben' | 'rosu';

export interface Cifra {
  valoare: number | string;
  /** Calea din pachet („hrv.azi”), sau „prescriptie” / „regula” pentru numere care nu sunt date. */
  camp: string;
}

export interface CeItem {
  text: string;
  cifre?: Cifra[];
}

export interface SpecialistResponse {
  agent: string;
  verdict: Verdict;
  ce: CeItem[];
  mese?: string[];
  pentru_viitor: string;
  lipseste: string[];
}

export interface VerifiedItem extends CeItem {
  stare: 'acceptat' | 'respins';
  motiv?: string;
}

export interface VerifiedResponse {
  agent: string;
  verdict: Verdict;
  ce: VerifiedItem[];
  mese: string[];
  pentru_viitor: string;
  lipseste: string[];
  /** Probleme de formă sau de „lipseste” greșit: nu resping rânduri, dar intră în jurnal. */
  avertismente: string[];
  valid: boolean;
}

export const AGENTS = ['fiziolog', 'antrenor_inot', 'antrenor_bicicleta', 'antrenor_alergare', 'antrenor_forta', 'nutritionist', 'fizioterapeut', 'minte'] as const;
const VERDICTS: Verdict[] = ['ok', 'atentie', 'stop', 'tacere', 'verde', 'galben', 'rosu'];
const MAX_CE: Record<string, number> = { fiziolog: 4, antrenor_inot: 4, antrenor_bicicleta: 4, antrenor_alergare: 4, antrenor_forta: 4, nutritionist: 4, fizioterapeut: 3, minte: 2 };
const FREE_FIELDS = new Set(['prescriptie', 'regula']);

export function getPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur != null && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else if (Array.isArray(cur) && /^\d+$/.test(part) && Number(part) < cur.length) {
      cur = cur[Number(part)];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

/** Numerele dintr-un text, cu virgula zecimală românească acceptată; ignoră Z1–Z5 și datele calendaristice. */
export function numbersIn(text: string): number[] {
  const cleaned = text
    .replace(/\bZ[1-5](?:\s*[–-]\s*Z?[1-5])?\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, ' ');
  const out: number[] = [];
  for (const m of cleaned.matchAll(/(?<![\w.,])(-?\d+(?:[.,]\d+)?)(?![\w])/g)) {
    out.push(Number(m[1]!.replace(',', '.')));
  }
  // „6:26” → 6 și 26 sunt o singură valoare (durată); le tratăm ca text, nu ca numere separate
  const durations = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  for (const d of durations) {
    const [h, m] = d.split(':').map(Number);
    const ih = out.indexOf(h!);
    if (ih >= 0) out.splice(ih, 1);
    const im = out.indexOf(m!);
    if (im >= 0) out.splice(im, 1);
  }
  return out;
}

function valueEquals(claimed: number | string, actual: unknown): boolean {
  if (actual == null) return false;
  if (typeof actual === 'number') {
    const c = typeof claimed === 'number' ? claimed : Number(String(claimed).replace(',', '.'));
    return Number.isFinite(c) && Math.abs(c - actual) < 0.051;
  }
  if (typeof actual === 'string') return String(claimed).trim().toLowerCase() === actual.trim().toLowerCase();
  if (typeof actual === 'boolean') return String(claimed).toLowerCase() === String(actual);
  if (Array.isArray(actual)) return JSON.stringify(actual) === JSON.stringify(claimed) || actual.map(String).join('–') === String(claimed);
  return false;
}

/**
 * Numerele prezentate ca măsurători ale sportivului („pulsul tău 62”, „62 bpm”, „ai dormit 7,5 ore”, „HRV 48 ms”).
 * Ele trebuie să vină dintr-un câmp al pachetului; „regula” / „prescriptie” nu le pot acoperi.
 */
const MEASURE_BEFORE = /(puls\w*|HRV\w*|ai dormit|somn\w*|ai alergat|ai pedalat|ai înotat|ritmul tău|greutate\w*|feritin\w*|vitamina d|hemoglobin\w*|recuperare\w*|respirați\w*)[^.\d]{0,25}?(\d+(?:[.,]\d+)?)(?![\d:])/gi;
const MEASURE_AFTER = /(\d+(?:[.,]\d+)?)\s*(bpm|bătăi|ms\b)/gi;
/**
 * Auditul v93, A14: măsurătoarea are un TIP (puls, HRV, somn, distanță…), iar cifra trebuie să existe în pachet într-un
 * câmp de același tip — „ai alergat 120 km” nu trece doar pentru că 120 e pulsul.
 */
export type ClaimKind = 'puls' | 'hrv' | 'somn' | 'distanta' | 'greutate' | 'feritina' | 'vitamina_d' | 'hemoglobina' | 'recuperare' | 'respiratie' | 'kcal' | 'putere';
const KIND_WORD: [RegExp, ClaimKind][] = [
  [/^puls|^bpm|^bătăi/i, 'puls'],
  [/^hrv|^ms$/i, 'hrv'],
  [/dormit|^somn/i, 'somn'],
  [/alergat|pedalat|înotat|^km$/i, 'distanta'],
  [/^greutate|^kg$/i, 'greutate'],
  [/^feritin/i, 'feritina'],
  [/^vitamina d/i, 'vitamina_d'],
  [/^hemoglobin/i, 'hemoglobina'],
  [/^recuperare/i, 'recuperare'],
  [/^respira/i, 'respiratie'],
  [/^kcal$/i, 'kcal'],
  [/^w$|^wa[tț]/i, 'putere'],
];
/** Ce chei din pachet pot susține fiecare tip de măsurătoare. */
export const KIND_PATH: Record<ClaimKind, RegExp> = {
  puls: /puls|(^|[._])(hr|fc|rhr|bpm)|heart/i,
  hrv: /hrv/i,
  somn: /somn|sleep|dormit/i,
  distanta: /km|dist|metri|lung|volum/i,
  greutate: /greut|weight|kg|corp/i,
  feritina: /ferit/i,
  vitamina_d: /vitamin/i,
  hemoglobina: /hemoglob/i,
  recuperare: /recup|recovery|readiness|scor/i,
  respiratie: /resp/i,
  kcal: /kcal|energ|calor/i,
  putere: /watt|putere|ftp|power|_w$/i,
};
const MEASURE_UNIT_AFTER = /(\d+(?:[.,]\d+)?)\s*(bpm|bătăi|ms\b|km\b|kcal\b|W\b|kg\b)/g;
export function typedMeasurementClaims(text: string): { value: number; kind: ClaimKind }[] {
  const out: { value: number; kind: ClaimKind }[] = [];
  const kindOf = (w: string) => KIND_WORD.find(([re]) => re.test(w.trim()))?.[1] ?? null;
  for (const m of text.matchAll(MEASURE_BEFORE)) {
    const k = kindOf(m[1]!);
    if (k) out.push({ value: Number(m[2]!.replace(',', '.')), kind: k });
  }
  for (const m of text.matchAll(MEASURE_UNIT_AFTER)) {
    const k = kindOf(m[2]!);
    if (k) out.push({ value: Number(m[1]!.replace(',', '.')), kind: k });
  }
  return out.filter((x, i) => out.findIndex((y) => y.value === x.value && y.kind === x.kind) === i);
}
/** Toate numerele din pachet, cu calea lor („hrv.azi”, „antrenament_ultim.distanta_km”). */
export function numberPaths(obj: unknown, path = '', out: { path: string; value: number }[] = []): { path: string; value: number }[] {
  if (typeof obj === 'number') out.push({ path, value: obj });
  else if (typeof obj === 'string') {
    for (const n of obj.match(/\d+(?:[.,]\d+)?/g) ?? []) out.push({ path, value: Number(n.replace(',', '.')) });
  } else if (Array.isArray(obj)) obj.forEach((x, i) => numberPaths(x, `${path}[${i}]`, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) numberPaths(v, path ? `${path}.${k}` : k, out);
  return out;
}

export function measurementClaims(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MEASURE_BEFORE)) out.push(Number(m[2]!.replace(',', '.')));
  for (const m of text.matchAll(MEASURE_AFTER)) out.push(Number(m[1]!.replace(',', '.')));
  return [...new Set(out)];
}

export function verifyResponse(resp: SpecialistResponse, packet: unknown): VerifiedResponse {
  const avertismente: string[] = [];
  let valid = true;

  if (!(AGENTS as readonly string[]).includes(resp.agent)) {
    avertismente.push(`agent necunoscut: ${resp.agent}`);
    valid = false;
  }
  if (!VERDICTS.includes(resp.verdict)) {
    avertismente.push(`verdict în afara listei: ${String(resp.verdict)}`);
    valid = false;
  }
  const ce = Array.isArray(resp.ce) ? resp.ce : [];
  const max = MAX_CE[resp.agent] ?? 4;
  if (ce.length > max) avertismente.push(`„ce” are ${ce.length} rânduri, maximum ${max}: rândurile de după ${max} se ignoră`);
  if (resp.verdict === 'tacere' && ce.length > 0) {
    avertismente.push('tăcere cu conținut în „ce”: conținutul se ignoră');
  }
  if (typeof resp.pentru_viitor === 'string' && resp.pentru_viitor.split('\n').filter((l) => l.trim()).length > 1) {
    avertismente.push('„pentru_viitor” are mai mult de un rând');
  }

  const items: VerifiedItem[] = [];
  const usable = resp.verdict === 'tacere' ? [] : ce.slice(0, max);
  for (const item of usable) {
    const cifre = item.cifre ?? [];
    const reasons: string[] = [];
    // 1. fiecare pereche trebuie să existe și să coincidă
    const coveredValues: number[] = [];
    const dataValues: number[] = [];
    for (const c of cifre) {
      if (FREE_FIELDS.has(c.camp)) {
        if (typeof c.valoare === 'number') coveredValues.push(c.valoare);
        continue;
      }
      const { found, value } = getPath(packet, c.camp);
      if (!found) reasons.push(`câmp inexistent: ${c.camp}`);
      else if (value == null) reasons.push(`câmp null citat ca valoare: ${c.camp}`);
      else if (!valueEquals(c.valoare, value)) reasons.push(`${c.camp}: în pachet ${JSON.stringify(value)}, în text ${JSON.stringify(c.valoare)}`);
      else if (typeof c.valoare === 'number') coveredValues.push(c.valoare), dataValues.push(c.valoare);
      else if (typeof value === 'number') coveredValues.push(value), dataValues.push(value);
    }
    // 1b. o „regulă” nu poate acoperi o măsurătoare a sportivului
    for (const n of measurementClaims(item.text)) {
      if (!dataValues.some((v) => Math.abs(v - n) < 0.051)) reasons.push(`măsurătoare fără câmp din pachet: ${n}`);
    }
    // 2. fiecare număr din text trebuie acoperit de o pereche
    for (const n of numbersIn(item.text)) {
      const idx = coveredValues.findIndex((v) => Math.abs(v - n) < 0.051);
      if (idx >= 0) coveredValues.splice(idx, 1);
      else reasons.push(`număr fără câmp: ${n}`);
    }
    items.push(reasons.length ? { ...item, stare: 'respins', motiv: reasons.join('; ') } : { ...item, stare: 'acceptat' });
  }

  // 3. „lipseste” doar cu câmpuri care există și sunt null
  const lipseste: string[] = [];
  for (const f of resp.lipseste ?? []) {
    const { found, value } = getPath(packet, f);
    if (!found) avertismente.push(`„lipseste” cu câmp inexistent în schemă: ${f}`);
    else if (value != null) avertismente.push(`„lipseste” cu câmp care are valoare: ${f}`);
    else lipseste.push(f);
  }

  return {
    agent: resp.agent,
    verdict: resp.verdict,
    ce: items,
    mese: resp.agent === 'nutritionist' ? (resp.mese ?? []).slice(0, 3) : [],
    pentru_viitor: typeof resp.pentru_viitor === 'string' ? resp.pentru_viitor.split('\n').find((l) => l.trim()) ?? '-' : '-',
    lipseste,
    avertismente,
    valid,
  };
}

/** Testul-canar săptămânal: pune null pe un câmp folosit și verifică dacă agentul l-a trecut la „lipseste” în loc să-l citeze. */
export function canaryPassed(resp: SpecialistResponse, field: string): boolean {
  const cites = (resp.ce ?? []).some((i) => (i.cifre ?? []).some((c) => c.camp === field));
  return !cites && (resp.lipseste ?? []).includes(field);
}
