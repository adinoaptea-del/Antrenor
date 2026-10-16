// „Citește datele”: la apăsare, la deschidere, la revenirea în aplicație și periodic cât e deschisă.
// Demo: simulează citirea. Real: POST /api/sync → serverul trage Whoop (API v2) și Strava (activitățile Garmin),
// recalculează pachetul și întoarce ora ultimei citiri pe sursă. Închisă, aplicația nu poate citi singură:
// citirea periodică o face serverul (cron la 15 min + webhook-urile Whoop/Strava).

import { useSyncExternalStore } from 'react';
import { forms } from '../forms/store';

export const SOURCES = ['Whoop', 'Garmin (prin Strava)'];
const INTERVAL_MS = 15 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;

let busy = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function sync(): Promise<void> {
  if (busy) return;
  busy = true;
  emit();
  try {
    await new Promise((r) => setTimeout(r, 900)); // aici intră apelul real
    forms.setLastSync(new Date().toISOString());
  } finally {
    busy = false;
    emit();
  }
}

let started = false;
export function startAutoSync(lastSyncIso: string | null): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const stale = () => !lastSyncIso || Date.now() - new Date(lastSyncIso).getTime() > STALE_MS;
  if (stale()) void sync();
  setInterval(() => {
    if (document.visibilityState === 'visible') void sync();
  }, INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
}

export function useSyncing(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => busy,
    () => false,
  );
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
