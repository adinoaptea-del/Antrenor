// Dizolvarea ecranului secundar la întoarcerea pe Acasă — aceeași idee ca ieșirea din întâmpinare (src/motion/fireStorm.ts,
// regula 27), comprimată (~1,3 s): ecranul însuși (imaginea lui) se erodează din 4 zone, fiecare bucată ruptă devine
// praf cu culoarea ei reală, praful e purtat de rafale oblice + turbulență locală (fără vârtej), apoi un resort amortizat
// îl strânge în bula de Acasă, unde se stinge. Logică pură, deterministă (seed fix); desenul e în ui/Dissolve.tsx.

import { turbAt, windAt } from './fireStorm.js';

export const DISSOLVE = {
  /** Celula de eroziune (px CSS): o celulă ruptă = o granulă. */
  cell: 2,
  /** Fereastra eroziunii: prima zonă se rupe la start, ultima celulă până la `erode` ms. */
  erode: 520,
  /** Shake-ul unic al imaginii (px, ms), ca la întâmpinare. */
  shakePx: 2,
  shakeMs: 180,
  /** După desprindere: zbor liber, apoi strângerea (resort) în bulă. */
  freeMs: 260,
  gatherMs: 520,
} as const;
export const DISSOLVE_TOTAL_MS = DISSOLVE.erode + DISSOLVE.freeMs + DISSOLVE.gatherMs + 120;
export const DISSOLVE_DT = 1 / 60;
const SPRING_K = 150;
const SPRING_C = 2 * Math.sqrt(SPRING_K);

export function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const smooth = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

/** 4 zone de rupere (u, v în 0..1), cu decalaj: prima pornește la 0, următoarele la ~70 ms una după alta. */
export function dissolveZones(seed = 7): { u: number; v: number; o: number }[] {
  return [0, 1, 2, 3].map((i) => ({ u: 0.1 + hash(i, seed) * 0.8, v: 0.08 + hash(i, seed + 1) * 0.84, o: i * 70 + hash(i, seed + 2) * 40 }));
}

/** Când se rupe punctul (u, v): de la cea mai apropiată zonă spre exterior, cu zgomot pe margine (ms). */
export function erosionAt(u: number, v: number, aspect: number, zones: { u: number; v: number; o: number }[], jitter: number): number {
  let best = Infinity;
  for (const z of zones) {
    const d = Math.hypot((u - z.u) * aspect, v - z.v) / Math.hypot(aspect, 1);
    best = Math.min(best, z.o + d * 900);
  }
  return Math.max(0, Math.min(DISSOLVE.erode, best + jitter));
}

export interface DGrains {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  born: Float32Array;
  /** Culoarea reală a bucății de ecran (0..255). */
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  tx: Float32Array;
  ty: Float32Array;
  done: Uint8Array;
  alive: Uint8Array;
}

/**
 * Granulele din celulele cu conținut ale imaginii (nu din fundalul gol): poziția, culoarea și momentul ruperii. `cells`
 * vine din imaginea ecranului (ui/Dissolve.tsx), deja filtrată și limitată ca număr.
 */
export function makeDGrains(cells: { x: number; y: number; r: number; g: number; b: number; t: number }[], target: { cx: number; cy: number; r: number }): DGrains {
  const n = cells.length;
  const G: DGrains = { n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), born: new Float32Array(n), r: new Uint8Array(n), g: new Uint8Array(n), b: new Uint8Array(n), tx: new Float32Array(n), ty: new Float32Array(n), done: new Uint8Array(n), alive: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const c = cells[i]!;
    G.x[i] = c.x;
    G.y[i] = c.y;
    G.born[i] = c.t;
    G.r[i] = c.r;
    G.g[i] = c.g;
    G.b[i] = c.b;
    // Ținta: în bulă, mai des spre margine (cum se atașează praful la firele bulei la întâmpinare).
    const a = hash(i, 21) * Math.PI * 2;
    const rr = target.r * (0.55 + 0.45 * Math.sqrt(hash(i, 22)));
    G.tx[i] = target.cx + Math.cos(a) * rr;
    G.ty[i] = target.cy + Math.sin(a) * rr;
  }
  return G;
}

/** Un pas fix de simulare la momentul t (ms de la start). */
export function stepDGrains(G: DGrains, t: number): void {
  const dt = DISSOLVE_DT;
  const ts = t / 1000;
  for (let i = 0; i < G.n; i++) {
    if (G.done[i]) continue;
    const age = t - G.born[i]!;
    if (age < 0) continue;
    const x = G.x[i]!;
    const y = G.y[i]!;
    if (!G.alive[i]) {
      G.alive[i] = 1;
      // Se desprinde cu un impuls mic, spre exterior și oblic.
      G.vx[i] = 30 + hash(i, 31) * 50;
      G.vy[i] = -20 - hash(i, 32) * 40;
    }
    const w = smooth((age - DISSOLVE.freeMs) / DISSOLVE.gatherMs);
    const free = (1 - w) * (1 - w);
    const [wx, wy] = windAt(x, y, ts);
    const [ux, uy] = turbAt(x, y, ts + hash(i, 33) * 3);
    let ax = (wx * 2.2 + ux * 3) * free - 1.2 * G.vx[i]!;
    let ay = (wy * 2.2 + uy * 3) * free - 1.2 * G.vy[i]!;
    if (w > 0) {
      ax += w * (SPRING_K * (G.tx[i]! - x) - SPRING_C * G.vx[i]!);
      ay += w * (SPRING_K * (G.ty[i]! - y) - SPRING_C * G.vy[i]!);
    }
    G.vx[i] = G.vx[i]! + ax * dt;
    G.vy[i] = G.vy[i]! + ay * dt;
    G.x[i] = x + G.vx[i]! * dt;
    G.y[i] = y + G.vy[i]! * dt;
    if (age > DISSOLVE.freeMs + DISSOLVE.gatherMs + 80) G.done[i] = 1;
  }
}

/**
 * Culoarea și opacitatea granulei: pornește cu culoarea bucății de ecran, trece spre paleta bulei în zbor și se stinge
 * când ajunge în bulă.
 */
const PAL: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];
export function grainLook(G: DGrains, i: number, t: number): { r: number; g: number; b: number; a: number } | null {
  if (!G.alive[i] || G.done[i]) return null;
  const age = t - G.born[i]!;
  const k = smooth(age / (DISSOLVE.freeMs + 150));
  const k2 = hash(i, 41);
  const p = PAL[k2 < 0.45 ? 0 : k2 < 0.88 ? 1 : 2]!;
  // Granulele din fundalul cardurilor (închise la culoare) se luminează spre paletă, ca praful să se vadă.
  const r = G.r[i]! + (p[0] - G.r[i]!) * k;
  const g = G.g[i]! + (p[1] - G.g[i]!) * k;
  const b = G.b[i]! + (p[2] - G.b[i]!) * k;
  const end = DISSOLVE.freeMs + DISSOLVE.gatherMs;
  const a = 1 - smooth((age - end + 160) / 240);
  return { r, g, b, a: Math.max(0, a) };
}
