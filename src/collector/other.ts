// Activitățile care nu sunt înot, bicicletă, alergare sau forță: recuperarea (saună, baie rece, yoga, stretching,
// masaj, respirație, meditație) și mișcarea în plus (plimbări, drumeții, alte sporturi). Intră în pachet:
// recuperarea face parte din antrenament, iar mișcarea în plus se adună la oboseală.

export type OtherKind = 'recuperare' | 'activ';

export interface OtherActivity {
  id: string;
  source: string;
  externalId: string;
  date: string;
  startLocal: string | null;
  kind: OtherKind;
  /** Numele normalizat: „saună”, „baie rece”, „yoga”, „plimbare” … sau numele primit de la brățară. */
  name: string;
  minutes: number;
  avgHr: number | null;
  maxHr: number | null;
}

const RECOVERY: [RegExp, string][] = [
  [/sauna|saun/i, 'saună'],
  [/ice ?bath|cold ?(plunge|water|shower|exposure)|cryo|baie rece/i, 'baie rece'],
  [/yoga|pilates/i, 'yoga'],
  [/stretch|flexib|mobility|mobilitate|foam/i, 'stretching'],
  [/massage|masaj/i, 'masaj'],
  [/breath|respira/i, 'respirație'],
  [/meditat|mind ?and ?body|mindful/i, 'meditație'],
  [/steam/i, 'saună umedă'],
  [/walk|plimb|natur/i, 'plimbare'],
  [/cool ?down|recovery|recuperare|hot ?tub/i, 'recuperare'],
];

const ACTIVE: [RegExp, string][] = [
  [/hik|drume/i, 'drumeție'],
  [/tennis|padel|squash|badminton|pickleball/i, 'sport cu racheta'],
  [/soccer|football|fotbal|basket|volley|handball/i, 'sport de echipă'],
  [/ski|snowboard/i, 'schi'],
  [/row|kayak|canoe|paddle|sup\b/i, 'canotaj / caiac'],
  [/climb|bouldering/i, 'cățărare'],
  [/dance|dans/i, 'dans'],
  [/box|martial|mma|kickbox|jiu/i, 'sport de contact'],
  [/elliptical|stair|step/i, 'cardio la aparate'],
  [/golf/i, 'golf'],
];

export function classifyOther(rawName: string): { kind: OtherKind; name: string } | null {
  const n = rawName.replace(/_/g, ' ').trim();
  if (!n) return null;
  for (const [re, name] of RECOVERY) if (re.test(n)) return { kind: 'recuperare', name };
  for (const [re, name] of ACTIVE) if (re.test(n)) return { kind: 'activ', name };
  // Orice altă activitate înregistrată e mișcare în plus, cu numele primit.
  if (/^activity$|^other$|^altul$/i.test(n)) return null;
  return { kind: 'activ', name: n.toLowerCase() };
}
