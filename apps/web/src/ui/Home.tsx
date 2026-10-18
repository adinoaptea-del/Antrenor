import { GOAL_NAME, overallReady } from '@core/bar/sport-readiness.js';
import type { Goal } from '@core/calendar/phases.js';
import { useState } from 'react';
import type { Sport } from '@core/types.js';
import { addDays, weekday } from '@core/util/dates.js';
import { isRunGoal } from '@core/calendar/phases.js';
import { BikeArt, Card, CircleBtn, Icons, RunArt, SwimArt, fmtDayMonth } from './common';
import { SyncButton } from './SyncButton';
import { useData, useMe } from '../data/store';
import { DAY_NAMES, SPORT_LABEL, daysToRace, fmtMinutes, greeting, lastDoneWorkout, nextWorkout, workoutsOn } from '../data/model';
import { eveningComplete, morningComplete } from '../forms/types';
import type { MorningForm } from '../forms/types';
import { BaselineList } from '../forms/Baseline';
import { Today } from './Today';
import { BadgesTeaser, NewBadge } from './Badges';

// Acasă după desenul lui Cuza: numele, bara de progres, trei carduri de sport cu imagine,
// zilele până la cursă, trei pătrate (Recuperare, Forța, Calendar). Nimic altceva.
const SPORTS: { id: Sport; art: JSX.Element }[] = [
  { id: 'inot', art: <SwimArt /> },
  { id: 'bicicleta', art: <BikeArt /> },
  { id: 'alergare', art: <RunArt /> },
];

const BAR_PARTS = [
  { name: 'inot', label: 'Înot', weight: 0.2, how: 'cea mai lungă distanță înotată în 6 săptămâni, față de 1.900 m (și ritmul, după test)' },
  { name: 'bicicleta', label: 'Bicicletă', weight: 0.25, how: 'cea mai lungă tură în 6 săptămâni, față de 90 km' },
  { name: 'alergare', label: 'Alergare', weight: 0.25, how: 'cea mai lungă alergare în 6 săptămâni, față de 18 km (plus alergarea după bicicletă)' },
  { name: 'consistenta', label: 'Consecvență', weight: 0.15, how: 'câte ședințe din plan ai făcut în ultimele 4 săptămâni' },
  { name: 'forma', label: 'Formă', weight: 0.15, how: 'încărcarea de antrenament acumulată față de ce cere faza în care ești' },
] as const;

const RUN_BAR_PARTS = (goal: 'semimaraton' | 'maraton') =>
  [
    { name: 'alergare', label: 'Alergare', weight: 0.5, how: `cea mai lungă alergare în 6 săptămâni, față de ${goal === 'maraton' ? 32 : 18} km` },
    { name: 'consistenta', label: 'Consecvență', weight: 0.25, how: 'câte ședințe din plan ai făcut în ultimele 4 săptămâni' },
    { name: 'forma', label: 'Formă', weight: 0.25, how: 'încărcarea de antrenament acumulată față de ce cere faza în care ești' },
  ] as const;

