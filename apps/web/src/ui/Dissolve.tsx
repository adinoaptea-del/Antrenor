import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DISSOLVE, DISSOLVE_TOTAL_MS, grainAt, hash, makeGrains, threshold } from '@core/motion/dissolve.js';
import { grainCount } from '@core/motion/fireStorm.js';

const COLS: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];

export interface DissolveShot {
  id: number;
  /** Copia statică a ecranului care pleacă (DOM clonat). */
  node: HTMLElement;
  rect: { left: number; top: number; width: number; height: number };
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Ecranul care pleacă (copie statică) se erodează pe celule după pragul din src/motion/dissolve.ts, iar din fiecare
 * celulă pleacă praf care zboară în bula de Acasă. Acasă e deja dedesubt și se vede prin găuri. Nu blochează atingerile.
 */
export function Dissolve({ shot, onDone }: { shot: DissolveShot; onDone: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const L = layer.current;
    const C = cv.current;
    if (!L || !C) return;
    L.appendChild(shot.node);
    const { width: W, height: H } = shot.rect;
    // Masca: o celulă = un pixel; scalată la ecran.
    const mw = Math.max(1, Math.ceil(W / DISSOLVE.cell));
    const mh = Math.max(1, Math.ceil(H / DISSOLVE.cell));
    const mask = document.createElement('canvas');
    mask.width = mw;
    mask.height = mh;
    const mctx = mask.getContext('2d')!;
    const th = new Float32Array(mw * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) th[y * mw + x] = threshold((x + 0.5) / mw, (y + 0.5) / mh, y * mw + x) * DISSOLVE.erode;
    const img = mctx.createImageData(mw, mh);

    const dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 2);
    C.width = Math.round(window.innerWidth * dpr);
    C.height = Math.round(window.innerHeight * dpr);
    const ctx = C.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Ținta: bula de Acasă (montată dedesubt); altfel centrul de sus al ecranului.
    const orb = document.querySelector('.screen .orb') as HTMLElement | null;
    const ob = orb?.getBoundingClientRect();
    const target = ob && ob.width > 0 ? { cx: ob.left + ob.width / 2 - shot.rect.left, cy: ob.top + ob.height / 2 - shot.rect.top, r: ob.width * 0.38 } : { cx: W / 2, cy: H * 0.4, r: Math.min(W, H) * 0.3 };
    const g = makeGrains(grainCount(W, navigator.hardwareConcurrency ?? 8), W, H, target);

    const start = performance.now();
    let last = start;
    let simT = 0;
    let raf = 0;
    const frame = (now: number) => {
      // Un singur ceas: cel mult 50 ms pe cadru (fără salturi după o pauză), cum cere regula 27.
      simT += Math.min(50, now - last);
      last = now;
      const t = simT;
      // Masca ecranului: celulele cu pragul trecut devin transparente (cu o margine de 60 ms pentru o rupere moale).
      const d = img.data;
      for (let i = 0; i < th.length; i++) {
        const left = th[i]! - t;
        d[i * 4 + 3] = left <= 0 ? 0 : left >= 40 ? 255 : Math.round((left / 40) * 255);
      }
      mctx.putImageData(img, 0, 0);
      const url = `url(${mask.toDataURL()})`;
      L.style.setProperty('-webkit-mask-image', url);
      L.style.setProperty('mask-image', url);

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'lighter';
      for (let ci = 0; ci < 3; ci++) {
        const col = COLS[ci]!;
        for (let bk = 0; bk < 3; bk++) {
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${[0.3, 0.55, 0.85][bk]})`;
          for (let i = 0; i < g.n; i++) {
            if (g.col[i] !== ci) continue;
            const p = grainAt(g, i, t);
            if (!p) continue;
            // Trei trepte de opacitate (ca întâmpinarea), alese după opacitatea granulei.
            const b = p.a < 0.4 ? 0 : p.a < 0.75 ? 1 : 2;
            if (b !== bk) continue;
            const s = g.size[i]! * (0.8 + hash(i, 13) * 0.4);
            ctx.fillRect(shot.rect.left + p.x - s, shot.rect.top + p.y - s, s * 2, s * 2);
          }
        }
      }
      if (t < DISSOLVE_TOTAL_MS) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [shot, onDone]);

  return createPortal(
    <div className="dissolve" aria-hidden="true">
      <div ref={layer} className="dissolve-shot" style={{ left: shot.rect.left, top: shot.rect.top, width: shot.rect.width, height: shot.rect.height }} />
      <canvas ref={cv} className="dissolve-cv" />
    </div>,
    document.body,
  );
}
