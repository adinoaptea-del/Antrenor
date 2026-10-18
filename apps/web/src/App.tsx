import { BadgesScreen } from './ui/Badges';
import { useEffect, useRef, useState } from 'react';
import type { Sport } from '@core/types.js';
import { goalKind, goalSports } from '@core/calendar/phases.js';
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
import { takeLocalBack, Ambient, AppHeader, PageTitle, SubTabs, ambientOn } from './ui/Shell';
import { Goal } from './ui/Goal';
import { Intake } from './forms/Intake';
import { Evening, Morning, Weekly } from './forms/Daily';
import { Body, Labs, Tests } from './forms/Baseline';
import { DataProvider, useData } from './data/store';
import { startAutoSync } from './ui/sync';
import { SPORT_LABEL, dayLevel, thisWeekDates } from './data/model';

// Patru taburi egale jos: Acasă, Plan (Calendar | Sporturi), Evoluție (Starea de azi | Obiectiv), Coach.
// Profilul se deschide din avatar; formularele și ecranele secundare nu marchează niciun tab.
type Screen = 'antrenament' | 'acasa' | 'recuperare' | 'obiectiv' | 'calendar' | 'antrenor' | 'profil' | 'prieteni' | 'intake' | 'dimineata' | 'seara' | 'saptamanal' | 'analize' | 'teste' | 'corp' | 'insigne';
type Tab = 'acasa' | 'plan' | 'evolutie' | 'coach';
const TABS: { id: Tab; label: string; icon: keyof typeof Icons; go: Screen; screens: Screen[] }[] = [
  { id: 'acasa', label: 'Acasă', icon: 'home', go: 'acasa', screens: ['acasa'] },
  { id: 'plan', label: 'Plan', icon: 'calendar', go: 'calendar', screens: ['calendar', 'antrenament'] },
  { id: 'evolutie', label: 'Evoluție', icon: 'trend', go: 'recuperare', screens: ['recuperare', 'obiectiv', 'insigne'] },
  { id: 'coach', label: 'Coach', icon: 'chat', go: 'antrenor', screens: ['antrenor'] },
];
const tabOf = (s: Screen): Tab | null => TABS.find((t) => t.screens.includes(s))?.id ?? null;
const MAIN = TABS.flatMap((t) => t.screens.filter((x) => x !== 'insigne').map((id) => ({ id })));
const ALL: Screen[] = ['antrenament', 'acasa', 'recuperare', 'obiectiv', 'calendar', 'antrenor', 'profil', 'prieteni', 'intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp', 'insigne'];
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

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

