import { useEffect, useRef, useState } from 'react';
import type { Sport } from '@core/types.js';
import { Home } from './ui/Home';
import { Train } from './ui/Train';
import { Stats } from './ui/Stats';
import { Calendar } from './ui/Calendar';
import { Coach } from './ui/Coach';
import { Profile } from './ui/Profile';
import { Memento } from './ui/Memento';
import { Countdown } from './ui/Countdown';
import { Admin } from './ui/Admin';
import { ErrorScreen, Loading, Login, Setup, Unconfigured } from './ui/Login';
import { Icons } from './ui/common';
import { Intake } from './forms/Intake';
import { Evening, Morning, Weekly } from './forms/Daily';
import { Body, Labs, Tests } from './forms/Baseline';
import { DataProvider, useData } from './data/store';
import { startAutoSync } from './ui/sync';
import { SPORT_LABEL, dayLevel, thisWeekDates } from './data/model';

// Trei ecrane principale în bara de jos (Acasă la mijloc); restul se deschid din butoane și se închid cu săgeata.
type Screen = 'antrenament' | 'acasa' | 'recuperare' | 'calendar' | 'antrenor' | 'profil' | 'prieteni' | 'intake' | 'dimineata' | 'seara' | 'saptamanal' | 'analize' | 'teste' | 'corp';
const MAIN: { id: Screen; label: string; icon: keyof typeof Icons }[] = [
  { id: 'antrenament', label: 'Antrenament', icon: 'target' },
  { id: 'acasa', label: 'Acasă', icon: 'home' },
  { id: 'recuperare', label: 'Recuperare', icon: 'pulse' },
];
const ALL: Screen[] = ['antrenament', 'acasa', 'recuperare', 'calendar', 'antrenor', 'profil', 'prieteni', 'intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp'];
const RETURN_AFTER_MS = 30 * 60 * 1000;

function readScreen(): Screen {
  const h = location.hash.replace('#', '').split('?')[0] ?? '';
  return (ALL.includes(h as Screen) ? h : 'acasa') as Screen;
}

export interface GoOpts {
  sport?: Sport;
  activityId?: string;
}

export function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

function Shell() {
  const { status, me, error, refresh, local, sync } = useData();
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [lastMain, setLastMain] = useState<Screen>('acasa');
  const [trainSport, setTrainSport] = useState<Sport>('inot');
  const [eveningFor, setEveningFor] = useState<string | null>(null);
  const [memento, setMemento] = useState(true);
  const [countdown, setCountdown] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onHash = () => setScreen(readScreen());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const stop = startAutoSync(sync);
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RETURN_AFTER_MS) setMemento(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, sync]);

  if (status === 'boot' || status === 'loading') return <Loading />;
  if (status === 'unconfigured') return <Unconfigured reason={error} />;
  if (status === 'setup') return <Setup />;
  if (status === 'anon') return <Login />;
  if (status === 'error' || !me) return <ErrorScreen error={error ?? 'fără date'} retry={() => void refresh()} />;

  const go = (s: string, opts?: GoOpts) => {
    const t = (ALL.includes(s as Screen) ? s : 'acasa') as Screen;
    if (opts?.sport) setTrainSport(opts.sport);
    if (opts?.activityId) setEveningFor(opts.activityId);
    if (MAIN.some((m) => m.id === t)) setLastMain(t);
    setScreen(t);
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* fără hash, rămâne starea din React */
    }
    window.scrollTo({ top: 0 });
  };
  const back = () => go(lastMain);
  const isMain = MAIN.some((m) => m.id === screen);
  const isForm = ['intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp'].includes(screen);

  // Primul pas: fără chestionar de intrare nu există plan. Intri direct în el.
  const gateIntake = !me.intakeComplete && screen !== 'intake' && screen !== 'profil';

  const level = dayLevel(me);
  const act = eveningFor ? me.activities.find((a) => a.id === eveningFor) : null;
  const eveningWorkout = eveningFor?.startsWith('plan-') ? (me.plan.find((w) => `plan-${w.id}` === eveningFor) ?? null) : act ? (me.plan.find((w) => w.sport === act.sport && (w.date === act.date || w.date === act.date) && !act.unplanned) ?? null) : null;
  const eveningUnplanned = act?.unplanned ? { date: act.date, sport: SPORT_LABEL[act.sport], minutes: act.minutes, distanceKm: act.distanceKm } : null;

  return (
    <div className="app">
      {countdown && <Countdown onDone={() => setCountdown(false)} />}
      {memento && !countdown && me.intakeComplete && <Memento onClose={() => setMemento(false)} />}
      {level && <div className={`edge edge-${level}`} aria-hidden="true" />}
      {local && screen !== 'acasa' && !isForm && (
        <div className="demo-banner" role="status">
          <i /> previzualizare fără server · datele rămân în telefon
        </div>
      )}
      {gateIntake ? (
        <Intake onBack={() => go('profil')} onDone={() => {
          setMemento(false);
          setCountdown(true);
          go('acasa');
        }} />
      ) : (
        <>
          {screen === 'acasa' && <Home onOpen={go} />}
          {screen === 'antrenament' && <Train onOpen={go} sport={trainSport} onSport={setTrainSport} />}
          {screen === 'recuperare' && <Stats onOpen={go} />}
          {screen === 'calendar' && <Calendar onBack={back} onOpen={go} />}
          {screen === 'antrenor' && <Coach onBack={back} onOpen={go} />}
          {screen === 'profil' && <Profile onBack={back} onOpen={go} />}
          {screen === 'prieteni' && me.admin && <Admin onBack={() => go('profil')} />}
          {screen === 'intake' && (
            <Intake
              onBack={back}
              onDone={() => {
                if (!me.intakeComplete) {
                  setMemento(false);
                  setCountdown(true);
                }
                go('acasa');
              }}
            />
          )}
          {screen === 'dimineata' && <Morning date={me.today} onBack={back} onDone={() => go('acasa')} />}
          {screen === 'seara' && eveningFor && <Evening workout={eveningWorkout} activityId={eveningFor} unplanned={eveningUnplanned} onBack={back} onDone={() => go('acasa')} />}
          {screen === 'saptamanal' && <Weekly weekStart={thisWeekDates(me)[0]!} onBack={back} onDone={() => go('acasa')} />}
          {screen === 'analize' && <Labs onBack={back} onDone={() => go('acasa')} />}
          {screen === 'teste' && <Tests onBack={back} onDone={() => go('acasa')} />}
          {screen === 'corp' && <Body onBack={back} onDone={() => go('acasa')} />}
        </>
      )}

      {isMain && !gateIntake && (
        <button className="fab" onClick={() => go('antrenor')} aria-label="Antrenor">
          <span className="circle">{Icons.chat}</span>
          <span className="lbl">Antrenor</span>
        </button>
      )}

      {!isForm && !gateIntake && (
        <nav className="nav" aria-label="Navigare">
          {MAIN.map((t) => (
            <button key={t.id} className={screen === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={screen === t.id ? 'page' : undefined} aria-label={t.label}>
              {Icons[t.icon]}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
