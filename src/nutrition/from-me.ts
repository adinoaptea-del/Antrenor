// Intrările nutriționistului din datele pe care le vede sportivul (același plan, aceeași zi, aceeași restricție).
import type { Me } from '../api-types.js';
import { DEFAULT_PREFS, nutritionDay, type DaySession, type NutritionDay, type NutritionInput } from './engine.js';
import { addDays, diffDays, weekday } from '../util/dates.js';

export function nutritionInputFromMe(me: Me, date = me.today): NutritionInput {
  const intake = (me.forms.intake ?? {}) as { program?: { day: number; startMin: number }[]; fitness?: { sarcina?: string } };
  const starts = (intake.program ?? []).filter((b) => b.day === weekday(date)).map((b) => b.startMin).sort((a, b) => a - b);
  const sessions: DaySession[] = me.plan
    .filter((w) => w.date === date && (w.status === 'planificat' || w.status === 'mutat') && w.type !== 'odihna')
    .map((w, i) => ({ sport: w.sport, type: w.type, minutes: w.plannedMinutes, key: w.key, startMin: starts[i] ?? starts[0] ?? null }));
  const age = me.profile.birthYear ? Number(date.slice(0, 4)) - me.profile.birthYear : null;
  const body = me.baseline?.body ?? null;
  const tired = Object.values(me.outcomes ?? {}).filter((o) => o.motiv === 'oboseala' && diffDays(o.reportedAt.slice(0, 10), date) <= 7).length >= 2;
  const lvl = me.day?.level;
  return {
    date,
    athlete: { sex: me.profile.sex, age, heightCm: me.profile.heightCm, weightKg: body?.greutate ?? null, weightDate: body?.data ?? null },
    goal: me.user.goal ?? null,
    sessions,
    prefs: { ...DEFAULT_PREFS, ...(me.prefs?.nutritie ?? {}) },
    blockers: { restriction: date === me.today && (lvl === 'stop' || lvl === 'rosu') ? lvl : null, fatigue: tired, pregnancy: intake.fitness?.sarcina === 'da', minor: age != null && age < 18 },
  };
}

export function nutritionForMe(me: Me, date = me.today): NutritionDay {
  return nutritionDay(nutritionInputFromMe(me, date));
}

/** Rețetele din ultimele 4 zile (pentru alternative fără repetare). */
export function recentRecipes(me: Me, date = me.today): string[] {
  const out: string[] = [];
  for (let k = 1; k <= 4; k++) out.push(...nutritionForMe(me, addDays(date, -k)).meals.map((m) => m.recipe.id));
  return out;
}
