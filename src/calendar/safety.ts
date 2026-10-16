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
