// Inversarea după vreme (regula proprietarului, 20.10.2026): dacă într-o zi e vreme frumoasă și ai o ședință în sală
// sau la bazin, iar în ziua alăturată plouă și ai bicicletă sau alergare afară, cele două ședințe își schimbă zilele și
// sportivul e anunțat („Mâine e frumos: am inversat înotul cu bicicleta”). Și invers. Încărcarea săptămânii nu se
// schimbă (aceleași două ședințe, doar zilele), iar mutarea trece prin aceleași reguli ca „Mută” (actions.ts dayBlock).
// Determinist, fără AI. Prognoza: Open-Meteo (server/_lib/weather.ts).

import type { WeatherDay } from '../collector/types.js';
import type { PlannedWorkout, Sport } from '../types.js';
import { addDays, weekday } from '../util/dates.js';
import { dayBlock, withOriginal, type FixedMeet, type MoveCtx } from './actions.js';

export type WeatherVerdict = 'bun' | 'rau' | 'neutru';

/**
 * Vremea pentru sport afară, pe o zi. „Rău”: ploaie ≥ 3 mm, sau ≥ 1 mm cu probabilitate ≥ 70%, vânt ≥ 40 km/h, maxima
 * ≤ 2 °C sau resimțită ≥ 34 °C. „Bun”: sub 1 mm, probabilitate sub 40% (când se știe), vânt sub 30 km/h, 8–30 °C,
 * resimțită sub 31 °C. Între ele: neutru (nu se mută nimic). Date lipsă: null, nu ghicim.
 */
export function weatherVerdict(d: WeatherDay | null | undefined): WeatherVerdict | null {
  if (!d || d.ploaie_mm == null || d.tmax == null) return null;
  const rain = d.ploaie_mm;
  const prob = d.prob_ploaie ?? null;
  const wind = d.vant_kmh ?? 0;
  const feel = d.resimtita_max ?? d.tmax;
  if (rain >= 3 || (rain >= 1 && prob != null && prob >= 70) || wind >= 40 || d.tmax <= 2 || feel >= 34) return 'rau';
  if (rain < 1 && (prob == null || prob < 40) && wind < 30 && d.tmax >= 8 && d.tmax <= 30 && feel < 31) return 'bun';
  return 'neutru';
}

export const WEATHER_NOTE = 'vremea';
const DAY = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
const WHAT: Record<Sport, string> = { inot: 'înotul', bicicleta: 'bicicleta', alergare: 'alergarea', forta: 'sala', mers: 'mersul' };

export interface SwapCtx extends MoveCtx {
  /** Ședințe deja făcute (activitate legată): nu se mută. */
  done?: string[];
  /** Întâlnirile fixe (alergarea cu grupul): rămân în ziua lor. */
  fixed?: FixedMeet[];
  /** Înotul e în ape libere (prefs.mediuInot = 'ape'): atunci nu e „înăuntru”. */
  swimOutdoors?: boolean;
  /** Fără bicicletă de șosea (doar rolă): bicicleta nu e „afară”. */
  noOutdoorBike?: boolean;
}

const live = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';
/** Ce a ales sportivul sau ce a schimbat deja vremea nu se mai atinge automat. */
const touchable = (w: PlannedWorkout, ctx: SwapCtx) =>
  live(w) &&
  !(ctx.done ?? []).includes(w.id) &&
  !/^(mutată de tine|pusă înapoi|vremea)/.test(w.note ?? '') &&
  !/TEST/i.test(w.structure ?? '') &&
  !(ctx.fixed ?? []).some((f) => f.zi === weekday(w.date) && f.sport === w.sport);
const outdoor = (w: PlannedWorkout, ctx: SwapCtx) => (w.sport === 'bicicleta' && !ctx.noOutdoorBike) || w.sport === 'alergare';
const indoor = (w: PlannedWorkout, ctx: SwapCtx) => w.sport === 'forta' || (w.sport === 'inot' && !ctx.swimOutdoors && !/ape libere/i.test(w.structure ?? ''));

/** „azi”, „mâine”, „poimâine”, altfel ziua săptămânii. */
export function dayWord(d: string, today: string): string {
  return d === today ? 'azi' : d === addDays(today, 1) ? 'mâine' : d === addDays(today, 2) ? 'poimâine' : DAY[weekday(d)]!;
}
const describe = (d: WeatherDay, v: WeatherVerdict) => {
  const t = d.tmax != null ? `${Math.round(d.tmax)}°` : '';
  if (v === 'bun') return `${t}, fără ploaie`;
  const bits = [d.ploaie_mm != null && d.ploaie_mm >= 1 ? `ploaie (${Math.round(d.ploaie_mm)} mm)` : null, d.vant_kmh != null && d.vant_kmh >= 40 ? `vânt puternic (${Math.round(d.vant_kmh)} km/h)` : null, d.tmax != null && d.tmax <= 2 ? `frig (${t})` : null, (d.resimtita_max ?? -99) >= 34 ? `caniculă (${Math.round(d.resimtita_max!)}° resimțit)` : null].filter(Boolean);
  return bits.join(' și ') || 'vreme rea';
};

