// Ștergerea unei activități importate (auditul consolidat 22.10.2026, C2). Cu schema 13, scorul legat de activitate
// păstrează rândul cu legătura NULL (on delete set null), iar aici scorurile se recalculează imediat: ședința nu mai
// rămâne „făcută”, iar încărcarea, aderența și progresia nu mai numără activitatea. Erorile nu se mai înghit.
import { remove } from './db.js';
import { loadUser } from './collect.js';
import { rescore } from './score.js';

export async function deleteActivities(userId: string, ids: string[], today: string): Promise<{ removed: number }> {
  if (!ids.length) return { removed: 0 };
  const list = `in.(${ids.map((i) => `"${i.replace(/"/g, '')}"`).join(',')})`;
  // Pe o schemă sub 13 (FK fără „on delete”), o activitate cu scor dă eroare aici: o lăsăm să urce, vizibilă.
  await remove('activities', { user_id: `eq.${userId}`, id: list });
  await remove('other_activities', { user_id: `eq.${userId}`, id: list });
  const u = await loadUser(userId);
  const goal = u.goal && u.goal !== 'full' ? u.goal : '70.3';
  await rescore(userId, today, goal);
  return { removed: ids.length };
}
