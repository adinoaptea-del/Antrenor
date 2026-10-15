import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker doar în aplicația reală (nu în preview-ul publicat ca pagină).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.includes('claude')) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
