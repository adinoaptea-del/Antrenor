// Istoricul: la conectare se aduc doar ultimele 5 săptămâni. Aici, o singură dată pe sursă, se aduce tot istoricul
// disponibil (Strava: 24 de luni, rezumatele; WHOOP: tot ce are). Nu suprascrie nimic din ce există deja (detaliile
// citite, corecturile sportivului): rândurile vechi se adaugă doar dacă lipsesc.
import { insertIgnore, remove } from './db.js';
import { accessToken, connectedProviders } from './tokens.js';
import { activityRow, pullStrava, pullWhoop, wellnessRow } from './sync.js';
import { claimEvent } from './agents.js';

const DAYS = { strava: 730, whoop: 730 } as const;

export async function importHistory(userId: string): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const row of await connectedProviders(userId)) {
    const p = row.provider;
    if (p !== 'strava' && p !== 'whoop') continue;
    if (!(await claimEvent(userId, `istoric:v1:${p}`))) continue;
    try {
      const token = await accessToken(userId, p);
      if (!token) throw new Error('fără token');
      if (p === 'strava') {
        const { activities, others } = await pullStrava(token, DAYS.strava);
        const a = await insertIgnore('activities', activities.map((x) => activityRow(userId, x)), 'id');
        await insertIgnore('other_activities', others.map((o) => ({ id: o.id, user_id: userId, source: o.source, external_id: o.externalId, date: o.date, start_local: o.startLocal, kind: o.kind, name: o.name, minutes: o.minutes, avg_hr: o.avgHr, max_hr: o.maxHr })), 'id').catch(() => []);
        out.strava = a.length;
      } else {
        const { wellness, activities, others } = await pullWhoop(userId, token, DAYS.whoop);
        const w = await insertIgnore('wellness_daily', wellness.map((x) => wellnessRow(userId, x)), 'user_id,date,source');
        const a = await insertIgnore('activities', activities.map((x) => activityRow(userId, x)), 'id');
        await insertIgnore('other_activities', others.map((o) => ({ id: o.id, user_id: userId, source: o.source, external_id: o.externalId, date: o.date, start_local: o.startLocal, kind: o.kind, name: o.name, minutes: o.minutes, avg_hr: o.avgHr, max_hr: o.maxHr })), 'id').catch(() => []);
        out.whoop = w.length + a.length;
      }
    } catch (e) {
      // Se reîncearcă la rularea următoare.
      await remove('agent_events', { user_id: `eq.${userId}`, event_key: `eq.istoric:v1:${p}` }).catch(() => undefined);
      out[p] = `eroare: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return out;
}
