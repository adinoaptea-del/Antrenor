// Importul istoricului din Samsung Health („Setări → Descărcare date personale”). Exportul e un folder (sau o arhivă)
// cu câte un CSV pe tabel: com.samsung.shealth.exercise.<data>.csv, com.samsung.shealth.sleep.<data>.csv,
// com.samsung.health.sleep_stage.<data>.csv, com.samsung.health.weight.<data>.csv … Prima linie a fiecărui fișier e o
// linie de metadate (tabelul, versiunea, numărul de rânduri), a doua e capul de tabel, cu coloane de forma
// „com.samsung.health.exercise.start_time”. Orele sunt în UTC, cu decalajul local în „time_offset” („UTC+0300”).
//
// Aici citim doar ce folosește AIRON: antrenamentele (sport, durată, distanță, puls mediu/maxim), somnul (cu fazele de
// trezire scăzute) și greutatea. Rezultatul are forma aplicației „Health Connect Webhook”, ca serverul să-l treacă prin
// același parser ca datele zilnice de pe telefon.

export interface SamsungFile {
  name: string;
  text: string;
}

export interface SamsungImport {
  /** Corpul pentru parserul Health Connect (formatul HC Webhook). */
  body: {
    timestamp: string;
    app_version: string;
    timezone: string;
    exercise: { start_time: string; end_time: string; type: string; title: string; distance_meters: number | null; avg_heart_rate: number | null; max_heart_rate: number | null; metadata: { id: string } }[];
    sleep: { start_time: string; session_end_time: string; duration_seconds: number; stages: { stage: string; start_time: string; end_time: string }[] }[];
    weight: { time: string; kilograms: number }[];
  };
  /** Ce fișiere am citit și câte rânduri din fiecare. */
  read: { file: string; rows: number }[];
  /** Codurile de exercițiu Samsung pe care nu le știm (le arătăm, ca să le adăugăm). */
  unknownExercise: number[];
}

/** Fișierele pe care le citim (restul exportului — puls la fiecare minut, pași, stres — nu e nevoie). */
export function samsungTableOf(fileName: string): 'exercise' | 'sleep' | 'sleep_stage' | 'weight' | null {
  const n = fileName.toLowerCase().split('/').pop() ?? '';
  if (!n.endsWith('.csv')) return null;
  if (/^com\.samsung\.(s)?health\.exercise\.\d/.test(n)) return 'exercise';
  if (/^com\.samsung\.(s)?health\.sleep\.\d/.test(n)) return 'sleep';
  if (/^com\.samsung\.(s)?health\.sleep_stage\.\d/.test(n)) return 'sleep_stage';
  if (/^com\.samsung\.(s)?health\.weight\.\d/.test(n)) return 'weight';
  return null;
}

/** CSV cu ghilimele (câmpurile pot conține virgule); prima linie e metadată și se sare. */
export function parseSamsungCsv(text: string): Record<string, string>[] {
  const lines = splitCsvRows(text.replace(/^﻿/, ''));
  if (lines.length < 2) return [];
  // Prima linie: „com.samsung.shealth.exercise,6313008,19” (metadate). Uneori lipsește: atunci capul e direct prima linie.
  const first = lines[0]!;
  const headerIdx = first.length <= 4 && !first.some((c) => /start_time|datauuid/.test(c)) ? 1 : 0;
  const header = (lines[headerIdx] ?? []).map((h) => h.split('.').pop()!.trim());
  const out: Record<string, string>[] = [];
  for (const row of lines.slice(headerIdx + 1)) {
    if (row.length < 2) continue;
    const r: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h && row[i] != null && row[i] !== '' && r[h] == null) r[h] = row[i]!;
    });
    out.push(r);
  }
  return out;
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** „2024-03-01 06:30:12.000” (UTC) → ISO. */
export function samsungTime(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/.exec(v.trim());
  if (m) return `${m[1]}T${m[2]!.length === 5 ? `${m[2]}:00` : m[2]}Z`;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e11) return new Date(n).toISOString();
  return null;
}

/**
 * Codurile de exercițiu Samsung Health (SDK, „predefined exercise types”) pentru sporturile din AIRON. Ce nu e aici rămâne
 * necunoscut și apare în rezultatul importului.
 */
const EXERCISE: Record<number, string> = {
  1001: 'walking',
  1002: 'running',
  11007: 'cycling',
  13001: 'hiking',
  14001: 'swimming',
  14002: 'swimming',
  15003: 'cycling', // bicicletă de interior
  15005: 'running', // bandă de alergare
};

