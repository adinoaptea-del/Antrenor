// „Citește datele”: la apăsare, la deschidere, la revenire și la 15 minute cât e deschisă.
// Închisă, aplicația nu poate citi singură; serverul citește la 15 minute și la webhook-urile Whoop / Strava.
const INTERVAL_MS = 15 * 60 * 1000;

export function startAutoSync(run: () => Promise<unknown>): () => void {
  const tick = () => {
    if (document.visibilityState === 'visible') void run().catch(() => undefined);
  };
  const iv = setInterval(tick, INTERVAL_MS);
  // Prima citire imediat la pornire, nu după primul interval.
  tick();
  const onVis = () => {
    if (document.visibilityState === 'visible') void run().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(iv);
    document.removeEventListener('visibilitychange', onVis);
  };
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
