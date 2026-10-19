import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SHORT_OPEN_MS, clamp01, easeInOut, easeOut } from '@core/motion/teleport.js';

/**
 * Varianta scurtă a teleportării, pentru ferestrele deschise des (ședințe, rețete): ~420 ms, din punctul atingerii.
 * Câteva particule din jur converg spre deget, un singur impuls moale, iar fereastra se deschide din același punct.
 * Conținutul nu așteaptă: e vizibil de la primele ~150 ms. Decor: fără clic, fără efect la „mișcare redusă”.
 */

let lastTap: { x: number; y: number; at: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastTap = { x: e.clientX, y: e.clientY, at: performance.now() };
    },
    { capture: true, passive: true },
  );
}
/** Atingerea care a deschis fereastra (dacă e recentă); altfel null (ex. deschis de la tastatură). */
export function recentTap(maxAgeMs = 900): { x: number; y: number } | null {
  return lastTap && performance.now() - lastTap.at < maxAgeMs ? { x: lastTap.x, y: lastTap.y } : null;
}
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pune originea animației de deschidere (CSS --ox/--oy) a unui element în punctul atingerii. */
export function useOpenOrigin(ref: { current: HTMLElement | null }, deps: unknown[] = [], at?: { x: number; y: number } | null) {
  const [tap] = useState(() => at ?? recentTap());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = tap ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    el.style.setProperty('--ox', `${Math.round(p.x - r.left)}px`);
    el.style.setProperty('--oy', `${Math.round(p.y - r.top)}px`);
    el.classList.add('open-from');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tap;
}

/** Particulele care converg spre punctul atingerii și impulsul moale; se șterge singur după ~420 ms. */
export function OpenBurst({ x, y, onDone }: { x: number; y: number; onDone?: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || reduced()) {
      onDone?.();
      return;
    }
    const S = 260;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = S * dpr;
    c.height = S * dpr;
    let sd = Math.round(x * 7 + y * 13) || 3;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
    const cols = ['70,205,210', '110,236,140', '222,252,70'];
    const pts = Array.from({ length: 34 }, () => ({ a: rnd() * Math.PI * 2, d: 60 + rnd() * 70, bend: (rnd() - 0.5) * 0.9, r: 0.6 + rnd() * 1.3, col: cols[Math.floor(rnd() * 3)]!, delay: rnd() * 0.3 }));
    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - t0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      const C = S / 2;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) {
        const u = easeInOut(clamp01((t / 200 - p.delay) / 0.7));
        const ang = p.a + p.bend * (1 - u);
        const d = p.d * (1 - u);
        const a = 0.7 * Math.min(1, t / 60) * (1 - clamp01((t - 220) / 160));
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(${p.col},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(C + Math.cos(ang) * d, C + Math.sin(ang) * d, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Impulsul: o undă moale care pleacă din deget (lumină locală, nu flash).
      const q = clamp01((t - 150) / (SHORT_OPEN_MS - 150));
      if (q > 0 && q < 1) {
        const rr = 6 + easeOut(q) * (C - 8);
        ctx.strokeStyle = `rgba(110,236,140,${(0.32 * (1 - q)).toFixed(3)})`;
        ctx.lineWidth = 10 * (1 - q) + 1;
        ctx.beginPath();
        ctx.arc(C, C, rr, 0, Math.PI * 2);
        ctx.stroke();
        const g = ctx.createRadialGradient(C, C, 0, C, C, 40);
        g.addColorStop(0, `rgba(222,252,70,${(0.18 * (1 - q)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(222,252,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(C - 40, C - 40, 80, 80);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (t < SHORT_OPEN_MS + 40) raf = requestAnimationFrame(draw);
      else onDone?.();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={cv} className="open-burst" aria-hidden="true" style={{ left: x - 130, top: y - 130 }} />;
}

/** Arată impulsul o singură dată, la punctul atingerii care a deschis fereastra. */
export function BurstAtTap({ tap }: { tap: { x: number; y: number } | null }) {
  const [on, setOn] = useState(!!tap);
  if (!tap || !on) return null;
  return <OpenBurst x={tap.x} y={tap.y} onDone={() => setOn(false)} />;
}
