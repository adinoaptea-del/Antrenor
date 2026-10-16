import { recordUsage } from './usage.js';
// Citirea raportului de test de efort (CPET, lactat, teren) cu modelul: doar transcriere.
// Zonele le pune codul: din tabelul de zone al clinicii, dacă există; altfel doar ce se leagă direct de praguri.
import { ENV } from './env.js';

type Z = [number | null, number | null, number | null, number | null, number | null];

export interface TestReading {
  lizibil: boolean;
  tip: 'cpet' | 'lactat' | 'teren' | 'altul';
  data_testului: string | null;
  clinica: string | null;
  ergometru: 'banda' | 'bicicleta' | 'altul' | null;
  fc_max: number | null;
  vo2max_ml_kg_min: number | null;
  prag1_fc: number | null;
  prag2_fc: number | null;
  prag2_ritm_min_km: string | null;
  prag2_putere_w: number | null;
  ftp_w: number | null;
  zone_alergare_fc_max: Z;
  zone_bicicleta_fc_max: Z;
}

export interface TestResult {
  reading: TestReading;
  /** Câmpurile formularului, completate de cod din citire. */
  form: { tip: TestReading['tip']; data: string | null; fcmax: number | null; alergare_z: Z; pace_prag: string | null; ftp: number | null; bicicleta_z: Z };
  note: string[];
}

const SYSTEM = `Transcrii un raport de test de efort (CPET / ergospirometrie, test de lactat sau test de teren). Reguli:
- Copiezi exact ce scrie; nu calculezi, nu estimezi, nu completezi din memorie. Ce nu apare în raport = null.
- tip: "cpet" (ergospirometrie, VO2, praguri ventilatorii VT1/VT2, AT/RCP), "lactat" (praguri de lactat LT1/LT2), "teren", altfel "altul".
- ergometru: "banda" (alergare / treadmill), "bicicleta" (cicloergometru), altfel "altul".
- prag1_fc = FC la primul prag (VT1 / AT / LT1 / prag aerob); prag2_fc = FC la al doilea prag (VT2 / RCP / LT2 / prag anaerob).
- prag2_ritm_min_km = ritmul la al doilea prag, format "m:ss" pe km (dacă raportul dă viteza în km/h, o copiezi doar dacă e scrisă și ca ritm; altfel null).
- prag2_putere_w = puterea la al doilea prag; ftp_w doar dacă raportul scrie explicit FTP.
- zone_alergare_fc_max / zone_bicicleta_fc_max: DOAR dacă raportul are un tabel de zone de antrenament pe FC: limita de SUS a fiecărei zone, Z1..Z5 (dacă tabelul are 3 sau 6-7 zone, nu le adaptezi: lași toate null). Zonele de pe bandă merg la alergare, cele de pe bicicletă la bicicletă.
- data_testului în format YYYY-MM-DD; clinica = numele clinicii sau al laboratorului.
- lizibil = false dacă documentul nu e un raport de test de efort sau nu se poate citi.`;

const ZONES = { type: 'array', items: { type: ['number', 'null'] } };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lizibil', 'tip', 'data_testului', 'clinica', 'ergometru', 'fc_max', 'vo2max_ml_kg_min', 'prag1_fc', 'prag2_fc', 'prag2_ritm_min_km', 'prag2_putere_w', 'ftp_w', 'zone_alergare_fc_max', 'zone_bicicleta_fc_max'],
  properties: {
    lizibil: { type: 'boolean' },
    tip: { type: 'string', enum: ['cpet', 'lactat', 'teren', 'altul'] },
    data_testului: { type: ['string', 'null'] },
    clinica: { type: ['string', 'null'] },
    ergometru: { type: ['string', 'null'] },
    fc_max: { type: ['number', 'null'] },
    vo2max_ml_kg_min: { type: ['number', 'null'] },
    prag1_fc: { type: ['number', 'null'] },
    prag2_fc: { type: ['number', 'null'] },
    prag2_ritm_min_km: { type: ['string', 'null'] },
    prag2_putere_w: { type: ['number', 'null'] },
    ftp_w: { type: ['number', 'null'] },
    zone_alergare_fc_max: ZONES,
    zone_bicicleta_fc_max: ZONES,
  },
};

