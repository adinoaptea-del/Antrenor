import { FITNESS_WEEKS, GOAL_LABEL, type Goal } from '@core/calendar/phases.js';
import { fitnessProfile, fitnessWeeks, type FitnessIntake } from '@core/strength/fitness.js';
import { BLOCK_LABEL } from '@core/strength/ppl.js';
import { addDays, diffDays } from '@core/util/dates.js';
import { useMe } from '../data/store';
import { colorOf } from '../data/model';
import { Card, Label, fmtDayMonth } from './common';

/** Săptămâna din programul de fitness (1…26), din prima zi a planului; 0 = programul n-a început. */
export function fitnessWeekOf(planStart: string | null | undefined, today: string): number {
  if (!planStart) return 0;
  const w = Math.floor(diffDays(planStart, today) / 7) + 1;
  return w < 1 ? 0 : Math.min(FITNESS_WEEKS, w);
}

/**
 * Progresul la fitness: unde e în program și ce a făcut din ce era planificat. Nu un procent de „corp ideal” și nu
 * kilograme promise; greutatea apare doar dacă a introdus-o ea, ca tendință.
 */
export function FitnessProgress({ compact = false, onOpen }: { compact?: boolean; onOpen?: (s: string) => void }) {
  const me = useMe();
  const goal = (me.user.goal ?? 'fit-tonifiere') as Goal;
  const f = ((me.forms.intake as { fitness?: FitnessIntake } | null)?.fitness ?? {}) as FitnessIntake;
  const week = fitnessWeekOf(me.planStart, me.today);
  const fw = week ? fitnessWeeks(fitnessProfile(goal, f))[week - 1] : null;
  const past = me.plan.filter((w) => w.type === 'forta' && w.date < me.today && w.status !== 'sters');
  const scored = past.filter((w) => colorOf(me, w) !== 'gri');
  const done = scored.filter((w) => ['verde', 'galben', 'portocaliu'].includes(colorOf(me, w))).length;
  const since4 = addDays(me.today, -28);
  const last4 = scored.filter((w) => w.date >= since4);
  const done4 = last4.filter((w) => ['verde', 'galben', 'portocaliu'].includes(colorOf(me, w))).length;
  const pct = week ? Math.round((week / FITNESS_WEEKS) * 100) : 0;

  return (
    <Card tight>
      <Label>{GOAL_LABEL[goal] ?? 'Fitness'}</Label>
      <div className="ready-head">
        <span className="num ready-num">{week || '—'}</span>
        <span className="unit">din {FITNESS_WEEKS} săptămâni</span>
        {fw && <span className="ready-leg">{BLOCK_LABEL[fw.block].toLowerCase()}</span>}
      </div>
      <div className="ready-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      {!week && me.planStart && <div className="small muted" style={{ marginTop: 10 }}>Programul începe {fmtDayMonth(me.planStart)}.</div>}
      {week > 0 && (
        <div className="small" style={{ marginTop: 10 }}>
          Ședințe de sală făcute: <b>{done}</b> din {scored.length}
          {last4.length && last4.length !== scored.length ? ` · ultimele 4 săptămâni: ${done4} din ${last4.length}` : ''}
        </div>
      )}
      {!compact && (
        <>
          {me.baseline.body?.greutate != null && (
            <div className="small" style={{ marginTop: 6 }}>
              Ultima greutate introdusă: <b>{me.baseline.body.greutate.toLocaleString('ro-RO')} kg</b> ({fmtDayMonth(me.baseline.body.data)}). Contează tendința pe câteva săptămâni, nu o zi.
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 8 }}>
            Progresul se vede în aceleași exerciții: mai multe repetări sau greutate la aceeași rezervă, energie și cum te miști. Cântărirea, circumferințele și pozele sunt opționale.
          </div>
          {onOpen && (
            <div className="wk-btns" style={{ marginTop: 10 }}>
              <button className="pill" onClick={() => onOpen('antrenament')}>
                Ședința următoare
              </button>
              <button className="pill" onClick={() => onOpen('corp')}>
                Greutate (opțional)
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
