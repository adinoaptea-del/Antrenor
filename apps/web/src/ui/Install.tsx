import { useEffect, useState } from 'react';
import { Card, Icons, Label } from './common';

// „Instalează pe telefon”: pe Android (Chrome, Samsung Internet) browserul oferă instalarea direct (beforeinstallprompt);
// pe iPhone nu există buton, doar Partajare → „Adaugă pe ecranul principal”. Ascuns când aplicația rulează deja instalată.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type Platform = 'samsung' | 'android' | 'ios' | 'other';
function platform(): Platform {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'other';
}

const HOW: Record<Platform, string> = {
  samsung: 'În Samsung Internet: meniul ☰ (jos dreapta) → „Adaugă pagina la” → „Ecran Acasă”.',
  android: 'În Chrome: meniul ⋮ (sus dreapta) → „Instalează aplicația” sau „Adaugă pe ecranul de pornire”.',
  ios: 'În Safari: butonul Partajare → „Adaugă pe ecranul principal”.',
  other: 'Din meniul browserului: „Instalează aplicația” sau „Adaugă pe ecranul principal”.',
};

export function InstallCard() {
  const [, force] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  if (isInstalled() || done) return null;
  const p = platform();
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const r = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    deferred = null;
    if (r.outcome === 'accepted') setDone(true);
    force((n) => n + 1);
  };
  return (
    <Card tight>
      <Label icon={Icons.download}>Instalează pe telefon</Label>
      <div className="small muted">Pe ecranul telefonului, AIRON se deschide ca o aplicație: fără bara browserului, cu butonul „înapoi” al telefonului.</div>
      {deferred ? (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => void install()}>
          Instalează AIRON
        </button>
      ) : (
        <div className="small" style={{ marginTop: 8 }}>
          {HOW[p]}
        </div>
      )}
    </Card>
  );
}