const full = (z: Z) => z.length === 5 && z.every((v) => v != null);
const five = (z: unknown): Z => (Array.isArray(z) && z.length === 5 ? (z.map((v) => (typeof v === 'number' ? v : null)) as Z) : [null, null, null, null, null]);

/**
 * Din citire în formular. Tabelul de zone al clinicii are prioritate. Fără tabel, codul pune doar ce corespunde direct pragurilor:
 * Z2 sus = primul prag, Z4 sus = al doilea prag, Z5 sus = FC max; Z1 și Z3 rămân goale (nu se ghicesc).
 */
export function toTestForm(r: TestReading): TestResult {
  const note: string[] = [];
  const fromThresholds: Z = [null, r.prag1_fc, null, r.prag2_fc, r.fc_max];
  const hasThr = r.prag1_fc != null || r.prag2_fc != null;
  let run: Z = [null, null, null, null, null];
  let bike: Z = [null, null, null, null, null];
  if (full(five(r.zone_alergare_fc_max))) run = five(r.zone_alergare_fc_max);
  if (full(five(r.zone_bicicleta_fc_max))) bike = five(r.zone_bicicleta_fc_max);
  if (!full(run) && !full(bike) && hasThr) {
    if (r.ergometru === 'bicicleta') bike = fromThresholds;
    else run = fromThresholds;
    note.push('raportul nu are tabel de zone: am pus pragurile (Z2 sus = primul prag, Z4 sus = al doilea prag, Z5 = FC max); completează Z1 și Z3 din raport, altfel zonele de FC nu intră în plan (doar FC max și ritmul de prag)');
  }
  if (r.ergometru === 'banda' && !full(bike)) note.push('testul a fost pe bandă: zonele de bicicletă nu se copiază din alergare (FC pe bicicletă e mai mică)');
  if (r.ergometru === 'bicicleta' && !full(run)) note.push('testul a fost pe bicicletă: zonele de alergare nu se copiază din bicicletă');
  if (r.vo2max_ml_kg_min != null) note.push(`VO2max ${r.vo2max_ml_kg_min} ml/kg/min`);
  const date = r.data_testului && /^\d{4}-\d{2}-\d{2}$/.test(r.data_testului) ? r.data_testului : null;
  if (!['banda', 'bicicleta', 'altul'].includes(String(r.ergometru))) r.ergometru = null;
  const pace = r.prag2_ritm_min_km && /^\d{1,2}:\d{2}$/.test(r.prag2_ritm_min_km) ? r.prag2_ritm_min_km : null;
  return { reading: r, form: { tip: r.tip, data: date, fcmax: r.fc_max, alergare_z: run, pace_prag: pace, ftp: r.ftp_w, bicicleta_z: bike }, note };
}

export async function readTest(base64: string, mediaType: string, userId: string | null = null): Promise<TestResult> {
  const block =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ENV.modelKey(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ENV.modelSpecialist(),
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Transcrie raportul în JSON-ul cerut.' }] }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`citirea raportului a eșuat (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  await recordUsage(userId, 'test', ENV.modelSpecialist(), data.usage);
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  if (data.stop_reason === 'max_tokens') throw new Error('raportul e prea lung pentru o singură citire; încarcă doar paginile cu pragurile și zonele');
  if (!text) throw new Error('modelul nu a întors nimic');
  try {
    return toTestForm(JSON.parse(text) as TestReading);
  } catch {
    throw new Error('citirea raportului a ieșit incompletă; încearcă din nou sau încarcă o poză mai clară');
  }
}
