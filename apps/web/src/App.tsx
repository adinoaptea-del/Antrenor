import { useEffect, useState } from 'react';
import { Home } from './ui/Home';
import { Train } from './ui/Train';
import { Stats } from './ui/Stats';
import { Calendar } from './ui/Calendar';
import { Coach } from './ui/Coach';
import { Profile } from './ui/Profile';
import { Icons } from './ui/common';

// Trei ecrane principale în bara de jos (Acasă la mijloc); calendarul, antrenorul și profilul se deschid din butoanele de sus / plutitor.
type Screen = 'antrenament' | 'acasa' | 'statistici' | 'calendar' | 'antrenor' | 'profil';
const MAIN: { id: Screen; label: string; icon: keyof typeof Icons }[] = [
  { id: 'antrenament', label: 'Antrenament', icon: 'target' },
  { id: 'acasa', label: 'Acasă', icon: 'home' },
  { id: 'statistici', label: 'Statistici', icon: 'grid' },
];
const ALL: Screen[] = ['antrenament', 'acasa', 'statistici', 'calendar', 'antrenor', 'profil'];

function readScreen(): Screen {
  const h = location.hash.replace('#', '');
  return (ALL.includes(h as Screen) ? h : 'acasa') as Screen;
}

export function App() {
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [lastMain, setLastMain] = useState<Screen>('acasa');

  useEffect(() => {
    const onHash = () => setScreen(readScreen());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (s: string) => {
    const t = (ALL.includes(s as Screen) ? s : 'acasa') as Screen;
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

  return (
    <div className="app">
      <div className="demo-banner" role="status">
        <i /> date demo
      </div>
      {screen === 'acasa' && <Home onOpen={go} />}
      {screen === 'antrenament' && <Train onOpen={go} />}
      {screen === 'statistici' && <Stats onOpen={go} />}
      {screen === 'calendar' && <Calendar onBack={back} onOpen={go} />}
      {screen === 'antrenor' && <Coach onBack={back} onOpen={go} />}
      {screen === 'profil' && <Profile onBack={back} />}

      {isMain && (
        <button className="fab" onClick={() => go('antrenor')} aria-label="Antrenor">
          <span className="circle">{Icons.chat}</span>
          <span className="lbl">Antrenor</span>
        </button>
      )}

      <nav className="nav" aria-label="Navigare">
        {MAIN.map((t) => (
          <button key={t.id} className={screen === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={screen === t.id ? 'page' : undefined} aria-label={t.label}>
            {Icons[t.icon]}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
