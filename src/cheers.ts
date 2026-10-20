// Felicitările de după o ședință (cererea proprietarului, 19.10.2026): un mesaj scurt, cu umor, potrivit sportului
// făcut, cu numele sportivului. Apare DOAR când ședința a fost executată cel puțin 60% (minutele față de plan; la forță,
// exercițiile notate față de cele propuse). Afirmațiile din mesaj sunt adevărate: „fix cât trebuia” doar la 90–115%,
// „din ce în ce mai bine” doar cu dovadă (ritm mai bun decât media ultimelor ședințe), „începi să înveți” doar la primele
// ședințe de înot. Sub 60% nu apare nimic: o felicitare nemeritată ar fi falsă. Peste plan cu durere raportată (≥ 3)
// nu se laudă depășirea (auditul v93, A72/A92; nu schimbă pragurile regulii 26, doar nu felicită cantitatea cu durere).

export type CheerSport = 'alergare' | 'bicicleta' | 'inot' | 'forta' | 'mers';
export type CheerTier = 'fix' | 'bine' | 'peste';

export interface CheerInput {
  sport: CheerSport;
  /** Execuția față de plan: 1 = exact; null = nu se poate spune (fără date) → fără mesaj. */
  ratio: number | null;
  name: string | null;
  minutes: number | null;
  km: number | null;
  /** A câta ședință din sportul ăsta în ultimele 14 zile (cu cea de azi). */
  nThisSport14: number;
  /** A câta ședință de înot de la începutul planului (pentru „începi să înveți”). */
  nSwimTotal?: number;
  /** Ritm mai bun decât media ultimelor 3 ședințe din același sport (dovada pentru „din ce în ce mai bine”). */
  improving?: boolean;
  /** Pentru alegerea stabilă (același mesaj la redeschidere). */
  seed: string;
  /** Durerea raportată seara pentru ședința asta (0–10); null = neraportată. */
  pain?: number | null;
}

/** De la durerea asta în sus nu se laudă depășirea planului (auditul v93, A72/A92). */
export const CHEER_PAIN_NO_PRAISE = 3;

export const CHEER_MIN_RATIO = 0.6;

export function cheerTier(ratio: number | null): CheerTier | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio < CHEER_MIN_RATIO) return null;
  if (ratio > 1.15) return 'peste';
  if (ratio >= 0.9) return 'fix';
  return 'bine';
}

type T = (x: { n: string; min: string; km: string; k: number }) => string;

/** Mesajele, pe sport și pe nivel. {n} = numele (sau gol), {min}/{km} doar unde există date. */
export const CHEERS: Record<CheerSport, Record<CheerTier, T[]>> = {
  alergare: {
    fix: [
      ({ n }) => `Ai alergat fix cât trebuia astăzi. Ține-o tot așa${n}!`,
      ({ n, km }) => `${km ? `${km} ca la carte` : 'Alergarea ca la carte'}. Planul și picioarele tale s-au înțeles perfect${n}.`,
      ({ n }) => `Precizie de ceas elvețian${n}: ai alergat exact cât era scris.`,
      ({ n }) => `Asfaltul încă se întreabă cine a trecut pe acolo${n}. Ai bifat alergarea de azi!`,
      ({ n }) => `Alergare livrată la timp, fără scuze. Respect${n}!`,
    ],
    bine: [
      ({ n, min }) => `${min ? `${min} de alergare` : 'O alergare bună'} în cont${n}. Nu perfect, dar solid: asta construiește.`,
      ({ n }) => `Ai pus kilometri în picioare azi${n}. Fiecare contează.`,
      ({ n }) => `Nu toată, dar cea mai mare parte. Corpul a primit mesajul${n}.`,
    ],
    peste: [
      ({ n }) => `Ai alergat mai mult decât scria planul${n}: entuziasm de campion. Mâine îl lași pe corp să recupereze.`,
      ({ n }) => `Ai dat peste plan azi${n}. Frumos, dar ține minte: ușorul de mâine face parte din antrenament.`,
    ],
  },
  bicicleta: {
    fix: [
      ({ n }) => `Ești deja zeu pe bicicletă${n}, i-au luat foc roțile!`,
      ({ n, km }) => `${km ? `${km} pedalați` : 'Tura pedalată'} exact cum trebuia. Lanțul îți mulțumește${n}.`,
      ({ n }) => `Tură bifată la fix${n}. Șoseaua a aflat cine e șeful.`,
      ({ n }) => `Pedale, cadență, disciplină. Azi le-ai avut pe toate${n}!`,
    ],
    bine: [
      ({ n }) => `Tură bună în picioare${n}. Fiecare pedală te duce mai aproape de cursă.`,
      ({ n, min }) => `${min ? `${min} pe bicicletă` : 'Bicicletă'} în cont${n}. Nu tot planul, dar cu siguranță nu puțin.`,
    ],
    peste: [({ n }) => `Ai pedalat peste plan${n}. Roțile sunt fericite, picioarele vor odihnă mâine.`],
  },
  inot: {
    fix: [
      ({ n }) => `Ședința de înot, exact cum era scrisă. Ești bombă${n}!`,
      ({ n }) => `Apa a cedat azi${n}. Ai înotat cât trebuia, cu cap.`,
      ({ n }) => `Lungime după lungime, ai dus-o la capăt. Delfinii iau notițe${n}.`,
    ],
    bine: [
      ({ n }) => `Ai intrat în apă și ai lucrat${n}. Asta face diferența la înot: constanța.`,
      ({ n }) => `Cea mai mare parte din înot, bifată. Tehnica se construiește exact așa${n}.`,
    ],
    peste: [({ n }) => `Ai rămas în apă mai mult decât era planul${n}. Pește adevărat!`],
  },
  forta: {
    fix: [
      ({ n }) => `Mai aveai puțin și ridicai și sala, la cum te-ai descurcat azi${n}!`,
      ({ n }) => `Toate exercițiile, toate seriile. Greutățile au cerut pauză${n}.`,
      ({ n }) => `Antrenament de forță complet${n}. Mușchii tăi semnează contractul pe încă o săptămână.`,
      ({ n }) => `Sala te-a văzut și a înțeles: azi nu se glumește${n}.`,
    ],
    bine: [
      ({ n }) => `Majoritatea exercițiilor, făcute ca la carte${n}. Forța se adună din zile ca asta.`,
      ({ n }) => `Ai tras bine azi${n}. Nu tot, dar destul cât corpul să crească.`,
    ],
    peste: [({ n }) => `Ai făcut chiar mai mult decât era scris${n}. Bravo, dar recuperarea e și ea antrenament.`],
  },
  mers: {
    fix: [
      ({ n }) => `Ai mers de ai topit talpa încălțărilor! Ești fabulos${n}!`,
      ({ n, min }) => `${min ? `${min} de mers` : 'Mersul de azi'}, exact cât era planul. Bula ta se golește frumos${n}.`,
      ({ n }) => `Pas cu pas, fix cât trebuia. Trotuarul te salută${n}!`,
    ],
    bine: [
      ({ n }) => `Ai pus pași în cont azi${n}. Fiecare minut contează în bula săptămânii.`,
      ({ n }) => `Plimbare bună${n}. Nu toată ținta zilei, dar mult mai bine decât canapeaua.`,
    ],
    peste: [({ n }) => `Ai mers mai mult decât era planul${n}. Încălțările cer concediu!`],
  },
};

