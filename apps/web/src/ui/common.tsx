import type { ReactNode } from 'react';
import type { Color } from '@core/types.js';

// ---------- Primitive ----------

export function Card({ children, className = '', tight = false, style }: { children: ReactNode; className?: string; tight?: boolean; style?: React.CSSProperties }) {
  return (
    <section className={`card ${tight ? 'tight' : ''} ${className}`} style={style}>
      {children}
    </section>
  );
}

export function Dot({ color }: { color: Color }) {
  return <i className={`dot ${color}`} aria-hidden="true" />;
}

export function Label({ children, lime = false, icon }: { children: ReactNode; lime?: boolean; icon?: ReactNode }) {
  return (
    <div className={`lab ${lime ? 'lime' : ''}`}>
      {icon}
      {children}
    </div>
  );
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}

export function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const months = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'];
  return `${d} ${months[(m ?? 1) - 1]}`;
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export const DAY_NAMES = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];

// ---------- Bara de sus ----------

export function TopBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <header className="top">
      <div className="top-l">{left}</div>
      <div className="top-c">{center}</div>
      <div className="top-r">{right}</div>
    </header>
  );
}

export function CircleBtn({ icon, label, onClick }: { icon: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button className="circ" onClick={onClick} aria-label={label} title={label}>
      {icon}
    </button>
  );
}

export function Avatar({ name, onClick }: { name: string; onClick?: () => void }) {
  if (!onClick)
    return (
      <span className="avatar" aria-hidden="true">
        <span>{name.slice(0, 1)}</span>
      </span>
    );
  return (
    <button className="avatar" onClick={onClick} aria-label="Profil" title="Profil">
      <span>{name.slice(0, 1)}</span>
    </button>
  );
}

export function LiveTitle({ children }: { children: ReactNode }) {
  return <div className="live">{children}</div>;
}

// ---------- Carduri de statistică ----------

