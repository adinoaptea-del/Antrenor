import { useState } from 'react';
import type { Sport } from '@core/types.js';
import type { MeActivity } from '@core/api-types.js';
import { diffDays, weekday } from '@core/util/dates.js';
import { Card, Label } from './common';
import { useData, useMe } from '../data/store';
import { DAY_NAMES } from '../data/model';

// Detaliile fiecărei ședințe, din brățări: apeși pe o valoare și vezi cum a evoluat în ultimele ședințe.
// Nimic estimat: o valoare care nu vine de la brățări nu apare.

type Better = 'low' | 'high' | null;
interface Metric {
  k: string;
  label: string;
  unit?: string;
  get: (a: MeActivity) => number | null | undefined;
  fmt?: (v: number) => string;
  better: Better;
  hint?: string;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const dec = (v: number, d = 1) => v.toLocaleString('ro-RO', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const paceSec = (a: MeActivity) => (a.paceMinKm != null ? a.paceMinKm * 60 : a.distanceKm && a.distanceKm > 0.2 ? (a.minutes * 60) / a.distanceKm : null);

const COMMON_HR: Metric[] = [
  { k: 'hr', label: 'FC medie', unit: 'bpm', get: (a) => a.avgHr, better: null },
  { k: 'hrmax', label: 'FC maximă', unit: 'bpm', get: (a) => a.maxHr, better: null },
];
const ENERGY: Metric[] = [
  { k: 'kcal', label: 'Calorii', unit: 'kcal', get: (a) => a.details?.kcal, better: null },
  { k: 'strain', label: 'Strain WHOOP', get: (a) => a.details?.strain, fmt: (v) => dec(v), better: null, hint: 'efortul ședinței pe scara WHOOP, 0–21' },
];

function metricsFor(sport: Sport, ftp: number | null): Metric[] {
  if (sport === 'alergare')
    return [
      { k: 'pace', label: 'Ritm mediu', unit: '/km', get: paceSec, fmt: mmss, better: 'low' },
      { k: 'fastkm', label: 'Cel mai rapid km', unit: '/km', get: (a) => a.details?.fastestKmSec, fmt: mmss, better: 'low' },
      { k: 'dist', label: 'Distanță', unit: 'km', get: (a) => a.distanceKm, fmt: (v) => dec(v), better: 'high' },
      { k: 'steps', label: 'Pași pe km', get: (a) => a.details?.stepsPerKm, better: null, hint: 'câți pași faci la fiecare km; scade când pasul se lungește' },
      { k: 'cad', label: 'Cadență', unit: 'pași/min', get: (a) => a.cadence ?? a.details?.cadence, better: null, hint: 'la alergarea ușoară, 165–180 e o plajă obișnuită' },
      { k: 'stride', label: 'Lungimea pasului', unit: 'm', get: (a) => a.details?.strideM, fmt: (v) => dec(v, 2), better: null },
      ...COMMON_HR,
      { k: 'elev', label: 'Urcare', unit: 'm', get: (a) => a.details?.elevGainM, better: null },
      { k: 'time', label: 'Timp în mișcare', get: (a) => (a.details?.movingMin ?? a.minutes) * 60, fmt: mmssLong, better: null },
      ...ENERGY,
    ];
  if (sport === 'bicicleta')
    return [
      { k: 'spd', label: 'Viteză medie', unit: 'km/h', get: (a) => a.details?.avgSpeedKmh ?? (a.distanceKm && a.minutes ? (a.distanceKm / a.minutes) * 60 : null), fmt: (v) => dec(v), better: 'high' },
      { k: 'dist', label: 'Distanță', unit: 'km', get: (a) => a.distanceKm, fmt: (v) => dec(v), better: 'high' },
      { k: 'np', label: 'Putere normalizată', unit: 'W', get: (a) => a.details?.npWatts, better: 'high', hint: 'puterea „echivalentă” a turei, ține cont de variații' },
      { k: 'w', label: 'Putere medie', unit: 'W', get: (a) => a.watts ?? a.details?.avgWatts, better: 'high' },
      ...(ftp ? [{ k: 'if', label: 'Intensitate (IF)', get: (a: MeActivity) => (a.details?.npWatts ? a.details.npWatts / ftp : null), fmt: (v: number) => dec(v, 2), better: null as Better, hint: `putere normalizată / FTP (${ftp} W). Z2 ≈ 0,60–0,75` }] : []),
      { k: 'wmax', label: 'Putere maximă', unit: 'W', get: (a) => a.details?.maxWatts, better: 'high' },
      { k: 'cad', label: 'Cadență', unit: 'rpm', get: (a) => a.cadence ?? a.details?.cadence, better: null, hint: '80–95 rpm e plaja obișnuită pe plat' },
      { k: 'spdmax', label: 'Viteză maximă', unit: 'km/h', get: (a) => a.details?.maxSpeedKmh, fmt: (v) => dec(v), better: null },
      ...COMMON_HR,
      { k: 'elev', label: 'Urcare', unit: 'm', get: (a) => a.details?.elevGainM, better: null },
      { k: 'kj', label: 'Lucru mecanic', unit: 'kJ', get: (a) => a.details?.kj, better: null },
      ...ENERGY,
    ];
  if (sport === 'inot')
    return [
      { k: 'p100', label: 'Ritm mediu', unit: '/100 m', get: (a) => a.details?.pace100mSec ?? (a.distanceKm && a.distanceKm >= 0.05 ? (a.minutes * 60) / (a.distanceKm * 10) : null), fmt: mmss, better: 'low' },
      { k: 'cont', label: 'Cel mai lung fără oprire', unit: 'm', get: (a) => a.details?.continuousM, better: 'high', hint: 'ture legate fără pauză; asta contează pentru proba de cursă' },
      { k: 'lap', label: 'Cea mai rapidă tură', unit: '/100 m', get: (a) => a.details?.fastestLap100mSec, fmt: mmss, better: 'low' },
      { k: 'dist', label: 'Distanță', unit: 'm', get: (a) => (a.distanceKm != null ? Math.round(a.distanceKm * 1000) : null), fmt: (v) => v.toLocaleString('ro-RO'), better: 'high' },
      { k: 'cad', label: 'Brațe pe minut', get: (a) => a.cadence ?? a.details?.cadence, better: null },
      { k: 'laps', label: 'Ture', get: (a) => a.details?.laps, better: null },
      ...COMMON_HR,
      ...ENERGY,
    ];
  return [{ k: 'time', label: 'Durată', get: (a) => a.minutes * 60, fmt: mmssLong, better: null }, ...COMMON_HR, ...ENERGY];
}

function mmssLong(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function SessionDetails({ sport }: { sport: Sport }) {
  const me = useMe();
  const sessions = me.activities.filter((a) => a.sport === sport).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10);
  const [selId, setSelId] = useState<string | null>(null);
  const [metricK, setMetricK] = useState<string | null>(null);
  const ftpMatch = me.zones?.bike?.match(/FTP\s+(\d+)/);
  const ftp = ftpMatch ? Number(ftpMatch[1]) : null;

  if (!sessions.length) {
    return (
      <Card tight>
        <Label>Detalii antrenament</Label>
        <div className="small muted">Apar după primul antrenament sincronizat de la brățări.</div>
      </Card>
    );
  }

  const sel = sessions.find((s) => s.id === selId) ?? sessions[0]!;
  const all = metricsFor(sport, ftp);
  const shown = all.filter((m) => valid(m.get(sel)));
  const metric = shown.find((m) => m.k === metricK) ?? null;
  const dayLabel = (iso: string) => {
    const d = diffDays(iso, me.today);
    return d === 0 ? 'azi' : d === 1 ? 'ieri' : `${DAY_NAMES[weekday(iso)]} ${Number(iso.slice(8, 10))}`;
  };
  const fmt = (m: Metric, v: number) => (m.fmt ? m.fmt(v) : Math.round(v).toLocaleString('ro-RO'));
  const best = (m: Metric) => {
    if (!m.better) return null;
    const vs = sessions.map((s) => m.get(s)).filter(valid);
    if (vs.length < 2) return null;
    return m.better === 'low' ? Math.min(...vs) : Math.max(...vs);
  };
  const missingRun = sport === 'alergare' && sel.details?.fastestKmSec == null && sel.details?.stepsPerKm == null;

  return (
    <Card tight>
      <Label>Detalii antrenament</Label>
      <div className="det-pills" role="tablist" aria-label="Ședința">
        {sessions.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === sel.id} className={`det-pill ${s.id === sel.id ? 'on' : ''}`} onClick={() => setSelId(s.id)}>
            <b>{dayLabel(s.date)}</b>
            <small>{s.distanceKm != null ? (sport === 'inot' ? `${Math.round(s.distanceKm * 1000)} m` : `${dec(s.distanceKm)} km`) : `${s.minutes} min`}</small>
          </button>
        ))}
      </div>

