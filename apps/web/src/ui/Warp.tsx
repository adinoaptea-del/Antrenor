import { useEffect, useRef } from 'react';

/**
 * Tranziția spațială dintre mesajul de bun venit și Acasă: particulele bulei pornesc din centru spre margini, cu dâre,
 * tot mai repede, apoi se sting (~0,8 s). Decor peste tot ecranul, fără clic. Cu „mișcare redusă” nu se desenează.
 */
export function Warp({ onDone, ms = 850 }: { onDone: () => void; ms?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!c || !ctx || reduce) {
      onDone();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (c.width = Math.round(window.innerWidth * dpr));
    const H = (c.height = Math.round(window.innerHeight * dpr));
    let s = 13;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const cols = [
      [70, 205, 210],
      [110, 236, 140],
      [222, 252, 70],
    ];
    // Particule pe trei adâncimi: cele apropiate pornesc mai repede și lasă dâre mai lungi.
    const pts = Array.from({ length: 420 }, () => {
      const a = rnd() * Math.PI * 2;
      const depth = rnd();
      return { a, r0: (0.04 + rnd() * 0.22) * Math.min(W, H), v: (0.35 + depth * 1.4) * Math.max(W, H), sz: (0.6 + depth * 2.2) * dpr, col: cols[Math.floor(rnd() * 3)]!, depth };
    });
    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const ease = p * p * (3 - 2 * p);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const cx = W / 2;
      const cy = H * 0.42;
      for (const q of pts) {
        const acc = ease * ease;
        const r = q.r0 + q.v * acc;
        const tail = Math.min(r - q.r0, (40 + 180 * q.depth) * dpr * ease);
        const x = cx + Math.cos(q.a) * r;
        const y = cy + Math.sin(q.a) * r;
        const x2 = cx + Math.cos(q.a) * (r - tail);
        const y2 = cy + Math.sin(q.a) * (r - tail);
        const alpha = (0.25 + 0.6 * q.depth) * (p < 0.15 ? p / 0.15 : 1) * (1 - Math.max(0, (p - 0.6) / 0.4));
        if (alpha <= 0.01) continue;
        const g = ctx.createLinearGradient(x2, y2, x, y);
        g.addColorStop(0, `rgba(${q.col[0]},${q.col[1]},${q.col[2]},0)`);
        g.addColorStop(1, `rgba(${q.col[0]},${q.col[1]},${q.col[2]},${alpha.toFixed(3)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = q.sz;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (p < 1) raf = requestAnimationFrame(draw);
      else onDone();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={cv} className="warp" aria-hidden="true" />;
}