export function Stat({ icon, label, value, unit, children, lime = false }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; children?: ReactNode; lime?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-h">
        <span className="ic">{icon}</span>
        <span className="lb">{label}</span>
      </div>
      <div className="stat-v">
        <span className={`num ${lime ? 'lime' : ''}`}>{value}</span>
        {unit && <span className="u">{unit}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------- Inel ----------

export function Ring({ value, size = 150, stroke = 10, level, children }: { value: number | null; size?: number; stroke?: number; level?: string | null; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className={`ring-arc ${level ? `lvl-${level}` : ''}`}
            strokeWidth={stroke}
            strokeDasharray={`${(c * v) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

export function Ecg({ width = 90, height = 18 }: { width?: number; height?: number }) {
  const d = `M0 ${height / 2}h${width * 0.22}l${width * 0.04} -${height * 0.3}l${width * 0.05} ${height * 0.9}l${width * 0.05} -${height}l${width * 0.05} ${height * 0.7}l${width * 0.04} -${height * 0.3}h${width * 0.2}l${width * 0.04} -${height * 0.25}l${width * 0.04} ${height * 0.5}l${width * 0.03} -${height * 0.25}h${width * 0.24}`;
  return (
    <svg className="ecg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ---------- Grafice ----------

type Pt = { x: number; y: number };

export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0]!.x} ${pts[0]!.y}`;
  let d = `M${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({
  values,
  labels,
  max,
  ticks,
  height = 150,
  tag,
}: {
  values: (number | null)[];
  labels: string[];
  max: number;
  ticks: number[];
  height?: number;
  tag?: (v: number) => string;
}) {
  const W = 320;
  const H = height;
  const padL = 30;
  const padR = 18;
  const padT = 16;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = values.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + innerH - (Math.min(v, max) / max) * innerH;
  const pts: Pt[] = values.map((v, i) => ({ x: Math.round(x(i)), y: Math.round(y(v ?? 0)) }));
  const known = pts.filter((_, i) => values[i] != null);
  const line = smoothPath(known);
  const area = known.length ? `${line} L${known[known.length - 1]!.x} ${padT + innerH} L${known[0]!.x} ${padT + innerH} Z` : '';
  const last = known[known.length - 1];
  const lastV = values.filter((v): v is number => v != null).pop();
  const gid = `g${Math.round(max * 7 + height)}`;
  return (
    <svg className="area" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 6} y={y(t) + 3} className="tick" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {area && <path d={area} fill={`url(#${gid})`} />}
      {line && <path d={line} className="line" />}
      {known.map((p) => (
        <circle key={p.x} cx={p.x} cy={p.y} r="3.5" className="pt" />
      ))}
      {labels.map((l, i) => (
        <text key={l + i} x={x(i)} y={H - 6} className="tick" textAnchor="middle">
          {l}
        </text>
      ))}
      {last && lastV != null && tag && (
        <g transform={`translate(${Math.min(last.x, W - padR - 14)} ${last.y - 18})`}>
          <rect x="-15" y="-9" width="30" height="16" rx="8" className="tagbg" />
          <text x="0" y="3" className="tagtx" textAnchor="middle">
            {tag(lastV)}
          </text>
        </g>
      )}
    </svg>
  );
}

export function Spark({ values, kind = 'line', height = 30 }: { values: number[]; kind?: 'line' | 'bars'; height?: number }) {
  const W = 120;
  const H = height;
  const max = Math.max(1, ...values);
  if (kind === 'bars') {
    const bw = W / values.length;
    return (
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true" preserveAspectRatio="none">
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * (H - 2));
          return <rect key={i} x={i * bw + bw * 0.25} y={H - h} width={bw * 0.5} height={h} rx="2" className={v === 0 ? 'bar empty' : 'bar'} />;
        })}
      </svg>
    );
  }
  const pts: Pt[] = values.map((v, i) => ({ x: Math.round((i * (W - 8)) / Math.max(1, values.length - 1)) + 4, y: Math.round(H - 3 - (v / max) * (H - 8)) }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1]!.x} ${H} L${pts[0]!.x} ${H} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true" preserveAspectRatio="none">
      <path d={area} className="sparea" />
      <path d={line} className="line" />
      <circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r="3" className="pt" />
    </svg>
  );
}

// Hartă stilizată: străzi șterse, traseu punctat lime, steag la final.
export function MiniMap({ height = 104 }: { height?: number }) {
  return (
    <svg className="map" viewBox="0 0 160 104" width="100%" height={height} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="104" rx="14" fill="var(--surface-2)" />
      <g className="streets">
        <path d="M0 22h160M0 48h160M0 78h160M28 0v104M66 0v104M98 0v104M136 0v104M0 96L160 10" />
      </g>
      <path d="M18 80C40 70 44 40 66 46S92 78 110 62s20-30 36-36" className="route" />
      <circle cx="18" cy="80" r="4" className="start" />
      <circle cx="66" cy="46" r="3" className="start" />
      <g transform="translate(146 26)">
        <path d="M0 0v-14" className="flag-pole" />
        <path d="M0-14h9l-2.5 3.5L9-7H0z" className="flag" />
      </g>
    </svg>
  );
}

