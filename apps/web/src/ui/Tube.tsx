import { useEffect, useRef } from 'react';

/**
 * Tubul de pregătire: aceeași materie ca bula (particule lime-verde-turcoaz pe grafit), într-o capsulă orizontală care
 * se umple de la stânga cât arată progresul. Plin = obiectivul atins. Fără date: tubul rămâne gol, cu contur punctat.
 * Animația se oprește în fundal, în afara ecranului și la „mișcare redusă”.
 */
export function Tube({ pct, size = 'big', label }: { pct: number | null; size?: 'big' | 'small'; label: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const pctRef = useRef(pct);
  pctRef.current = pct;

  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = size === 'big' ? 260 : 110;
    let seed = size === 'big' ? 11 : 29;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pts = Array.from({ length: N }, () => ({ x: rnd(), y: rnd(), sp: 0.004 + rnd() * 0.012, ph: rnd() * 6.28, sz: rnd() < 0.08 ? 1.6 + rnd() : 0.5 + rnd() * 0.8, hue: rnd() }));
    let w = 0;
    let h = 0;
    const fit = () => {
      const r = c.getBoundingClientRect();
      w = r.width;
      h = r.height;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    const col = (k: number) => (k < 0.45 ? [80, 214, 205] : k < 0.8 ? [110, 236, 140] : [222, 252, 70]);
    let shown = 0; // umplerea animată spre valoarea reală
    const draw = (t: number, dt: number) => {
      const W = w * dpr;
      const H = h * dpr;
      const r = H / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const target = pctRef.current == null ? 0 : Math.max(0, Math.min(100, pctRef.current)) / 100;
      shown += (target - shown) * Math.min(1, dt * 2.5);
      const capsule = () => {
        ctx.beginPath();
        ctx.moveTo(r, 1);
        ctx.lineTo(W - r, 1);
        ctx.arc(W - r, r, r - 1, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(r, H - 1);
        ctx.arc(r, r, r - 1, Math.PI / 2, (3 * Math.PI) / 2);
        ctx.closePath();
      };
      // Sticla tubului
      capsule();
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fill();
      ctx.save();
      capsule();
      ctx.clip();
      const fillW = W * shown;
      if (fillW > 1) {
        // Lumina conținutului
        const g = ctx.createLinearGradient(0, 0, fillW, 0);
        g.addColorStop(0, 'rgba(70,205,210,0.10)');
        g.addColorStop(0.7, 'rgba(110,236,140,0.16)');
        g.addColorStop(1, 'rgba(222,252,70,0.28)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, fillW, H);
        // Frontul de umplere: o margine moale, ușor ondulată
        ctx.globalCompositeOperation = 'lighter';
        const fg = ctx.createLinearGradient(fillW - 18 * dpr, 0, fillW + 2, 0);
        fg.addColorStop(0, 'rgba(222,252,70,0)');
        fg.addColorStop(1, 'rgba(222,252,70,0.35)');
        ctx.fillStyle = fg;
        ctx.fillRect(fillW - 18 * dpr, 0, 18 * dpr + 2, H);
        for (const p of pts) {
          const px = ((p.x + t * p.sp) % 1) * fillW;
          const py = H * (0.12 + 0.76 * ((p.y + 0.08 * Math.sin(t * 0.7 + p.ph)) % 1));
          const c2 = col(p.hue * (0.6 + 0.4 * (px / Math.max(1, fillW))));
          const a = (0.35 + 0.45 * Math.sin(t * 1.3 + p.ph) ** 2) * (0.5 + 0.5 * (px / Math.max(1, fillW)));
          const rad = p.sz * dpr;
          ctx.fillStyle = `rgba(${c2[0]},${c2[1]},${c2[2]},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      // Conturul
      capsule();
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash(pctRef.current == null ? [4 * dpr, 4 * dpr] : []);
      ctx.strokeStyle = shown >= 0.995 ? 'rgba(222,252,70,0.8)' : 'rgba(160,240,170,0.28)';
      ctx.stroke();
      ctx.setLineDash([]);
    };
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 3;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      draw(t, dt);
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!reduce && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } else {
        shown = pctRef.current == null ? 0 : Math.max(0, Math.min(100, pctRef.current)) / 100;
        draw(t, 0);
      }
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
  }, [size]);

  return <canvas ref={cv} className={`tube tube-${size}`} role="img" aria-label={pct == null ? `${label}: fără date încă` : `${label}: ${Math.round(pct)}%`} />;
}