export function Home({ onOpen }: { onOpen: (screen: string, opts?: { sport?: Sport; activityId?: string }) => void }) {
  const me = useMe();
  const { local } = useData();
  const bar = me.bar;
  const [barInfo, setBarInfo] = useState(false);
  const total = !bar || bar.blocked || bar.total == null ? null : Math.round(bar.total);
  const known = bar?.components.filter((c) => c.value != null).length ?? 0;
  const morning = me.forms.morning as MorningForm | null;
  const lastDone = lastDoneWorkout(me);
  const lastDoneAct = lastDone ? me.activities.find((a) => a.sport === lastDone.sport && (a.date === lastDone.date || a.date > lastDone.date) && !a.unplanned) : null;
  const lastDoneId = lastDoneAct?.id ?? (lastDone ? `plan-${lastDone.id}` : null);
  const evening = lastDoneId ? me.forms.evening[lastDoneId] : undefined;
  const isSunday = weekday(me.today) === 6;
  const strength = nextWorkout(me, 'forta');
  const todayCount = workoutsOn(me, me.today).length;
  const yesterday = addDays(me.today, -1);
  const dayLabel = (d: string) => (d === me.today ? 'azi' : d === yesterday ? 'ieri' : `${DAY_NAMES[weekday(d)]}, ${fmtDayMonth(d)}`);
  const days = daysToRace(me);
  const overall = me.sportReady ? overallReady(me.sportReady) : null;
  const limiting = me.sportReady && me.sportReady.length > 1 ? [...me.sportReady].sort((a, b) => (a.value ?? -1) - (b.value ?? -1))[0]! : null;
  const goalName = me.user.goal && me.user.goal in GOAL_NAME ? GOAL_NAME[me.user.goal as Goal] : 'cursă';

  return (
    <>
      <div className="topline">
        <CircleBtn icon={Icons.calendar} label="Calendar" onClick={() => onOpen('calendar')} />
        <SyncButton />
      </div>
      <div className="hub-name">
        <button className="name-ring" onClick={() => onOpen('profil')} aria-label="Profil">
          {me.user.name || 'Sportiv'}
        </button>
        <div className="sub">{me.user.raceDate ? `${fmtDayMonth(me.user.raceDate)} ${me.user.raceDate.slice(0, 4)}` : 'completează chestionarul ca să pornească planul'}</div>
      </div>

      <div className="forms-row">
        {!me.intakeComplete && (
          <button className="form-tile todo" onClick={() => onOpen('intake')}>
            <span className="k">Chestionar</span>
            <span className="v">3 minute</span>
          </button>
        )}
        {/* Chestionarul de dimineață contează doar pentru decizia zilei: după 14:00 nu mai apare. */}
        {!morningComplete(morning ?? undefined) && new Date().getHours() >= 4 && new Date().getHours() < 14 && (
          <button className="form-tile todo" onClick={() => onOpen('dimineata')}>
            <span className="k">Dimineața</span>
            <span className="v">{morning && Object.values(morning.hooper).some((v) => v != null) ? `Completează (${Object.values(morning.hooper).filter((v) => v != null).length} din 4)` : 'Cum te simți azi? · 20 de secunde'}</span>
          </button>
        )}
        {lastDone && lastDoneId && !eveningComplete(evening) && (
          <button className="form-tile todo" onClick={() => onOpen('seara', { activityId: lastDoneId })}>
            <span className="k">Cum a fost</span>
            <span className="v">{`${SPORT_LABEL[lastDone.sport]} · ${dayLabel(lastDone.date)}`}</span>
          </button>
        )}
        {isSunday && !me.forms.weeklyDone && (
          <button className="form-tile todo" onClick={() => onOpen('saptamanal')}>
            <span className="k">Săptămâna</span>
            <span className="v">3 întrebări</span>
          </button>
        )}
      </div>


      <NewBadge onOpen={onOpen} />
      <Today onOpen={onOpen} />

      {me.sportReady && me.sportReady.length > 0 ? (
        <div className="progress" role="img" aria-label={`Progres față de repere, ${goalName}: ${overall}%`}>
          <div className="ready-title">
            Progres față de repere ({goalName}): <b>{overall}%</b>
          </div>
          <div className="track">
            <div className={`fill ${overall ? '' : 'empty'}`} style={overall ? { width: `${Math.max(3, overall ?? 0)}%` } : undefined} />
            <div className="ticks" aria-hidden="true">
              {me.sportReady.map((r) => (
                <i key={r.sport} style={{ flexGrow: 1 }} />
              ))}
            </div>
          </div>
          <div className="meta">
            <span className="tiny muted">{me.sportReady.map((r) => `${SPORT_LABEL[r.sport]} ${r.value ?? 0}%`).join('  ·  ')}</span>
            <button className="pill" onClick={() => setBarInfo(!barInfo)} style={{ height: 28 }} aria-expanded={barInfo}>
              detalii {Icons.chevronRight}
            </button>
          </div>
          {barInfo && (
            <div className="bar-info">
              {me.sportReady.map((r) => (
                <button key={r.sport} className="bi-row bi-btn" onClick={() => onOpen('antrenament', { sport: r.sport })}>
                  <span className="bi-k">{SPORT_LABEL[r.sport]}</span>
                  <span className={`bi-v ${r.value == null ? 'none' : ''}`}>{r.value == null ? 'fără date' : `${r.value}%`}</span>
                  <span className="bi-d">{r.value == null ? `nicio ședință cu distanță în 6 săptămâni; proba: ${r.leg}` : r.parts.map((p) => `${p.label.toLowerCase()}: ${p.have} din ${p.target}`).join('; ')}</span>
                </button>
              ))}
              {limiting && <div className="small" style={{ marginTop: 4 }}>Proba care te ține pe loc: <b>{SPORT_LABEL[limiting.sport]}</b> ({limiting.value == null ? 'fără date' : `${limiting.value}%`}).</div>}
              <div className="tiny muted">Un index după regulile noastre de antrenor, nu o probabilitate de a termina cursa. Media probelor, din tot ce au înregistrat brățările în ultimele 6 săptămâni; o probă fără nicio ședință contează 0. Apasă pe un sport pentru detalii.</div>
            </div>
          )}
        </div>
      ) : (
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
              <b>{total == null ? (bar?.blocked ? 'blocată' : 'fără date') : `${total}%`}</b> progres față de repere
            </span>
            <button className="pill" onClick={() => setBarInfo(!barInfo)} style={{ height: 28 }} aria-expanded={barInfo}>
              {bar && bar.components.length ? `măsurat ${known}/${bar.components.length}` : 'detalii'} {Icons.chevronRight}
            </button>
          </div>
          {barInfo && (
            <div className="bar-info">
              {(isRunGoal(me.user.goal) ? RUN_BAR_PARTS(me.user.goal) : BAR_PARTS).map((p) => {
                const c = bar?.components.find((x) => x.name === p.name);
                return (
                  <div key={p.name} className="bi-row">
                    <span className="bi-k">
                      {p.label} <small>{Math.round(p.weight * 100)}%</small>
                    </span>
                    <span className={`bi-v ${c?.value == null ? 'none' : ''}`}>{c?.value == null ? 'fără date' : `${Math.round(c.value)}%`}</span>
                    <span className="bi-d">{c?.value == null ? p.how : c.detail}</span>
                  </div>
                );
              })}
              <div className="tiny muted">Bara se calculează doar din ce s-a măsurat. Fără date de la brățări în ultimele 6 săptămâni, rămâne goală; nu ghicește.</div>
            </div>
          )}
        </div>
      )}

      <p className="daymsg">{greeting(me)}</p>


      <div className="sports">
        {SPORTS.filter((s) => !isRunGoal(me.user.goal) || s.id === 'alergare').map((s) => {
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

      {me.intakeComplete && (!me.profile.sex || !me.profile.birthYear || !me.profile.heightCm) && (
        <button className="labs-alert" onClick={() => onOpen('profil')}>
          <b>Completează sexul, vârsta și înălțimea</b>
          <span>Contează pentru analize, nutriție și recuperare. Completează-le în Profil → Despre tine.</span>
        </button>
      )}

      {me.intakeComplete && (!me.baseline.labs || me.baseline.labs.expirat) && (
        <button className="labs-alert" onClick={() => onOpen('analize')}>
          <b>Planul nu e 100% pe corpul tău</b>
          <span>{me.baseline.labs?.expirat ? 'Analizele urcate sunt mai vechi de 12 luni.' : 'Lipsesc analizele de sânge.'} Urcă-le acum: PDF sau poză.</span>
        </button>
      )}

      {(!me.baseline.labs || me.baseline.labs.expirat || !me.baseline.tests || !me.baseline.body || me.baseline.cardiolog !== 'da') && (
        <Card tight style={{ marginTop: 12 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <div className="title">Date de bază</div>
            <span className="small muted">{[me.baseline.labs && !me.baseline.labs.expirat, me.baseline.tests, me.baseline.body, me.baseline.cardiolog === 'da'].filter(Boolean).length} din 4 completate</span>
          </div>
          <BaselineList onlyMissing onOpen={(s) => onOpen(s)} />
          <div className="tiny muted" style={{ marginTop: 8 }}>Ce ai completat găsești în Profil.</div>
        </Card>
      )}

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


      <BadgesTeaser onOpen={onOpen} />

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
