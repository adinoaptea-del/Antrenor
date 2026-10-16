// Mementoul pentru analize: o dată la 3 zile de la chestionar, cât timp lipsesc analize valabile (mai noi de 12 luni).
import { insert, one } from './db.js';
import { loadLabs } from './collect.js';
import { diffDays } from '../../src/util/dates.js';

export const LABS_REMINDER =
  'Analizele tale lipsesc (sau sunt mai vechi de 12 luni). Planul merge și fără ele, dar nu e 100% pe corpul tău: nutriția, fierul și semnalele de alarmă vin doar din analize. Urcă-le din Date de bază → Analize de sânge (PDF sau poză).';

export async function labsReminder(userId: string, today: string): Promise<boolean> {
  if (await loadLabs(userId)) return false;
  const intake = await one<{ for_date: string }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.intrare' }, { order: 'for_date.asc' });
  if (!intake) return false;
  const days = diffDays(intake.for_date, today);
  if (days <= 0 || days % 3 !== 0) return false;
  await insert('messages', { user_id: userId, kind: 'avertisment', body: LABS_REMINDER, decision: null });
  return true;
}