function exerciseName(code: number): string | null {
  if (EXERCISE[code]) return EXERCISE[code]!;
  // Grupa 10000 (exerciții de fitness cu greutăți, aparate, circuit) = forță.
  if (code >= 10001 && code <= 10999) return 'strength';
  return null;
}

const num = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function samsungExport(files: SamsungFile[], timezone = 'Europe/Bucharest'): SamsungImport {
  const read: SamsungImport['read'] = [];
  const unknown = new Set<number>();
  const body: SamsungImport['body'] = { timestamp: new Date().toISOString(), app_version: 'samsung-health-export', timezone, exercise: [], sleep: [], weight: [] };
  const stagesBySleep = new Map<string, { stage: string; start_time: string; end_time: string }[]>();
  const sleeps: { uuid: string | null; start: string; end: string }[] = [];

  for (const f of files) {
    const table = samsungTableOf(f.name);
    if (!table) continue;
    const rows = parseSamsungCsv(f.text);
    read.push({ file: f.name.split('/').pop()!, rows: rows.length });
    for (const r of rows) {
      if (table === 'exercise') {
        const start = samsungTime(r.start_time);
        const dur = num(r.duration); // ms
        const end = samsungTime(r.end_time) ?? (start && dur ? new Date(Date.parse(start) + dur).toISOString() : null);
        const code = num(r.exercise_type);
        if (!start || !end || code == null) continue;
        const name = exerciseName(code);
        if (!name) {
          unknown.add(code);
          continue;
        }
        const dist = num(r.distance);
        body.exercise.push({
          start_time: start,
          end_time: end,
          type: name,
          title: name === 'running' ? 'Alergare' : name === 'cycling' ? 'Bicicletă' : name === 'swimming' ? 'Înot' : name === 'strength' ? 'Forță' : name === 'walking' ? 'Mers' : 'Drumeție',
          distance_meters: dist != null && dist > 0 ? dist : null,
          avg_heart_rate: num(r.mean_heart_rate),
          max_heart_rate: num(r.max_heart_rate),
          metadata: { id: `sh-${(r.datauuid ?? start).replace(/[^a-zA-Z0-9-]/g, '')}` },
        });
      } else if (table === 'sleep') {
        const start = samsungTime(r.start_time);
        const end = samsungTime(r.end_time);
        if (!start || !end || Date.parse(end) <= Date.parse(start)) continue;
        sleeps.push({ uuid: r.datauuid ?? null, start, end });
      } else if (table === 'sleep_stage') {
        const start = samsungTime(r.start_time);
        const end = samsungTime(r.end_time);
        const id = r.sleep_id;
        const stage = num(r.stage);
        if (!start || !end || !id || stage == null) continue;
        // 40001 treaz, 40002 ușor, 40003 profund, 40004 REM → codurile Health Connect (1 treaz, 4 ușor, 5 profund, 6 REM).
        const hc = stage === 40001 ? '1' : stage === 40003 ? '5' : stage === 40004 ? '6' : '4';
        stagesBySleep.set(id, [...(stagesBySleep.get(id) ?? []), { stage: hc, start_time: start, end_time: end }]);
      } else if (table === 'weight') {
        const t = samsungTime(r.start_time ?? r.create_time);
        const kg = num(r.weight);
        if (t && kg && kg > 25 && kg < 300) body.weight.push({ time: t, kilograms: kg });
      }
    }
  }
  for (const s of sleeps) {
    body.sleep.push({ start_time: s.start, session_end_time: s.end, duration_seconds: Math.round((Date.parse(s.end) - Date.parse(s.start)) / 1000), stages: s.uuid ? (stagesBySleep.get(s.uuid) ?? []) : [] });
  }
  return { body, read, unknownExercise: [...unknown].sort((a, b) => a - b) };
}

/** Împarte importul în bucăți mici (limita unei cereri e de câțiva MB): după numărul de înregistrări. */
export function chunkSamsung(b: SamsungImport['body'], size = 1500): SamsungImport['body'][] {
  const all = [...b.exercise.map((x) => ['exercise', x] as const), ...b.sleep.map((x) => ['sleep', x] as const), ...b.weight.map((x) => ['weight', x] as const)];
  const out: SamsungImport['body'][] = [];
  for (let i = 0; i < all.length; i += size) {
    const part: SamsungImport['body'] = { ...b, exercise: [], sleep: [], weight: [] };
    for (const [k, x] of all.slice(i, i + size)) (part[k] as unknown[]).push(x);
    out.push(part);
  }
  return out;
}
