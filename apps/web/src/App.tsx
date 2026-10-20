import { Cheer, pendingCheer } from './ui/Cheer';
import { WalkPage } from './ui/Walking';
import { BadgesScreen } from './ui/Badges';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sport } from '@core/types.js';
import { goalKind, goalSports } from '@core/calendar/phases.js';
import { Home } from './ui/Home';
import { Train } from './ui/Train';
import { Stats } from './ui/Stats';
import { Calendar } from './ui/Calendar';
import { Meals } from './ui/Meals';
import { Coach } from './ui/Coach';
import { Profile } from './ui/Profile';
import { Memento, welcomeDue } from './ui/Memento';
import { Dissolve, reducedMotion, type DissolveShot } from './ui/Dissolve';
import { Countdown } from './ui/Countdown';
import { Admin } from './ui/Admin';
import { LabsGate } from './ui/LabsGate';
import { Tour, tourSeen } from './ui/Tour';
import { ErrorScreen, Loading, Login, Setup, Unconfigured } from './ui/Login';
import { Icons } from './ui/common';
import { takeLocalBack, Ambient, AppHeader, BackHeader, PageTitle, SubTabs, ambientOn } from './ui/Shell';
import { Goal } from './ui/Goal';
import { Intake } from './forms/Intake';
import { Progress } from './ui/Progress';
import { Evening, Morning, Weekly } from './forms/Daily';
import { Body, Labs, Tests } from './forms/Baseline';
import { DataProvider, useData } from './data/store';
import { startAutoSync } from './ui/sync';
import { SPORT_LABEL, dayLevel, dayOf, thisWeekDates } from './data/model';

// Trei taburi jos: Azi (bula cu ședințele zilei; Starea de azi și Obiectivul se deschid din ea), Plan, Coach.
// Profilul se deschide din avatar; formularele și ecranele secundare nu marchează niciun tab.
type Screen = 'mese' | 'progres' | 'antrenament' | 'acasa' | 'recuperare' | 'obiectiv' | 'calendar' | 'antrenor' | 'profil' | 'prieteni' | 'intake' | 'dimineata' | 'seara' | 'saptamanal' | 'analize' | 'teste' | 'corp' | 'insigne' | 'mers';
type Tab = 'acasa' | 'plan' | 'coach';
const TABS: { id: Tab; label: string; icon: keyof typeof Icons; go: Screen; screens: Screen[] }[] = [
  { id: 'acasa', label: 'Azi', icon: 'home', go: 'acasa', screens: ['acasa', 'recuperare', 'obiectiv', 'insigne'] },
  { id: 'plan', label: 'Plan', icon: 'calendar', go: 'calendar', screens: ['calendar', 'antrenament'] },
  { id: 'coach', label: 'Coach', icon: 'chat', go: 'antrenor', screens: ['antrenor'] },
];
const tabOf = (s: Screen): Tab | null => TABS.find((t) => t.screens.includes(s))?.id ?? null;
// O singură pagină principală (Azi); restul se deschid din butoanele de sub bulă și au „înapoi”.
const MAIN: { id: Screen }[] = [{ id: 'acasa' }];
const ALL: Screen[] = ['mese', 'progres', 'antrenament', 'acasa', 'recuperare', 'obiectiv', 'calendar', 'antrenor', 'profil', 'prieteni', 'intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp', 'insigne', 'mers'];
const RETURN_AFTER_MS = 30 * 60 * 1000;
/** Ieșirea din aplicație (alt app, ecran blocat) mai lungă de atât = la revenire, Acasă cu întâmpinarea (cererea lui Cuza, 20.10.2026). */
const RESUME_HOME_MS = 60 * 1000;
const FORM_SCREENS: Screen[] = ['intake', 'dimineata', 'seara', 'saptamanal', 'analize', 'teste', 'corp'];

/**
 * Ecranul de pornire: întotdeauna Acasă. Excepție doar revenirile cu parametri (#profil?conectat=oura / ?eroare=…),
 * pe care ecranul respectiv le citește după încărcare.
 */
