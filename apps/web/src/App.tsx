import { useEffect, useRef, useState } from 'react';
import { Home } from './ui/Home';
import { Train } from './ui/Train';
import { Stats } from './ui/Stats';
import { Calendar } from './ui/Calendar';
import { Coach } from './ui/Coach';
import { Profile } from './ui/Profile';
import { Memento } from './ui/Memento';
import { Icons } from './ui/common';
import { Intake } from './forms/Intake';
import { Evening, Morning, Weekly } from './forms/Daily';
import { useForms } from './forms/store';
import { startAutoSync } from './ui/sync';
import { TODAY, allWorkouts, thisWeekDates, unplannedActivity } from './data/demo';
import type { Sport } from '@core/types.js';

// Trei ecrane principale în bara de jos (Acasă la mijloc); restul se deschid din butoane și se închid cu săgeata.
type Screen = 'antrenament' | 'acasa' | 'recuperare' | 'calendar' | 'antrenor' | 'profil' | 'intake' | 'dimineata' | 'seara' | 'saptamanal';
const MAIN: { id: Screen; label: string; icon: keyof typeof Icons }[] = [
  { id: 'antrenament', label: 'Antrenament', icon: 'target' },
  { id: 'acasa', label: 'Acasă', icon: 'home' },
  { id: 'recuperare', label: 'Recuperare', icon: 'pulse' },
];
const ALL: Screen[] = ['antrenament', 'acasa', 'recuperare', 'calendar', 'antrenor', 'profil', 'intake', 'dimineata', 'seara', 'saptamanal'];
const RETURN_AFTER_MS = 30 * 60 * 1000; // mementoul revine dacă aplicația a stat închisă/ascunsă peste 30 min

function readScreen(): Screen {
  const h = location.hash.replace('#', '');
  return (ALL.includes(h as Screen) ? h : 'acasa') as Screen;
}

export interface GoOpts {
  sport?: Sport;
  activityId?: string;
}

export function App() {
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [lastMain, setLastMain] = useState<Screen>('acasa');
  const [trainSport, setTrainSport] = useState<Sport>('inot');
  const [eveningFor, setEveningFor] = useState<string | null>(null);
  const [memento, setMemento] = useState(true);
  const hiddenAt = useRef<number | null>(null);
  const f = useForms();

  useEffect(() => {
    const onHash = () => setScreen(readScreen());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    startAutoSync(f.lastSync);
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RETURN_AFTER_MS) setMemento(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const isForm = screen === 'intake' || screen === 'dimineata' || screen === 'seara' || screen === 'saptamanal';

  const eveningWorkout = eveningFor && eveningFor !== unplannedActivity.id ? (allWorkouts.find((w) => `demo-${w.id}` === eveningFor) ?? null) : null;
  const eveningUnplanned = eveningFor === unplannedActivity.id ? { date: unplannedActivity.date, sport: 'Alergare', minutes: unplannedActivity.minutes, distanceKm: unplannedActivity.distanceKm } : null;

  return (
    <div className="app">
      {memento && <Memento onClose={() => setMemento(false)} />}
      {screen !== 'acasa' && !isForm && (
        <div className="demo-banner" role="status">
          <i /> date demo
        </div>
      )}
      {screen === 'acasa' && <Home onOpen={go} />}
      {screen === 'antrenament' && <Train onOpen={go} sport={trainSport} onSport={setTrainSport} />}
      {screen === 'recuperare' && <Stats onOpen={go} />}
      {screen === 'calendar' && <Calendar onBack={back} onOpen={go} />}
      {screen === 'antrenor' && <Coach onBack={back} onOpen={go} />}
      {screen === 'profil' && <Profile onBack={back} onOpen={go} />}
      {screen === 'intake' && <Intake onBack={back} onDone={() => go('acasa')} />}
      {screen === 'dimineata' && <Morning date={TODAY} onBack={back} onDone={() => go('acasa')} />}
      {screen === 'seara' && eveningFor && <Evening workout={eveningWorkout} activityId={eveningFor} unplanned={eveningUnplanned} onBack={back} onDone={() => go('acasa')} />}
      {screen === 'saptamanal' && <Weekly weekStart={thisWeekDates()[0]!} onBack={back} onDone={() => go('acasa')} />}

      {isMain && (
        <button className="fab" onClick={() => go('antrenor')} aria-label="Antrenor">
          <span className="circle">{Icons.chat}</span>
          <span className="lbl">Antrenor</span>
        </button>
      )}

      {!isForm && (
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