export function PoolMap({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="map" viewBox="0 0 320 120" width="100%" height={120} aria-hidden="true" preserveAspectRatio="none">
        <rect width="320" height="120" rx="16" fill="var(--surface-2)" />
        <g className="streets">
          <path d="M0 30c20-8 40-8 60 0s40 8 60 0 40-8 60 0 40 8 60 0 40-8 80 0M0 60c20-8 40-8 60 0s40 8 60 0 40-8 60 0 40 8 60 0 40-8 80 0M0 90c20-8 40-8 60 0s40 8 60 0 40-8 60 0 40 8 60 0 40-8 80 0" />
        </g>
        <path d="M40 84C90 40 150 40 200 60s80 10 90-30" className="route" />
        <circle cx="40" cy="84" r="4" className="start" />
        <circle cx="160" cy="50" r="5" className="buoy" />
        <circle cx="290" cy="30" r="5" className="buoy" />
      </svg>
    );
  }
  return (
    <svg className="map" viewBox="0 0 320 120" width="100%" height={120} aria-hidden="true" preserveAspectRatio="none">
      <rect width="320" height="120" rx="16" fill="var(--surface-2)" />
      <g className="lanes">
        <path d="M0 24h320M0 48h320M0 72h320M0 96h320" />
      </g>
      <path d="M24 60h272" className="route" />
      <circle cx="24" cy="60" r="4" className="start" />
      <circle cx="296" cy="60" r="4" className="start" />
      <path d="M150 60c6-6 12-6 18 0s12 6 18 0" className="swimmer" />
    </svg>
  );
}

// Ilustrații pentru cele trei sporturi: pictograme cu linie albă groasă și accent roșu (culorile Ironman).
export function SwimArt() {
  return (
    <svg className="art" viewBox="0 0 120 130" aria-hidden="true">
      <path d="M0 96c10-7 20-7 30 0s20 7 30 0 20-7 30 0 20 7 30 0" className="red" />
      <path d="M0 110c10-7 20-7 30 0s20 7 30 0 20-7 30 0 20 7 30 0" className="red" style={{ opacity: 0.45 }} />
      <path d="M18 100 58 88" className="ink" style={{ opacity: 0.28 }} />
      <path d="M40 86h20" className="ink" />
      <path d="M58 84 48 58 72 46" className="ink" />
      <circle cx="76" cy="70" r="10" className="ink-fill" />
      <circle cx="88" cy="52" r="2.5" className="red-fill" />
      <circle cx="96" cy="60" r="2" className="red-fill" />
      <circle cx="84" cy="44" r="1.8" className="red-fill" />
    </svg>
  );
}

export function BikeArt() {
  return (
    <svg className="art" viewBox="0 0 120 130" aria-hidden="true">
      <path d="M8 122h104" className="red-thin" />
      <circle cx="32" cy="100" r="17" className="red" />
      <circle cx="90" cy="100" r="17" className="red" />
      <circle cx="32" cy="100" r="3" className="red-fill" />
      <circle cx="90" cy="100" r="3" className="red-fill" />
      <path d="M32 100 60 102 50 70 84 74 60 102M50 70 32 100M84 74 90 100M44 68h12M82 68h10" className="ink" style={{ strokeWidth: 4.5 }} />
      <path d="M50 66 76 44M76 44 88 66" className="ink" />
      <path d="M50 66 56 88 54 98" className="ink" style={{ opacity: 0.5 }} />
      <path d="M50 66 70 82 66 108" className="ink" />
      <circle cx="86" cy="35" r="8.5" className="ink-fill" />
    </svg>
  );
}

export function RunArt() {
  return (
    <svg className="art" viewBox="0 0 120 130" aria-hidden="true">
      <path d="M6 122c30-10 70-10 108 0" className="red-thin" />
      <path d="M22 62h12M14 72h14" className="red" style={{ opacity: 0.7 }} />
      <circle cx="66" cy="22" r="8.5" className="ink-fill" />
      <path d="M64 33 54 70" className="ink" style={{ strokeWidth: 13 }} />
      <path d="M63 38 78 50 84 36M63 38 48 52 40 42M54 70 74 86 72 114M54 70 40 92 26 84" className="ink" />
    </svg>
  );
}

// ---------- Icoane (linie, 24 px) ----------

function I({ d, extra }: { d: string; extra?: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="i">
      <path d={d} />
      {extra}
    </svg>
  );
}

