// Dizolvarea ecranului secundar în praf, la întoarcerea pe Acasă (cererea lui Cuza, 20.10.2026): după „Trimite” într-un
// formular și la orice „înapoi” spre Acasă, fereastra se erodează rapid în granule (același praf ca întâmpinarea:
// src/motion/fireStorm.ts), iar granulele zboară în bula de Acasă. Logica e pură și deterministă (seed fix), desenul e
// în ui/Dissolve.tsx.

export const DISSOLVE = {
  /** Cât durează eroziunea ecranului (ms): pragul fiecărei celule e în [0, ERODE]. */
  erode: 420,
  /** Viața unei granule după ce s-a desprins (ms). */
  lifeMin: 420,
  lifeMax: 640,
  /** Celula măștii (px CSS). */
  cell: 8,
} as const;

/** Durata totală, până dispare ultima granulă. */
export const DISSOLVE_TOTAL_MS = DISSOLVE.erode + DISSOLVE.lifeMax;

/** Zgomot determinist în [0, 1). */
export function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Pragul (0..1) la care se desprinde punctul (u, v) din ecran (coordonate 0..1): un front dinspre colțul de sus-stânga
 * (unde e „înapoi”) amestecat cu zgomot pe celule, ca marginea să fie ruptă, nu o linie.
 */
export function threshold(u: number, v: number, cellIndex: number): number {
  const front = (u * 0.4 + v * 0.6) * 0.78;
  const noise = hash(cellIndex, 3) * 0.22;
  return Math.min(1, Math.max(0, front + noise));
}

export interface Grains {
  n: number;
  x0: Float32Array;
  y0: Float32Array;
  /** Momentul desprinderii (ms de la start). */
  born: Float32Array;
  life: Float32Array;
  /** Derivă inițială (px), rafala oblică. */
  dx: Float32Array;
  dy: Float32Array;
  /** Ținta în bulă (px). */
  tx: Float32Array;
  ty: Float32Array;
  size: Float32Array;
  col: Uint8Array;
}

/**
 * Granulele pentru un dreptunghi W × H (px CSS), cu ținta în jurul centrului bulei (cx, cy, raza r).
 * Culoarea: aceeași paletă ca întâmpinarea (0 cyan 45%, 1 verde 43%, 2 lime 12%).
 */
export function makeGrains(n: number, W: number, H: number, target: { cx: number; cy: number; r: number }): Grains {
  const g: Grains = {
    n,
    x0: new Float32Array(n),
    y0: new Float32Array(n),
    born: new Float32Array(n),
    life: new Float32Array(n),
    dx: new Float32Array(n),
    dy: new Float32Array(n),
    tx: new Float32Array(n),
    ty: new Float32Array(n),
    size: new Float32Array(n),
    col: new Uint8Array(n),
  };
  const cols = Math.max(1, Math.ceil(W / DISSOLVE.cell));
  for (let i = 0; i < n; i++) {
    const u = hash(i, 1);
    const v = hash(i, 2);
    const x = u * W;
    const y = v * H;
    const ci = Math.floor(y / DISSOLVE.cell) * cols + Math.floor(x / DISSOLVE.cell);
    g.x0[i] = x;
    g.y0[i] = y;
    g.born[i] = threshold(x / W, y / H, ci) * DISSOLVE.erode;
    g.life[i] = DISSOLVE.lifeMin + hash(i, 4) * (DISSOLVE.lifeMax - DISSOLVE.lifeMin);
    // Rafală oblică (spre dreapta-sus) + turbulență mică; fără vârtej.
    const gust = 18 + hash(i, 5) * 42;
    g.dx[i] = gust * 0.8 + (hash(i, 6) - 0.5) * 30;
    g.dy[i] = -gust * 0.45 + (hash(i, 7) - 0.5) * 30;
    const a = hash(i, 8) * Math.PI * 2;
    const rr = target.r * Math.sqrt(hash(i, 9));
    g.tx[i] = target.cx + Math.cos(a) * rr;
    g.ty[i] = target.cy + Math.sin(a) * rr;
    g.size[i] = 0.35 + hash(i, 10) * 0.85 + (hash(i, 11) > 0.97 ? 0.8 : 0);
    const k = hash(i, 12);
    g.col[i] = k < 0.45 ? 0 : k < 0.88 ? 1 : 2;
  }
  return g;
}

const smooth = (p: number) => p * p * (3 - 2 * p);

/** Poziția și opacitatea granulei i la momentul t (ms). null = încă lipită de ecran sau deja stinsă. */
export function grainAt(g: Grains, i: number, t: number): { x: number; y: number; a: number } | null {
  const p = (t - g.born[i]!) / g.life[i]!;
  if (p < 0 || p >= 1) return null;
  const drift = smooth(Math.min(1, p * 1.6));
  const pull = Math.pow(p, 2.2);
  const x = g.x0[i]! + g.dx[i]! * drift;
  const y = g.y0[i]! + g.dy[i]! * drift;
  return { x: x + (g.tx[i]! - x) * pull, y: y + (g.ty[i]! - y) * pull, a: Math.min(1, p * 6) * (1 - smooth(Math.max(0, (p - 0.55) / 0.45))) };
}
