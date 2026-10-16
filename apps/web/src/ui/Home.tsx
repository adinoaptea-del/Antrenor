import type { Sport } from '@core/types.js';
import { BikeArt, Card, DAY_NAMES, Icons, RunArt, SwimArt, fmtDayMonth, fmtMinutes } from './common';
import { weekday } from '@core/util/dates.js';
import { ATHLETE, RACE, SPORT_LABEL, TODAY, bar, daysToRace, greeting, nextWorkout, todayState, warnings, workoutsOn } from '../data/demo';

// Acasă după desenul lui Cuza: numele, bara de progres, trei carduri de sport cu imagine,
// zilele până la cursă, trei pătrate (Recuperare, Forța, Calendar). Nimic altceva.
const SPORTS: { id: Sport; art: JSX.Element }[] = [
  { id: 'inot', art: <SwimArt /> },
  { id: 'bicicleta', art: <BikeArt /> },
  { id: 'alergare', art: <RunArt /> },
];

export function Home({ onOpen }: { onOpen: (screen: string, opts?: { sport?: Sport }) => void }) {
  const total = bar.blocked || bar.total == null ? null : Math.round(bar.total);
  const known = bar.components.filter((c) => c.value != null).length;
  const strength = nextWorkout('forta');
  const todayCount = workoutsOn(TODAY).length;

  return (
    <>
      <div className="hub-name">
        <button onClick={() => onOpen('profil')} aria-label="Profil">
          {ATHLETE.name}
        </button>
        <div className="sub">{RACE.name}</div>
      </div>

      <div className="progress" role="img" aria-label={total == null ? 'Bara de pregătire: fără date' : `Pregătit ${total}% pentru 70.3`}>
        <div className="track">
          {total == null ? <div className="fill empty" /> : <div className="fill" style={{ width: `${Math.max(3, total)}%` }} />}
          <div className="ticks" aria-hidden="true">
            {bar.components.map((c) => (
              <i key={c.name} style={{ flexGrow: c.weight * 100 }} />
            ))}
          </div>
        </div>
        <div className="meta">
          <span>
            <b>{total == null ? (bar.blocked ? 'blocată' : 'fără date') : `${total}%`}</b> pregătit pentru 70.3
          </span>
          <button className="pill" onClick={() => onOpen('recuperare')} style={{ height: 28 }}>
            {known} din {bar.components.length} componente {Icons.chevronRight}
          </button>
        </div>
      </div>

      <p className="daymsg">{greeting()}</p>

      <div className="sports">
        {SPORTS.map((s) => {
          const next = nextWorkout(s.id);
          const isToday = next?.date === TODAY;
          return (
            <button key={s.id} className={`sport-card ${isToday ? 'today' : ''}`} onClick={() => onOpen('antrenament', { sport: s.id })}>
              {isToday && <span className="badge">azi</span>}
              {s.art}
              <div>
                <div className="nm">{SPORT_LABEL[s.id]}</div>
                <div className="nx">{next ? `${isToday ? 'azi' : DAY_NAMES[weekday(next.date)]} · ${fmtMinutes(next.plannedMinutes)}` : 'nimic planificat'}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="countdown">
        <span className="num">{daysToRace}</span>
        <span className="lb">zile până la cursă</span>
        <span className="sub">
          {fmtDayMonth(RACE.date)} {RACE.date.slice(0, 4)} · {RACE.name}
        </span>
      </div>

      <div className="boxes">
        <button className="box" onClick={() => onOpen('recuperare')}>
          <span className="ic">{Icons.pulse}</span>
          <div>
            <div className="nm">Recuperare</div>
            <div className="v">
              <b>{todayState.recovery}</b> · somn {todayState.sleep}
            </div>
          </div>
        </button>
        <button className="box" onClick={() => onOpen('antrenament', { sport: 'forta' })}>
          <span className="ic">{Icons.dumbbell}</span>
          <div>
            <div className="nm">Forța</div>
            <div className="v">{strength ? `${strength.date === TODAY ? 'azi' : DAY_NAMES[weekday(strength.date)]} · ${fmtMinutes(strength.plannedMinutes)}` : 'nimic planificat'}</div>
          </div>
        </button>
        <button className="box" onClick={() => onOpen('calendar')}>
          <span className="ic">{Icons.calendar}</span>
          <div>
            <div className="nm">Calendar</div>
            <div className="v">
              <b>{fmtDayMonth(TODAY)}</b> · {todayCount} {todayCount === 1 ? 'ședință' : 'ședințe'}
            </div>
          </div>
        </button>
      </div>

      {warnings.map((w) => (
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
