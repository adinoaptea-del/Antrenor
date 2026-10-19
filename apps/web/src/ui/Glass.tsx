import { useEffect, useRef } from 'react';

/**
 * Materia ferestrelor AIRON: același lichid luminos ca bula și tuburile, discret în spatele textului.
 * Particule pe trei adâncimi (departe: mici, slabe, lente; aproape: mai mari, difuze, mai rapide), care urcă încet ca
 * în suspensie, și o bandă de lichid luminos pe marginea de jos, cu menisc ușor ondulat. Decor: cititorul de ecran nu-l
 * vede. Se oprește în fundal, în afara ecranului și la „mișcare redusă” (rămâne un cadru static).
 */
export function GlassFX({ level = 0.22, seed = 5 }: { level?: number; seed?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    // Trei adâncimi: [număr, rază px, alfa, viteză urcare px/s]
    const LAYERS: [number, number, number, number][] = [
      [70, 0.6, 0.35, 3],
      [34, 1.2, 0.5, 7],
      [10, 3.2, 0.22, 12],
    ];
    const pts = LAYERS.flatMap(([n, r, a, v], depth) => Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: r * (0.6 + rnd() * 0.8), a: a * (0.5 + rnd() * 0.7), v: v * (0.6 + rnd() * 0.8), ph: rnd() * 6.28, hue: rnd(), depth })));
    let w = 0;
    let h = 0;
    const fit = () => {
      // Mărimea din layout, nu cea vizuală: o animație cu scale (ex. felicitarea) nu micșorează rezoluția.
      const r = c.getBoundingClientRect();
      w = c.clientWidth || r.width;
      h = c.clientHeight || r.height;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    const col = (k: number) => (k < 0.4 ? [70, 205, 210] : k < 0.78 ? [110, 236, 140] : [222, 252, 70]);
    const draw = (t: number) => {
      const W = w * dpr;
      const H = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Lichidul de pe fund: o bandă luminoasă, cu menisc ondulat lent (sus) și lumină care se stinge în sus.
      const base = H * (1 - level);
      ctx.beginPath();
      ctx.moveTo(0, H);
      const M = 48;
      for (let i = 0; i <= M; i++) {
        const x = (i / M) * W;
        const u = i / M;
        // Menisc: urcă puțin spre pereți (lichidul „se agață” de sticlă), plus unde mici și lente.
        const wall = Math.pow(Math.abs(u - 0.5) * 2, 6) * 14 * dpr;
        const wave = (Math.sin(u * 7 + t * 0.45) * 2.2 + Math.sin(u * 13 - t * 0.31) * 1.2) * dpr;
        ctx.lineTo(x, base - wall + wave);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, base - 20 * dpr, 0, H);
      g.addColorStop(0, 'rgba(222,252,70,0.10)');
      g.addColorStop(0.08, 'rgba(110,236,140,0.075)');
      g.addColorStop(1, 'rgba(70,205,210,0.02)');
      ctx.fillStyle = g;
      ctx.fill();
      // Linia meniscului, fină și luminoasă.
      ctx.beginPath();
      for (let i = 0; i <= M; i++) {
        const u = i / M;
        const x = u * W;
        const wall = Math.pow(Math.abs(u - 0.5) * 2, 6) * 14 * dpr;
        const wave = (Math.sin(u * 7 + t * 0.45) * 2.2 + Math.sin(u * 13 - t * 0.31) * 1.2) * dpr;
        if (i === 0) ctx.moveTo(x, base - wall + wave);
        else ctx.lineTo(x, base - wall + wave);
      }
      const lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, 'rgba(70,205,210,0.05)');
      lg.addColorStop(0.5, 'rgba(222,252,70,0.28)');
      lg.addColorStop(1, 'rgba(110,236,140,0.08)');
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
      // Particulele, mai dese în lichid, rare deasupra.
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) {
        const y = (((p.y * H - t * p.v * dpr) % H) + H) % H;
        const x = (p.x * W + Math.sin(t * 0.3 + p.ph) * 6 * dpr) % W;
        const inLiquid = y > base;
        const a = p.a * (inLiquid ? 1 : 0.35) * (0.65 + 0.35 * Math.sin(t * 0.9 + p.ph));
        if (a < 0.01) continue;
        const [r0, g0, b0] = col(p.hue);
        const rad = p.r * dpr;
        if (p.depth === 2) {
          // Aproape de privitor: bule difuze, cu margine.
          const bg = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
          bg.addColorStop(0, `rgba(${r0},${g0},${b0},${(a * 0.5).toFixed(3)})`);
          bg.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(x, y, rad * 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${r0},${g0},${b0},${(a * 0.6).toFixed(3)})`;
          ctx.lineWidth = 0.6 * dpr;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${r0},${g0},${b0},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 4 + seed;
    const loop = (now: number) => {
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!reduce && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } else draw(t);
    };
    const io = new IntersectionObserver((e) => {
      visible = e[0]?.isIntersecting ?? true;
      sync();
    });
    io.observe(c);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [level, seed]);
  return <canvas ref={cv} className="glass-fx" aria-hidden="true" />;
}
