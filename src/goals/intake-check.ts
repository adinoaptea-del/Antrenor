// Auditul v93, A101: aceeași regulă pentru ținta de alergare în aplicație și pe server. Ramura „finalizare” nu cere
// timp; ramura „timp” cere o țintă care se poate citi (ritm „5:30” sau timp final „52:00” / „1:55:00”).
import { parseDuration, parsePace } from '../util/run.js';

export interface RunTargetLike {
  ramura?: 'finalizare' | 'timp' | null;
  tinta?: { mod?: 'ritm' | 'timp' | string | null; valoare?: string | null } | null;
}

export function runResultValid(r: RunTargetLike['tinta']): boolean {
  return !!r && (r.mod === 'ritm' ? parsePace(r.valoare ?? null) != null : parseDuration(r.valoare ?? null) != null);
}

/** null = în regulă; altfel motivul, pe înțeles. */
export function runTargetProblem(a: RunTargetLike | null | undefined): string | null {
  if (!a || a.ramura !== 'timp') return null;
  return runResultValid(a.tinta) ? null : 'ai ales „pe timp”: scrie ținta (ritm, ex. 5:30, sau timp final, ex. 52:00), ori alege „vreau să termin”';
}
