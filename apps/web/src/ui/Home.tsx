import { GOAL_NAME } from '@core/bar/sport-readiness.js';
import { FITNESS_WEEKS, goalKind, type Goal } from '@core/calendar/phases.js';
import { FitnessProgress, fitnessWeekOf } from './FitnessProgress';
import type { Sport } from '@core/types.js';
import { addDays, weekday } from '@core/util/dates.js';
import { Icons, fmtDayMonth } from './common';
import { SyncButton } from './SyncButton';
import { useMe } from '../data/store';
import { DAY_NAMES, SPORT_LABEL, colorOf, daysToRace, fmtMinutes, lastDoneWorkout, workoutsOn } from '../data/model';
import { eveningComplete, morningComplete } from '../forms/types';
import type { MorningForm } from '../forms/types';
import { Today } from './Today';
import { useWorkoutSheet } from './WorkoutSheet';
import { RacePanel } from './RaceReady';
import { AppHeader } from './Shell';
import { fmtTime } from '@core/goals/run-target.js';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const longDate = (iso: string) => `${DAY_NAMES[weekday(iso)]!.replace(/^./, (c) => c.toUpperCase())}, ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/**
 * Acasă: o singură decizie pentru azi și un singur buton principal; apoi ce urmează și reperele cursei.
 * Realizările stau în Evoluție, detaliile pe sport în Plan.
 */
export function Home({ onOpen }: { onOpen: (screen: string, opts?: { sport?: Sport; activityId?: string }) => void }) {
  const me = useMe();
  const morning = me.forms.morning as MorningForm | null;
  const lastDone = lastDoneWorkout(me);
  const lastDoneAct = lastDone ? me.activities.find((a) => a.sport === lastDone.sport && (a.date === lastDone.date || a.date > lastDone.date) && !a.unplanned) : null;
  const lastDoneId = lastDoneAct?.id ?? (lastDone ? `plan-${lastDone.id}` : null);
  const evening = lastDoneId ? me.forms.evening[lastDoneId] : undefined;
  const days = daysToRace(me);
  const fit = goalKind(me.user.goal) === 'fitness';
  const fitWeek = fitnessWeekOf(me.planStart, me.today);
  const goalName = me.user.goal && me.user.goal in GOAL_NAME ? GOAL_NAME[me.user.goal as Goal] : 'cursă';
  const yesterday = addDays(me.today, -1);
  const dayLabel = (d: string) => (d === me.today ? 'azi' : d === yesterday ? 'ieri' : `${DAY_NAMES[weekday(d)]}`);
  const hour = new Date().getHours();
  const todayUpcoming = workoutsOn(me, me.today).filter((w) => w.type !== 'odihna' && colorOf(me, w) === 'asteptare' && w.status !== 'anulat_sistem');

  // Un singur buton principal, în ordinea în care contează pentru decizia de azi.
  const cta: { label: string; go: () => void } | null =
    !morningComplete(morning ?? undefined) && hour >= 4 && hour < 14
      ? { label: 'Cum te simți?', go: () => onOpen('dimineata') }
      : lastDone && lastDoneId && !eveningComplete(evening)
        ? { label: `Cum a fost ${SPORT_LABEL[lastDone.sport].toLowerCase()} ${dayLabel(lastDone.date)}?`, go: () => onOpen('seara', { activityId: lastDoneId }) }
        : todayUpcoming.length
          ? { label: 'Vezi ședința în plan', go: () => onOpen('calendar') }
          : { label: 'De ce? Întreabă antrenorul', go: () => onOpen('antrenor') };

  const { open: openSheet, sheet } = useWorkoutSheet();
  const next = me.plan
    .filter((w) => (w.status === 'planificat' || w.status === 'mutat') && w.date > me.today && w.type !== 'odihna')
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    <>
      <AppHeader name={me.user.name} onProfile={() => onOpen('profil')} right={<SyncButton compact />} />
      <div className="hello">
        <h1>Salut, {(me.user.name || 'sportivule').split(' ')[0]}.</h1>
        <p>{longDate(me.today)}</p>
        {fit && me.user.raceDate && (
          <div className="race-chip">
            <b>{fitWeek ? `săpt. ${fitWeek}` : 'start'}</b>
            <span>
              {goalName} · {fitWeek ? `din ${FITNESS_WEEKS}` : `de luni, ${fmtDayMonth(me.planStart ?? me.today)}`}
            </span>
          </div>
        )}
        {!fit && me.user.raceDate && (
          <div className="race-chip">
            <b>{days} zile</b>
            <span>
              {me.user.raceName ?? goalName}
              {me.raceReady?.target ? ` · țintă ${fmtTime(me.raceReady.target.targetSec)}` : ''} · {fmtDayMonth(me.user.raceDate)} {me.user.raceDate.slice(0, 4)}
            </span>
          </div>
        )}
      </div>

      {sheet}
      <div className="stack">
        {!me.intakeComplete && (
          <button className="row-card todo" onClick={() => onOpen('intake')}>
            <span>
              <b>Chestionarul de intrare</b>
              <small>3 minute · fără el nu există plan</small>
            </span>
            {Icons.chevronRight}
          </button>
        )}

        <Today onOpen={onOpen} cta={cta} />

        {next && (
          <button className="row-card" onClick={() => openSheet(next)}>
            <span>
              <small className="eyebrow">
                Urmează · {DAY_NAMES[weekday(next.date)]}, {fmtDayMonth(next.date)}
              </small>
              <b>
                {SPORT_LABEL[next.sport]} · {fmtMinutes(next.plannedMinutes)}
              </b>
            </span>
            {Icons.chevronRight}
          </button>
        )}

        {fit ? <FitnessProgress compact /> : <RacePanel goalName={goalName} onOpen={onOpen} />}

        {weekday(me.today) === 6 && !me.forms.weeklyDone && me.intakeComplete && (
          <button className="row-card" onClick={() => onOpen('saptamanal')}>
            <span>
              <b>Check-in-ul săptămânii</b>
              <small>3 întrebări despre săptămâna care se încheie</small>
            </span>
            {Icons.chevronRight}
          </button>
        )}

        {me.intakeComplete && (!me.profile.sex || !me.profile.birthYear || !me.profile.heightCm) && (
          <button className="row-card" onClick={() => onOpen('profil')}>
            <span>
              <b>Completează sexul, vârsta și înălțimea</b>
              <small>Contează pentru analize, nutriție și recuperare.</small>
            </span>
            {Icons.chevronRight}
          </button>
        )}

        {me.intakeComplete && (!me.baseline.labs || me.baseline.labs.expirat) && (
          <button className="row-card" onClick={() => onOpen('analize')}>
            <span>
              <b>{me.baseline.labs?.expirat ? 'Analizele au peste 12 luni' : 'Lipsesc analizele de sânge'}</b>
              <small>Urcă-le ca PDF sau poză; planul le folosește după regulile de siguranță.</small>
            </span>
            {Icons.chevronRight}
          </button>
        )}

        {me.warnings.map((w) => (
          <section key={w.title} className="card note-card">
            <b>{w.title}</b>
            <p className="small">{w.text}</p>
            <p className="small muted">Corecția: {w.fix}</p>
          </section>
        ))}
      </div>
    </>
  );
}
