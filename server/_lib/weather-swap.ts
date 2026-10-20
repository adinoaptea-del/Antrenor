// Inversarea după vreme pe server (src/calendar/weather-swap.ts): prognoza pe 3 zile din orașul din profil, o singură
// încercare pe pereche de zile (agent_events „vreme:a:b”), ședințele schimbate se salvează, iar mesajul intră în jurnal.
// Sportivul vede inversarea pe Acasă (cardul „Vremea”), cu „Lasă-le cum erau”.
import { addDays } from '../../src/util/dates.js';
import { weatherSwap } from '../../src/calendar/weather-swap.js';
import { executedIds } from './agents.js';
import { loadForms, loadPlan, loadUser, toWorkoutRow } from './collect.js';
import { insert, insertIgnore, upsert } from './db.js';
import { currentAway, loadPrefs } from './prefs.js';
import { forecast } from './weather.js';

/** `first` = prima zi din pereche: azi (dimineața: azi ↔ mâine) sau mâine (seara: mâine ↔ poimâine). */
export async function weatherSwapFor(userId: string, today: string, first: 'azi' | 'maine'): Promise<string | null> {
  const u = (await loadUser(userId)) as { tz: string; city?: string | null; lat?: number | null; lon?: number | null };
  if (u.lat == null || u.lon == null || !u.city) return null;
  const a = first === 'azi' ? today : addDays(today, 1);
  const b = addDays(a, 1);
  const key = `vreme:${a}:${b}`;
  const fc = await forecast(u.city, u.lat, u.lon, u.tz || 'Europe/Bucharest');
  if (!fc) return null;
  const wa = first === 'azi' ? fc.azi : fc.maine;
  const wb = first === 'azi' ? fc.maine : fc.poimaine ?? null;
  const { planId, workouts } = await loadPlan(userId, addDays(today, -3), addDays(today, 7));
  if (!planId) return null;
  const [done, forms, prefs] = await Promise.all([executedIds(userId, today, workouts), loadForms(userId, today), loadPrefs(userId)]);
  const intake = forms.intake as { program?: { day: number; startMin: number; endMin: number }[]; bicicleta?: { tip?: string | null } } | null;
  const at = new Date().toISOString();
  const r = weatherSwap(workouts, { date: a, w: wa }, { date: b, w: wb }, today, at, {
    done,
    fixed: prefs.fixe,
    away: currentAway(prefs, today),
    freeBlocks: Array.isArray(intake?.program) ? intake!.program : undefined,
    swimOutdoors: prefs.mediuInot === 'ape',
    noOutdoorBike: intake?.bicicleta?.tip === 'nu_am',
  });
  if (!r) return null;
  // O singură inversare pe pereche de zile, chiar dacă cron-ul rulează de două ori.
  const fresh = await insertIgnore('agent_events', { user_id: userId, event_key: key }, 'user_id,event_key');
  if (!fresh.length) return null;
  await upsert('workouts_planned', r.changed.map((w) => toWorkoutRow(w, userId, planId)), 'id');
  await insert('journal', { user_id: userId, date: today, entry: `calendar (vremea): ${r.text}` }).catch(() => undefined);
  return r.text;
}
