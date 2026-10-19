// Capacitatea la înot (cât înoată fără oprire), cu proveniența ei (auditul v2, V2-04). Necunoscut rămâne null: o valoare
// implicită a produsului nu e declarația sportivului și nu dovedește capacitatea (nu deblochează eligibilitate, progres
// sau ape libere).
//  - measured: cea mai lungă porțiune continuă înregistrată de ceas (lungimile din ultimele 8 săptămâni), sau testul CSS
//    (400 m înotați fără oprire);
//  - user_reported: ce a declarat în chestionar;
//  - null: nu știm — ședința devine familiarizare / evaluare, nu „50 m demonstrați”.

import { addDays } from '../util/dates.js';

export type Provenance = 'measured' | 'user_reported' | 'estimated' | 'product_default';
export interface SwimCapacity {
  meters: number | null;
  source: Provenance | null;
  /** De unde vine, pentru afișare („ceasul, 12.10”, „chestionar”, „test CSS”). */
  detail: string | null;
}

export function swimCapacity(input: {
  declaredM: number | null | undefined;
  css?: number | null;
  activities?: { date: string; sport: string; details?: { continuousM?: number | null } | null }[];
  today: string;
}): SwimCapacity {
  const from = addDays(input.today, -56);
  const measured = (input.activities ?? []).filter((a) => a.sport === 'inot' && a.date >= from && a.date <= input.today && (a.details?.continuousM ?? 0) > 0);
  const best = measured.reduce<{ m: number; date: string } | null>((b, a) => (!b || a.details!.continuousM! > b.m ? { m: a.details!.continuousM!, date: a.date } : b), null);
  if (best && (input.css == null || best.m >= 400)) return { meters: best.m, source: 'measured', detail: `ceasul, ${best.date}` };
  if (input.css != null) return { meters: Math.max(400, best?.m ?? 0), source: 'measured', detail: 'testul CSS (400 m fără oprire)' };
  if (input.declaredM != null) return { meters: input.declaredM, source: 'user_reported', detail: 'declarat în chestionar' };
  return { meters: null, source: null, detail: null };
}