      <Origin key={sel.id} act={sel} />
      {sel.details?.polyline && <Route polyline={sel.details.polyline} />}

      <div className="det-grid">
        {shown.map((m) => {
          const v = m.get(sel)!;
          const b = best(m);
          const isBest = b != null && v === b;
          return (
            <button key={m.k} className={`det-tile ${metric?.k === m.k ? 'on' : ''}`} onClick={() => setMetricK(metric?.k === m.k ? null : m.k)} aria-expanded={metric?.k === m.k}>
              <span className="det-l">{m.label}</span>
              <span className="det-v">
                {fmt(m, v)}
                {m.unit && <small>{m.unit}</small>}
              </span>
              {isBest && <span className="det-best">cel mai bun din ultimele {sessions.length}</span>}
            </button>
          );
        })}
      </div>

      {metric && <Trend metric={metric} sessions={sessions} selId={sel.id} fmt={(v) => fmt(metric, v)} dayLabel={dayLabel} onPick={setSelId} />}

      {sport === 'alergare' && sel.details?.splitsSecPerKm && sel.details.splitsSecPerKm.length > 1 && <Splits splits={sel.details.splitsSecPerKm} />}

      {sport === 'alergare' && sel.details?.bestEfforts && (
        <div className="det-sec">
          <div className="det-h">Cei mai buni timpi în ședința asta</div>
          <div className="det-efforts">
            {Object.entries(sel.details.bestEfforts).map(([k, v]) => (
              <span key={k} className="rec-chip">
                {k} <b>{v >= 3600 ? `${Math.floor(v / 3600)}:${mmss(v % 3600).padStart(5, '0')}` : mmss(v)}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {missingRun && <div className="tiny muted" style={{ marginTop: 10 }}>Cel mai rapid km și pașii pe km vin din Strava sau Apple Health (cu cadență). Apar după următoarea sincronizare.</div>}
      {metric?.hint && <div className="tiny muted" style={{ marginTop: 8 }}>{metric.hint}</div>}
    </Card>
  );
}

function valid(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function Trend({ metric, sessions, selId, fmt, dayLabel, onPick }: { metric: Metric; sessions: MeActivity[]; selId: string; fmt: (v: number) => string; dayLabel: (iso: string) => string; onPick: (id: string) => void }) {
  const pts = [...sessions].reverse().map((s) => ({ s, v: metric.get(s) })).filter((p): p is { s: MeActivity; v: number } => valid(p.v));
  if (pts.length < 2) return <div className="tiny muted det-sec">Evoluția apare după a doua ședință cu {metric.label.toLowerCase()}.</div>;
  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  // La ritm/timp, mai mic e mai bine: bara mai înaltă = mai rapid.
  const h = (v: number) => (hi === lo ? 45 : 15 + ((metric.better === 'low' ? hi - v : v - lo) / (hi - lo)) * 55);
  return (
    <div className="det-sec">
      <div className="det-h">{metric.label}: ultimele {pts.length} ședințe</div>
      <div className="det-trend">
        {pts.map((p) => (
          <button key={p.s.id} className={`det-col ${p.s.id === selId ? 'on' : ''}`} onClick={() => onPick(p.s.id)} aria-label={`${dayLabel(p.s.date)}: ${fmt(p.v)}`}>
            <span className="det-cv">{fmt(p.v)}</span>
            <span className="det-bar" style={{ height: `${h(p.v)}%` }} />
            <span className="det-cd">{dayLabel(p.s.date)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Splits({ splits }: { splits: number[] }) {
  const lo = Math.min(...splits);
  const hi = Math.max(...splits);
  return (
    <div className="det-sec">
      <div className="det-h">Timpul pe fiecare km</div>
      <div className="splits">
        {splits.map((s, i) => (
          <div key={i} className={`split ${s === lo ? 'fast' : ''}`}>
            <span className="sk">{i + 1}</span>
            <span className="sb">
              <i style={{ width: `${hi === lo ? 100 : 55 + ((hi - s) / (hi - lo)) * 45}%` }} />
            </span>
            <span className="st">{mmss(s)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Polyline Google („encoded polyline algorithm”) → [lat, lng]. */
function decode(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Traseul real al ședinței, din GPS; nordul e sus. */
function Route({ polyline }: { polyline: string }) {
  const pts = decode(polyline);
  if (pts.length < 2) return null;
  const k = Math.cos((pts.reduce((a, p) => a + p[0], 0) / pts.length) * (Math.PI / 180));
  const xs = pts.map((p) => p[1] * k);
  const ys = pts.map((p) => -p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 320, H = 170, pad = 14;
  const s = Math.min((W - 2 * pad) / (x1 - x0 || 1e-9), (H - 2 * pad) / (y1 - y0 || 1e-9));
  const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const P = pts.map((_, i) => [ox + (xs[i]! - x0) * s, oy + (ys[i]! - y0) * s] as const);
  const d = P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const a = P[0]!, b = P[P.length - 1]!;
  return (
    <div className="route">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Traseul ședinței">
        <path d={d} className="route-glow" />
        <path d={d} className="route-line" />
        <circle cx={a[0]} cy={a[1]} r="5" className="route-start" />
        <circle cx={b[0]} cy={b[1]} r="5" className="route-end" />
      </svg>
      <div className="route-legend">
        <span><i className="route-start" /> start</span>
        <span><i className="route-end" /> final</span>
      </div>
    </div>
  );
}

const SOURCE_NAME: Record<string, string> = { strava: 'Strava', whoop: 'WHOOP', apple: 'Apple Health', oura: 'Oura', garmin: 'Garmin' };
const FIX: { sport: 'inot' | 'bicicleta' | 'alergare' | 'forta'; label: string }[] = [
  { sport: 'alergare', label: 'Alergare' },
  { sport: 'bicicleta', label: 'Bicicletă' },
  { sport: 'inot', label: 'Înot' },
  { sport: 'forta', label: 'Forță' },
];

/** De unde vine ședința (numele dat de ceas) și corectura, dacă brățara a încurcat sportul. Corectura rămâne și după sincronizări. */
function Origin({ act }: { act: MeActivity }) {
  const { submitForm } = useData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fix = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await submitForm('activitate', { activityId: act.id, ...body });
      setOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="origin">
      <div className="tiny muted">
        {act.name ? `Înregistrat ca „${act.name.split(' · ')[0]!.split(';')[0]}” · ` : 'Înregistrat de '}{SOURCE_NAME[act.source] ?? act.source}
        {' · '}
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'închide' : 'nu e corect?'}
        </button>
      </div>
      {open && (
        <div className="origin-fix">
          <span className="tiny muted">E de fapt:</span>
          {FIX.filter((f) => f.sport !== act.sport).map((f) => (
            <button key={f.sport} className="pill" disabled={busy} onClick={() => void fix({ sport: f.sport })}>
              {f.label}
            </button>
          ))}
          <button className="pill" disabled={busy} onClick={() => void fix({ ignored: true })}>
            Nu e antrenament
          </button>
          {msg && <div className="tiny" style={{ color: 'var(--c-rosu)' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
