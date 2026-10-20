// Vremea din orașul din profil, prin Open-Meteo (gratuit, fără cheie). Fără oraș sau la eroare: null, nu ghicim.
import type { WeatherDay, WeatherInput } from '../../src/collector/types.js';

export async function geocode(city: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ro&format=json`);
  if (!r.ok) return null;
  const j = (await r.json()) as { results?: { name: string; latitude: number; longitude: number; country?: string }[] };
  const g = j.results?.[0];
  return g ? { name: `${g.name}${g.country ? `, ${g.country}` : ''}`, lat: g.latitude, lon: g.longitude } : null;
}

export async function forecast(city: string, lat: number, lon: number, tz: string): Promise<WeatherInput | null> {
  const q = 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${q}&timezone=${encodeURIComponent(tz)}&forecast_days=5`);
    if (!r.ok) return null;
    const d = (await r.json()) as { daily?: Record<string, (number | null)[]> & { time?: string[] } };
    const day = (i: number): WeatherDay => ({
      tmax: d.daily?.temperature_2m_max?.[i] ?? null,
      tmin: d.daily?.temperature_2m_min?.[i] ?? null,
      resimtita_max: d.daily?.apparent_temperature_max?.[i] ?? null,
      ploaie_mm: d.daily?.precipitation_sum?.[i] ?? null,
      vant_kmh: d.daily?.wind_speed_10m_max?.[i] ?? null,
      prob_ploaie: d.daily?.precipitation_probability_max?.[i] ?? null,
    });
    return d.daily ? { oras: city, azi: day(0), maine: day(1), poimaine: (d.daily.temperature_2m_max?.length ?? 0) > 2 ? day(2) : null, zile: (d.daily.time ?? []).map((date, i) => ({ date, w: day(i) })) } : null;
  } catch {
    return null;
  }
}
