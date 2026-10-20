// Folosirea aplicației (src/usage.ts): telefonul numără local sesiunile, secundele cu aplicația în față, ecranele și
// ferestrele de detaliu deschise, apoi trimite numărătorile la /api/track (la ~1 minut și la ieșirea din aplicație).
// Fără conținut: doar ce ecran, de câte ori. Ce nu s-a trimis rămâne în telefon și pleacă la următoarea ocazie.
import { getSession } from './api';

type Day = { sessions: number; seconds: number; details: number; screens: Record<string, number> };
const KEY = 'airon-usage-pending';
const FIRST = 'airon-usage-first';
/** O revenire după atâta timp în fundal = sesiune nouă. */
const NEW_SESSION_MS = 30 * 60_000;
/** Un pas de numărare mai lung (telefon adormit) nu se numără ca timp în aplicație. */
const MAX_TICK_MS = 120_000;

let pending: Record<string, Day> = {};
let started = false;
let visibleSince: number | null = null;
let hiddenAt: number | null = null;
let sending = false;

const localDate = () => new Date().toLocaleDateString('sv-SE');
const load = () => {
  try {
    pending = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Day>;
  } catch {
    pending = {};
  }
};
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* fără stocare: se trimite doar ce e în memorie */
  }
};
const today = (): Day => {
  const d = localDate();
  return (pending[d] ??= { sessions: 0, seconds: 0, details: 0, screens: {} });
};

/** Prima zi în care aplicația a fost folosită pe telefonul ăsta (pentru momentul în care cerem nota). */
export function firstUseDate(): string | null {
  try {
    return localStorage.getItem(FIRST);
  } catch {
    return null;
  }
}

function addTime(now: number) {
  if (visibleSince == null) return;
  const ms = now - visibleSince;
  visibleSince = now;
  if (ms > 0 && ms <= MAX_TICK_MS) today().seconds += Math.round(ms / 1000);
}

/** Trimite tot ce s-a adunat (fiecare zi separat). La eșec, numărătorile se pun înapoi. */
async function flush() {
  if (sending) return;
  const days = Object.keys(pending);
  if (!days.length) return;
  sending = true;
  try {
    const s = await getSession();
    if (!s) return;
    for (const date of days) {
      const d = pending[date];
      if (!d) continue;
      delete pending[date];
      save();
      try {
        const r = await fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ date, ...d }) });
        if (!r.ok && r.status >= 500) throw new Error(String(r.status));
      } catch {
        const cur = (pending[date] ??= { sessions: 0, seconds: 0, details: 0, screens: {} });
        cur.sessions += d.sessions;
        cur.seconds += d.seconds;
        cur.details += d.details;
        for (const [k, n] of Object.entries(d.screens)) cur.screens[k] = (cur.screens[k] ?? 0) + n;
        save();
        break;
      }
    }
  } finally {
    sending = false;
  }
}

/** Pornește numărarea (o singură dată; nu în modul demo). */
export function startUsage(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  load();
  try {
    if (!localStorage.getItem(FIRST)) localStorage.setItem(FIRST, localDate());
  } catch {
    /* fără stocare */
  }
  today().sessions += 1;
  visibleSince = document.hidden ? null : performance.now();
  save();
  document.addEventListener('visibilitychange', () => {
    const now = performance.now();
    if (document.hidden) {
      addTime(now);
      visibleSince = null;
      hiddenAt = Date.now();
      save();
      void flush();
    } else {
      if (hiddenAt != null && Date.now() - hiddenAt >= NEW_SESSION_MS) today().sessions += 1;
      hiddenAt = null;
      visibleSince = now;
      save();
    }
  });
  window.setInterval(() => {
    if (document.hidden) return;
    addTime(performance.now());
    save();
    void flush();
  }, 60_000);
  void flush();
}

/** Un ecran deschis (App.go). */
export function trackScreen(key: string): void {
  if (!started) return;
  const d = today();
  d.screens[key] = (d.screens[key] ?? 0) + 1;
  save();
}

/** O fereastră de detaliu deschisă: ședință, rețetă, detaliile unui sport. */
export function trackDetail(kind: 'sedinta' | 'reteta' | 'sport'): void {
  if (!started) return;
  const d = today();
  d.details += 1;
  d.screens[`det:${kind}`] = (d.screens[`det:${kind}`] ?? 0) + 1;
  save();
}

/** Nota 1–5 („Cât de mult îți place AIRON?”), cu un text opțional. */
export async function sendRating(score: number, text: string | null): Promise<void> {
  const s = await getSession();
  if (!s) throw new Error('neautentificat');
  const r = await fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ nota: score, text, date: localDate() }) });
  if (!r.ok) throw new Error(`nu am putut trimite (${r.status})`);
}
