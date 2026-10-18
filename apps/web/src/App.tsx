import { BadgesScreen } from './ui/Badges';
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
import { LabsGate } from './ui/LabsGate';
import { Tour, tourSeen } from './ui/Tour';
import { ErrorScreen, Loading, Login, Setup, Unconfigured } from './ui/Login';
import { Icons } from './ui/common';
import { Intake } from './forms/Intake';
import { Evening, Morning, Weekly } from './forms/Daily';
import { Body, Labs, Tests } from './forms/Baseline';
import { DataProvider, useData } from './data/store';
import { startAutoSync } from './ui/sync';
import { SPORT_LABEL, dayLevel, thisWeekDates } from './data/model';

// Trei ecrane principale în bara de jos (Acasă la mijloc); restul se deschid din butoane și se închid cu săgeata.
type Screen = 'antrenament' | 'acasa' | 'recuperare' | 'calendar' | 'antrenor' | 'profil' | 'prieteni' | 'intake' | 'dimineata' | 'seara' | 'saptamanal' | 'analize' | 'teste' | 'corp' | 'insigne';
const MAIN: { id: Screen; label: string; icon: keyof typeof Icons }[] = [
  { id: 'antrenament', label: 'Antrenament', icon: 'target' },
  { id: 'acasa', label: 'Acasă', icon: 'home' },
  { id: 'recuperare', label: 'Recuperare', icon: 'pulse' },
];
const ALL: Screen[] = ['antrenament', 'acasa', 'recuperare', 'calendar', 'antrenor', 'profil', 'prieteni', 'intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp', 'insigne'];
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
  const { status, me, error, refresh, local, sync, offline } = useData();
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [lastMain, setLastMain] = useState<Screen>('acasa');
  const [trainSport, setTrainSport] = useState<Sport>('inot');
  const [eveningFor, setEveningFor] = useState<string | null>(null);
  const [memento, setMemento] = useState(true);
  const [countdown, setCountdown] = useState(false);
  const [labsGate, setLabsGate] = useState(false);
  const [tour, setTour] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  // Gestul de „înapoi” ca pe iPhone: tragi din marginea stângă; ecranul te urmărește cu degetul, cu umbră,
  // iar la eliberare fie iese spre dreapta (și apare ecranul de dinainte), fie revine elastic.
  const swipeBack = useRef<(() => void) | null>(null);
  const [navDir, setNavDir] = useState<'fwd' | 'back' | 'fade' | 'none'>('none');
  useEffect(() => {
    let sx = 0;
    let sy = 0;
    let st = 0;
    let active = false;
    let el: HTMLElement | null = null;
    const W = () => window.innerWidth || 390;
    const start = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        active = false; // două degete nu sunt gestul de înapoi
        return;
      }
      const t = e.touches[0];
      active = !!t && t.clientX <= 24 && !!swipeBack.current;
      if (!active || !t) return;
      sx = t.clientX;
      sy = t.clientY;
      st = performance.now();
      el = document.querySelector('.screen');
      if (el) {
        el.style.transition = 'none';
        el.style.animation = 'none';
      }
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // fără pinch-zoom și fără deplasarea paginii cu două degete
        return;
      }
      if (!active || !el) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.max(0, t.clientX - sx);
      const dy = Math.abs(t.clientY - sy);
      if (dy > 30 && dy > dx) {
        active = false;
        el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
        return;
      }
      el.style.transform = `translate3d(${dx}px, 0, 0)`;
      el.style.boxShadow = `-12px 0 28px rgba(0, 0, 0, ${0.45 * (1 - dx / W())})`;
    };
    const end = (e: TouchEvent) => {
      if (!active || !el) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t ? Math.max(0, t.clientX - sx) : 0;
      const speed = dx / Math.max(1, performance.now() - st); // px/ms
      const target = el;
      if (dx > W() * 0.35 || (speed > 0.5 && dx > 40)) {
        target.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
        target.style.transform = `translate3d(${W()}px, 0, 0)`;
        setTimeout(() => {
          target.style.transition = '';
          target.style.transform = '';
          target.style.boxShadow = '';
          target.style.animation = '';
          swipeBack.current?.();
        }, 200);
      } else {
        target.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
        target.style.transform = '';
        setTimeout(() => {
          target.style.boxShadow = '';
          target.style.transition = '';
        }, 280);
      }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    // Safari pe iPhone ignoră uneori user-scalable=no: oprim gestul de zoom direct.
    const noGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', noGesture, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gesturechange', noGesture, { passive: false } as AddEventListenerOptions);
    // Dublu-tap pe text nu mai face zoom.
    let lastTap = 0;
    const noDoubleTapZoom = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap < 300 && e.touches.length === 0 && !(e.target as HTMLElement | null)?.closest('input, textarea, select, button, a')) e.preventDefault();
      lastTap = now;
    };
    document.addEventListener('touchend', noDoubleTapZoom, { passive: false });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      document.removeEventListener('gesturestart', noGesture);
      document.removeEventListener('gesturechange', noGesture);
      document.removeEventListener('touchend', noDoubleTapZoom);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

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
    if (s === 'ghid') {
      setTour(true);
      s = 'acasa';
    }
    const t = (ALL.includes(s as Screen) ? s : 'acasa') as Screen;
    if (opts?.sport) setTrainSport(opts.sport);
    if (opts?.activityId) setEveningFor(opts.activityId);
    if (MAIN.some((m) => m.id === t)) setLastMain(t);
    // Direcția animației: mai „adânc” = intră din dreapta; înapoi = din stânga; între taburi = fade.
    const depth = (x: Screen) => (MAIN.some((m) => m.id === x) ? 0 : x === 'prieteni' || ['intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp'].includes(x) ? 2 : 1);
    setNavDir(t === screen ? 'none' : depth(t) > depth(screen) ? 'fwd' : depth(t) < depth(screen) ? 'back' : 'fade');
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
  // Unde duce gestul de „înapoi” de pe fiecare ecran (pe Acasă nu face nimic).
  swipeBack.current =
    screen === 'acasa' || countdown || memento || labsGate || tour
      ? null
      : screen === 'prieteni' || screen === 'intake'
        ? () => go('profil')
        : isMain || lastMain === screen
          ? () => go('acasa')
          : back;
  const isForm = ['intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp'].includes(screen);

  // Primul pas: fără chestionar de intrare nu există plan. Intri direct în el.
  const gateIntake = !me.intakeComplete && screen !== 'intake' && screen !== 'profil';

  const level = dayLevel(me);
  const act = eveningFor ? me.activities.find((a) => a.id === eveningFor) : null;
  const eveningWorkout = eveningFor?.startsWith('plan-') ? (me.plan.find((w) => `plan-${w.id}` === eveningFor) ?? null) : act ? (me.plan.find((w) => w.sport === act.sport && (w.date === act.date || w.date === act.date) && !act.unplanned) ?? null) : null;
  const eveningUnplanned = act?.unplanned ? { date: act.date, sport: SPORT_LABEL[act.sport], minutes: act.minutes, distanceKm: act.distanceKm } : null;

  return (
    <div className="app">
      {offline && (
        <div className="offline-bar" role="status">
          Fără semnal: vezi datele de la {new Date(offline).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Se actualizează singur când revine semnalul.
        </div>
      )}
      {countdown && (
        <Countdown
          onDone={() => {
            setCountdown(false);
            if (!tourSeen()) setTour(true);
          }}
        />
      )}
      {tour && screen === 'acasa' && <Tour onClose={() => setTour(false)} />}
      {memento && !countdown && me.intakeComplete && <Memento onClose={() => setMemento(false)} />}
      {level && <div className={`edge edge-${level}`} aria-hidden="true" />}
      {local && screen !== 'acasa' && !isForm && (
        <div className="demo-banner" role="status">
          <i /> previzualizare fără server · datele rămân în telefon
        </div>
      )}
      {labsGate && !gateIntake ? (
        <LabsGate
          onDone={() => {
            setLabsGate(false);
            setCountdown(true);
            go('acasa');
          }}
        />
      ) : gateIntake ? (
        <Intake onBack={() => go('profil')} onDone={() => {
          setMemento(false);
          setLabsGate(true);
          go('acasa');
        }} />
      ) : (
        <div key={screen} className={`screen nav-${navDir}`}>
          {screen === 'acasa' && <Home onOpen={go} />}
          {screen === 'antrenament' && <Train onOpen={go} sport={trainSport} onSport={setTrainSport} />}
          {screen === 'recuperare' && <Stats onOpen={go} />}
          {screen === 'calendar' && <Calendar onBack={back} onOpen={go} />}
          {screen === 'antrenor' && <Coach onBack={back} onOpen={go} />}
          {screen === 'profil' && <Profile onBack={back} onOpen={go} />}
          {screen === 'insigne' && <BadgesScreen onBack={back} onOpen={go} />}
          {screen === 'prieteni' && me.admin && <Admin onBack={() => go('profil')} />}
          {screen === 'intake' && (
            <Intake
              onBack={back}
              onDone={() => {
                if (!me.intakeComplete) {
                  setMemento(false);
                  setLabsGate(true);
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
        </div>
      )}


      {!isForm && !gateIntake && !labsGate && (
        <nav className="nav" aria-label="Navigare">
          {[...MAIN, { id: 'antrenor' as Screen, label: 'Antrenor', icon: 'chat' as const }].map((t) => (
            <button key={t.id} className={`${screen === t.id ? 'on' : ''} ${t.id === 'acasa' ? 'home' : ''}`} onClick={() => go(t.id)} aria-current={screen === t.id ? 'page' : undefined} aria-label={t.label}>
              {t.id === 'acasa' ? <span className="home-ic">{Icons[t.icon]}</span> : Icons[t.icon]}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
