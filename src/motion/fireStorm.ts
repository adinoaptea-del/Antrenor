// „Fire → Furtună → Home” (specificația aprobată, 20.10.2026). Doar logica: geometria firelor, eroziunea, câmpul de
// mișcare al prafului (vânt + turbulență + frânare + resort spre țintă) și cronologia. Desenul e în
// apps/web/src/ui/WelcomeFire.tsx. Totul e determinist (seed fix, pas fix 1/60 s): aceeași rulare dă aceleași cadre.
// Valorile sunt setări artistice de pornire, nu măsurători.

export const FIRE = {
  /** Formarea din fire (ms de la pornire). Auditul grafic (20.10.2026, G03): 0–1.200 ms. */
  build: [0, 1200] as const,
  /** Mesajul începe înainte ca formarea să fie completă (~700 ms) și e lizibil la 1.200 ms (G03). */
  textIn: [700, 1200] as const,
  /** „Continuă” devine disponibil odată cu lizibilitatea mesajului. */
  ready: 1200,
  /**
   * Ieșirea (G02): fazele se suprapun, fără pauze — textul pleacă în 220 ms, ruperea începe la 100 ms (cât textul
   * încă se stinge), transportul 300–1.500, reasamblarea 1.100–2.100, predarea către Acasă 1.900–2.500.
   */
  exit: {
    textOut: [0, 220] as const,
    warp: [0, 600] as const,
    shakeAt: 160,
    shakeMs: 180,
    shakePx: 2,
    erode: [100, 650] as const,
    storm: [300, 1500] as const,
    gather: [1000, 2100] as const,
    handoff: 2100,
    content: [1900, 2300] as const,
    interface: [2100, 2500] as const,
  },
};
export const FIRE_EXIT_MS = FIRE.exit.interface[1];
export const FIRE_DT = 1 / 60;

export type FireState = 'BOOT' | 'LINE_BUILD' | 'WELCOME_IDLE' | 'BREAKUP' | 'STORM' | 'REFORM' | 'HOME_IDLE';
export function fireState(t: number, out: number | null): FireState {
  if (out == null) return t <= 0 ? 'BOOT' : t < FIRE.build[1] ? 'LINE_BUILD' : 'WELCOME_IDLE';
  if (out >= FIRE_EXIT_MS) return 'HOME_IDLE';
  if (out < FIRE.exit.storm[0] + 200) return 'BREAKUP';
  if (out < FIRE.exit.gather[0]) return 'STORM';
  return 'REFORM';
}
export const FIRE_LABEL: Record<string, string> = {
  LINE_BUILD: 'Firele construiesc',
  WELCOME_IDLE: 'Mesajul în sferă',
  BREAKUP: 'Ruperea',
  STORM: 'Furtuna',
  REFORM: 'Firele reconstruiesc',
  HOME_IDLE: 'Acasă',
};

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const span = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
export const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Generator determinist (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Filament {
  /** Planul firului: normala (în conul de 47° din jurul direcției privirii) și baza lui. */
  n: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  rf: number;
  bw: number;
  bph: number;
  start: number;
  dur: number;
  s0: number;
  /** Firul sosește din exteriorul volumului și se așază pe sferă. */
  outside: boolean;
  col: 0 | 1 | 2;
  width: number;
}
const norm = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Conul normalelor (47°): proiecțiile rămân elipse cu semiaxa mică ≥ 0,6 R, deci centrul rămâne liber pentru text. */
export const FIRE_CONE = (47 * Math.PI) / 180;

export function makeFilaments(seed = 7, n = 22): Filament[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, j) => {
    const tilt = r() * FIRE_CONE;
    const az = r() * Math.PI * 2;
    const nn = norm(Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), Math.cos(tilt));
    const ref: [number, number, number] = Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(...cross(nn, ref));
    const v = norm(...cross(nn, u));
    const k = r();
    return {
      n: nn,
      u,
      v,
      rf: 0.94 + r() * 0.1,
      bw: (2 * Math.PI) / (5 + r() * 3), // respirație cu perioadă de 5–8 s, fază proprie
      bph: r() * Math.PI * 2,
      start: j * 22 + r() * 20, // porniri decalate cu ~20–40 ms (formarea în 1,2 s, G03)
      dur: 500 + r() * 180,
      s0: r() * Math.PI * 2,
      outside: r() < 0.3,
      col: k < 0.45 ? 0 : k < 0.88 ? 1 : 2, // lime folosit rar
      width: 0.7 + r() * 0.8,
    };
  });
}

/** Punctul s (0..2π) al firului, în coordonatele sferei (px, centrul în 0), la momentul t (s). */
export function filamentPoint(f: Filament, s: number, t: number, R: number): [number, number, number] {
  const br = 1 + 0.015 * Math.sin(2 * s + t * f.bw + f.bph) + 0.008 * Math.sin(3 * s - t * f.bw * 0.7 + f.bph * 1.3);
  const r = R * f.rf * br;
  const c = Math.cos(s);
  const sn = Math.sin(s);
  let x = r * (c * f.u[0] + sn * f.v[0]);
  let y = r * (c * f.u[1] + sn * f.v[1]);
  const z = r * (c * f.u[2] + sn * f.v[2]);
  // Rotația lentă a volumului în jurul axei privirii (nu un vârtej: doar respirația sferei).
  const a = t * 0.05;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  [x, y] = [x * ca - y * sa, x * sa + y * ca];
  return [x, y, z];
}

