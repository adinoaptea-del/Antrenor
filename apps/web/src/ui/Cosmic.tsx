import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Mesajul cosmic: componenta comună pentru întâmpinare și felicitarea de după antrenament.
 *
 * Un corp din sticlă fumurie, organic și ușor asimetric, care înconjoară textul și se potrivește lungimii lui; înăuntru,
 * lichid luminos turcoaz–verde–lime și particule pe trei adâncimi, care circulă DOAR în inelul dintre text și perete
 * (centrul rămâne întunecat și liniștit, textul nu se mișcă).
 *
 * O singură transformare în trei etape:
 *  - apariție (~0,6 s): particulele converg spre mesaj (din cardul ședinței, dacă există), lumina se adună, conturul se
 *    desenează progresiv, textul apare prin estompare;
 *  - prezență: plutire aproape imperceptibilă, unduire mică, particule care circulă încet; „reușita” are în plus un val
 *    de lumină prin lichid și o scurtă expansiune a particulelor;
 *  - dispariție (~0,5 s): textul se stinge, conturul se desface în particule, lumina se întoarce în bula de Acasă (dacă
 *    se vede) sau se pierde în fundal.
 * Fără flash, fără sunet. „Mișcare redusă” = estompare simplă, fără canvas.
 */

export type CosmicVariant = 'intampinare' | 'reusita';
type Rect = { x: number; y: number; w: number; h: number };

const IN_MS = { intampinare: 600, reusita: 700 };
const OUT_MS = 500;
const COLS: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeIn = (x: number) => x * x * x;

/** Timpul de citire după lungime (~4 cuvinte pe secundă plus așezare). Folosit la întâmpinare, care se închide singură. */
export function readingMs(text: string, variant: CosmicVariant): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return variant === 'intampinare' ? Math.min(9000, Math.max(3500, 2200 + words * 280)) : Math.min(12000, Math.max(5000, 3200 + words * 320));
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Bula de pe Acasă, dacă se vede pe ecran: acolo se întoarce lumina. */
export const homeOrbRect = () => rectOf(document.querySelector('.azi .orb'));
/** Cardul ședinței (orice element cu data-wid), cel mai de sus vizibil: de acolo pornește felicitarea. */
export const workoutRect = (id: string) => {
  const els = Array.from(document.querySelectorAll(`[data-wid="${CSS.escape(id)}"]`));
  for (let i = els.length - 1; i >= 0; i--) {
    const r = rectOf(els[i]!);
    if (r) return r;
  }
  return null;
};

