import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker doar în aplicația reală (nu în preview-ul publicat ca pagină).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.includes('claude')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      // La fiecare revenire în aplicație verifică dacă a apărut o versiune nouă.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
  // Versiune nouă instalată: reîncarcă o singură dată, ca să se vadă imediat.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}
