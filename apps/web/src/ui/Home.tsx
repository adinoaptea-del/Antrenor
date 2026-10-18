import { GOAL_NAME } from '@core/bar/sport-readiness.js';
import { FITNESS_WEEKS, goalKind, type Goal } from '@core/calendar/phases.js';
import { fitnessWeekOf } from './FitnessProgress';
import type { PlannedWorkout, Sport } from '@core/types.js';
import { sessionName } from '@core/strength/ppl.js';
import { swimSet } from '@core/calendar/session-steps.js';
import { addDays, weekday } from '@core/util/dates.js';
import { Icons, fmtDayMonth } from './common';
import { SyncButton } from './SyncButton';
import { useMe } from '../data/store';
import { DAY_NAMES, SPORT_LABEL, colorOf, dayOf, daysToRace, fmtMinutes, isUpcoming, lastDoneWorkout, workoutsOn } from '../data/model';
import { eveningComplete, morningComplete } from '../forms/types';
import type { MorningForm } from '../forms/types';
import { AptQuestion, StateLine } from './Today';
import { Orb } from './Orb';
import { useWorkoutSheet } from './WorkoutSheet';
import { AppHeader } from './Shell';
import { fmtTime } from '@core/goals/run-target.js';


const PLAIN: Record<PlannedWorkout['type'], string> = { z2: 'ușor', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă', brick: 'bicicletă + alergare', forta: 'forță', odihna: 'odihnă' };

/** Numele ședinței în bulă: la forță numele sesiunii din program, altfel sportul. */
const titleOf = (w: PlannedWorkout) => (w.type === 'forta' ? sessionName(w.structure) ?? 'Forță' : w.type === 'brick' ? 'Bicicletă + alergare' : SPORT_LABEL[w.sport]);
const subOf = (w: PlannedWorkout, css: number | null = null) =>
  w.sport === 'inot' && w.type !== 'odihna'
    ? (() => {
        const s = swimSet({ type: w.type, minutes: w.plannedMinutes, css, date: w.date });
        return `${s.meters} m · ≈ ${s.estMin} min · ${PLAIN[w.type]}`;
      })()
    : [fmtMinutes(w.plannedMinutes), w.type === 'forta' || w.type === 'brick' ? null : PLAIN[w.type], w.targetZones.length ? `Z${w.targetZones.join('–')}` : null].filter(Boolean).join(' · ');

/**
 * Azi: bula cu ședințele reale ale zilei (din planul activ). Apăsarea deschide direct fereastra cu detaliile, pe prima
 * ședință rămasă; cu mai multe ședințe, sus în fereastră alegi între ele. Sub bulă, separat: un singur buton principal,
 * starea de azi și progresul către obiectiv. Bula nu e procent și nu e culoarea recuperării.
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
  const { open: openSheet, sheet, isOpen } = useWorkoutSheet(onOpen);

  const day = dayOf(me);
  const paused = !!day && (day.level === 'rosu' || day.level === 'stop');
  const today = workoutsOn(me, me.today).filter((w) => w.type !== 'odihna');
  const isDone = (w: PlannedWorkout) => !isUpcoming(me, w) && w.status !== 'anulat_sistem' && colorOf(me, w) !== 'asteptare';
  const remaining = today.filter((w) => !isDone(w) && w.status !== 'anulat_sistem');
  const allDone = today.length > 0 && remaining.length === 0 && today.some(isDone);
  const next = me.plan
    .filter((w) => (w.status === 'planificat' || w.status === 'mutat') && w.date > me.today && w.type !== 'odihna')
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const openToday = () => (today.length ? openSheet(remaining[0] ?? today[0]!, today) : next ? openSheet(next) : onOpen('calendar'));

  // Un singur buton principal, în ordinea în care contează azi.
  const cta: { label: string; go: () => void } | null =
    !me.intakeComplete
      ? { label: 'Completează chestionarul', go: () => onOpen('intake') }
      : !morningComplete(morning ?? undefined) && hour >= 4 && hour < 14 && !day?.ask
        ? { label: 'Cum te simți?', go: () => onOpen('dimineata') }
        : lastDone && lastDoneId && !eveningComplete(evening)
          ? { label: `Cum a fost ${SPORT_LABEL[lastDone.sport].toLowerCase()} ${dayLabel(lastDone.date)}?`, go: () => onOpen('seara', { activityId: lastDoneId }) }
          : remaining.length && !paused
            ? { label: remaining.length > 1 ? 'Vezi antrenamentele' : 'Vezi antrenamentul', go: openToday }
            : null;

  const shown = today.slice(0, 3);
  const eyebrow = fit ? `Programul de fitness${fitWeek ? ` · săpt. ${fitWeek} din ${FITNESS_WEEKS}` : ''}` : me.user.raceDate ? `Pregătire pentru ${me.user.raceName ?? goalName}` : 'Antrenamentul tău';

  let orbBody: JSX.Element;
  let orbLabel: string;
  if (!me.intakeComplete) {
    orbBody = (
      <>
        <span className="orb-big">Îți evaluăm nivelul</span>
        <span className="orb-sub">Completează chestionarul ca să-ți facem planul</span>
      </>
    );
    orbLabel = 'Completează chestionarul de intrare';
  } else if (!me.plan.length) {
    orbBody = <span className="orb-big">Planul e în pregătire</span>;
    orbLabel = 'Planul e în pregătire';
  } else if (!today.length) {
    orbBody = (
      <>
        <span className="orb-k">Azi</span>
        <span className="orb-big">Recuperare</span>
        {next && <span className="orb-sub">Următoarea: {DAY_NAMES[weekday(next.date)]} · {titleOf(next)} {fmtMinutes(next.plannedMinutes)}</span>}
      </>
    );
    orbLabel = next ? `Azi recuperare. Următoarea ședință: ${DAY_NAMES[weekday(next.date)]}, ${titleOf(next)}. Deschide detaliile.` : 'Azi recuperare';
  } else {
    orbBody = (
      <>
        <span className="orb-k">{allDone ? 'Ai încheiat planul de azi' : paused ? `${day!.title} · azi fără ședință` : 'Azi'}</span>
        {shown.map((w) => {
          const done = isDone(w);
          const off = w.status === 'anulat_sistem' || paused;
          return (
            <span key={w.id} className={`orb-w ${done ? 'done' : ''} ${off && !done ? 'off' : ''}`}>
              <b>
                {done && <span className="orb-ok">{Icons.check}</span>}
                {titleOf(w)}
              </b>
              <small>{done ? 'făcut' : subOf(w, me.baseline.tests?.css ?? null)}</small>
            </span>
          );
        })}
        {today.length > shown.length && <span className="orb-sub">+{today.length - shown.length} în listă</span>}
      </>
    );
    orbLabel = `Antrenamentele de azi: ${today.map((w) => `${titleOf(w)}, ${isDone(w) ? 'făcut' : subOf(w, me.baseline.tests?.css ?? null)}`).join('; ')}. Deschide detaliile.`;
  }

  return (
    <>
      <AppHeader name={me.user.name} onProfile={() => onOpen('profil')} right={<SyncButton compact />} />
      {sheet}
      <div className="azi">
        <p className="azi-k">{eyebrow}</p>
        <Orb onPress={!me.intakeComplete ? () => onOpen('intake') : openToday} label={orbLabel} paused={isOpen} dim={paused}>
          {orbBody}
        </Orb>
        {today.length > shown.length && (
          <div className="azi-list">
            {today.slice(shown.length).map((w) => (
              <button key={w.id} className="row-card" onClick={() => openSheet(w, today)}>
                <span>
                  <b>{titleOf(w)}</b>
                  <small>{isDone(w) ? 'făcut' : subOf(w, me.baseline.tests?.css ?? null)}</small>
                </span>
                {Icons.chevronRight}
              </button>
            ))}
          </div>
        )}
        {day && me.plan.length > 0 && (day.level !== 'verde' || day.ask) && !day.rest && (
          <p className="azi-day">
            <b>{day.title}.</b> {day.action}
          </p>
        )}
        {day?.ask && <AptQuestion />}
        {cta && (
          <button className="btn cta azi-cta" onClick={cta.go}>
            {cta.label} {Icons.arrowRight}
          </button>
        )}
        {remaining.length > 0 && !paused && (
          <button className="linkish azi-adapt" onClick={openToday}>
            Adaptează ziua
          </button>
        )}
      </div>

      <div className="stack">
        <div className="azi-rows">
          <button className="azi-row" onClick={() => onOpen('recuperare')}>
            <StateLine />
            {Icons.chevronRight}
          </button>
          <button className="azi-row" onClick={() => onOpen('obiectiv')}>
            <span>
              {fit ? `Progresul pe ${FITNESS_WEEKS} de săptămâni` : `Progresul către ${me.user.raceName ?? goalName}`}
              <small>{fit ? (fitWeek ? `săptămâna ${fitWeek}` : `începe luni, ${fmtDayMonth(me.planStart ?? me.today)}`) : days != null ? `${days} zile · ${fmtDayMonth(me.user.raceDate!)} ${me.user.raceDate!.slice(0, 4)}${me.raceReady?.target ? ` · țintă ${fmtTime(me.raceReady.target.targetSec)}` : ''}` : 'reperele și dovezile tale'}</small>
            </span>
            {Icons.chevronRight}
          </button>
        </div>

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
