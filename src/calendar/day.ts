// Decizia zilei: UNA singură, din care citesc toate ecranele (Acasă, Antrenor, Recuperare, calendar, marginea
// ecranului, mesajele). Înainte, fiecare ecran își alegea singur sursa (starea din brățări, decizia de dimineață,
// restricțiile, calendarul) și aplicația putea spune în același timp „stai azi” și „fă ceva ușor”.
//
// Ordinea, de la cea mai strictă:
//  1. stop (febră, simptom cardiac) — din restricție sau din decizia de dimineață;
//  2. calendarul: dacă toate ședințele de azi au fost anulate de o regulă de sănătate (efort mare, durere, boală,
//     zi roșie), ziua e roșie — ce scrie sus trebuie să fie ce scrie în calendar;
//  3. starea de acum (brățări + cum te simți, cu restricția ca podea); portocaliu se citește galben („mai ușor”);
//  4. decizia salvată dimineața, dacă nu există stare.

import type { PlannedWorkout } from '../types.js';

export type DayLevel = 'verde' | 'galben' | 'rosu' | 'stop';

export interface DayDecision {
  level: DayLevel;
  /** „Zi verde” … */
  title: string;
  /** Ce faci azi, într-o propoziție — aceeași peste tot. */
  action: string;
  /** De ce (fapte, fără jargon tehnic), sau null. */
  reason: string | null;
}

export const DAY_TEXT: Record<DayLevel, { title: string; action: string }> = {
  verde: { title: 'Zi verde', action: 'Faci antrenamentul din plan.' },
  galben: { title: 'Zi galbenă', action: 'Azi mai ușor: faci varianta ușoară a ședinței.' },
  rosu: { title: 'Zi roșie', action: 'Azi pauză: fără antrenament.' },
  stop: { title: 'Stop', action: 'Azi nu te antrenezi. Dacă simptomele continuă, mergi la medic.' },
};

const RANK: Record<DayLevel, number> = { verde: 0, galben: 1, rosu: 2, stop: 3 };

export interface DayInput {
  /** Starea de acum (brățări + chestionar, cu restricția aplicată). */
  state: { verdict: 'verde' | 'galben' | 'portocaliu' | 'rosu'; motiv?: string | null } | null;
  /** Decizia salvată (dimineața), aliniată la stare. */
  readiness: { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null } | null;
  /** Restricția activă (febră, boală, durere, efort mare azi). */
  restriction: { verdict: 'galben' | 'rosu' | 'stop'; reason: string } | null;
  /** Ședințele de azi din plan (toate statusurile). */
  todayPlan: PlannedWorkout[];
}

export function decideDay(i: DayInput): DayDecision | null {
  const candidates: { level: DayLevel; reason: string | null }[] = [];
  if (i.restriction) candidates.push({ level: i.restriction.verdict, reason: i.restriction.reason });
  if (i.readiness?.verdict === 'stop') candidates.push({ level: 'stop', reason: i.readiness.reason });
  if (i.state) candidates.push({ level: i.state.verdict === 'portocaliu' ? 'galben' : i.state.verdict, reason: plain(i.state.motiv ?? null) });
  else if (i.readiness) candidates.push({ level: i.readiness.verdict, reason: i.readiness.reason });

  // Calendarul: toate ședințele de azi anulate de o regulă de sănătate = pauză azi.
  const sessions = i.todayPlan.filter((w) => w.type !== 'odihna' && w.status !== 'sters');
  const cancelled = sessions.filter((w) => w.status === 'anulat_sistem' && !(w.note ?? '').startsWith('plecat'));
  const active = sessions.filter((w) => w.status === 'planificat' || w.status === 'mutat');
  if (sessions.length > 0 && active.length === 0 && cancelled.length > 0) candidates.push({ level: 'rosu', reason: cancelled[0]!.note ?? 'ședințele de azi au fost anulate' });

  if (!candidates.length) return null;
  const top = candidates.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
  // Motivul vine de la sursa care a decis; la egalitate, primul cu text.
  const reason = candidates.find((c) => c.level === top.level && c.reason)?.reason ?? null;
  return { level: top.level, ...DAY_TEXT[top.level], reason: reason ? cap(reason) : null };
}

/** Un mesaj (al antrenorului) se potrivește cu decizia zilei? Altfel e depășit și nu se arată. */
export function messageMatches(decision: 'verde' | 'galben' | 'rosu' | 'stop' | null, day: DayDecision | null): boolean {
  if (!day || !decision) return true;
  return decision === day.level;
}

function plain(m: string | null): string | null {
  if (!m) return null;
  // „date obiective 62/100 (3 din 5 măsurate)” → limbaj de sportiv.
  return m
    .replace(/date obiective (\d+)\/100 \((\d) din 5 măsurate\)/, 'recuperarea măsurată de brățări: $1/100')
    .replace(/fără date obiective de la brățări: cel mult galben/, 'fără date de la brățări azi, așa că nu poate fi zi verde')
    .replace(/cum te simți \(Hooper (\d+)\) coboară la (\w+)/, 'cum te simți azi ($1/28) coboară ziua la $2');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
