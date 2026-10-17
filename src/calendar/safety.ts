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

/** Durerea din chestionarul de după antrenament: ≥ 3 schimbă zilele următoare (fără impact), ≥ 5 cere și fizioterapeut. */
export function painSafetyEvents(date: string, durere: unknown): MorningSafety {
  const d = (durere ?? {}) as { scor?: unknown; loc?: unknown };
  const score = typeof d.scor === 'number' && Number.isFinite(d.scor) ? d.scor : null;
  if (score == null || score < 3) return { verdict: null, events: [], message: null };
  const loc = typeof d.loc === 'string' && d.loc.trim() ? d.loc.trim() : 'nespecificat';
  return {
    verdict: score >= 5 ? 'rosu' : null,
    events: [{ kind: 'durere', date, score, loc }],
    message: score >= 5 ? `Durere ${score}/10 la ${loc}: următoarele 5 zile fără alergare (bicicletă ușoară în loc). Arată durerea unui fizioterapeut sau medic, ideal în 1–2 zile; dacă se umflă, nu poți călca sau doare în repaus, mergi azi.` : null,
  };
}

export type Restriction = { verdict: 'stop' | 'rosu' | 'galben'; reason: string } | null;

/**
 * Restricția activă azi, aceeași pentru API, calendar și ecrane. Datele brățărilor (somn, HRV) nu o pot ridica:
 *  - febră sau simptom cardiac raportat azi, ori stop salvat azi → stop;
 *  - boală raportată azi → roșu;
 *  - durere ≥ 5 în ultimele 2 zile → roșu; durere 3–4 în ultimele 2 zile → cel puțin galben.
 */
export function activeRestriction(input: {
  today: string;
  morning: { date?: string; semnale?: Record<string, unknown> | null } | null;
  evenings: { date: string; durere?: { scor: number | null; loc: string | null } | null }[];
  savedVerdict?: 'verde' | 'galben' | 'rosu' | 'stop' | null;
  /** Activitățile de azi (după dedublare) și RPE-ul declarat: un efort mare azi închide ziua. */
  todayActivities?: { sport: string; minutes: number; rpe?: number | null }[];
}): Restriction {
  const s = input.morning && (input.morning.date == null || input.morning.date === input.today) ? (input.morning.semnale ?? {}) : {};
  if (s.simptom_cardiac === true) return { verdict: 'stop', reason: 'Simptom cardiac raportat azi: fără antrenament, cere o evaluare medicală.' };
  if (s.febra === true) return { verdict: 'stop', reason: 'Febră raportată azi: fără antrenament.' };
  if (input.savedVerdict === 'stop') return { verdict: 'stop', reason: 'Stop pentru azi.' };
  if (s.boala === true) return { verdict: 'rosu', reason: 'Boală raportată azi: pauză.' };
  const recent = input.evenings.filter((e) => e.date <= input.today && e.date >= addDaysIso(input.today, -2) && e.durere?.scor != null);
  const worst = recent.reduce<{ scor: number; loc: string | null } | null>((m, e) => (!m || e.durere!.scor! > m.scor ? { scor: e.durere!.scor!, loc: e.durere!.loc } : m), null);
  if (worst && worst.scor >= 5) return { verdict: 'rosu', reason: `Durere ${worst.scor}/10${worst.loc ? ` la ${worst.loc}` : ''}: fără alergare și fără intensitate până trece.` };
  const big = bigEffort(input.todayActivities ?? []);
  if (big) return { verdict: 'rosu', reason: `Ai făcut deja azi un efort mare (${big}): restul zilei odihnă, fără alt antrenament.` };
  if (worst && worst.scor >= 3) return { verdict: 'galben', reason: `Durere ${worst.scor}/10${worst.loc ? ` la ${worst.loc}` : ''}: doar ușor, fără impact.` };
  return null;
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
