/**
 * Sfera AIRON: modelul și desenul ei, comune bulei de pe Acasă (ui/Orb.tsx) și întâmpinării (ui/WelcomeSphere.tsx).
 * Aceeași sămânță = aceleași particule: particula i din întâmpinare este particula i din bula de Acasă (aceeași fază
 * orbitală, aceeași culoare, aceeași adâncime). Așa transferul nu are două sfere între care să facă crossfade: fiecare
 * particulă pleacă dintr-o sferă și ajunge exact unde o desenează cealaltă.
 */

export interface OrbPoint {
  u: number;
  th: number;
  r: number;
  sp: number;
  ph: number;
  sz: number;
  big: boolean;
  hue: number;
  tw: number;
}

export const orbSlow = () => (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 8) <= 4 : false);
export const orbCount = () => (orbSlow() ? 420 : 760);

/** Puncte: majoritatea pe membrană (coajă subțire), puține în volum; fiecare cu viteza și faza lui. */
export function makeOrbModel(n = orbCount()): OrbPoint[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: n }, () => {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const shell = rnd() < 0.85;
    const big = rnd() < 0.06;
    return {
      u,
      th,
      r: shell ? 0.93 + rnd() * 0.1 : 0.3 + rnd() * 0.6,
      sp: (0.03 + rnd() * 0.06) * (rnd() < 0.5 ? -1 : 1),
      ph: rnd() * Math.PI * 2,
      sz: big ? 1.6 + rnd() * 1.6 : 0.5 + rnd() * 0.9,
      big,
      hue: rnd(),
      tw: 0.2 + rnd() * 0.35,
    };
  });
}

/** Deformare netedă în coordonatele vederii: sumă de unde lente pe cicluri diferite (aprox. 9–21 s). */
export const orbRadius = (x: number, y: number, z: number, t: number) =>
  1 + 0.06 * Math.sin(2.1 * x + t * 0.62) + 0.05 * Math.sin(2.6 * y - t * 0.44 + 1.3) + 0.04 * Math.sin(3.1 * z + t * 0.3 + 2.1) + 0.035 * Math.sin(3.7 * (x - y) - t * 0.51) + 0.02 * Math.sin(5.3 * x * y + t * 0.37);

const LIME = [222, 252, 70];
const GREEN = [110, 236, 140];
const TEAL = [70, 205, 210];
/** Culoarea după unghi: lime-galben în dreapta-jos, verde, turcoaz rece în stânga-sus. */
export const orbColAt = (ang: number, k: number) => {
  const f = (Math.cos(ang - 0.75) + 1) / 2;
  const g = Math.min(1, Math.max(0, f * 0.85 + (k - 0.5) * 0.3));
  const [a, b, m] = g > 0.5 ? [GREEN, LIME, (g - 0.5) * 2] : [TEAL, GREEN, g * 2];
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * m));
};
/** Progresul mersului: puțin realizat = mai rece (turcoaz), aproape de țintă = lime. */
export const orbTint = (c: number[], prog: number | null) => {
  if (prog == null) return c;
  const to = prog < 0.5 ? TEAL.map((v, i) => v + (GREEN[i]! - v) * prog * 2) : GREEN.map((v, i) => v + (LIME[i]! - v) * (prog - 0.5) * 2);
  return c.map((v, i) => Math.round(v * 0.5 + to[i]! * 0.5));
};

/** Câte particule arată bula: la mers, proporțional cu minutele rămase. */
export const orbVisibleN = (n: number, prog: number | null) => (prog == null ? n : Math.round(n * (0.06 + 0.94 * (1 - prog))));

export interface OrbParticle {
  x: number;
  y: number;
  a: number;
  c: number[];
  rad: number;
  big: boolean;
  depth: number;
}

/**
 * Particula i, exact cum o desenează sfera cu centrul (cx, cy) și raza R, la momentul t (unități: ale canvasului
 * țintă; `unit` = mărimea unui px CSS în acele unități, adică dpr pe canvasul bulei, 1 în coordonate CSS).
 */
export function orbParticle(p: OrbPoint, t: number, cx: number, cy: number, R: number, unit: number, prog: number | null, burst = 0): OrbParticle | null {
  const rotY = t * 0.08;
  const rotX = 0.35 + 0.12 * Math.sin(t * 0.05);
  const cY = Math.cos(rotY),
    sY = Math.sin(rotY),
    cX = Math.cos(rotX),
    sX = Math.sin(rotX);
  const th = p.th + t * p.sp;
  const s = Math.sqrt(1 - p.u * p.u);
  const x0 = s * Math.cos(th),
    y0 = p.u,
    z0 = s * Math.sin(th);
  const x1 = x0 * cY + z0 * sY;
  const z1 = -x0 * sY + z0 * cY;
  const y1 = y0 * cX - z1 * sX;
  const z2 = y0 * sX + z1 * cX;
  const r = p.r * orbRadius(x1, y1, z2, t);
  const f = 2.8 / (2.8 - z2 * r);
  const X = cx + x1 * r * R * f;
  const Y = cy + y1 * r * R * f;
  const depth = (z2 + 1) / 2;
  const dc = Math.hypot(X - cx, Y - cy) / R;
  // Centrul rămâne aerisit pentru text; marginea e mai luminoasă.
  const clear = Math.min(1, Math.max(0.08, (dc - 0.42) / 0.38));
  const rim = 0.6 + 0.6 * Math.max(0, 1 - Math.abs(dc - 1) * 4);
  const a = Math.min(1, (0.4 + 0.7 * depth) * clear * rim * (0.8 + p.tw * Math.sin(t * 1.1 + p.ph)) * (1 + 0.8 * burst));
  const c = orbTint(orbColAt(Math.atan2(Y - cy, X - cx), p.hue), prog);
  const rad = p.sz * unit * (0.7 + 0.6 * depth);
  return { x: X, y: Y, a, c, rad, big: p.big, depth };
}