/** Proiecția cu perspectivă discretă; adâncimea 0 (spate) … 1 (față). */
export function project(p: [number, number, number], cx: number, cy: number, R: number) {
  const f = 6 / (6 - p[2] / Math.max(1, R));
  return { x: cx + p[0] * f, y: cy + p[1] * f, depth: clamp01((p[2] / Math.max(1, R) + 1) / 2), scale: f };
}

/** Formarea: cât din lungimea firului e desenată (arc), și raza (unele vin din afară și se așază). */
export function buildOf(f: Filament, t: number): { reveal: number; scale: number } {
  const u = easeInOut(clamp01((t - f.start) / f.dur));
  return { reveal: u, scale: f.outside ? 1 + 0.6 * (1 - u) : 1 };
}

/** Zonele de eroziune: ruperea începe din mai multe locuri, decalat. */
export interface Zone {
  c: [number, number, number];
  o: number;
}
export function makeZones(seed = 11, n = 4): Zone[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const th = r() * Math.PI * 2;
    const z = r() * 2 - 1;
    const s = Math.sqrt(1 - z * z);
    return { c: [s * Math.cos(th), s * Math.sin(th), z], o: FIRE.exit.erode[0] + i * 70 + r() * 40 };
  });
}
/** Momentul în care se rupe punctul (direcția lui pe sferă, unitar): de la cea mai apropiată zonă, spre exterior. */
export function erosionTime(p: [number, number, number], zones: Zone[], jitter = 0): number {
  let best = Infinity;
  for (const z of zones) {
    const d = Math.acos(Math.max(-1, Math.min(1, p[0] * z.c[0] + p[1] * z.c[1] + p[2] * z.c[2])));
    best = Math.min(best, z.o + (d / Math.PI) * 300);
  }
  return Math.min(FIRE.exit.erode[1], best + jitter);
}

// ——— Câmpul de mișcare al prafului: fără vârtej global ———
/** Vântul: rafale predominant transversale (oblic), cu direcție și amplitudine care evoluează lent. */
export function windAt(x: number, y: number, t: number): [number, number] {
  const dir = -0.28 + 0.32 * Math.sin(t * 0.37 + 0.8) + 0.12 * Math.sin(t * 1.1 + y * 0.004);
  const gust = 0.55 + 0.45 * Math.sin(t * 0.9 + x * 0.006 - y * 0.003) * Math.sin(t * 0.53 + 1.7);
  const A = 170 * gust; // ieșirea comprimată (auditul grafic G02): rafale mai puternice, același câmp
  return [Math.cos(dir) * A, Math.sin(dir) * A];
}
/** Turbulența: câmp coerent (rotorul unui potențial pe trei scări) — vârtejuri mici, locale, nu o circulație în jurul centrului. */
export function turbAt(x: number, y: number, t: number): [number, number] {
  let vx = 0;
  let vy = 0;
  const scales: [number, number, number][] = [
    [0.008, 90, 0.6],
    [0.019, 55, 1.1],
    [0.041, 28, 1.7],
  ];
  for (const [k, a, w] of scales) {
    // ψ = sin(kx + wt)·cos(ky − 0.7wt); v = (∂ψ/∂y, −∂ψ/∂x)
    const sx = Math.sin(k * x + w * t);
    const cx = Math.cos(k * x + w * t);
    const sy = Math.sin(k * y - 0.7 * w * t);
    const cy = Math.cos(k * y - 0.7 * w * t);
    vx += a * (-sx * sy);
    vy += -a * (cx * cy);
  }
  return [vx, vy];
}
/** Atracția spre țintă: pornește eșalonat; resort critic amortizat (amortizare 2√k → fără oscilații ample). */
export const SPRING_K = 160;
export const SPRING_C = 2 * Math.sqrt(SPRING_K);
export function gatherWeight(out: number, stagger: number): number {
  const a = FIRE.exit.gather[0] + stagger * 350;
  return smooth((out - a) / 350);
}
/** Unda/compresia spațiului (doar decor), lată și slabă: amplitudinea în px. */
export function warpAmp(out: number | null): number {
  if (out == null) return 0;
  return 4 * Math.sin(Math.PI * span(out, FIRE.exit.warp));
}
/** Shake-ul: un impuls scurt, amortizat, de ~2 px (doar decorul). */
export function fireShake(out: number | null): [number, number] {
  if (out == null) return [0, 0];
  const u = (out - FIRE.exit.shakeAt) / FIRE.exit.shakeMs;
  if (u < 0 || u > 1) return [0, 0];
  const d = Math.exp(-3 * u) * (1 - u) * FIRE.exit.shakePx;
  return [d * Math.sin(u * Math.PI * 4), d * 0.6 * Math.sin(u * Math.PI * 4 + 1.2)];
}

