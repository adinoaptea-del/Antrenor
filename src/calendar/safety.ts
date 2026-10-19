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

/** Acțiunea afișată la stop, aceeași în formular, pe Home și în mesajul antrenorului (L-SIM-03). */
export const CARDIAC_ACTION = 'Azi nu te antrenezi. Cere o evaluare medicală azi. Dacă ai durere în piept, leșin, lipsă de aer sau palpitații care nu trec, sună la 112.';
export const FEVER_ACTION = 'Azi nu te antrenezi. Dacă febra nu scade sau apar dureri în piept ori lipsă de aer, mergi la medic.';
export function stopAction(reason: string | null | undefined): string {
  if (/cardiac|piept|leșin|lesin|palpita|lipsă de aer|lipsa de aer|evaluare medical/i.test(reason ?? '')) return CARDIAC_ACTION;
  if (/febr/i.test(reason ?? '')) return FEVER_ACTION;
  return 'Azi nu te antrenezi.';
}

/**
 * Simptomul cardiac nu expiră odată cu ziua (L-SIM-03/04): după ziua raportării, până la o evaluare medicală
 * declarată de sportiv, doar ușor — fără teste, intervale sau ieșiri lungi. Fereastra: 14 zile. AI-ul nu dă aviz:
 * ridicarea vine doar din bifa sportivului „am fost evaluat medical și pot face efort”.
 */
export function pendingCardiac(mornings: { date?: string; semnale?: Record<string, unknown> | null }[] | undefined, today: string): string | null {
  const rows = (mornings ?? []).filter((m) => m.date && m.date <= today && m.date >= addDaysIso(today, -14)).sort((a, b) => (a.date! < b.date! ? -1 : 1));
  let since: string | null = null;
  for (const m of rows) {
    if (m.semnale?.simptom_cardiac === true) since = m.date!;
    else if (since && m.semnale?.cardiac_evaluat === true) since = null;
  }
  return since;
}

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
  morning: { date?: string; semnale?: Record<string, unknown> | null; hooper?: { oboseala?: number | null; dureri?: number | null } | null; dureri_zona?: string | null; dureri_mers?: boolean | null } | null;
  evenings: { date: string; durere?: { scor: number | null; loc: string | null } | null; comentariu?: string | null }[];
  savedVerdict?: 'verde' | 'galben' | 'rosu' | 'stop' | null;
  /** Activitățile de azi (după dedublare) și RPE-ul declarat: un efort mare azi închide ziua. */
  todayActivities?: { sport: string; minutes: number; rpe?: number | null }[];
  /** Chestionarele de dimineață din ultimele 14 zile: un simptom cardiac rămâne activ până la evaluarea declarată. */
  mornings?: { date?: string; semnale?: Record<string, unknown> | null }[];
}): Restriction {
  const s = input.morning && (input.morning.date == null || input.morning.date === input.today) ? (input.morning.semnale ?? {}) : {};
  if (s.simptom_cardiac === true) return { verdict: 'stop', reason: 'Simptom cardiac raportat azi: fără antrenament, cere o evaluare medicală.' };
  const written = [typeof s.nota === 'string' ? s.nota : null, ...input.evenings.filter((e) => e.date <= input.today && e.date >= addDaysIso(input.today, -1)).map((e) => e.comentariu ?? null)].map(urgentText).find(Boolean);
  if (written) return { verdict: 'stop', reason: `Ai scris „${written}”: azi fără antrenament și cere o evaluare medicală azi. Dacă durerea în piept, leșinul sau lipsa de aer apar acum, sună la 112.` };
  if (s.febra === true) return { verdict: 'stop', reason: 'Febră raportată azi: fără antrenament.' };
  if (input.savedVerdict === 'stop') return { verdict: 'stop', reason: 'Stop pentru azi.' };
  if (s.boala === true) return { verdict: 'rosu', reason: 'Boală raportată azi: pauză.' };
  // Semnalele individuale înaintea sumei (auditul M35, E01): epuizare sau dureri musculare 6–7/7 nu sunt „în regulă”
  // doar pentru că celelalte note sunt bune. Oboseala nu e diagnostic; durerea musculară se separă de durerea focală.
  const hm = input.morning && (input.morning.date == null || input.morning.date === input.today) ? input.morning : null;
  const dureri = hm?.hooper?.dureri ?? null;
  const oboseala = hm?.hooper?.oboseala ?? null;
  if (dureri != null && dureri >= 6) {
    const zona = hm?.dureri_zona;
    const where = zona === 'picioare' ? ' la picioare' : zona === 'spate' ? ' la spate' : zona === 'brate' ? ' la umeri și brațe' : zona === 'tot' ? ' pe tot corpul' : '';
    const act = zona === 'picioare' ? 'azi fără alergare și fără picioare la sală; înot sau bicicletă doar foarte ușor și doar dacă nu încarcă zona' : zona === 'brate' ? 'azi fără înot și fără partea de sus la sală; alergare sau bicicletă doar ușor' : zona === 'spate' ? 'azi fără sală și fără ședințe lungi; doar ușor, dacă nu doare' : zona === 'tot' ? 'azi pauză sau doar mers ușor' : 'azi doar ușor; spune unde (picioare, spate, umeri) ca să știm ce ședințe rămân';
    return { verdict: 'galben', reason: `Dureri musculare ${dureri}/7${where}: ${act}.${hm?.dureri_mers ? ' Doare și la mers: dacă e într-un singur punct sau ascuțită, e durere, nu oboseală — spune-o în formularul de seară.' : ''} Reevaluăm mâine dimineață.` };
  }
  if (oboseala != null && oboseala >= 6) {
    const days = (input.mornings ?? []).filter((m) => m.date && m.date < input.today && m.date >= addDaysIso(input.today, -3) && Number((m as { hooper?: { oboseala?: number } }).hooper?.oboseala ?? 0) >= 6).length;
    return { verdict: 'galben', reason: `Epuizare ${oboseala}/7 azi${days ? ` (a ${days + 1}-a zi din ultimele 4)` : ''}: doar ușor sau pauză. ${days >= 2 ? 'E persistentă: verificăm cauza (somn, mâncare, boală) înainte de următoarea ședință grea; obiectivul rămâne, planul se reevaluează.' : 'Dacă ține 2–3 zile, verificăm cauza (somn, mâncare, boală).'}` };
  }
  const todayMorning = input.morning && (input.morning.date == null || input.morning.date === input.today) ? [{ date: input.today, semnale: input.morning.semnale ?? null }] : [];
  const cardiacSince = pendingCardiac([...(input.mornings ?? []).filter((m) => m.date !== input.today), ...todayMorning], input.today);
  if (cardiacSince && cardiacSince < input.today) return { verdict: 'galben', reason: `Simptom cardiac raportat pe ${cardiacSince}: până la o evaluare medicală, doar ușor — fără teste, intervale sau ieșiri lungi. Când medicul ți-a permis efortul, bifează în chestionarul de dimineață.` };
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