function startScreen(): Screen {
  const hasQuery = location.hash.includes('?');
  if (hasQuery) return readScreen();
  try {
    if (location.hash && location.hash !== '#acasa') history.replaceState(null, '', '#acasa');
  } catch {
    /* fără istoric */
  }
  return 'acasa';
}

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
  const [screen, setScreen] = useState<Screen>(startScreen);
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  const [lastMain, setLastMain] = useState<Screen>('acasa');
  const [trainSport, setTrainSport] = useState<Sport>(() => (goalSports(me?.user.goal ?? null)[0] ?? 'inot'));
  const [eveningFor, setEveningFor] = useState<string | null>(null);
  // Întâmpinarea: la intrare, dar nu la o reîncărcare sau revenire în mai puțin de 30 de minute.
  // Deschiderea aplicației arată mereu întâmpinarea; doar o reîncărcare (ex. cea automată după o actualizare) ține
  // pragul de 30 de minute, ca să nu se repete.
  const [memento, setMemento] = useState(() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav && nav.type !== 'reload') return true;
    } catch {
      /* */
    }
    return welcomeDue();
  });
  const [countdown, setCountdown] = useState(false);
  const [shot, setShot] = useState<DissolveShot | null>(null);
  const [labsGate, setLabsGate] = useState(false);
  const [tour, setTour] = useState(false);
  const [ambient, setAmbient] = useState(ambientOn);
  const hiddenAt = useRef<number | null>(null);
  const welcomeLive = useRef(false);
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
    // Mărirea cu două degete e permisă (text mare, accesibilitate); doar dublu-tap-ul nu mai face zoom.
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
        // Păstrăm și parametrii (#profil?conectat=oura / ?eroare=…): revenirea de la producător îi citește după
        // încărcare; fără ei, o conectare eșuată nu arăta nimic.
        const qs = location.hash.split('?')[1];
        history.replaceState(null, '', '#acasa');
        history.pushState({ airon: 'deep' }, '', `#${start}${qs ? `?${qs}` : ''}`);
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

  // Previzualizarea întâmpinării (Administrare): o arată acum, fără pragul de 30 de minute.
  useEffect(() => {
    const on = () => setMemento(true);
    window.addEventListener('airon-welcome-preview', on);
    return () => window.removeEventListener('airon-welcome-preview', on);
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const stop = startAutoSync(sync);
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        // Revenirea în aplicație: Acasă, cu întâmpinarea. Un formular început rămâne deschis (nu pierzi ce ai scris)
        // dacă lipsa a fost scurtă (sub 30 de minute).
        const inForm = FORM_SCREENS.includes(screenRef.current);
        if (away > RESUME_HOME_MS && (!inForm || away > RETURN_AFTER_MS)) {
          if (screenRef.current !== 'acasa') {
            try {
              history.replaceState(null, '', '#acasa');
            } catch {
              /* */
            }
            setNavDir('none');
            setScreen('acasa');
          }
          setMemento(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, sync]);

  const clearShot = useCallback(() => setShot(null), []);

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
    // Întoarcerea pe Acasă (înapoi, „Trimite” într-un formular): ecranul care pleacă se dizolvă în praf care intră în
    // bulă (cererea lui Cuza, 20.10.2026). Acasă apare dedesubt fără alunecare.
    if (t === 'acasa' && screen !== 'acasa' && !reducedMotion()) {
      try {
        const el = document.querySelector('.screen') as HTMLElement | null;
        if (el) {
          const r = el.getBoundingClientRect();
          const node = el.cloneNode(true) as HTMLElement;
          node.style.left = `${r.left}px`;
          node.style.top = `${r.top}px`;
          node.style.width = `${r.width}px`;
          setShot({ id: Date.now(), node, rect: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } });
          setNavDir('none');
        }
      } catch {
        /* fără copie: navigarea obișnuită */
      }
    }
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
  const quiet = labsGate || dayOf(me)?.level === 'stop';
  // Regula 26 / auditul v93 A92: zi roșie = fără felicitare (nu doar stop).
  const cheerNow = me.intakeComplete && !local && !countdown && !tour && !isForm && !quiet && dayOf(me)?.level !== 'rosu' && pendingCheer(me);
  // O singură scenă: dacă la deschidere există o felicitare, ea are prioritate; o întâmpinare deja pornită nu e
  // întreruptă de o felicitare apărută între timp (sincronizare) — felicitarea așteaptă să se termine întâmpinarea.
  const showWelcome = memento && !countdown && !quiet && me.intakeComplete && (welcomeLive.current || !cheerNow);
  if (showWelcome) welcomeLive.current = true;
  else if (!memento) welcomeLive.current = false;
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
      {/* Mesajele cosmice: felicitarea are prioritate (fără două ferestre la rând); niciuna peste formulare, ghid,
          numărătoare, analize sau un semnal de oprire (avertismentul are prioritate). */}
      {showWelcome && <Memento onClose={() => setMemento(false)} />}
      {shot && <Dissolve key={shot.id} shot={shot} onDone={clearShot} />}
      {me.intakeComplete && !local && <Cheer me={me} blocked={!!countdown || tour || isForm || quiet || showWelcome} onShow={() => setMemento(false)} />}
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
          {screen === 'progres' && <Progress onBack={() => go('acasa')} onOpen={go} />}
          {(screen === 'calendar' || screen === 'antrenament') && (
            <>
              <BackHeader title="Planul tău" onBack={() => go('acasa')} />
              <PageTitle title="" sub={planSub(me.today)} />
              <SubTabs label="Planul" value={screen === 'calendar' ? 'calendar' : 'sporturi'} onChange={(v) => go(v === 'calendar' ? 'calendar' : 'antrenament')} items={[{ id: 'calendar', label: 'Calendar' }, { id: 'sporturi', label: sportsTabLabel(me.user.goal) }]} />
              {screen === 'calendar' ? <Calendar onBack={back} onOpen={go} /> : goalKind(me.user.goal) === 'walk' ? <WalkPage /> : <Train onOpen={go} sport={trainSport} onSport={setTrainSport} />}
            </>
          )}
          {(screen === 'recuperare' || screen === 'obiectiv') && (
            <>
              <BackHeader title="Evoluția ta" onBack={() => go('progres')} />
              <PageTitle title="" sub={screen === 'recuperare' ? 'Datele corpului de azi, cu sursa și ora.' : 'Repere măsurate, cu limite explicite.'} />
              <SubTabs label="Evoluția" value={screen === 'recuperare' ? 'azi' : 'obiectiv'} onChange={(v) => go(v === 'azi' ? 'recuperare' : 'obiectiv')} items={[{ id: 'azi', label: 'Starea de azi' }, { id: 'obiectiv', label: 'Obiectiv' }]} />
              {screen === 'recuperare' ? <Stats onOpen={go} /> : <Goal onOpen={go} />}
            </>
          )}
          {screen === 'antrenor' && <Coach onBack={back} onOpen={go} />}
          {screen === 'mese' && (
            <>
              <BackHeader title="Mese recomandate" onBack={() => go('acasa')} />
              <PageTitle title="" sub={planSub(me.today)} />
              <Meals onOpen={go} />
            </>
          )}
          {screen === 'profil' && <Profile onBack={back} onOpen={go} ambient={ambient} onAmbient={setAmbient} />}
          {screen === 'mers' && <WalkPage onBack={back} />}
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


    </div>
  );
}

/** Eticheta tabului de sport: la un singur sport, numele sportului (nu există „Sporturi”). */
function sportsTabLabel(goal: string | null): string {
  const k = goalKind(goal);
  return k === 'run' ? 'Alergare' : k === 'swim' ? 'Înot' : k === 'bike' ? 'Bicicletă' : k === 'fitness' ? 'Fitness' : k === 'walk' ? 'Mers' : 'Sporturi';
}

/** „Azi: 19 octombrie 2026” — doar data de azi; săptămâna afișată o spune calendarul (L-SIM-05). */
function planSub(today: string): string {
  const M = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  return `Azi: ${Number(today.slice(8, 10))} ${M[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`;
}