function Shell() {
  const { status, me, error, refresh, local, sync, offline } = useData();
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [lastMain, setLastMain] = useState<Screen>('acasa');
  const [trainSport, setTrainSport] = useState<Sport>(() => (goalSports(me?.user.goal ?? null)[0] ?? 'inot'));
  const [eveningFor, setEveningFor] = useState<string | null>(null);
  const [memento, setMemento] = useState(true);
  const [countdown, setCountdown] = useState(false);
  const [labsGate, setLabsGate] = useState(false);
  const [tour, setTour] = useState(false);
  const [ambient, setAmbient] = useState(ambientOn);
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
      active = !IS_ANDROID && !!t && t.clientX <= 24 && !!swipeBack.current;
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

  // Butonul / gestul „înapoi” al telefonului (Android, Samsung): pe orice ecran în afară de Acasă există o intrare în
  // istoric peste Acasă; „înapoi” te duce unde te-ar duce și săgeata din aplicație, iar pe Acasă iese din aplicație.
  const popBack = useRef<() => void>(() => undefined);
  const skipPop = useRef(false);
  useEffect(() => {
    try {
      const start = readScreen();
      if (start !== 'acasa' && history.state?.airon !== 'deep') {
        history.replaceState(null, '', '#acasa');
        history.pushState({ airon: 'deep' }, '', `#${start}`);
      }
    } catch {
      /* fără istoric: rămâne navigarea din aplicație */
    }
    const onPop = () => {
      if (skipPop.current) {
        skipPop.current = false;
        try {
          history.replaceState(null, '', '#acasa');
        } catch {
          /* */
        }
        return;
      }
      popBack.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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
      const deepNow = history.state?.airon === 'deep';
      if (t !== 'acasa') {
        if (deepNow) history.replaceState({ airon: 'deep' }, '', `#${t}`);
        else history.pushState({ airon: 'deep' }, '', `#${t}`);
      } else if (deepNow) {
        // Înapoi la Acasă din aplicație: scoatem intrarea de deasupra, ca „înapoi” de pe Acasă să iasă din prima.
        skipPop.current = true;
        history.back();
      } else history.replaceState(null, '', '#acasa');
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
  popBack.current = () => {
    const local = takeLocalBack();
    if (local) {
      local();
      try {
        history.pushState({ airon: 'deep' }, '', `#${screen}`);
      } catch {
        /* */
      }
      return;
    }
    if (swipeBack.current) swipeBack.current();
    else if (screen !== 'acasa') go('acasa');
  };

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
      {ambient && <Ambient level={level} />}
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
          {(screen === 'calendar' || screen === 'antrenament') && (
            <>
              <AppHeader name={me.user.name} onProfile={() => go('profil')} />
              <PageTitle title="Planul tău" sub={planSub(me.today)} />
              <SubTabs label="Planul" value={screen === 'calendar' ? 'calendar' : 'sporturi'} onChange={(v) => go(v === 'calendar' ? 'calendar' : 'antrenament')} items={[{ id: 'calendar', label: 'Calendar' }, { id: 'sporturi', label: sportsTabLabel(me.user.goal) }]} />
              {screen === 'calendar' ? <Calendar onBack={back} onOpen={go} /> : <Train onOpen={go} sport={trainSport} onSport={setTrainSport} />}
            </>
          )}
          {(screen === 'recuperare' || screen === 'obiectiv') && (
            <>
              <AppHeader name={me.user.name} onProfile={() => go('profil')} />
              <PageTitle title="Evoluția ta" sub={screen === 'recuperare' ? 'Datele corpului de azi, cu sursa și ora.' : 'Repere măsurate, cu limite explicite.'} />
              <SubTabs label="Evoluția" value={screen === 'recuperare' ? 'azi' : 'obiectiv'} onChange={(v) => go(v === 'azi' ? 'recuperare' : 'obiectiv')} items={[{ id: 'azi', label: 'Starea de azi' }, { id: 'obiectiv', label: 'Obiectiv' }]} />
              {screen === 'recuperare' ? <Stats onOpen={go} /> : <Goal onOpen={go} />}
            </>
          )}
          {screen === 'antrenor' && <Coach onBack={back} onOpen={go} />}
          {screen === 'profil' && <Profile onBack={back} onOpen={go} ambient={ambient} onAmbient={setAmbient} />}
          {screen === 'insigne' && <BadgesScreen onBack={() => go('obiectiv')} onOpen={go} />}
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
        <nav className="tabbar" aria-label="Navigare">
          {TABS.map((t) => {
            const on = tabOf(screen) === t.id;
            return (
              <button key={t.id} className={on ? 'on' : ''} onClick={() => go(t.go)} aria-current={on ? 'page' : undefined}>
                <span className="tb-ic">{Icons[t.icon]}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/** Eticheta tabului de sport: la un singur sport, numele sportului (nu există „Sporturi”). */
function sportsTabLabel(goal: string | null): string {
  const k = goalKind(goal);
  return k === 'run' ? 'Alergare' : k === 'swim' ? 'Înot' : k === 'bike' ? 'Bicicletă' : k === 'fitness' ? 'Fitness' : 'Sporturi';
}

/** „19–25 octombrie 2026”: săptămâna curentă. */
function planSub(today: string): string {
  const M = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d.getTime() - dow * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  const a = `${mon.getUTCDate()}${mon.getUTCMonth() !== sun.getUTCMonth() ? ` ${M[mon.getUTCMonth()]}` : ''}`;
  return `Săptămâna ${a}–${sun.getUTCDate()} ${M[sun.getUTCMonth()]} ${sun.getUTCFullYear()}`;
}