/** Desenează o particulă (aceeași formă în ambele sfere și în zbor). */
export function drawOrbParticle(ctx: CanvasRenderingContext2D, q: OrbParticle, alphaK = 1) {
  const a = q.a * alphaK;
  if (a <= 0.01) return;
  const { x: X, y: Y, c, rad } = q;
  if (q.big) {
    const bg = ctx.createRadialGradient(X, Y, 0, X, Y, rad * 3.2);
    bg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.9).toFixed(3)})`);
    bg.addColorStop(0.35, `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.35).toFixed(3)})`);
    bg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(X, Y, rad * 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = `rgba(${Math.min(255, c[0]! + 30)},${Math.min(255, c[1]! + 20)},${Math.min(255, c[2]! + 40)},${a.toFixed(3)})`;
    ctx.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
  }
}

/**
 * Corpul sferei fără particule: haloul, membrana (contururi deformate) și firele interioare.
 * `body` 0..1 = cât din volum e prezent (întâmpinarea îl pierde, bula de Acasă îl capătă).
 */
export function drawOrbBody(ctx: CanvasRenderingContext2D, t: number, cx: number, cy: number, R: number, unit: number, body: number, W: number, H: number) {
  if (body <= 0.005) return;
  const shellK = Math.pow(body, 1.6);
  const g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.6);
  g.addColorStop(0, 'rgba(60,200,170,0.035)');
  g.addColorStop(0.45, 'rgba(150,240,110,0.09)');
  g.addColorStop(0.7, 'rgba(120,230,150,0.03)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = body;
  ctx.fillStyle = g;
  ctx.fillRect(Math.max(0, cx - R * 1.6), Math.max(0, cy - R * 1.6), Math.min(W, R * 3.2), Math.min(H, R * 3.2));
  ctx.globalAlpha = shellK;
  ctx.globalCompositeOperation = 'lighter';
  const layers = 5;
  for (let k = 0; k < layers; k++) {
    const sc = 1 - k * 0.028;
    const ph = k * 1.9;
    const path = new Path2D();
    const M = 140;
    for (let i = 0; i <= M; i++) {
      const q = (i / M) * Math.PI * 2;
      const x = Math.cos(q),
        y = Math.sin(q);
      const r = sc * orbRadius(x, y, 0.35 * Math.sin(q * 2 + t * 0.2 + ph), t + ph) * (1 + 0.012 * Math.sin(q * 7 + t * 0.9 + ph));
      const X = cx + x * r * R,
        Y = cy + y * r * R;
      if (i === 0) path.moveTo(X, Y);
      else path.lineTo(X, Y);
    }
    const c0 = orbColAt(Math.PI * 1.25, k / layers),
      c1 = orbColAt(0.75, k / layers);
    const strong = k === 0 ? 1 : k === 1 ? 0.7 : 0.45;
    const stroke = (lw: number, al: number) => {
      const lg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      lg.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},${al * 0.8})`);
      lg.addColorStop(1, `rgba(${c1[0]},${c1[1]},${c1[2]},${al})`);
      ctx.strokeStyle = lg;
      ctx.lineWidth = lw * unit;
      ctx.stroke(path);
    };
    stroke(26, 0.03 * strong);
    stroke(10, 0.07 * strong);
    stroke(2.2, 0.16 * strong);
    stroke(0.8, 0.5 * strong);
  }
  // Fire interioare: arce scurte, slabe, care se rotesc încet — volum, nu orbite.
  for (let k = 0; k < 7; k++) {
    const sc = 0.62 + k * 0.05;
    const st = k * 2.3 + t * (0.05 + k * 0.012) * (k % 2 ? -1 : 1);
    const len = 1.1 + 0.5 * Math.sin(t * 0.2 + k);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const q = st + (i / 40) * len;
      const x = Math.cos(q),
        y = Math.sin(q) * (0.75 + 0.2 * Math.sin(k));
      const r = sc * orbRadius(x, y, 0.4, t + k);
      const X = cx + x * r * R,
        Y = cy + y * r * R;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    const c = orbColAt(st + len / 2, k / 7);
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.1)`;
    ctx.lineWidth = 1.1 * unit;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Legătura dintre întâmpinare și bula reală de Acasă pe durata transferului: ceasul comun (aceeași fază orbitală) și
 * ce particule au ajuns (bula le desenează pe acelea, întâmpinarea pe celelalte). Inactiv = bula se desenează normal.
 */
export const orbLink: { active: boolean; el: HTMLElement | null; t: number; arrived: Uint8Array | null; body: number } = { active: false, el: null, t: 0, arrived: null, body: 1 };

/** Bulele montate își înregistrează progresul (mersul), ca transferul să țintească exact particulele vizibile. */
export const orbRegistry = new WeakMap<HTMLElement, { prog: () => number | null; time: () => number }>();
