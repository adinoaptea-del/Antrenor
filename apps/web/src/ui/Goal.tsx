import { GOAL_NAME } from '@core/bar/sport-readiness.js';
import type { Goal as GoalId } from '@core/calendar/phases.js';
import type { Sport } from '@core/types.js';
import { useMe } from '../data/store';
import { RaceDetail } from './RaceReady';
import { BadgesTeaser, NewBadge } from './Badges';
import { FitnessProgress } from './FitnessProgress';
import { goalKind } from '@core/calendar/phases.js';

/** Evoluție → Obiectiv: reperele cursei (separat de starea zilei), apoi realizările. */
export function Goal({ onOpen }: { onOpen: (s: string, o?: { sport?: Sport }) => void }) {
  const me = useMe();
  const goalName = me.user.goal && me.user.goal in GOAL_NAME ? GOAL_NAME[me.user.goal as GoalId] : 'cursă';
  return (
    <div className="stack">
      {goalKind(me.user.goal) === 'fitness' ? <FitnessProgress onOpen={onOpen} /> : me.raceReady ? <RaceDetail goalName={goalName} onOpen={onOpen} /> : <section className="card"><p className="small muted">Reperele apar după chestionarul de intrare și primele activități sincronizate.</p></section>}
      <NewBadge onOpen={onOpen} />
      <BadgesTeaser onOpen={onOpen} />
    </div>
  );
}