export function CosmicMessage({
  variant,
  kicker,
  text,
  hint = 'atinge ca să închizi',
  origin,
  returnTo,
  seed = 7,
  onClose,
}: {
  variant: CosmicVariant;
  kicker: ReactNode;
  text: string;
  hint?: string;
  /** De unde pornesc particulele (cardul ședinței); null = din jur. */
  origin?: () => Rect | null;
  /** Unde se întoarce lumina la final (bula de Acasă); null = se pierde în fundal. */
  returnTo?: () => Rect | null;
  seed?: number;
  onClose: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [out, setOut] = useState(false);
  const outRef = useRef<number | null>(null);
  const closed = useRef(false);
  const reduce = reducedMotion();
  const read = readingMs(text, variant);

  const close = () => {
    if (outRef.current != null) return;
    outRef.current = performance.now();
    setOut(true);
    window.setTimeout(
      () => {
        if (closed.current) return;
        closed.current = true;
        onClose();
      },
      reduce ? 260 : OUT_MS + 40,
    );
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Timpul de citire: se oprește cât aplicația e în fundal (nu pierzi mesajul cât n-ai fost acolo).
  useEffect(() => {
    let left = read + IN_MS[variant];
    let start = performance.now();
    let tm = 0;
    // Felicitarea rămâne până o închizi („Continuă” sau atingere): e o reușită de citit, nu o notificare.
    const auto = variant === 'intampinare';
    const arm = () => {
      window.clearTimeout(tm);
      if (!auto) return;
      if (document.hidden) {
        left -= performance.now() - start;
        return;
      }
      start = performance.now();
      tm = window.setTimeout(() => closeRef.current(), Math.max(0, left));
    };
    const onVis = () => {
      if (document.hidden) {
        window.clearTimeout(tm);
        left -= performance.now() - start;
      } else arm();
    };
    arm();
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(tm);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey);
    };
  }, [read, variant]);

  useEffect(() => {
    if (reduce) return;
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = 0;
    let VH = 0;
    const fit = () => {
      VW = window.innerWidth;
      VH = window.innerHeight;
      c.width = Math.max(1, Math.round(VW * dpr));
      c.height = Math.max(1, Math.round(VH * dpr));
    };
    fit();
    window.addEventListener('resize', fit);

    let s = seed * 9973 + 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    // Forma: o „superelipsă” care îmbracă dreptunghiul textului, deformată lent de câteva unde (asimetrie fixă + mișcare).
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const N = 84;
    const superR = (th: number, a: number, b: number, n: number) => {
      const cs = Math.abs(Math.cos(th));
      const sn = Math.abs(Math.sin(th));
      return Math.pow(Math.pow(cs / a, n) + Math.pow(sn / b, n), -1 / n);
    };
    const wobble = (th: number, t: number) => 1 + 0.045 * Math.sin(th + ph[0]!) + 0.05 * Math.sin(2 * th + ph[1]! + t * 0.23) + 0.035 * Math.sin(3 * th + ph[2]! - t * 0.17) + 0.018 * Math.sin(5 * th + ph[3]! + t * 0.31);

    // Particulele: un inel în jurul textului, pe trei adâncimi.
    const LAYERS: [number, number, number][] = [
      [110, 0.7, 0.45],
      [52, 1.3, 0.6],
      [16, 2.8, 0.3],
    ];
    const pts = LAYERS.flatMap(([n, r, a], depth) =>
      Array.from({ length: n }, () => ({
        th: rnd() * Math.PI * 2,
        // ~35% din particule formează norul din afara peretelui (ca în ghidul vizual), restul circulă în inel.
        u: rnd() < 0.35 ? 1.08 + rnd() * 0.7 : 0.18 + rnd() * 0.78,
        w: (0.04 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1) * (1 + depth * 0.4),
        r: r * (0.6 + rnd() * 0.8),
        a: a * (0.5 + rnd() * 0.6),
        ph: rnd() * 6.28,
        col: COLS[Math.floor(rnd() * 3)]!,
        depth,
        delay: rnd() * 0.22,
        sx: rnd(),
        sy: rnd(),
        sd: 1.3 + rnd() * 1.1,
        sa: rnd() * Math.PI * 2,
        rx: rnd(),
        ry: rnd(),
      })),
    );
    const org = origin?.() ?? null;
    let target: Rect | null | undefined;
    let shards: { x: number; y: number; vx: number; vy: number; r: number; col: [number, number, number] }[] = [];
    const tIn = performance.now();
    const inMs = IN_MS[variant];

    const geom = (t: number) => {
      const r = box.current?.getBoundingClientRect();
      const bw = r ? r.width : 300;
      const bh = r ? r.height : 120;
      const cx = (r ? r.left + bw / 2 : VW / 2) + Math.sin(t * 0.37) * 1.2;
      const cy = (r ? r.top + bh / 2 : VH / 2) + Math.sin(t * 0.6) * 2;
      const hw = bw / 2;
      const hh = bh / 2;
      return { cx, cy, hw, hh, A: hw + 46, B: hh + 50 };
    };
    const shellAt = (g: ReturnType<typeof geom>, th: number, t: number) => superR(th, g.A, g.B, 2.5) * wobble(th, t);
    const innerAt = (g: ReturnType<typeof geom>, th: number) => superR(th, g.hw * 0.98, g.hh * 0.98, 4);

    const shellPath = (g: ReturnType<typeof geom>, t: number) => {
      const P: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const r = shellAt(g, th, t);
        P.push([(g.cx + Math.cos(th) * r) * dpr, (g.cy + Math.sin(th) * r) * dpr]);
      }
      const p = new Path2D();
      const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
      const m0 = mid(P[N - 1]!, P[0]!);
      p.moveTo(m0[0], m0[1]);
      let per = 0;
      for (let i = 0; i < N; i++) {
        const a = P[i]!;
        const b = P[(i + 1) % N]!;
        const m = mid(a, b);
        p.quadraticCurveTo(a[0], a[1], m[0], m[1]);
        per += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      p.closePath();
      return { p, per, P };
    };

    let raf = 0;
    const draw = (now: number) => {
      const t = (now - tIn) / 1000;
      const pin = clamp01((now - tIn) / inMs);
      const ain = easeInOut(pin);
      const tOut = outRef.current;
      const pout = tOut == null ? 0 : clamp01((now - tOut) / OUT_MS);
      const aout = easeIn(pout);
      const W = VW * dpr;
      const H = VH * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (W < 4 || H < 4) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const g = geom(t);
      const { p: path, per, P } = shellPath(g, t);
      const shell = ain * (1 - aout);
      const cx = g.cx * dpr;
      const cy = g.cy * dpr;
      const R = Math.max(g.A, g.B) * dpr;

      // La începutul dispariției: conturul se desface în fragmente de lumină care pleacă spre exterior.
      if (tOut != null && !shards.length) {
        target = returnTo?.() ?? null;
        shards = P.filter((_, i) => i % 1 === 0).map((q) => {
          const dx = q[0] - cx;
          const dy = q[1] - cy;
          const d = Math.hypot(dx, dy) || 1;
          const v = (18 + rnd() * 46) * dpr;
          return { x: q[0], y: q[1], vx: (dx / d) * v + (rnd() - 0.5) * 10 * dpr, vy: (dy / d) * v - (8 + rnd() * 14) * dpr, r: (0.6 + rnd() * 1.3) * dpr, col: COLS[Math.floor(rnd() * 3)]! };
        });
      }

      // Lumina care se adună în jurul mesajului (apariția), apoi rămâne o aură moale.
      const gather = Math.sin(Math.PI * Math.min(1, pin * 1.1)) * 0.5 + 0.5 * ain;
      if (shell > 0.01) {
        const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.55);
        halo.addColorStop(0, `rgba(110,236,140,${(0.12 * gather * (1 - aout)).toFixed(3)})`);
        halo.addColorStop(0.6, `rgba(70,205,210,${(0.05 * gather * (1 - aout)).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(70,205,210,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);

        // Sticla fumurie: întunecată în centru (lizibilitate), mai luminoasă spre perete.
        ctx.save();
        ctx.globalAlpha = shell;
        const glass = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
        glass.addColorStop(0, 'rgba(5,9,9,0.97)');
        glass.addColorStop(0.62, 'rgba(8,15,15,0.92)');
        glass.addColorStop(1, 'rgba(22,38,36,0.78)');
        ctx.fillStyle = glass;
        ctx.fill(path);
        ctx.clip(path);

        // Lichidul de pe fund, cu menisc ondulat; la „reușită” undele cresc o clipă și se liniștesc.
        const energy = variant === 'reusita' ? 1 + 2.2 * Math.exp(-Math.max(0, t - 0.55) * 1.6) * (t > 0.45 ? 1 : 0) : 1;
        const top = cy - g.B * dpr;
        const hgt = g.B * 2 * dpr;
        const base = top + hgt * (1 - 0.22 * ain);
        const left = cx - g.A * 1.1 * dpr;
        const right = cx + g.A * 1.1 * dpr;
        const lq = new Path2D();
        lq.moveTo(left, top + hgt + 20 * dpr);
        const M = 40;
        const yAt = (u: number) => base + (Math.sin(u * 7 + t * 0.6) * 2.2 + Math.sin(u * 13 - t * 0.41) * 1.1) * energy * dpr;
        for (let i = 0; i <= M; i++) lq.lineTo(left + ((right - left) * i) / M, yAt(i / M));
        lq.lineTo(right, top + hgt + 20 * dpr);
        lq.closePath();
        const lg = ctx.createLinearGradient(0, base - 16 * dpr, 0, top + hgt);
        lg.addColorStop(0, 'rgba(222,252,70,0.16)');
        lg.addColorStop(0.12, 'rgba(110,236,140,0.12)');
        lg.addColorStop(1, 'rgba(70,205,210,0.05)');
        ctx.fillStyle = lg;
        ctx.fill(lq);
        ctx.beginPath();
        for (let i = 0; i <= M; i++) {
          const x = left + ((right - left) * i) / M;
          if (i === 0) ctx.moveTo(x, yAt(0));
          else ctx.lineTo(x, yAt(i / M));
        }
        ctx.strokeStyle = 'rgba(222,252,70,0.22)';
        ctx.lineWidth = dpr;
        ctx.stroke();

        // Valul de lumină al reușitei: o bandă moale traversează lichidul o dată (fără flash: alfa mic, margini difuze).
        if (variant === 'reusita') {
          const q = clamp01((t - 0.5) / 1.1);
          if (q > 0 && q < 1) {
            const x = left + (right - left + 160 * dpr) * easeInOut(q) - 80 * dpr;
            const wv = ctx.createLinearGradient(x - 70 * dpr, 0, x + 70 * dpr, 0);
            const a = 0.16 * Math.sin(Math.PI * q);
            wv.addColorStop(0, 'rgba(110,236,140,0)');
            wv.addColorStop(0.5, `rgba(222,252,70,${a.toFixed(3)})`);
            wv.addColorStop(1, 'rgba(70,205,210,0)');
            ctx.fillStyle = wv;
            ctx.fillRect(x - 70 * dpr, top, 140 * dpr, hgt);
          }
        }

        // Lumina difuză pe interiorul peretelui.
        ctx.strokeStyle = 'rgba(110,236,140,0.07)';
        ctx.lineWidth = 16 * dpr;
        ctx.stroke(path);
        // Reflexia fină: un arc luminos sus-stânga.
        ctx.beginPath();
        for (let i = Math.round(N * 0.56); i < Math.round(N * 0.74); i++) {
          const th = (i / N) * Math.PI * 2;
          const r = shellAt(g, th, t) - 7;
          const x = (g.cx + Math.cos(th) * r) * dpr;
          const y = (g.cy + Math.sin(th) * r) * dpr;
          if (i === Math.round(N * 0.56)) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(235,255,245,0.13)';
        ctx.lineWidth = 1.6 * dpr;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Conturul: se desenează progresiv la apariție, cu lumină moale în jur.
        ctx.save();
        ctx.globalAlpha = Math.min(1, ain * 1.3) * (1 - aout);
        ctx.setLineDash([per * clamp01(pin * 1.15), per]);
        const cg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        cg.addColorStop(0, 'rgba(70,205,210,0.55)');
        cg.addColorStop(0.5, 'rgba(222,252,70,0.5)');
        cg.addColorStop(1, 'rgba(110,236,140,0.45)');
        // Peretele gros de sticlă: o aură largă, miezul luminos și o a doua linie, interioară (refracția).
        ctx.shadowColor = 'rgba(110,236,140,0.5)';
        ctx.shadowBlur = 22 * dpr;
        ctx.strokeStyle = cg;
        ctx.lineWidth = 4 * dpr;
        ctx.stroke(path);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(240,255,220,0.55)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke(path);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(0.955, 0.945);
        ctx.translate(-cx, -cy);
        ctx.strokeStyle = 'rgba(70,205,210,0.28)';
        ctx.lineWidth = 1.4 * dpr;
        ctx.stroke(path);
        ctx.restore();
        ctx.restore();
      }

      // Particulele.
      ctx.globalCompositeOperation = 'lighter';
      const burst = variant === 'reusita' ? 1 + 0.3 * Math.sin(Math.PI * clamp01((t - 0.55) / 0.7)) : 1;
      for (const q of pts) {
        const th = q.th + q.w * t;
        const ri = innerAt(g, th);
        const rs = shellAt(g, th, t);
        const u = (q.u + 0.05 * Math.sin(t * 0.8 + q.ph)) * burst;
        const rr = q.u > 1 ? rs + (u - 1) * 80 : ri + (rs - ri) * u;
        let x = g.cx + Math.cos(th) * rr;
        let y = g.cy + Math.sin(th) * rr;
        // Apariția: din cardul ședinței sau din jur, spre locul din inel.
        const pi = clamp01((pin - q.delay) / (1 - q.delay));
        const e = easeOut(pi);
        let tail = 0;
        if (pi < 1) {
          const sx = org ? org.x + q.sx * org.w : g.cx + Math.cos(q.sa) * Math.max(g.A, g.B) * q.sd;
          const sy = org ? org.y + q.sy * org.h : g.cy + Math.sin(q.sa) * Math.max(g.A, g.B) * q.sd;
          const nx = sx + (x - sx) * e;
          const ny = sy + (y - sy) * e;
          tail = org ? (1 - e) * 0.9 : 0;
          x = nx;
          y = ny;
        }
        let a = q.a * (0.65 + 0.35 * Math.sin(t * 0.9 + q.ph)) * (org ? 0.4 + 0.6 * e : e);
        let rad = q.r;
        // Dispariția: spre bula de Acasă (dacă se vede) sau ușor în sus, stingându-se în fundal.
        if (tOut != null) {
          if (target) {
            // Spirală spre bulă: particulele se rotesc în jurul ei pe măsură ce se apropie.
            const tx = target.x + target.w * (0.3 + q.rx * 0.4);
            const ty = target.y + target.h * (0.3 + q.ry * 0.4);
            const dx0 = x - tx;
            const dy0 = y - ty;
            const k = 1 - aout;
            const rot = aout * (1.6 + q.depth * 0.5) * (q.w > 0 ? 1 : -1);
            x = tx + (dx0 * Math.cos(rot) - dy0 * Math.sin(rot)) * k;
            y = ty + (dx0 * Math.sin(rot) + dy0 * Math.cos(rot)) * k;
            a *= 1 - 0.7 * aout;
            rad *= 1 - 0.5 * aout;
            tail = aout * 0.6;
          } else {
            x += Math.cos(th) * 40 * aout;
            y += Math.sin(th) * 40 * aout - 26 * aout;
            a *= 1 - aout;
          }
        }
        if (a < 0.01) continue;
        const X = x * dpr;
        const Y = y * dpr;
        const [r0, g0, b0] = q.col;
        if (tail > 0.05) {
          const sx = org && tOut == null ? org.x + q.sx * org.w : target ? target.x + target.w / 2 : x;
          const sy = org && tOut == null ? org.y + q.sy * org.h : target ? target.y + target.h / 2 : y;
          const dx = (sx - x) * 0.12 * tail;
          const dy = (sy - y) * 0.12 * tail;
          const tg = ctx.createLinearGradient(X + dx * dpr, Y + dy * dpr, X, Y);
          tg.addColorStop(0, `rgba(${r0},${g0},${b0},0)`);
          tg.addColorStop(1, `rgba(${r0},${g0},${b0},${(a * 0.8).toFixed(3)})`);
          ctx.strokeStyle = tg;
          ctx.lineWidth = rad * dpr;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(X + dx * dpr, Y + dy * dpr);
          ctx.lineTo(X, Y);
          ctx.stroke();
        }
        if (q.depth === 2) {
          const bg = ctx.createRadialGradient(X, Y, 0, X, Y, rad * 2.4 * dpr);
          bg.addColorStop(0, `rgba(${r0},${g0},${b0},${(a * 0.5).toFixed(3)})`);
          bg.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(X, Y, rad * 2.4 * dpr, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${r0},${g0},${b0},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(X, Y, rad * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Fragmentele conturului.
      if (shards.length && tOut != null) {
        const dt = (now - tOut) / 1000;
        const fade = Math.pow(1 - pout, 1.5);
        for (const sh of shards) {
          const x = sh.x + sh.vx * dt;
          const y = sh.y + sh.vy * dt;
          ctx.fillStyle = `rgba(${sh.col[0]},${sh.col[1]},${sh.col[2]},${(0.75 * fade).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, sh.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (pout < 1) raf = requestAnimationFrame(draw);
      else if (target) {
        // Lumina ajunsă în bulă: o pulsație scurtă și moale a bulei (fără flash).
        const el = document.querySelector('.azi .orb');
        el?.classList.add('orb-absorb');
        window.setTimeout(() => el?.classList.remove('orb-absorb'), 900);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
    // Animația pornește o singură dată pe mesaj.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`cosmic cosmic-${variant} ${out ? 'out' : ''} ${reduce ? 'still' : ''}`} onClick={close} role={variant === 'reusita' ? 'dialog' : 'status'} aria-label={variant === 'reusita' ? 'Antrenament finalizat' : 'Mesajul zilei'}>
      {!reduce && <canvas ref={cv} className="cosmic-cv" aria-hidden="true" />}
      <div className={`cosmic-box ${reduce ? 'glass' : ''}`} ref={box}>
        <div className="cosmic-k">{kicker}</div>
        {variant === 'reusita' && (
          <svg className="cosmic-ok" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10.5" />
            <path d="M7.5 12.3l3 3 6-6.2" />
          </svg>
        )}
        <p className="cosmic-t" aria-live="polite">
          {text}
        </p>
        {variant === 'intampinare' && (
          <button
            className="cosmic-x"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            {hint}
          </button>
        )}
      </div>
      {variant === 'reusita' && (
        <button
          className="cosmic-go"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          Continuă
        </button>
      )}
    </div>
  );
}
