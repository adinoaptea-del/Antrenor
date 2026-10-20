// Intrările nutriționistului din datele pe care le vede sportivul (același plan, aceeași zi, aceeași restricție).
// Aceleași funcții pure (daySessions, labIndications) sunt folosite și de server (collect.ts), ca ecranul și pachetul AI
// să pornească din aceleași ședințe.
import type { Me } from '../api-types.js';
import type { PlannedWorkout } from '../types.js';
import { brickSplit, BRICK_TRANSITION_MIN } from '../calendar/coherence.js';
import { DEFAULT_PREFS, nutritionDay, type DaySession, type NutritionDay, type NutritionInput } from './engine.js';
import { loggedPicks } from './log.js';
import { addDays, diffDays, weekday } from '../util/dates.js';

type PlanLike = Pick<PlannedWorkout, 'date' | 'sport' | 'type' | 'plannedMinutes' | 'key' | 'status'> & { id?: string; structure?: string | null };
type ActivityLike = { date: string; sport: string; minutes: number; startLocal?: string | null };

const hm = (s: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Ședințele zilei pentru necesarul de energie (auditul v93, A77 / T57): ședința făcută intră cu durata reală (din
 * activitate), chiar dacă statusul din plan a rămas „planificat” sau a fost anulat de sistem; efortul neplanificat intră
 * și el; ședința planificată și încă nefăcută intră cu durata din plan. O activitate se leagă doar de ședința din aceeași
 * zi și același sport (regula 28). Brick-ul se împarte ca în calendar (brickSplit: bicicletă + tranziție + alergare), cu
 * o singură fereastră de efort pentru alimentare.
 * `starts` = începuturile blocurilor libere din programul declarat (ora presupusă, nu ora reală).
 */
export function daySessions(plan: PlanLike[], activities: ActivityLike[], date: string, starts: number[]): DaySession[] {
  const todays = plan.filter((w) => w.date === date && w.status !== 'sters' && w.type !== 'odihna');
  type Part = { s: DaySession; active: boolean };
  const parts: Part[] = [];
  todays.forEach((w, i) => {
    const active = w.status === 'planificat' || w.status === 'mutat';
    const start = starts[i] ?? starts[0] ?? null;
    const src = start != null ? ('program' as const) : null;
    if (w.type === 'brick') {
      const { bike, run, transition } = brickSplit(w.structure, w.plannedMinutes);
      const window = `brick-${w.id ?? i}`;
      parts.push({ active, s: { sport: 'bicicleta', type: 'brick', minutes: bike, key: w.key, startMin: start, startSource: src, window } });
      parts.push({ active, s: { sport: 'alergare', type: 'brick', minutes: run, key: w.key, startMin: start != null ? start + bike + (transition ?? BRICK_TRANSITION_MIN) : null, startSource: src, window } });
      return;
    }
    parts.push({ active, s: { sport: w.sport, type: w.type, minutes: w.plannedMinutes, key: w.key, startMin: start, startSource: src } });
  });
  const acts = activities.filter((a) => a.date === date && a.minutes > 0).map((a, k) => ({ a, k })).sort((x, y) => (hm(x.a.startLocal) ?? 1e9) - (hm(y.a.startLocal) ?? 1e9) || x.k - y.k).map((x) => x.a);
  const used = new Set<number>();
  const out: DaySession[] = [];
  for (const p of parts) {
    const k = acts.findIndex((a, j) => !used.has(j) && a.sport === p.s.sport);
    if (k >= 0) {
      used.add(k);
      const a = acts[k]!;
      const st = hm(a.startLocal);
      out.push({ ...p.s, minutes: a.minutes, done: true, ...(st != null ? { startMin: st, startSource: 'activitate' as const } : {}) });
    } else if (p.active) out.push({ ...p.s, done: false });
  }
  acts.forEach((a, j) => {
    if (used.has(j)) return;
    const st = hm(a.startLocal);
    out.push({ sport: a.sport, type: 'activitate', minutes: a.minutes, done: true, startMin: st, startSource: st != null ? 'activitate' : null });
  });
  return out;
}

/**
 * Indicațiile pentru fier / vitamina D (auditul v93, A80): doar o valoare sub intervalul laboratorului (buletin valabil)
 * sau declarația sportivului că medicul i-a recomandat — niciodată din sex.
 */
export function labIndications(rows: { nume: string; sub: boolean }[], declared?: { iron?: boolean; vitaminD?: boolean } | null): { iron: boolean; vitaminD: boolean } {
  const low = (re: RegExp) => rows.some((r) => r.sub && re.test(r.nume));
  return { iron: low(/feritin/i) || declared?.iron === true, vitaminD: low(/vitamin[ae]?\s*d|25[\s-]*oh/i) || declared?.vitaminD === true };
}

export function nutritionInputFromMe(me: Me, date = me.today): NutritionInput {
  const intake = (me.forms.intake ?? {}) as { program?: { day: number; startMin: number }[]; fitness?: { sarcina?: string }; sarcina?: string };
  const starts = (intake.program ?? []).filter((b) => b.day === weekday(date)).map((b) => b.startMin).sort((a, b) => a - b);
  const sessions = daySessions(me.plan, me.activities ?? [], date, starts);
  const age = me.profile.birthYear ? Number(date.slice(0, 4)) - me.profile.birthYear : null;
  const body = me.baseline?.body ?? null;
  const tired = Object.values(me.outcomes ?? {}).filter((o) => o.motiv === 'oboseala' && diffDays(o.reportedAt.slice(0, 10), date) <= 7).length >= 2;
  const lvl = me.day?.level;
  const prefs = { ...DEFAULT_PREFS, ...(me.prefs?.nutritie ?? {}) };
  const lf = me.baseline?.labs ?? null;
  const labs = lf && !lf.expirat ? (lf.alte ?? []).map((x) => ({ nume: x.nume, sub: x.in_afara === 'sub' })) : [];
  return {
    date,
    athlete: { sex: me.profile.sex, age, heightCm: me.profile.heightCm, weightKg: body?.greutate ?? null, weightDate: body?.data ?? null },
    goal: me.user.goal ?? null,
    athleteId: me.user.id,
    sessions,
    prefs,
    indications: labIndications(labs, prefs.indications),
    blockers: { restriction: date === me.today && (lvl === 'stop' || lvl === 'rosu' || lvl === 'galben') ? lvl : null, fatigue: tired, pregnancy: intake.fitness?.sarcina === 'da' || intake.sarcina === 'da', minor: age != null && age < 18 },
  };
}

export function nutritionForMe(me: Me, date = me.today): NutritionDay {
  return nutritionDay(nutritionInputFromMe(me, date));
}

/** Rețetele din ultimele 4 zile (pentru alternative fără repetare): din jurnal când există, altfel calculate. */
export function recentRecipes(me: Me, date = me.today): string[] {
  const log = me.prefs?.nutritie?.log;
  const out: string[] = [];
  for (let k = 1; k <= 4; k++) {
    const d = addDays(date, -k);
    const logged = loggedPicks(log, d);
    out.push(...(logged ? (Object.values(logged) as string[]) : nutritionForMe(me, d).meals.map((m) => m.recipe.id)));
  }
  return out;
}