/** Mesajele speciale, cu dovezi: progresul, constanța, primele ședințe de înot. */
const EXTRA = {
  improving: (sport: CheerSport, n: string) =>
    sport === 'alergare' ? `Te descurci din ce în ce mai bine la alergat${n}: azi ai fost mai rapid decât de obicei.` : sport === 'bicicleta' ? `Pe bicicletă mergi tot mai bine${n}: azi, mai repede decât media ultimelor ture.` : `Tot mai bine${n}: azi ai fost mai rapid decât de obicei.`,
  learningSwim: (n: string) => `Începi să înveți să înoți, ești bombă omule${n}!`,
  streak: (k: number, sport: CheerSport, n: string) => `A ${k}-a ședință de ${SPORT_WORD[sport]} în două săptămâni${n}. Asta e constanța care face rezultate.`,
};
const SPORT_WORD: Record<CheerSport, string> = { alergare: 'alergare', bicicleta: 'bicicletă', inot: 'înot', forta: 'forță', mers: 'mers' };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Mesajul pentru o ședință; null sub 60% sau fără date (nu se felicită ce nu s-a făcut). */
export function cheerFor(x: CheerInput): { title: string; text: string; tier: CheerTier } | null {
  const tier = cheerTier(x.ratio);
  if (!tier) return null;
  // Peste plan cu durere raportată (≥ 3/10): nicio laudă pentru depășire. Nu e un „fix”/„bine” fals (regula 26: mesajele
  // sunt adevărate), ci fără felicitare: cantitatea în plus cu durere nu e succes (auditul v93, A72/A92).
  if (tier === 'peste' && x.pain != null && x.pain >= CHEER_PAIN_NO_PRAISE) return null;
  const first = (x.name ?? '').trim().split(/\s+/)[0] ?? '';
  const n = first ? `, ${first}` : '';
  const h = hash(x.seed);
  const vars = { n, min: x.minutes ? `${x.minutes} de minute` : '', km: x.km ? `${x.km.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km` : '', k: x.nThisSport14 };
  // Mesajele cu dovezi au prioritate când dovada există (și execuția e bună), altfel lista sportului.
  let text: string;
  if (x.sport === 'inot' && (x.nSwimTotal ?? 99) <= 4 && tier !== 'bine') text = EXTRA.learningSwim(n);
  else if (x.improving && tier === 'fix' && (x.sport === 'alergare' || x.sport === 'bicicleta') && h % 2 === 0) text = EXTRA.improving(x.sport, n);
  else if (x.nThisSport14 >= 3 && tier !== 'peste' && h % 3 === 0) text = EXTRA.streak(x.nThisSport14, x.sport, n);
  else {
    const list = CHEERS[x.sport][tier];
    text = list[h % list.length]!(vars);
  }
  const title = tier === 'fix' ? 'Bifat ca la carte' : tier === 'peste' ? 'Peste plan' : 'Bine lucrat';
  return { title, text, tier };
}

/** Câte mesaje sunt în total (pentru raport/teste). */
export const CHEER_COUNT = Object.values(CHEERS).reduce((n, s) => n + s.fix.length + s.bine.length + s.peste.length, 0) + 3;

/** Felicitările în așteptare strânse într-una: textul celei mai recente, toate id-urile de marcat. */
export function aggregateCheers<T extends { w: { id: string }; c: { text: string } }>(list: T[]): { ids: string[]; text: string; n: number } | null {
  const first = list[0];
  return first ? { ids: list.map((x) => x.w.id), text: first.c.text, n: list.length } : null;
}
export const cheerKicker = (n: number) => (n <= 1 ? 'Antrenament finalizat' : `${n} antrenamente finalizate`);
