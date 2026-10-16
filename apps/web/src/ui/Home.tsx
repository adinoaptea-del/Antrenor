import type { Sport } from '@core/types.js';
import { weekday } from '@core/util/dates.js';
import { BikeArt, Card, Icons, RunArt, SwimArt, fmtDayMonth } from './common';
import { SyncButton } from './SyncButton';
import { useMe } from '../data/store';
import { DAY_NAMES, DAY_SHORT, SPORT_LABEL, daysToRace, fmtMinutes, greeting, lastDoneWorkout, nextWorkout, unplannedActivities, workoutsOn } from '../data/model';
import { eveningComplete, morningComplete } from '../forms/types';
import type { MorningForm } from '../forms/types';

// Acasă după desenul lui Cuza: numele, bara de progres, trei carduri de sport cu imagine,
// zilele până la cursă, trei pătrate (Recuperare, Forța, Calendar). Nimic altceva.
const SPORTS: { id: Sport; art: JSX.Element }[] = [
  { id: 'inot', art: <SwimArt /> },
  { id: 'bicicleta', art: <BikeArt /> },
  { id: 'alergare', art: <RunArt /> },
];

export function Home({ onOpen }: { onOpen: (screen: string, opts?: { sport?: Sport; activityId?: string }) => void }) {
  const me = useMe();
  const bar = me.bar;
  const total = !bar || bar.blocked || bar.total == null ? null : Math.round(bar.total);
  const known = bar?.components.filter((c) => c.value != null).length ?? 0;
  const morning = me.forms.morning as MorningForm | null;
  const lastDone = lastDoneWorkout(me);
  const lastDoneAct = lastDone ? me.activities.find((a) => a.sport === lastDone.sport && (a.date === lastDone.date || a.date > lastDone.date) && !a.unplanned) : null;
  const lastDoneId = lastDoneAct?.id ?? (lastDone ? `plan-${lastDone.id}` : null);
  const evening = lastDoneId ? me.forms.evening[lastDoneId] : undefined;
  const hooperSum = morningComplete(morning ?? undefined) ? Object.values(morning!.hooper).reduce((x, y) => (x ?? 0) + (y ?? 0), 0) : null;
  const isSunday = weekday(me.today) === 6;
  const strength = nextWorkout(me, 'forta');
  const todayCount = workoutsOn(me, me.today).length;
  const unplanned = unplannedActivities(me);
  const pendingUnplanned = unplanned.filter((a) => !a.tipNeplanificat);
  const days = daysToRace(me);

  return (
    <>
      <div className="topline">
        <span className="small muted">{me.user.raceName ?? 'fără cursă setată'}</span>
        <SyncButton />
      </div>
      <div className="hub-name">
        <button onClick={() => onOpen('profil')} aria-label="Profil">
          {me.user.name || 'Sportiv'}
        </button>
        <div className="sub">{me.user.raceDate ? `${fmtDayMonth(me.user.raceDate)} ${me.user.raceDate.slice(0, 4)}` : 'completează chestionarul ca să pornească planul'}</div>
      </div>

      <div className="progress" role="img" aria-label={total == null ? 'Bara de pregătire: fără date' : `Pregătit ${total}% pentru cursă`}>
        <div className="track">
          {total == null ? <div className="fill empty" /> : <div className="fill" style={{ width: `${Math.max(3, total)}%` }} />}
          <div className="ticks" aria-hidden="true">
            {(bar?.components ?? [1, 1, 1, 1, 1].map((_, i) => ({ name: String(i), weight: 0.2 }))).map((c) => (
              <i key={c.name} style={{ flexGrow: c.weight * 100 }} />
            ))}
          </div>
        </div>
        <div className="meta">
          <span>
            <b>{total == null ? (bar?.blocked ? 'blocată' : 'fără date') : `${total}%`}</b> pregătit pentru {me.user.goal ?? 'cursă'}
          </span>
          <button className="pill" onClick={() => onOpen('recuperare')} style={{ height: 28 }}>
            {bar ? `${known} din ${bar.components.length} componente` : 'cum se calculează'} {Icons.chevronRight}
          </button>
        </div>
      </div>

      <p className="daymsg">{greeting(me)}</p>

      <div className="forms-row">
        {!me.intakeComplete && (
          <button className="form-tile todo" onClick={() => onOpen('intake')}>
            <span className="k">Chestionar</span>
            <span className="v">3 minute</span>
          </button>
        )}
        {pendingUnplanned.map((a) => (
          <button key={a.id} className="form-tile todo" onClick={() => onOpen('seara', { activityId: a.id })}>
            <span className="k">Neplanificat</span>
            <span className="v">
              {SPORT_LABEL[a.sport]} {DAY_SHORT[weekday(a.date)]} · ce a fost?
            </span>
          </button>
        ))}
        <button className={`form-tile ${morningComplete(morning ?? undefined) ? '' : 'todo'}`} onClick={() => onOpen('dimineata')}>
          <span className="k">Dimineața {morningComplete(morning ?? undefined) && Icons.check}</span>
          <span className="v">{morningComplete(morning ?? undefined) ? `Hooper ${hooperSum}${(hooperSum ?? 0) >= 24 ? ' · roșu' : (hooperSum ?? 0) >= 20 ? ' · galben' : ''}` : '20 de secunde'}</span>
        </button>
        {lastDone && lastDoneId && (
          <button className={`form-tile ${eveningComplete(evening) ? '' : 'todo'}`} onClick={() => onOpen('seara', { activityId: lastDoneId })}>
            <span className="k">Cum a fost {eveningComplete(evening) && Icons.check}</span>
            <span className="v">{eveningComplete(evening) ? `RPE ${evening!.rpe}` : `${SPORT_LABEL[lastDone.sport]} ${DAY_SHORT[weekday(lastDone.date)]}`}</span>
          </button>
        )}
        {isSunday && !me.forms.weeklyDone && (
          <button className="form-tile todo" onClick={() => onOpen('saptamanal')}>
            <span className="k">Săptămâna</span>
            <span className="v">3 întrebări</span>
          </button>
        )}
      </div>

      <div className="sports">
        {SPORTS.map((s) => {
          const next = nextWorkout(me, s.id);
          const isToday = next?.date === me.today;
          return (
            <button key={s.id} className={`sport-card ${isToday ? 'today' : ''}`} onClick={() => onOpen('antrenament', { sport: s.id })}>
              {isToday && <span className="badge">azi</span>}
              {s.art}
              <div>
                <div className="nm">{SPORT_LABEL[s.id]}</div>
                <div className="nx">{next ? `${isToday ? 'azi' : DAY_NAMES[weekday(next.date)]} · ${fmtMinutes(next.plannedMinutes)}` : me.plan.length ? 'nimic planificat' : 'fără plan încă'}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="countdown">
        <span className="num">{days == null ? '–' : days}</span>
        <span className="lb">zile până la cursă</span>
        <span className="sub">{me.user.raceDate ? `${fmtDayMonth(me.user.raceDate)} ${me.user.raceDate.slice(0, 4)} · ${me.user.raceName ?? ''}` : 'data cursei vine din chestionar'}</span>
      </div>

      <div className="boxes">
        <button className="box" onClick={() => onOpen('recuperare')}>
          <span className="ic">{Icons.pulse}</span>
          <div>
            <div className="nm">Recuperare</div>
            <div className="v">{me.wellnessToday?.recoveryScore != null ? <><b>{me.wellnessToday.recoveryScore}</b>{me.wellnessToday.sleepMin != null ? ` · somn ${fmtMinutes(me.wellnessToday.sleepMin)}` : ''}</> : me.wellnessToday?.sleepMin != null ? `somn ${fmtMinutes(me.wellnessToday.sleepMin)}` : 'fără date azi'}</div>
          </div>
        </button>
        <button className="box" onClick={() => onOpen('antrenament', { sport: 'forta' })}>
          <span className="ic">{Icons.dumbbell}</span>
          <div>
            <div className="nm">Forța</div>
            <div className="v">{strength ? `${strength.date === me.today ? 'azi' : DAY_NAMES[weekday(strength.date)]} · ${fmtMinutes(strength.plannedMinutes)}` : 'nimic planificat'}</div>
          </div>
        </button>
        <button className="box" onClick={() => onOpen('calendar')}>
          <span className="ic">{Icons.calendar}</span>
          <div>
            <div className="nm">Calendar</div>
            <div className="v">
              <b>{fmtDayMonth(me.today)}</b> · {todayCount} {todayCount === 1 ? 'ședință' : 'ședințe'}
            </div>
          </div>
        </button>
      </div>

      {unplanned
        .filter((a) => a.tipNeplanificat)
        .map((a) => (
          <Card key={a.id} className="blue" tight style={{ marginTop: 12 }}>
            <div className="title">În afara planului: {a.name ?? SPORT_LABEL[a.sport]}</div>
            <div className="small" style={{ marginTop: 4 }}>
              {DAY_NAMES[weekday(a.date)]}, {fmtDayMonth(a.date)} · {fmtMinutes(a.minutes)}
              {a.distanceKm ? ` · ${a.distanceKm.toLocaleString('ro-RO')} km` : ''}
              {a.avgHr ? ` · FC medie ${a.avgHr}` : ''}. Ai spus: <b>{a.tipNeplanificat === 'cursa' ? 'cursă' : a.tipNeplanificat === 'antrenament' ? 'antrenament liber' : 'altceva'}</b>. Planul ține cont de ea; schimbările apar în Calendar și în jurnal.
            </div>
          </Card>
        ))}

      {me.warnings.map((w) => (
        <Card key={w.title} className="warn" tight style={{ marginTop: 12 }}>
          <div className="title">{w.title}</div>
          <div className="small" style={{ marginTop: 4 }}>
            {w.text}
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Corecția: {w.fix}
          </div>
        </Card>
      ))}
    </>
  );
}