export interface WeatherSwap {
  changed: PlannedWorkout[];
  /** Mesajul pentru sportiv. */
  text: string;
}

/**
 * Pentru două zile alăturate (a, b) cu prognoza lor: dacă una e „rea” și cealaltă „bună”, caută o ședință afară în ziua
 * rea și una înăuntru în ziua bună și le schimbă zilele, dacă ambele mutări respectă regulile planului. Cel mult o
 * inversare pe pereche de zile; prima încercată e ședința de afară cea mai lungă.
 */
export function weatherSwap(plan: PlannedWorkout[], a: { date: string; w: WeatherDay | null }, b: { date: string; w: WeatherDay | null }, today: string, at: string, ctx: SwapCtx = {}): WeatherSwap | null {
  const va = weatherVerdict(a.w);
  const vb = weatherVerdict(b.w);
  if (!va || !vb) return null;
  const bad = va === 'rau' && vb === 'bun' ? a : vb === 'rau' && va === 'bun' ? b : null;
  const good = bad === a ? b : bad === b ? a : null;
  if (!bad || !good || bad.date < today || good.date < today) return null;
  const outs = plan.filter((w) => w.date === bad.date && touchable(w, ctx) && outdoor(w, ctx)).sort((x, y) => y.plannedMinutes - x.plannedMinutes);
  const ins = plan.filter((w) => w.date === good.date && touchable(w, ctx) && indoor(w, ctx)).sort((x, y) => y.plannedMinutes - x.plannedMinutes);
  for (const o of outs) {
    for (const i of ins) {
      const after = plan.map((w) => (w.id === o.id ? { ...w, date: good.date } : w.id === i.id ? { ...w, date: bad.date } : w));
      const oNew = after.find((w) => w.id === o.id)!;
      const iNew = after.find((w) => w.id === i.id)!;
      if (dayBlock(after.filter((w) => w.id !== o.id), oNew, good.date, ctx)) continue;
      if (dayBlock(after.filter((w) => w.id !== i.id), iNew, bad.date, ctx)) continue;
      const why = `${DAY[weekday(good.date)]} frumos (${describe(good.w!, 'bun')}), ${DAY[weekday(bad.date)]} ${describe(bad.w!, 'rau')}`;
      const changed = [
        withOriginal(o, { ...o, date: good.date, note: `${WEATHER_NOTE}: ${why}; inversată cu ${WHAT[i.sport]}` }, at),
        withOriginal(i, { ...i, date: bad.date, note: `${WEATHER_NOTE}: ${why}; inversată cu ${WHAT[o.sport]}` }, at),
      ];
      const G = dayWord(good.date, today);
      const B = dayWord(bad.date, today);
      const place = i.sport === 'inot' ? 'înotul din bazin' : 'sala';
      const text = `${G[0]!.toUpperCase()}${G.slice(1)} e vreme frumoasă (${describe(good.w!, 'bun')}), iar ${B} se anunță ${describe(bad.w!, 'rau')}: am inversat ${place} cu ${WHAT[o.sport]}, ca să te poți bucura de vremea bună. ${WHAT[o.sport][0]!.toUpperCase()}${WHAT[o.sport].slice(1)} e ${G}, ${place} ${B}.`;
      return { changed, text };
    }
  }
  return null;
}

/** „Lasă-le cum erau”: cele două ședințe inversate de vreme revin în zilele lor (dacă ziua n-a trecut). */
export function undoWeatherSwap(plan: PlannedWorkout[], id: string, today: string, at: string): PlannedWorkout[] {
  const w = plan.find((x) => x.id === id);
  if (!w || !(w.note ?? '').startsWith(WEATHER_NOTE) || !w.original) throw new Error('ședința n-a fost mutată de vreme');
  const partner = plan.find((x) => x.id !== w.id && (x.note ?? '').startsWith(WEATHER_NOTE) && x.original?.date === w.date && x.date === w.original!.date);
  const back = (x: PlannedWorkout) => {
    if (x.original!.date < today) throw new Error('ziua inițială a trecut');
    return withOriginal(x, { ...x, date: x.original!.date, note: 'pusă înapoi în ziua din plan' }, at);
  };
  return partner ? [back(w), back(partner)] : [back(w)];
}