export function fireTextAlpha(t: number, out: number | null): number {
  return smooth(span(t, FIRE.textIn)) * (out == null ? 1 : 1 - smooth(span(out, FIRE.exit.textOut)));
}
export function fireContentAlpha(out: number | null): number {
  return out == null ? 0 : smooth(span(out, FIRE.exit.content));
}
export function fireSceneOpacity(out: number | null): number {
  return out == null ? 1 : 1 - smooth(span(out, FIRE.exit.interface));
}

/**
 * Starea prafului (typed arrays, fără alocări pe cadru). Fiecare granulă are o sursă stabilă (firul și eșantionul din
 * care se naște) și o țintă stabilă pe sfera de Acasă.
 */
export interface Grains {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  born: Uint8Array;
  attached: Uint8Array;
  depth: Float32Array;
  size: Float32Array;
  stagger: Float32Array;
  srcF: Uint16Array;
  srcS: Float32Array;
  emitAt: Float32Array;
  col: Uint8Array;
}
export function makeGrains(n: number, filaments: Filament[], zones: Zone[], seed = 23): Grains {
  const r = rng(seed);
  const g: Grains = {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    born: new Uint8Array(n),
    attached: new Uint8Array(n),
    depth: new Float32Array(n),
    size: new Float32Array(n),
    stagger: new Float32Array(n),
    srcF: new Uint16Array(n),
    srcS: new Float32Array(n),
    emitAt: new Float32Array(n),
    col: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const f = Math.floor(r() * filaments.length);
    const s = r() * Math.PI * 2;
    g.srcF[i] = f;
    g.srcS[i] = s;
    const fl = filaments[f]!;
    const c = Math.cos(s);
    const sn = Math.sin(s);
    const dir: [number, number, number] = [c * fl.u[0] + sn * fl.v[0], c * fl.u[1] + sn * fl.v[1], c * fl.u[2] + sn * fl.v[2]];
    g.emitAt[i] = erosionTime(dir, zones, (r() - 0.5) * 60) + r() * 40;
    const d = r();
    g.depth[i] = d;
    // Praf îndepărtat: fin; apropiat: puțin mai mare (câteva granule până la 2 px).
    g.size[i] = d > 0.97 ? 1.5 + r() * 0.5 : 0.35 + d * 0.85;
    g.stagger[i] = r();
    g.col[i] = fl.col;
  }
  return g;
}

/**
 * Un pas fix de simulare. `source(i)` dă poziția curentă a eșantionului-sursă (pentru naștere), `target(i)` ținta pe
 * sfera de Acasă. Accelerația = vânt + turbulență − frânare·viteză + atracție·resort (cu amortizare critică).
 */
export function stepGrains(g: Grains, out: number, tSec: number, source: (i: number) => [number, number, number, number], target: (i: number) => [number, number] | null, onAttach?: (i: number) => void) {
  const dt = FIRE_DT;
  const drag = 0.9;
  for (let i = 0; i < g.n; i++) {
    if (!g.born[i]) {
      if (out < g.emitAt[i]!) continue;
      const [sx, sy, tx, ty] = source(i);
      g.born[i] = 1;
      g.x[i] = sx;
      g.y[i] = sy;
      // Pornește din segmentul care dispare, cu o viteză mică pe tangentă și spre exterior.
      g.vx[i] = tx * (25 + 35 * g.depth[i]!);
      g.vy[i] = ty * (25 + 35 * g.depth[i]!);
      continue;
    }
    if (g.attached[i]) continue;
    const x = g.x[i]!;
    const y = g.y[i]!;
    const k = 0.5 + 0.8 * g.depth[i]!;
    const w = gatherWeight(out, g.stagger[i]!);
    const free = (1 - w) * (1 - w);
    const [wx, wy] = windAt(x, y, tSec);
    const [ux, uy] = turbAt(x, y, tSec + g.stagger[i]! * 3);
    let ax = (wx + ux * 1.6) * k * free - drag * g.vx[i]!;
    let ay = (wy + uy * 1.6) * k * free - drag * g.vy[i]!;
    if (w > 0) {
      const T = target(i);
      if (T) {
        ax += w * (SPRING_K * (T[0] - x) - SPRING_C * g.vx[i]!);
        ay += w * (SPRING_K * (T[1] - y) - SPRING_C * g.vy[i]!);
        if (w > 0.95 && Math.hypot(T[0] - x, T[1] - y) < 2.5) {
          g.attached[i] = 1;
          onAttach?.(i);
        }
      }
    }
    g.vx[i] = g.vx[i]! + ax * dt;
    g.vy[i] = g.vy[i]! + ay * dt;
    g.x[i] = x + g.vx[i]! * dt;
    g.y[i] = y + g.vy[i]! * dt;
  }
}

/** Câte particule: telefon 3.000–6.000, desktop 6.000–12.000; mai puține pe dispozitive slabe. */
export function grainCount(width: number, cores: number): number {
  const mobile = width < 700;
  if (cores <= 4) return mobile ? 3000 : 6000;
  return mobile ? 5000 : 10000;
}
