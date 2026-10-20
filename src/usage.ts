// Folosirea aplicației de către prieteni (cererea proprietarului, 20.10.2026): când a intrat ultima dată, cât de des
// revine, ce informații caută și cât îi place. Doar numărători pe zi (app_usage_daily) și nota 1–5 (app_feedback); fără
// conținut. Logică pură: curățarea a ce trimite telefonul și rezumatul pentru Admin → Prieteni.

/** Zonele aplicației, pe înțeles. Cheia = ecranul (App.tsx Screen) sau fereastra de detaliu. */
export const USAGE_AREAS = {
  plan: { label: 'Plan și ședințe', keys: ['calendar', 'antrenament', 'obiectiv', 'det:sedinta', 'det:sport'] },
  mese: { label: 'Mese', keys: ['mese', 'det:reteta'] },
  progres: { label: 'Progres', keys: ['progres', 'insigne', 'corp', 'mers', 'analize', 'teste'] },
  recuperare: { label: 'Recuperare', keys: ['recuperare'] },
  antrenor: { label: 'Antrenor', keys: ['antrenor'] },
  jurnal: { label: 'Jurnale completate', keys: ['dimineata', 'seara', 'saptamanal'] },
} as const;
export type UsageArea = keyof typeof USAGE_AREAS;

/** Ce chei acceptă serverul (restul se aruncă): ecranele aplicației + ferestrele de detaliu. */
export const USAGE_KEYS: readonly string[] = ['acasa', 'profil', 'intake', ...Object.values(USAGE_AREAS).flatMap((a) => a.keys)];
/** Căutarea de informații = tot ce deschide ca să afle ceva (fără Acasă, profil, formulare). */
const INFO_AREAS: UsageArea[] = ['plan', 'mese', 'progres', 'recuperare', 'antrenor'];
const areaOf = (key: string): UsageArea | null => (Object.keys(USAGE_AREAS) as UsageArea[]).find((a) => (USAGE_AREAS[a].keys as readonly string[]).includes(key)) ?? null;

export interface UsagePing {
  date: string;
  sessions: number;
  seconds: number;
  details: number;
  screens: Record<string, number>;
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const int = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0);

/**
 * Ce trimite telefonul, curățat: data doar ieri/azi/mâine față de serverul în UTC (fusurile), plafoane realiste pe o
 * trimitere (un telefon blocat sau un client modificat nu umflă cifrele), doar chei cunoscute.
 */
export function cleanPing(body: unknown, todayUtc: string): UsagePing | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!isDate(b.date)) return null;
  const d = (s: string) => Date.parse(`${s}T00:00:00Z`);
  if (Math.abs(d(b.date) - d(todayUtc)) > 86_400_000) return null;
  const screens: Record<string, number> = {};
  if (b.screens && typeof b.screens === 'object') {
    for (const [k, v] of Object.entries(b.screens as Record<string, unknown>)) {
      if (!USAGE_KEYS.includes(k)) continue;
      const n = int(v, 200);
      if (n > 0) screens[k] = n;
    }
  }
  const ping = { date: b.date, sessions: int(b.sessions, 20), seconds: int(b.seconds, 6 * 3600), details: int(b.details, 300), screens };
  return ping.sessions + ping.seconds + ping.details + Object.keys(screens).length > 0 ? ping : null;
}

export interface UsageRow {
  date: string;
  sessions: number;
  seconds: number;
  details: number;
  screens: Record<string, number> | null;
  last_at: string;
}
export interface FeedbackRow {
  date: string;
  score: number;
  note: string | null;
}

