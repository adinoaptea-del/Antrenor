// Citirea buletinului de analize (PDF sau poză) cu modelul: doar transcriere, fără interpretare.
// Ce e în afara intervalului și conversia unităților le calculează codul, nu modelul.
import { ENV } from './env.js';

export type LabCode = 'feritina' | 'vitamina_d' | 'hemoglobina' | 'ck' | 'crp' | 'altul';

export interface LabValue {
  nume: string;
  cod: LabCode;
  valoare: number | null;
  valoare_text: string | null;
  unitate: string | null;
  ref_min: number | null;
  ref_max: number | null;
  ref_text: string | null;
  /** Calculat de cod față de intervalul de pe buletin. */
  in_afara: 'sub' | 'peste' | null;
}

export interface LabsReading {
  lizibil: boolean;
  data_recoltarii: string | null;
  laborator: string | null;
  valori: LabValue[];
  /** Cele cinci valori din protocol, în unitățile aplicației (convertite de cod). null = lipsește sau unitate necunoscută. */
  cele5: { feritina: number | null; vitamina_d: number | null; hemoglobina: number | null; ck: number | null; crp: number | null };
  note: string[];
}

const SYSTEM = `Transcrii un buletin de analize medicale. Reguli:
- Copiezi exact ce scrie: numele analizei, valoarea, unitatea, intervalul de referință al laboratorului. Nu calculezi, nu convertești, nu interpretezi, nu completezi din memorie.
- valoare = numărul rezultatului (punct zecimal); dacă rezultatul nu e număr (ex. "negativ", "<0,5"), valoare = null și pui textul în valoare_text.
- ref_min / ref_max = capetele intervalului de referință de pe buletin; ce nu există e null; textul intervalului îl copiezi în ref_text.
- cod: "feritina", "vitamina_d" (25-OH vitamina D), "hemoglobina", "ck" (creatinkinaza / CK / CPK total), "crp" (proteina C reactivă, inclusiv hs-CRP); orice altceva = "altul".
- data_recoltarii în format YYYY-MM-DD dacă apare; altfel null. laborator = numele laboratorului, dacă apare.
- lizibil = false dacă documentul nu e un buletin de analize sau nu se poate citi.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lizibil', 'data_recoltarii', 'laborator', 'valori'],
  properties: {
    lizibil: { type: 'boolean' },
    data_recoltarii: { type: ['string', 'null'] },
    laborator: { type: ['string', 'null'] },
    valori: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nume', 'cod', 'valoare', 'valoare_text', 'unitate', 'ref_min', 'ref_max', 'ref_text'],
        properties: {
          nume: { type: 'string' },
          cod: { type: 'string', enum: ['feritina', 'vitamina_d', 'hemoglobina', 'ck', 'crp', 'altul'] },
          valoare: { type: ['number', 'null'] },
          valoare_text: { type: ['string', 'null'] },
          unitate: { type: ['string', 'null'] },
          ref_min: { type: ['number', 'null'] },
          ref_max: { type: ['number', 'null'] },
          ref_text: { type: ['string', 'null'] },
        },
      },
    },
  },
};

const norm = (u: string | null) => (u ?? '').toLowerCase().replace(/\s+/g, '').replace('μ', 'µ').replace('ug', 'µg');

/** Unitățile aplicației: feritină µg/L, vitamina D ng/mL, hemoglobină g/dL, CK U/L, CRP mg/L. */
export function toAppUnits(code: LabCode, value: number | null, unit: string | null): { value: number | null; note: string | null } {
  if (value == null) return { value: null, note: null };
  const u = norm(unit);
  const r = (v: number) => Math.round(v * 100) / 100;
  switch (code) {
    case 'feritina':
      if (['µg/l', 'ng/ml'].includes(u)) return { value: r(value), note: null };
      break;
    case 'vitamina_d':
      if (u === 'ng/ml' || u === 'µg/l') return { value: r(value), note: null };
      if (u === 'nmol/l') return { value: r(value / 2.496), note: `vitamina D convertită din ${value} nmol/L` };
      break;
    case 'hemoglobina':
      if (u === 'g/dl') return { value: r(value), note: null };
      if (u === 'g/l') return { value: r(value / 10), note: `hemoglobina convertită din ${value} g/L` };
      if (u === 'mmol/l') return { value: r(value * 1.611), note: `hemoglobina convertită din ${value} mmol/L` };
      break;
    case 'ck':
      if (['u/l', 'ui/l', 'iu/l'].includes(u)) return { value: r(value), note: null };
      break;
    case 'crp':
      if (u === 'mg/l') return { value: r(value), note: null };
      if (u === 'mg/dl') return { value: r(value * 10), note: `CRP convertit din ${value} mg/dL` };
      break;
    default:
      return { value: null, note: null };
  }
  return { value: null, note: `${code}: unitate necunoscută „${unit ?? '–'}”, introdu valoarea de mână` };
}

export function finalize(raw: { lizibil: boolean; data_recoltarii: string | null; laborator: string | null; valori: Omit<LabValue, 'in_afara'>[] }): LabsReading {
  const valori: LabValue[] = raw.valori.map((v) => ({
    ...v,
    in_afara: v.valoare == null ? null : v.ref_min != null && v.valoare < v.ref_min ? 'sub' : v.ref_max != null && v.valoare > v.ref_max ? 'peste' : null,
  }));
  const cele5 = { feritina: null, vitamina_d: null, hemoglobina: null, ck: null, crp: null } as LabsReading['cele5'];
  const note: string[] = [];
  for (const code of ['feritina', 'vitamina_d', 'hemoglobina', 'ck', 'crp'] as const) {
    const v = valori.find((x) => x.cod === code && x.valoare != null);
    if (!v) continue;
    const c = toAppUnits(code, v.valoare, v.unitate);
    cele5[code] = c.value;
    if (c.note) note.push(c.note);
  }
  const date = raw.data_recoltarii && /^\d{4}-\d{2}-\d{2}$/.test(raw.data_recoltarii) ? raw.data_recoltarii : null;
  return { lizibil: raw.lizibil, data_recoltarii: date, laborator: raw.laborator, valori, cele5, note };
}

export async function readLabs(base64: string, mediaType: string): Promise<LabsReading> {
  const block =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ENV.modelKey(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ENV.modelSpecialist(),
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Transcrie buletinul în JSON-ul cerut.' }] }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`citirea analizelor a eșuat (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('modelul nu a întors nimic');
  return finalize(JSON.parse(text));
}
