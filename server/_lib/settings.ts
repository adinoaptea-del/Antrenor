// Setări puse de admin din aplicație (tabela app_settings), folosite ca variabile de mediu.
// Variabilele din Vercel au prioritate; ce lipsește acolo se ia din bază. Cache 60 s pe instanță.
import { select, upsert } from './db.js';

export const SETTING_KEYS = ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'OURA_CLIENT_ID', 'OURA_CLIENT_SECRET'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

const fromVercel = new Set(SETTING_KEYS.filter((k) => !!process.env[k]));
let loadedAt = 0;

export async function hydrateSettings(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 60_000) return;
  try {
    const rows = await select<{ key: string; value: string }>('app_settings', {}, { select: 'key,value' });
    for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key) && !fromVercel.has(r.key as SettingKey)) process.env[r.key] = r.value;
    loadedAt = Date.now();
  } catch {
    // Baza nu e pregătită încă (sau tabela lipsește): rămân doar variabilele din Vercel.
  }
}

export async function saveSettings(values: Partial<Record<SettingKey, string>>): Promise<void> {
  const rows = Object.entries(values)
    .filter(([k, v]) => (SETTING_KEYS as readonly string[]).includes(k) && typeof v === 'string' && v.trim())
    .map(([key, value]) => ({ key, value: value!.trim(), updated_at: new Date().toISOString() }));
  if (rows.length) await upsert('app_settings', rows, 'key');
  for (const r of rows) if (!fromVercel.has(r.key as SettingKey)) process.env[r.key] = r.value;
  loadedAt = Date.now();
}
