import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DISSOLVE, DISSOLVE_DT, DISSOLVE_TOTAL_MS, dissolveZones, erosionAt, grainLook, hash, makeDGrains, stepDGrains } from '@core/motion/dissolve.js';
import { grainCount } from '@core/motion/fireStorm.js';

export interface DissolveShot {
  id: number;
  /** Imaginea ecranului care pleacă (ui/snapshot.ts), la rezoluția `dpr`. */
  image: HTMLCanvasElement;
  dpr: number;
  bg: [number, number, number];
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Ieșirea spre Acasă, ca ieșirea din întâmpinare: imaginea ecranului acoperă Acasă, se rupe din 4 zone (cu un shake
 * de 2 px), fiecare bucată ruptă devine o granulă cu culoarea ei, rafalele o poartă, apoi resortul o strânge în bulă.
 */
export function Dissolve({ shot, onDone }: { shot: DissolveShot; onDone: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const C = cv.current;
    if (!C) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = shot.dpr;
    C.width = Math.round(W * dpr);
    C.height = Math.round(H * dpr);
    const ctx = C.getContext('2d')!;

    // Celulele imaginii: momentul ruperii și, pentru cele cu conținut (nu fundal gol), granula lor.
    const img = shot.image;
    const ictx = img.getContext('2d')!;
    const px = ictx.getImageData(0, 0, img.width, img.height).data;
    const cell = DISSOLVE.cell;
    const cw = Math.ceil(W / cell);
    const ch = Math.ceil(H / cell);
    const zones = dissolveZones(shot.id % 97);
    const times = new Float32Array(cw * ch);
    const content: { x: number; y: number; r: number; g: number; b: number; t: number }[] = [];
    const [br, bgc, bb] = shot.bg;
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const k = cy * cw + cx;
        const t = erosionAt((cx + 0.5) / cw, (cy + 0.5) / ch, W / H, zones, (hash(k, 5) - 0.5) * 90);
        times[k] = t;
        const sx = Math.min(img.width - 1, Math.round((cx * cell + cell / 2) * dpr));
        const sy = Math.min(img.height - 1, Math.round((cy * cell + cell / 2) * dpr));
        const o = (sy * img.width + sx) * 4;
        const r = px[o]!;
        const g = px[o + 1]!;
        const b = px[o + 2]!;
        if (Math.abs(r - br) + Math.abs(g - bgc) + Math.abs(b - bb) > 14) content.push({ x: cx * cell + cell / 2, y: cy * cell + cell / 2, r, g, b, t });
      }
    }
    // Plafonul de granule ca la întâmpinare; textul (culori deschise) are prioritate față de fundalul cardurilor.
    const cap = Math.round(grainCount(W, navigator.hardwareConcurrency ?? 8) * 1.6);
    let picked = content;
    if (content.length > cap) {
      const lum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;
      picked = content.filter((c, i) => lum(c) > 380 || hash(i, 9) < cap / content.length);
      if (picked.length > cap) picked = picked.filter((_, i) => hash(i, 10) < cap / picked.length);
    }
    const orb = document.querySelector('.screen .orb') as HTMLElement | null;
    const ob = orb?.getBoundingClientRect();
    const target = ob && ob.width > 0 ? { cx: ob.left + ob.width / 2, cy: ob.top + ob.height / 2, r: ob.width * 0.42 } : { cx: W / 2, cy: H * 0.4, r: Math.min(W, H) * 0.3 };
    const G = makeDGrains(picked, target);

    // Ordinea ruperii celulelor (le ștergem din imagine pe măsură ce trece timpul).
    const order = Array.from(times.keys()).sort((a, b) => times[a]! - times[b]!);
    let cut = 0;
    const gbuf = ctx.createImageData(W, H);
    const g32 = new Uint32Array(gbuf.data.buffer);
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext('2d')!;

    let last = performance.now();
    let sim = 0;
    let t = 0;
    let raf = 0;
    const frame = (now: number) => {
      // Un singur ceas: cel mult 50 ms pe cadru (regula 27), pas fix de simulare 1/60 s.
      t += Math.min(50, now - last);
      last = now;
      while (sim + DISSOLVE_DT * 1000 <= t) {
        sim += DISSOLVE_DT * 1000;
        stepDGrains(G, sim);
      }
      // 1) Imaginea ecranului: celulele rupte dispar din ea.
      while (cut < order.length && times[order[cut]!]! <= t) {
        const k = order[cut]!;
        ictx.clearRect((k % cw) * cell * dpr, Math.floor(k / cw) * cell * dpr, cell * dpr + 1, cell * dpr + 1);
        cut++;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, C.width, C.height);
      // Shake unic de 2 px pe imagine, la început (textul se rupe odată cu ea).
      const sh = t < DISSOLVE.shakeMs ? DISSOLVE.shakePx * Math.sin(t * 0.09) * (1 - t / DISSOLVE.shakeMs) * dpr : 0;
      ctx.drawImage(img, sh, 0);
      // 2) Praful: buffer la rezoluția CSS, granule de 1 px (cele luminoase de 2 px), aditiv.
      g32.fill(0);
      for (let i = 0; i < G.n; i++) {
        const L = grainLook(G, i, t);
        if (!L || L.a <= 0.02) continue;
        const x = G.x[i]! | 0;
        const y = G.y[i]! | 0;
        if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) continue;
        const a = Math.round(L.a * 255);
        const v = (a << 24) | (Math.round(L.b) << 16) | (Math.round(L.g) << 8) | Math.round(L.r);
        g32[y * W + x] = v;
        if (hash(i, 7) > 0.8) {
          g32[y * W + x + 1] = v;
          g32[(y + 1) * W + x] = v;
        }
      }
      tctx.putImageData(gbuf, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, C.width, C.height);
      ctx.globalCompositeOperation = 'source-over';
      if (t < DISSOLVE_TOTAL_MS) raf = requestAnimationFrame(frame);
      else onDone();
    };
    // Primul cadru: imaginea întreagă, ca Acasă să nu clipească dedesubt.
    ctx.drawImage(img, 0, 0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [shot, onDone]);

  return createPortal(<canvas ref={cv} className="dissolve-cv" aria-hidden="true" />, document.body);
}
