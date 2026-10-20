import { useEffect, useRef, type ReactNode } from 'react';
import { drawOrbBody, drawOrbParticle, makeOrbModel, orbCount, orbLink, orbParticle, orbRegistry, orbSlow, orbVisibleN } from './orbRender';

/**
 * Bula de pe Azi: un nor de particule în volum, deformat lent și asimetric, cu ședințele zilei scrise deasupra în HTML.
 * Textul nu se mișcă (nu e desenat în canvas). Particulele sunt decor: cititorul de ecran vede doar butonul și textul.
 * Animația se oprește când pagina e ascunsă, când bula nu e pe ecran, când e deschisă fereastra ședinței sau la
 * „mișcare redusă” (atunci rămâne un cadru static).
 */
export function Orb({ children, onPress, label, paused = false, dim = false, progress = null, celebrate = false, decor = false }: { children: ReactNode; onPress: () => void; label: string; paused?: boolean; dim?: boolean; progress?: number | null; celebrate?: boolean; /** Doar decor (în interiorul altui buton): fără buton propriu. */ decor?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Bula mersului: câte particule rămân = câte minute mai sunt (progress 0 → plină, 1 → aproape goală); culoarea merge
  // de la turcoaz rece spre lime pe măsură ce se adună mersul. Nu depinde de recuperarea zilei.
  const progRef = useRef<number | null>(progress);
  progRef.current = progress == null ? null : Math.max(0, Math.min(1, progress));
  const burstRef = useRef<number | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (celebrate) burstRef.current = performance.now();
    redrawRef.current();
  }, [celebrate]);
  useEffect(() => {
    redrawRef.current();
  }, [progress]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const slow = orbSlow();
    const N = orbCount();
    const dpr = Math.min(window.devicePixelRatio || 1, slow ? 1.5 : 2);
    // Același model ca întâmpinarea (ui/orbRender.ts): particula i de acolo ajunge exact în particula i de aici.
    const pts = makeOrbModel(N);

    let w = 0;
    let h = 0;
    const size = () => {
      // Mărimea din layout, nu cea vizuală: o animație cu scale (ex. felicitarea) nu micșorează rezoluția.
      const r = cv.getBoundingClientRect();
      w = cv.clientWidth || r.width;
      h = cv.clientHeight || r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    const host = cv.parentElement;
    const linked = () => orbLink.active && orbLink.el === host;
    if (host) orbRegistry.set(host, { prog: () => progRef.current, time: () => tAcc });

    const draw = (t: number) => {
      const prog = progRef.current;
      const visibleN = orbVisibleN(N, prog);
      // Scurta animație la atingerea țintei: o pulsație de ~1,6 s (nu și la „mișcare redusă”).
      const bAt = burstRef.current;
      const bT = bAt != null && !reduce ? (performance.now() - bAt) / 1600 : 2;
      const burst = bT >= 0 && bT < 1 ? Math.sin(Math.PI * bT) : 0;
      if (bT >= 1) burstRef.current = null;
      const W = w * dpr;
      const H = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Încă fără mărime (montare, ecran ascuns): nimic de desenat, fără valori NaN în gradienți.
      if (W < 4 || H < 4) return;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.37 * (1 + 0.06 * burst);
      // În transfer: volumul vine din materia ajunsă, iar particulele se desenează doar după ce au ajuns.
      const link = linked();
      drawOrbBody(ctx, t, cx, cy, R, dpr, link ? orbLink.body : 1, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < visibleN; i++) {
        if (link && !orbLink.arrived?.[i]) continue;
        const q = orbParticle(pts[i]!, t, cx, cy, R, dpr, prog, burst);
        if (q) drawOrbParticle(ctx, q);
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    let raf = 0;
    let visible = true;
    let t0 = performance.now();
    let tAcc = 12; // pornește dintr-o formă deja asimetrică
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      tAcc += dt;
      // Ceasul comun cu întâmpinarea: aceeași fază orbitală; după transfer, bula continuă de acolo, fără salt.
      if (linked()) tAcc = orbLink.t;
      draw(tAcc);
      raf = requestAnimationFrame(loop);
    };
    const running = () => !reduce && visible && !document.hidden && !pausedRef.current;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      // Un cadru imediat: bula nu apare goală cât așteaptă primul cadru de animație (ex. la revenirea pe Acasă).
      draw(tAcc);
      if (running()) {
        t0 = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const io = new IntersectionObserver((e) => {
      visible = e[0]?.isIntersecting ?? true;
      sync();
    });
    io.observe(cv);
    document.addEventListener('visibilitychange', sync);
    redrawRef.current = () => {
      if (!raf) {
        if (burstRef.current != null && running()) sync();
        else draw(tAcc);
      }
    };
    const tick = window.setInterval(() => {
      if (!raf && running()) sync();
      if (raf && !running()) sync();
    }, 400);
    sync();
    return () => {
      redrawRef.current = () => undefined;
      cancelAnimationFrame(raf);
      window.clearInterval(tick);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  if (decor)
    return (
      <div className={`orb ${dim ? 'dim' : ''}`} aria-hidden="true">
        <canvas ref={canvas} className="orb-cv" />
        <span className="orb-in">{children}</span>
      </div>
    );
  return (
    <button className={`orb ${dim ? 'dim' : ''}`} onClick={onPress} aria-label={label}>
      <canvas ref={canvas} className="orb-cv" aria-hidden="true" />
      <span className="orb-in">{children}</span>
    </button>
  );
}
