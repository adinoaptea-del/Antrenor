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

import { stopAction } from './safety.js';
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
  /** Zi fără ședință în plan: nu există „variantă ușoară”, e odihnă oricum (doar stopul și roșul se spun). */
  rest?: boolean;
  /** Fără date de la brățări: sportivul spune dacă e apt (da / parțial / nu). */
  ask?: boolean;
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
  /** Ședințele de azi deja făcute (legate de o activitate). */
  doneIds?: string[];
  /** Fără date de la brățări și fără răspuns: întrebăm sportivul dacă e apt. */
  ask?: boolean;
}

export function decideDay(i: DayInput): DayDecision | null {
  const candidates: { level: DayLevel; reason: string | null }[] = [];
  if (i.restriction) candidates.push({ level: i.restriction.verdict, reason: i.restriction.reason });
  if (i.readiness?.verdict === 'stop') candidates.push({ level: 'stop', reason: i.readiness.reason });
  if (i.state) candidates.push({ level: i.state.verdict === 'portocaliu' ? 'galben' : i.state.verdict, reason: plain(i.state.motiv ?? null) });
  else if (i.readiness) candidates.push({ level: i.readiness.verdict, reason: i.readiness.reason });

  // Calendarul: toate ședințele de azi anulate de o regulă de sănătate = pauză azi.
  const sessions = i.todayPlan.filter((w) => w.type !== 'odihna' && w.status !== 'sters');
  const coveredNote = (w: PlannedWorkout) => /^(acoperită|gata pe azi)/.test(w.note ?? '');
  const cancelled = sessions.filter((w) => w.status === 'anulat_sistem' && !(w.note ?? '').startsWith('plecat') && !coveredNote(w));
  const doneSet = new Set(i.doneIds ?? []);
  const done = sessions.filter((w) => doneSet.has(w.id));
  const active = sessions.filter((w) => (w.status === 'planificat' || w.status === 'mutat') && !doneSet.has(w.id));
  if (sessions.length > 0 && active.length === 0 && cancelled.length > 0) candidates.push({ level: 'rosu', reason: cancelled[0]!.note ?? 'ședințele de azi au fost anulate' });

  // Ziua e acoperită: ai făcut deja efortul zilei (sau partea aleasă), restul e odihnă. Nu e „zi roșie”.
  const covered = sessions.filter((w) => w.status === 'anulat_sistem' && coveredNote(w));
  if (sessions.length && covered.length && active.length === 0) {
    const hard = candidates.filter((c) => c.level === 'stop').sort((a, b) => RANK[b.level] - RANK[a.level])[0];
    if (!hard) return { level: 'verde', title: 'Ziua e acoperită', action: 'Ai făcut deja efortul zilei: restul zilei odihnă.', reason: 'Mâine dimineață antrenorii se uită la somn, recuperare și dureri, apoi decid ziua.', rest: true };
  }
  // Ai făcut tot ce era azi în plan.
  if (sessions.length && done.length && active.length === 0 && cancelled.length === 0 && !candidates.some((c) => c.level === 'stop')) {
    return { level: 'verde', title: 'Gata pe azi', action: 'Ai făcut ce era în plan. Restul zilei odihnă.', reason: null, rest: true };
  }
  // Fără date de la brățări și fără răspuns: întrebarea, nu o culoare ghicită (stopul rămâne stop).
  if (i.ask && active.length && !candidates.some((c) => c.level === 'stop' || c.level === 'rosu')) {
    return {
      level: 'galben',
      title: 'Fără date de la brățări',
      action: 'Ești odihnit și apt de antrenament azi?',
      reason: 'Brățara n-a trimis somnul și recuperarea din noaptea trecută: poate n-ai purtat-o, s-a descărcat sau nu s-a sincronizat. Tu știi cum ai dormit, deci decizi tu.',
      ask: true,
    };
  }
  // Zi fără nicio ședință în plan (odihnă): verde sau galben nu schimbă nimic, deci nu se spune „fă varianta ușoară”.
  if (sessions.length === 0 || (active.length === 0 && cancelled.length === 0)) {
    const hard = candidates.filter((c) => c.level === 'stop' || c.level === 'rosu').sort((a, b) => RANK[b.level] - RANK[a.level])[0];
    const tired = candidates.find((c) => c.level === 'galben');
    if (!hard) return { level: 'verde', title: 'Zi de odihnă', action: 'Azi odihnă, cum e în plan.', reason: tired ? `${cap(tired.reason ?? 'Ai notat că nu ești în formă')}. Azi oricum e pauză: planul rămâne, iar înainte de următoarea ședință se reevaluează cum te simți.` : null, rest: true };
  }
  if (!candidates.length) return null;
  const top = candidates.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
  // Motivul vine de la sursa care a decis; la egalitate, primul cu text.
  const reason = candidates.find((c) => c.level === top.level && c.reason)?.reason ?? null;
  // Zi fără ședințe în plan: spune explicit că nu s-a schimbat nimic și când se reevaluează (auditul T02).
  const restNote = sessions.length === 0 && top.level === 'rosu' ? { action: 'Azi era deja pauză în plan: nu se adaugă nimic. Planul rămâne; înainte de următoarea ședință se reevaluează cum te simți.' } : {};
  return { level: top.level, ...DAY_TEXT[top.level], ...restNote, ...(top.level === 'stop' ? { action: stopAction(reason) } : {}), reason: reason ? cap(reason) : null };
}

/** Un mesaj (al antrenorului) se potrivește cu decizia zilei? Altfel e depășit și nu se arată. */
export function messageMatches(decision: 'verde' | 'galben' | 'rosu' | 'stop' | null, day: DayDecision | null): boolean {
  if (!day || !decision) return true;
  // Întrebarea (fără date de la brățări) n-are încă răspuns: niciun mesaj nu a fost scris pe ea.
  if (day.ask) return false;
  // În zi de odihnă, un mesaj verde sau galben spune tot „odihnă” (nu are ce ședință să ușureze).
  if (day.rest) return decision === 'verde' || decision === 'galben';
  return decision === day.level;
}

function plain(m: string | null): string | null {
  if (!m) return null;
  // „date obiective 62/100 (3 din 5 măsurate)” → limbaj de sportiv.
  return m
    .replace(/date obiective (\d+)\/100 \((\d) din 5 măsurate\)/, 'recuperarea măsurată de brățări: $1/100')
    .replace(/fără date obiective de la brățări: cel mult galben/, 'brățara n-a măsurat recuperarea din noaptea trecută (somnul nu s-a înregistrat), așa că ziua nu poate fi verde')
    .replace(/cum te simți \(Hooper (\d+)\) coboară la (\w+)/, 'cum te simți azi ($1/28) coboară ziua la $2');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
