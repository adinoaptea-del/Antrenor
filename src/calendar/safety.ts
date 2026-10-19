// Protecția din cod la chestionarul de dimineață: se aplică la salvare, înaintea oricărui apel AI.
// Febră sau simptom cardiac = stop; boală = roșu. Mesajul e scris din cod, nu de model.

import type { AdaptEvent } from './adapt.js';

export interface MorningSafety {
  verdict: 'stop' | 'rosu' | null;
  events: AdaptEvent[];
  message: string | null;
}

export function morningSafetyEvents(date: string, semnale: Record<string, unknown> | null | undefined): MorningSafety {
  const s = semnale ?? {};
  const cardiac = s.simptom_cardiac === true;
  const febra = s.febra === true;
  const boala = s.boala === true;
  const events: AdaptEvent[] = [];
  if (febra) events.push({ kind: 'febra', date });
  if (cardiac || febra) events.push({ kind: 'readiness', date, verdict: 'stop', reason: cardiac ? 'simptom cardiac raportat' : 'febră' });
  else if (boala) events.push({ kind: 'readiness', date, verdict: 'rosu', reason: 'boală raportată dimineața' });
  const message = cardiac
    ? 'Ai raportat un simptom cardiac: azi nu te antrenezi. Cere o evaluare medicală azi. Dacă ai durere în piept, leșin, lipsă de aer sau palpitații care nu trec, sună la 112.'
    : febra
      ? 'Ai febră: azi și următoarele două zile fără antrenament; apoi o săptămână doar ușor. Dacă febra nu scade sau apar dureri în piept ori lipsă de aer, mergi la medic.'
      : boala
        ? 'Ai raportat că ești bolnav: azi fără antrenament. Reiei când simptomele au trecut.'
        : null;
  return { verdict: cardiac || febra ? 'stop' : boala ? 'rosu' : null, events, message };
}

/**
 * Durerea din chestionarul de după antrenament: ≥ 3 → restricție galbenă (doar ușor, fără impact; alternativa e o
 * SUGESTIE care cere confirmare, nu o înlocuire automată), ≥ 5 → roșu: fără antrenament până la reevaluare.
 * Aceeași restricție guvernează calendarul, mesajul și alternativele (auditul v2, V2-01).
 */
export function painSafetyEvents(date: string, durere: unknown): MorningSafety {
  const d = (durere ?? {}) as { scor?: unknown; loc?: unknown };
  const score = typeof d.scor === 'number' && Number.isFinite(d.scor) ? d.scor : null;
  if (score == null || score < 3) return { verdict: null, events: [], message: null };
  const loc = typeof d.loc === 'string' && d.loc.trim() ? d.loc.trim() : 'nespecificat';
  return {
    verdict: score >= 5 ? 'rosu' : null,
    events: [{ kind: 'durere', date, score, loc }],
    message: score >= 5 ? `Durere ${score}/10 la ${loc}: fără antrenament până la reevaluare. Arată durerea unui fizioterapeut sau medic, ideal în 1–2 zile; dacă se umflă, nu poți călca sau doare în repaus, mergi azi. Restricția se ridică doar când spui că durerea a scăzut (formularul de seară sau „Durerea a trecut”), nu doar pentru că au trecut zile.` : null,
  };
}

export type Restriction = { verdict: 'stop' | 'rosu' | 'galben'; reason: string } | null;

/**
 * Restricția activă azi, aceeași pentru API, calendar și ecrane. Datele brățărilor (somn, HRV) nu o pot ridica:
 *  - febră sau simptom cardiac raportat azi, ori stop salvat azi → stop;
 *  - boală raportată azi → roșu;
 *  - durere ≥ 5 în ultimele 2 zile → roșu; durere 3–4 în ultimele 2 zile → cel puțin galben.
 */
/**
 * Semnale de alarmă scrise liber (comentariul de seară, nota de dimineață): durere/apăsare în piept, leșin, palpitații,
 * lipsă de aer neobișnuită. Auditul R03: un simptom urgent trebuie tratat în cod, înaintea AI, nu doar dacă e bifat.
 * O negație apropiată („fără durere în piept”, „n-am avut palpitații”) nu declanșează.
 */
const URGENT = /(dur(ere|eri)|apăsare|apasare|strânsoare|jungh(i|iuri))\s+(în|in|la)\s+piept|piept(ul)?\s+(mă|ma)\s+(doare|strânge)|leșin|lesin|am\s+leșinat|palpita(ț|t)ii|inima\s+(o\s+ia\s+razna|bate\s+neregulat)|bătăi\s+neregulate|nu\s+(mai\s+)?puteam\s+respira|lipsă\s+de\s+aer|lipsa\s+de\s+aer|sufoca/i;
const NEG = /(fără|fara|nu\s+am|n-am|nu\s+a\s+fost|niciun|nicio)\s+(\S+\s+){0,3}$/i;
export function urgentText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = URGENT.exec(text);
  if (!m) return null;
  if (NEG.test(text.slice(Math.max(0, m.index - 40), m.index))) return null;
  return m[0];
}