export const Icons = {
  download: <I d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
  alert: <I d="M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.2v.3" />,
  stop: <I d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3ZM8.5 12h7" />,
  move: <I d="M4 12h16M16 8l4 4-4 4M8 4v4M8 16v4" />,
  plane: <I d="M10.5 13.5 3 11l1.5-1.5 7 1L16 6c1-1 2.6-1.4 3.3-.7.7.7.3 2.3-.7 3.3l-4.5 4.5 1 7L13.6 21.6 11 14Z" />,
  users: <I d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.8 3.1 2.6 3.5 5.2" />,
  bowl: <I d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0ZM8.5 8c0-1.6 1-2.1 1-3.5M12 8c0-1.6 1-2.1 1-3.5M15.5 8c0-1.6 1-2.1 1-3.5" />,
  home: <I d="M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5h4v5" />,
  trend: <I d="M4 19h16M5 16l4.5-5 3.5 3 6-7M15 7h4v4" />,
  info: <I d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01" />,
  shield: <I d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />,
  sliders: <I d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" />,
  grid: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="i">
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2.2" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="i">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  calendar: <I d="M3.5 10h17M8 3v4M16 3v4" extra={<rect x="3.5" y="5" width="17" height="15" rx="3.5" />} />,
  chat: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="i">
      <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.5L7 20.5V17a3 3 0 0 1-3-3z" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <path d="M12 4V2" />
    </svg>
  ),
  arrowRight: <I d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <I d="M19 12H5M11 6l-6 6 6 6" />,
  sparkle: <I d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  moon: <I d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  pulse: <I d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
  trophy: <I d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4.5A2.5 2.5 0 0 0 7 8.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5M12 14v3M8.5 20h7M9.5 17h5v3h-5z" />,
  timer: <I d="M12 10v3.5l2 1.5M9 3h6M12 3v3" extra={<circle cx="12" cy="13.5" r="7" />} />,
  thermo: <I d="M10 4a2 2 0 0 1 4 0v9.5a3.5 3.5 0 1 1-4 0zM12 13V8" />,
  sun: <I d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" extra={<circle cx="12" cy="12" r="3.5" />} />,
  wind: <I d="M4 10h10a2.5 2.5 0 1 0-2.5-2.5M4 14h13a2.5 2.5 0 1 1-2.5 2.5" />,
  heart: <I d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  route: <I d="M7 18h5a3 3 0 0 0 0-6h-1a3 3 0 0 1 0-6h7" extra={<><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /></>} />,
  clock: <I d="M12 7v5l3 2" extra={<circle cx="12" cy="12" r="8.5" />} />,
  waves: <I d="M3 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M3 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" />,
  bike: <I d="M6 16l4-7h5l3 7M10 9l3 7h5M13 9l-1-3h3" extra={<><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /></>} />,
  run: <I d="M13 7l-3 4 3 2.5-2 5.5M13 7l4 1.5 2 3M10 11l-4 1M11 13.5l-4 5" extra={<circle cx="15" cy="4" r="1.8" />} />,
  dumbbell: <I d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12" />,
  check: <I d="M5 12l4.5 4.5L19 7" />,
  bell: <I d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />,
  gps: <I d="M12 2v3M12 19v3M2 12h3M19 12h3" extra={<><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7.5" /></>} />,
  chevronDown: <I d="M6 9l6 6 6-6" />,
  chevronLeft: <I d="M15 6l-6 6 6 6" />,
  chevronRight: <I d="M9 6l6 6-6 6" />,
  droplet: <I d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  user: <I d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" extra={<circle cx="12" cy="8" r="4" />} />,
  watch: <I d="M8 5h8M8 19h8M12 10v2.5l1.5 1" extra={<rect x="6" y="5" width="12" height="14" rx="4" />} />,
  flag: <I d="M5 21V4M5 4h11l-2.5 4L16 12H5" />,
  refresh: <I d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />,
  edit: <I d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />,
  send: <I d="M4 12l16-8-5 16-3-6z" />,
  live: <I d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" extra={<circle cx="12" cy="12" r="1.5" fill="currentColor" />} />,
};
