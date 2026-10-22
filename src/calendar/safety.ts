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

/**
 * Restricția activă. Toate incidentele se adună (auditul v93, A01): culoarea e cea mai strictă dintre ele, iar `reason`
 * începe cu motivul care a decis și le păstrează pe celelalte (`others`), ca o durere să nu fie ascunsă de oboseală.
 */
export type Restriction = { verdict: 'stop' | 'rosu' | 'galben'; reason: string; others?: string[] } | null;

/** Acțiunea afișată la stop, aceeași în formular, pe Home și în mesajul antrenorului (L-SIM-03). */
export const CARDIAC_ACTION = 'Azi nu te antrenezi. Cere o evaluare medicală azi. Dacă ai durere în piept, leșin, lipsă de aer sau palpitații care nu trec, sună la 112.';
export const FEVER_ACTION = 'Azi nu te antrenezi. Dacă febra nu scade sau apar dureri în piept ori lipsă de aer, mergi la medic.';
/**
 * Zona durerii (auditul v93, A07): alternativa se alege după zonă, nu doar după scor. Necunoscută = 'necunoscut'.
 * jos = picior, genunchi, gleznă, tibie, șold, tendon; sus = umăr, braț, cot, încheietură, gât; spate = spate, lombar.
 */
export type PainRegion = 'jos' | 'sus' | 'spate' | 'necunoscut';
export function painRegion(loc: string | null | undefined): PainRegion {
  const l = (loc ?? '').toLowerCase();
  if (/genunch|gle[zș]n|tibi|gamb|picio|[șs]old|tendon|ahil|talp|fasci|coaps|ischio|femur|cvadr|adduct|aductor|inghin/.test(l)) return 'jos';
  if (/um[aă]r|bra[țt]|cot|[îi]ncheiet|g[aâ]t|ceaf|pect|piept(?!.*inim)/.test(l)) return 'sus';
  if (/spate|lomb|coloan|sacr|fes/.test(l)) return 'spate';
  return 'necunoscut';
}
/** Sporturile care NU se propun ca alternativă când doare zona asta (bicicleta la picioare e doar condiționată). */
export function sportsBlockedByPain(loc: string | null | undefined): string[] {
  const r = painRegion(loc);
  return r === 'jos' ? ['alergare'] : r === 'sus' ? ['inot', 'forta'] : r === 'spate' ? ['forta'] : [];
}

export function stopAction(reason: string | null | undefined): string {
  if (/cardiac|piept|leșin|lesin|palpita|lipsă de aer|lipsa de aer|evaluare medical/i.test(reason ?? '')) return CARDIAC_ACTION;
  if (/febr/i.test(reason ?? '')) return FEVER_ACTION;
  return 'Azi nu te antrenezi.';
}

/**
 * Simptomul cardiac nu expiră odată cu ziua (L-SIM-03/04): după ziua raportării, până la o evaluare medicală
 * declarată de sportiv, doar ușor — fără teste, intervale sau ieșiri lungi. Fără fereastră de expirare. AI-ul nu dă aviz:
 * ridicarea vine doar din bifa sportivului „am fost evaluat medical și pot face efort”.
 */