export interface UsageSummary {
  lastSeen: string | null;
  /** Zile cu aplicația deschisă: ultimele 7 și 28. */
  activeDays7: number;
  activeDays28: number;
  /** Pe săptămâni (cele mai vechi întâi, ultima = ultimele 7 zile): zile active, minute, informații căutate. */
  weeks: { activeDays: number; minutes: number; info: number }[];
  /** Zonele în care caută (ultimele 28 de zile), procent din deschideri, descrescător. */
  areas: { area: UsageArea; label: string; n: number; pct: number }[];
  /** Informații căutate pe sesiune (ultimele 28 de zile); null fără sesiuni. */
  infoPerSession: number | null;
  /** Revine mai des sau mai rar: ultimele 14 zile față de cele 14 dinainte. */
  trend: 'creste' | 'scade' | 'stabil' | 'nou' | 'inactiv';
  rating: { last: number; lastDate: string; avg: number; n: number; note: string | null } | null;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** Rezumatul pentru Admin, din rândurile zilnice (oricât de multe) și notele unui sportiv. `today` = data de azi. */
export function summarizeUsage(rows: UsageRow[], feedback: FeedbackRow[], today: string, since: string | null = null): UsageSummary {
  const ago = (r: { date: string }) => daysBetween(r.date, today);
  const active = rows.filter((r) => r.sessions > 0 || r.seconds > 0 || Object.keys(r.screens ?? {}).length > 0);
  const lastSeen = rows.reduce<string | null>((m, r) => (m == null || r.last_at > m ? r.last_at : m), null);
  const within = (lo: number, hi: number) => active.filter((r) => ago(r) >= lo && ago(r) < hi);
  const infoOf = (r: UsageRow) => Object.entries(r.screens ?? {}).reduce((s, [k, n]) => (INFO_AREAS.includes(areaOf(k) as UsageArea) ? s + n : s), 0);
  const weeks = [3, 2, 1, 0].map((w) => {
    const rs = within(w * 7, w * 7 + 7);
    return { activeDays: rs.length, minutes: Math.round(rs.reduce((s, r) => s + r.seconds, 0) / 60), info: rs.reduce((s, r) => s + infoOf(r), 0) };
  });
  const last28 = within(0, 28);
  const byArea = new Map<UsageArea, number>();
  for (const r of last28) for (const [k, n] of Object.entries(r.screens ?? {})) {
    const a = areaOf(k);
    if (a) byArea.set(a, (byArea.get(a) ?? 0) + n);
  }
  const totalArea = [...byArea.values()].reduce((s, n) => s + n, 0);
  const areas = [...byArea.entries()]
    .map(([area, n]) => ({ area, label: USAGE_AREAS[area].label, n, pct: totalArea ? Math.round((n / totalArea) * 100) : 0 }))
    .sort((a, b) => b.n - a.n);
  const sessions28 = last28.reduce((s, r) => s + r.sessions, 0);
  const info28 = last28.reduce((s, r) => s + infoOf(r), 0);
  const recent = within(0, 14).length;
  const before = within(14, 28).length;
  // Cont mai nou de 14 zile (sau primele zile cu date): nu are cu ce compara.
  const young = since != null && daysBetween(since, today) < 14;
  const trend: UsageSummary['trend'] = active.length === 0 || (recent === 0 && before === 0) ? 'inactiv' : young || before === 0 ? 'nou' : recent >= before + 2 ? 'creste' : recent <= before - 2 ? 'scade' : 'stabil';
  const fb = [...feedback].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rating = fb[0] ? { last: fb[0].score, lastDate: fb[0].date, avg: Math.round((fb.reduce((s, f) => s + f.score, 0) / fb.length) * 10) / 10, n: fb.length, note: fb.find((f) => f.note)?.note ?? null } : null;
  return {
    lastSeen,
    activeDays7: within(0, 7).length,
    activeDays28: last28.length,
    weeks,
    areas,
    infoPerSession: sessions28 ? Math.round((info28 / sessions28) * 10) / 10 : null,
    trend,
    rating,
  };
}

/** Când îi cerem nota: după cel puțin 3 zile de la prima folosire, apoi cel mult o dată la 14 zile (și după „Mai târziu”). */
export function feedbackDue(firstUse: string | null, lastAsked: string | null, today: string): boolean {
  if (!firstUse || daysBetween(firstUse, today) < 3) return false;
  return !lastAsked || daysBetween(lastAsked, today) >= 14;
}
