// Inversarea după vreme pe server (src/calendar/weather-swap.ts): prognoza pe 5 zile din orașul din profil. Se caută
// ORICE pereche de zile din fereastră (cel mult 3 zile distanță, cele mai apropiate întâi) în care una e frumoasă și
// cealaltă rea; acolo unde se poate, afară trece în ziua frumoasă și bazinul/sala în ziua rea. Unde nu se poate (zile
// ploioase la rând, nimic de inversat, regulile planului), totul rămâne cum e. O singură încercare pe pereche
// (agent_events „vreme:a:b”); sportivul vede inversarea pe Acasă (cardul „Vremea”), cu „Lasă-le cum erau”.
import { addDays, diffDays } from '../../src/util/dates.js';
import { weatherSwap } from '../../src/calendar/weather-swap.js';
import type { PlannedWorkout } from '../../src/types.js';
import { executedIds } from './agents.js';
import { loadForms, loadPlan, loadUser, toWorkoutRow } from './collect.js';
import { insert, insertIgnore, upsert } from './db.js';
import { currentAway, loadPrefs } from './prefs.js';
import { forecast } from './weather.js';

/** `from` = prima zi luată în calcul: azi (dimineața) sau mâine (seara). Întoarce mesajele inversărilor făcute. */
export async function weatherSwapFor(userId: string, today: string, from: 'azi' | 'maine'): Promise<string[]> {
  const u = (await loadUser(userId)) as { tz: string; city?: string | null; lat?: number | null; lon?: number | null };
  if (u.lat == null || u.lon == null || !u.city) return [];
  const fc = await forecast(u.city, u.lat, u.lon, u.tz || 'Europe/Bucharest');
  const start = from === 'azi' ? today : addDays(today, 1);
  const days = (fc?.zile ?? []).filter((d) => d.date >= start && d.date <= addDays(today, 4));
  if (days.length < 2) return [];
  const { planId, workouts } = await loadPlan(userId, addDays(today, -3), addDays(today, 10));
  if (!planId) return [];
  const [done, forms, prefs] = await Promise.all([executedIds(userId, today, workouts), loadForms(userId, today), loadPrefs(userId)]);
  const intake = forms.intake as { program?: { day: number; startMin: number; endMin: number }[]; bicicleta?: { tip?: string | null } } | null;
  const ctx = {
    done,
    fixed: prefs.fixe,
    away: currentAway(prefs, today),
    freeBlocks: Array.isArray(intake?.program) ? intake!.program : undefined,
    swimOutdoors: prefs.mediuInot === 'ape',
    noOutdoorBike: intake?.bicicleta?.tip === 'nu_am',
  };
  // Perechile: cele mai apropiate întâi (o zi distanță, apoi două, apoi trei), apoi cele mai devreme.
  const pairs: [number, number][] = [];
  for (const gap of [1, 2, 3]) for (let i = 0; i + gap < days.length; i++) pairs.push([i, i + gap]);
  let plan: PlannedWorkout[] = workouts;
  const texts: string[] = [];
  const at = new Date().toISOString();
  for (const [i, j] of pairs) {
    const a = days[i]!;
    const b = days[j]!;
    if (diffDays(a.date, b.date) > 3) continue;
    const r = weatherSwap(plan, a, b, today, at, ctx);
    if (!r) continue;
    const fresh = await insertIgnore('agent_events', { user_id: userId, event_key: `vreme:${a.date}:${b.date}` }, 'user_id,event_key');
    if (!fresh.length) continue;
    await upsert('workouts_planned', r.changed.map((w) => toWorkoutRow(w, userId, planId)), 'id');
    await insert('journal', { user_id: userId, date: today, entry: `calendar (vremea): ${r.text}` }).catch(() => undefined);
    // Ședințele inversate nu se mai ating în perechile următoare (nota „vremea”).
    plan = plan.map((w) => r.changed.find((c) => c.id === w.id) ?? w);
    texts.push(r.text);
  }
  return texts;
}