export function pendingCardiac(mornings: { date?: string; semnale?: Record<string, unknown> | null }[] | undefined, today: string): string | null {
  // Fără fereastră (auditul v93, A02): un simptom cardiac rămâne până la evaluarea declarată, oricât timp a trecut.
  const rows = (mornings ?? []).filter((m) => m.date && m.date <= today).sort((a, b) => (a.date! < b.date! ? -1 : 1));
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
const URGENT = new RegExp(
  [
    '(dur(ere|eri)|apăsare|apasare|strânsoare|stransoare|jungh(i|iuri)|arsur[ăa])\\s+(în|in|la|pe)\\s+piept',
    'piept(ul)?\\s+(mă|ma|m-a)\\s+(doare|durut|strânge|strange|apăsa|apasa)',
    '(mă|ma|m-a)\\s+(doare|durut|strâns|strans|apăsat|apasat)\\s+(în|in|la|pe)?\\s*piept(ul)?',
    'durere\\s+toracic[ăa]',
    'leșin|lesin|am\\s+leșinat|mi-a\\s+venit\\s+r[ăa]u',
    'am\\s+ame[țt]it|ame[țt]eal[ăa]|m-a\\s+luat\\s+ame[țt]eala',
    'am\\s+v[ăa]zut\\s+negru|mi\\s+s-a\\s+f[ăa]cut\\s+negru',
    'palpita(ț|t)ii',
    'inima\\s+(o\\s+ia\\s+razna|o\\s+lua\\s+razna|bate\\s+neregulat|bătea\\s+neregulat|bătea\\s+haotic)',
    'bătăi\\s+neregulate|ritm\\s+neregulat',
    'puls(ul)?\\s+(a\\s+)?(s[ăa]rit|crescut)\\s+(brusc\\s+)?(la\\s+)?\\d*\\s*(și|si)\\s+nu\\s+(mai\\s+)?(cobora|scădea|scadea)',
    'nu\\s+(mai\\s+)?puteam\\s+respira|lipsă\\s+de\\s+aer|lipsa\\s+de\\s+aer|sufoca',
  ].join('|'),
  'i',
);
const NEG = /(fără|fara|nu\s+am|n-am|nu\s+a\s+fost|niciun|nicio)\s+(\S+\s+){0,3}$/i;
const OTHER = /\b(colegul|colega|prietenul|prietena|soția|sotia|soțul|sotul|tata|mama|fratele|sora|cineva|un\s+alerg[ăa]tor|o\s+alerg[ăa]toare|altcuiva)\b/i;
/** Granița propoziției: negația dintr-o propoziție nu acoperă simptomul din următoarea („Nu am febră, dar am durere în piept”). */
const CLAUSE = /.*(?:[,;.!?:]|\b(?:dar|însă|insa|iar|apoi|totuși|totusi|și|si)\b)/is;
export function urgentText(text: string | null | undefined): string | null {
  if (!text) return null;
  // Fiecare apariție, nu doar prima: o negație la prima nu o ascunde pe a doua (auditul v93, A04).
  const re = new RegExp(URGENT.source, 'gi');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let before = text.slice(Math.max(0, m.index - 40), m.index);
    const cut = CLAUSE.exec(before);
    if (cut) before = before.slice(cut[0].length);
    // Persoana descrisă: simptomul altcuiva („colegul a leșinat”) nu e al sportivului.
    if (OTHER.test(before)) continue;
    if (!NEG.test(before)) return m[0];
  }
  return null;
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
  const found: { verdict: 'stop' | 'rosu' | 'galben'; reason: string }[] = [];
  const add = (verdict: 'stop' | 'rosu' | 'galben', reason: string) => found.push({ verdict, reason });
  const s = input.morning && (input.morning.date == null || input.morning.date === input.today) ? (input.morning.semnale ?? {}) : {};
  if (s.simptom_cardiac === true) add('stop', 'Simptom cardiac raportat azi: fără antrenament, cere o evaluare medicală.');
  const written = [typeof s.nota === 'string' ? s.nota : null, ...input.evenings.filter((e) => e.date <= input.today && e.date >= addDaysIso(input.today, -1)).map((e) => e.comentariu ?? null)].map(urgentText).find(Boolean);
  if (written) add('stop', `Ai scris „${written}”: azi fără antrenament și cere o evaluare medicală azi. Dacă durerea în piept, leșinul sau lipsa de aer apar acum, sună la 112.`);
  if (s.febra === true) add('stop', 'Febră raportată azi: fără antrenament.');
  if (input.savedVerdict === 'stop') add('stop', 'Stop pentru azi.');
  if (s.boala === true) add('rosu', 'Boală raportată azi: pauză.');
  // Revenirea după febră e condiționată (auditul v93, A06): ultima raportare a fost febră și de atunci nu ai spus
  // dimineața că nu mai ai → nu se reia antrenamentul doar pentru că au trecut zile.
  const reports = [...(input.mornings ?? []), ...(input.morning?.date ? [{ date: input.morning.date, semnale: input.morning.semnale ?? null }] : [])]
    .filter((m) => m.date && m.date <= input.today && m.semnale && Object.keys(m.semnale).length)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
  const lastReport = reports[reports.length - 1];
  if (s.febra !== true && lastReport && lastReport.date! < input.today && lastReport.semnale?.febra === true) add('rosu', `Ultima ta raportare (${lastReport.date}) a fost febră: reiei antrenamentul doar după ce spui dimineața că nu mai ai febră. Dacă nu scade sau apar dureri în piept ori lipsă de aer, mergi la medic.`);
  // Semnalele individuale înaintea sumei (auditul M35, E01): epuizare sau dureri musculare 6–7/7 nu sunt „în regulă”
  // doar pentru că celelalte note sunt bune. Oboseala nu e diagnostic; durerea musculară se separă de durerea focală.
  const hm = input.morning && (input.morning.date == null || input.morning.date === input.today) ? input.morning : null;
  const dureri = hm?.hooper?.dureri ?? null;
  const oboseala = hm?.hooper?.oboseala ?? null;
  if (dureri != null && dureri >= 6) {
    const zona = hm?.dureri_zona;
    const where = zona === 'picioare' ? ' la picioare' : zona === 'spate' ? ' la spate' : zona === 'brate' ? ' la umeri și brațe' : zona === 'tot' ? ' pe tot corpul' : '';
    const act = zona === 'picioare' ? 'azi fără alergare și fără picioare la sală; înot sau bicicletă doar foarte ușor și doar dacă nu încarcă zona' : zona === 'brate' ? 'azi fără înot și fără partea de sus la sală; alergare sau bicicletă doar ușor' : zona === 'spate' ? 'azi fără sală și fără ședințe lungi; doar ușor, dacă nu doare' : zona === 'tot' ? 'azi pauză sau doar mers ușor' : 'azi doar ușor; spune unde (picioare, spate, umeri) ca să știm ce ședințe rămân';
    add('galben', `Dureri musculare ${dureri}/7${where}: ${act}.${hm?.dureri_mers ? ' Doare și la mers: dacă e într-un singur punct sau ascuțită, e durere, nu oboseală — spune-o în formularul de seară.' : ''} Reevaluăm mâine dimineață.`);
  }
  if (oboseala != null && oboseala >= 6) {
    const days = (input.mornings ?? []).filter((m) => m.date && m.date < input.today && m.date >= addDaysIso(input.today, -3) && Number((m as { hooper?: { oboseala?: number } }).hooper?.oboseala ?? 0) >= 6).length;
    add('galben', `Epuizare ${oboseala}/7 azi${days ? ` (a ${days + 1}-a zi din ultimele 4)` : ''}: doar ușor sau pauză. ${days >= 2 ? 'E persistentă: verificăm cauza (somn, mâncare, boală) înainte de următoarea ședință grea; obiectivul rămâne, planul se reevaluează.' : 'Dacă ține 2–3 zile, verificăm cauza (somn, mâncare, boală).'}`);
  }
  const todayMorning = input.morning && (input.morning.date == null || input.morning.date === input.today) ? [{ date: input.today, semnale: input.morning.semnale ?? null }] : [];
  // A1 (auditul consolidat): simptomul cardiac declarat seara (întrebarea structurată sau durere „piept”) e același
  // incident ca cel de dimineață: stop în ziua lui, apoi doar ușor până la evaluarea declarată.
  const eveningCardiac = input.evenings
    .filter((e) => e.date <= input.today && ((e as { simptome_cardiace?: boolean | null }).simptome_cardiace === true || (e.durere?.loc === 'piept' && (e.durere?.scor ?? 0) > 0)))
    .map((e) => ({ date: e.date, semnale: { simptom_cardiac: true } as Record<string, unknown> }));
  if (eveningCardiac.some((e) => e.date === input.today) && s.simptom_cardiac !== true) add('stop', 'Ai declarat azi durere/apăsare în piept, palpitații, amețeală sau leșin: fără antrenament și cere o evaluare medicală. Dacă simptomul nu trece, sună la 112.');
  const cardiacSince = pendingCardiac([...(input.mornings ?? []).filter((m) => m.date !== input.today), ...todayMorning, ...eveningCardiac].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : 1)), input.today);
  if (cardiacSince && cardiacSince < input.today) add('galben', `Simptom cardiac raportat pe ${cardiacSince}: până la o evaluare medicală, doar ușor — fără teste, intervale sau ieșiri lungi. Când medicul ți-a permis efortul, bifează în chestionarul de dimineață.`);
  const worst = activePain(input.evenings, input.today);
  if (worst && worst.scor >= 5) add('rosu', `Durere ${worst.scor}/10${worst.loc ? ` la ${worst.loc}` : ''} (raportată pe ${worst.date}): fără antrenament până la reevaluare. Când a scăzut, spune în formular.`);
  // Efortul mare de azi nu mai e o restricție de sănătate: îl echivalează regula „acoperit” (efort făcut față de cel
  // planificat), iar ziua de mâine o decid datele de dimineață.
  else if (worst && worst.scor >= 3) add('galben', `Durere ${worst.scor}/10${worst.loc ? ` la ${worst.loc}` : ''} (raportată pe ${worst.date}): doar ușor, fără impact; o alternativă se face doar dacă nu doare.`);
  if (!found.length) return null;
  const top = found.reduce((x, y) => (RANK[y.verdict] > RANK[x.verdict] ? y : x));
  const others = found.filter((f) => f !== top).map((f) => f.reason);
  return { verdict: top.verdict, reason: others.length ? `${top.reason} Și: ${others.join(' ')}` : top.reason, ...(others.length ? { others } : {}) };
}

/**
 * Durerea activă: cea mai recentă raportare cu scor, per loc. O durere ≥ 3 rămâne activă până la o raportare ulterioară
 * mai mică pentru același loc (sau fără loc) — trecerea timpului singură nu o ridică, oricât ar fi (auditul v93, A02;
 * apelanții dau incidentele din ultimele 12 luni).
 */
export function activePain(evenings: { date: string; durere?: { scor: number | null; loc: string | null } | null }[], today: string): { scor: number; loc: string | null; date: string } | null {
  const rows = evenings.filter((e) => e.date <= today && e.durere?.scor != null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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

/** Lista completă pentru restricție: formularele recente + incidentele vechi, fără dubluri (aceeași zi și același loc). */
export function withIncidents<T extends { date?: string }>(recent: T[], old: T[] | undefined): T[] {
  if (!old?.length) return recent;
  const key = (x: T) => `${x.date}|${JSON.stringify((x as { durere?: unknown }).durere ?? (x as { semnale?: unknown }).semnale ?? null)}`;
  const seen = new Set(recent.map(key));
  return [...old.filter((x) => !seen.has(key(x))), ...recent];
}
