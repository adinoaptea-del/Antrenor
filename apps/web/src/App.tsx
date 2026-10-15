import { useEffect, useState } from 'react';
import { Home } from './ui/Home';
import { Train } from './ui/Train';
import { Calendar } from './ui/Calendar';
import { Coach } from './ui/Coach';
import { Profile } from './ui/Profile';
import { Icons } from './ui/common';

type Tab = 'acasa' | 'antrenament' | 'calendar' | 'antrenor' | 'profil';
const TABS: { id: Tab; label: string; icon: keyof typeof Icons }[] = [
  { id: 'acasa', label: 'Acasă', icon: 'home' },
  { id: 'antrenament', label: 'Antrenament', icon: 'train' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'antrenor', label: 'Antrenor', icon: 'coach' },
  { id: 'profil', label: 'Profil', icon: 'profile' },
];

function readTab(): Tab {
  const h = location.hash.replace('#', '');
  return (TABS.some((t) => t.id === h) ? h : 'acasa') as Tab;
}

export function App() {
  const [tab, setTab] = useState<Tab>(readTab);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* fără hash, rămâne starea din React */
    }
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <div className="demo-banner" role="status">
        <i /> Date demo, nu ale tale: calendarul vine din nucleu, scorurile sunt simulate
      </div>
      {tab === 'acasa' && <Home onOpen={(t) => go(t as Tab)} />}
      {tab === 'antrenament' && <Train />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'antrenor' && <Coach />}
      {tab === 'profil' && <Profile />}
      <nav className="nav" aria-label="Navigare">
        <div className="inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              {Icons[t.icon]}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
