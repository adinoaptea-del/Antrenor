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
    // Trei adâncimi: praf fin și lent, particule medii, bule mari și mai rapide (aproape de privitor).
    const pts = Array.from({ length: N }, () => {
      const k = rnd();
      const sz = k < 0.07 ? 1.8 + rnd() * 1.6 : k < 0.35 ? 0.9 + rnd() * 0.6 : 0.35 + rnd() * 0.45;
      return { x: rnd(), y: rnd(), sp: (0.002 + rnd() * 0.006) * (sz > 1.6 ? 2.2 : sz > 0.9 ? 1.4 : 1), ph: rnd() * 6.28, sz, hue: rnd() };
    });
    let w = 0;
    let h = 0;
    const fit = () => {
      // Mărimea din layout, nu cea vizuală: o animație cu scale (ex. felicitarea) nu micșorează rezoluția.
      const r = c.getBoundingClientRect();
      w = c.clientWidth || r.width;
      h = c.clientHeight || r.height;
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
      // Sticla tubului: fumurie, cu o lumină difuză în interior.
      capsule();
      const glass = ctx.createLinearGradient(0, 0, 0, H);
      glass.addColorStop(0, 'rgba(255,255,255,0.06)');
      glass.addColorStop(0.5, 'rgba(255,255,255,0.015)');
      glass.addColorStop(1, 'rgba(110,236,140,0.04)');
      ctx.fillStyle = glass;
      ctx.fill();
      ctx.save();
      capsule();
      ctx.clip();
      const fillW = W * shown;
      if (fillW > 1) {
        // Lichidul, cu menisc curbat și ușor ondulat: frontul e bombat (centrul înaintează), cu deformări mici și lente.
        const bulge = Math.min(r * 1.5, fillW * 0.5);
        const front = (y: number) => {
          const v = (y - H / 2) / (H / 2);
          const round = bulge * Math.sqrt(Math.max(0, 1 - v * v));
          const wob = (Math.sin(v * 2.6 + t * 0.9) * 1.6 + Math.sin(v * 5.3 - t * 0.55) * 0.8) * dpr * Math.min(1, fillW / (40 * dpr));
          return Math.max(0, fillW - bulge + round + wob);
        };
        const liquid = () => {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          const M = 28;
          for (let i = 0; i <= M; i++) {
            const y = (i / M) * H;
            ctx.lineTo(front(y), y);
          }
          ctx.lineTo(0, H);
          ctx.closePath();
        };
        liquid();
        const g = ctx.createLinearGradient(0, 0, fillW, 0);
        g.addColorStop(0, 'rgba(46,170,180,0.42)');
        g.addColorStop(0.55, 'rgba(90,220,150,0.48)');
        g.addColorStop(1, 'rgba(212,250,70,0.66)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.save();
        liquid();
        ctx.clip();
        // Adâncimea: mai întunecat jos, o reflexie pe suprafața de sus a lichidului.
        const depth = ctx.createLinearGradient(0, 0, 0, H);
        depth.addColorStop(0, 'rgba(255,255,255,0.10)');
        depth.addColorStop(0.18, 'rgba(255,255,255,0.0)');
        depth.addColorStop(0.75, 'rgba(0,0,0,0.0)');
        depth.addColorStop(1, 'rgba(0,20,20,0.25)');
        ctx.fillStyle = depth;
        ctx.fillRect(0, 0, fillW + r, H);
        // Particulele în suspensie: trei adâncimi (mici și lente departe, bule mai mari aproape).
        ctx.globalCompositeOperation = 'lighter';
        for (const p of pts) {
          const px = ((p.x + t * p.sp) % 1) * (fillW + bulge);
          const py = H * (0.08 + 0.84 * ((p.y + 0.08 * Math.sin(t * 0.7 + p.ph)) % 1));
          const rel = px / Math.max(1, fillW);
          const c2 = col(p.hue * (0.55 + 0.45 * rel));
          const a = (0.3 + 0.5 * Math.sin(t * 1.3 + p.ph) ** 2) * (0.45 + 0.55 * Math.min(1, rel));
          const rad = p.sz * dpr;
          if (p.sz > 1.6) {
            ctx.strokeStyle = `rgba(${c2[0]},${c2[1]},${c2[2]},${(a * 0.8).toFixed(3)})`;
            ctx.lineWidth = 0.7 * dpr;
            ctx.beginPath();
            ctx.arc(px, py, rad * 1.4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(${c2[0]},${c2[1]},${c2[2]},${(a * 0.25).toFixed(3)})`;
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(${c2[0]},${c2[1]},${c2[2]},${a.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(px, py, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        // Marginea meniscului: un fir luminos lime, mai gros la mijloc.
        ctx.beginPath();
        const M2 = 28;
        for (let i = 0; i <= M2; i++) {
          const y = (i / M2) * H;
          if (i === 0) ctx.moveTo(front(y), y);
          else ctx.lineTo(front(y), y);
        }
        ctx.strokeStyle = 'rgba(232,255,110,0.85)';
        ctx.lineWidth = 1.6 * dpr;
        ctx.shadowColor = 'rgba(222,252,70,0.8)';
        ctx.shadowBlur = 10 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      // Conturul sticlei: fin, cu reflexii neuniforme (mai luminos sus-stânga și jos-dreapta).
      capsule();
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash(pctRef.current == null ? [4 * dpr, 4 * dpr] : []);
      const rim = ctx.createLinearGradient(0, 0, W, H);
      const full = shown >= 0.995;
      rim.addColorStop(0, full ? 'rgba(222,252,70,0.9)' : 'rgba(170,250,220,0.45)');
      rim.addColorStop(0.35, 'rgba(160,240,190,0.16)');
      rim.addColorStop(0.7, 'rgba(160,240,190,0.12)');
      rim.addColorStop(1, full ? 'rgba(222,252,70,0.9)' : 'rgba(200,255,120,0.38)');
      ctx.strokeStyle = rim;
      ctx.stroke();
      ctx.setLineDash([]);
      // Reflexia de pe sticlă: o dungă subțire sus, care nu atinge capetele.
      if (pctRef.current != null) {
        ctx.beginPath();
        ctx.moveTo(r * 1.2, H * 0.2);
        ctx.lineTo(W - r * 1.6, H * 0.2);
        const hl = ctx.createLinearGradient(r, 0, W - r, 0);
        hl.addColorStop(0, 'rgba(255,255,255,0)');
        hl.addColorStop(0.2, 'rgba(255,255,255,0.18)');
        hl.addColorStop(0.6, 'rgba(255,255,255,0.05)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = hl;
        ctx.lineWidth = Math.max(1, H * 0.06);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
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