export function activeRestriction(input: {
  today: string;
  morning: { date?: string; semnale?: Record<string, unknown> | null } | null;
  evenings: { date: string; durere?: { scor: number | null; loc: string | null } | null; comentariu?: string | null }[];
  savedVerdict?: 'verde' | 'galben' | 'rosu' | 'stop' | null;
  /** Activitățile de azi (după dedublare) și RPE-ul declarat: un efort mare azi închide ziua. */
  todayActivities?: { sport: string; minutes: number; rpe?: number | null }[];
}): Restriction {
  const s = input.morning && (input.morning.date == null || input.morning.date === input.today) ? (input.morning.semnale ?? {}) : {};
  if (s.simptom_cardiac === true) return { verdict: 'stop', reason: 'Simptom cardiac raportat azi: fără antrenament, cere o evaluare medicală.' };
  const written = [typeof s.nota === 'string' ? s.nota : null, ...input.evenings.filter((e) => e.date <= input.today && e.date >= addDaysIso(input.today, -1)).map((e) => e.comentariu ?? null)].map(urgentText).find(Boolean);
  if (written) return { verdict: 'stop', reason: `Ai scris „${written}”: azi fără antrenament și cere o evaluare medicală azi. Dacă durerea în piept, leșinul sau lipsa de aer apar acum, sună la 112.` };
  if (s.febra === true) return { verdict: 'stop', reason: 'Febră raportată azi: fără antrenament.' };
  if (input.savedVerdict === 'stop') return { verdict: 'stop', reason: 'Stop pentru azi.' };
  if (s.boala === true) return { verdict: 'rosu', reason: 'Boală raportată azi: pauză.' };
  const worst = activePain(input.evenings, input.today);
  if (worst && worst.scor >= 5) return { verdict: 'rosu', reason: `Durere ${worst.scor}/10${worst.loc ? ` la ${worst.loc}` : ''} (raportată pe ${worst.date}): fără antrenament până la reevaluare. Când a scăzut, spune în formular.` };
  // Efortul mare de azi nu mai e o restricție de sănătate: îl echivalează regula „acoperit” (efort făcut față de cel
  // planificat), iar ziua de mâine o decid datele de dimineață.
  if (worst && worst.scor >= 3) return { verdict: 'galben', reason: `Durere ${worst.scor}/10${worst.loc ? ` la ${worst.loc}` : ''} (raportată pe ${worst.date}): doar ușor, fără impact; o alternativă se face doar dacă nu doare.` };
  return null;
}

/**
 * Durerea activă: cea mai recentă raportare cu scor, per loc. O durere ≥ 3 rămâne activă până la o raportare ulterioară
 * mai mică pentru același loc (sau fără loc) — trecerea timpului singură nu o ridică. Fereastra: 28 de zile (o durere
 * mai veche, fără nicio raportare de atunci, nu mai blochează, dar o spune mesajul de dimineață).
 */
export function activePain(evenings: { date: string; durere?: { scor: number | null; loc: string | null } | null }[], today: string): { scor: number; loc: string | null; date: string } | null {
  const rows = evenings.filter((e) => e.date <= today && e.date >= addDaysIso(today, -28) && e.durere?.scor != null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byLoc = new Map<string, { scor: number; loc: string | null; date: string }>();
  for (const e of rows) {
    const loc = (e.durere!.loc ?? '').trim().toLowerCase();
    const scor = e.durere!.scor!;
    // O raportare fără loc, cu scor mic („nu mă doare nimic”), ridică toate durerile raportate înainte.
    if (!loc && scor < 3) byLoc.clear();
    byLoc.set(loc, { scor, loc: e.durere!.loc, date: e.date });
  }
  return [...byLoc.values()].filter((x) => x.scor >= 3).sort((a, b) => b.scor - a.scor)[0] ?? null;
}

const RANK = { verde: 0, galben: 1, portocaliu: 2, rosu: 3, stop: 4 } as const;
/** Cea mai strictă dintre două culori (restricția nu poate fi coborâtă de media brățărilor). */
export function stricter<T extends keyof typeof RANK, U extends keyof typeof RANK>(a: T, b: U): T | U {
  return RANK[b] > RANK[a] ? b : a;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SPORT_WORD: Record<string, string> = { alergare: 'alergare', bicicleta: 'bicicletă', inot: 'înot', forta: 'forță' };
/**
 * Efort mare azi, aceeași regulă ca la activitățile neplanificate: o ședință de cel puțin 90 de minute, ori RPE ≥ 7.
 * Întoarce descrierea scurtă sau null.
 */
export function bigEffort(acts: { sport: string; minutes: number; rpe?: number | null }[]): string | null {
  const a = [...acts].sort((x, y) => y.minutes - x.minutes).find((x) => x.minutes >= 90 || (x.rpe ?? 0) >= 7);
  if (!a) return null;
  const h = Math.floor(a.minutes / 60);
  const m = a.minutes % 60;
  return `${SPORT_WORD[a.sport] ?? a.sport} ${h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`}${(a.rpe ?? 0) >= 7 ? `, efort ${a.rpe}/10` : ''}`;
}
