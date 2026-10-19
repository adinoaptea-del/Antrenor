import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bula de pe Azi: un nor de particule în volum, deformat lent și asimetric, cu ședințele zilei scrise deasupra în HTML.
 * Textul nu se mișcă (nu e desenat în canvas). Particulele sunt decor: cititorul de ecran vede doar butonul și textul.
 * Animația se oprește când pagina e ascunsă, când bula nu e pe ecran, când e deschisă fereastra ședinței sau la
 * „mișcare redusă” (atunci rămâne un cadru static).
 */
export function Orb({ children, onPress, label, paused = false, dim = false, progress = null, celebrate = false }: { children: ReactNode; onPress: () => void; label: string; paused?: boolean; dim?: boolean; progress?: number | null; celebrate?: boolean }) {
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
    const slow = (navigator.hardwareConcurrency ?? 8) <= 4;
    const N = slow ? 420 : 760;
    const dpr = Math.min(window.devicePixelRatio || 1, slow ? 1.5 : 2);

    // Puncte: majoritatea pe membrană (coajă subțire), puține în volum; fiecare cu viteza și faza lui.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pts = Array.from({ length: N }, () => {
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

    // Deformare netedă în coordonatele vederii: sumă de unde lente pe cicluri diferite (aprox. 9–21 s).
    const radius = (x: number, y: number, z: number, t: number) =>
      1 + 0.06 * Math.sin(2.1 * x + t * 0.62) + 0.05 * Math.sin(2.6 * y - t * 0.44 + 1.3) + 0.04 * Math.sin(3.1 * z + t * 0.3 + 2.1) + 0.035 * Math.sin(3.7 * (x - y) - t * 0.51) + 0.02 * Math.sin(5.3 * x * y + t * 0.37);

    // Culoarea după unghi: lime-galben în dreapta-jos, verde, turcoaz rece în stânga-sus.
    const LIME = [222, 252, 70];
    const GREEN = [110, 236, 140];
    const TEAL = [70, 205, 210];
    const colAt = (ang: number, k: number) => {
      const f = (Math.cos(ang - 0.75) + 1) / 2; // 1 spre dreapta-jos
      const g = Math.min(1, Math.max(0, f * 0.85 + (k - 0.5) * 0.3));
      const [a, b, m] = g > 0.5 ? [GREEN, LIME, (g - 0.5) * 2] : [TEAL, GREEN, g * 2];
      return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * m));
    };

    // Progresul mersului: puțin realizat = mai rece (turcoaz), aproape de țintă = lime.
    const tint = (c: number[], prog: number | null) => {
      if (prog == null) return c;
      const to = prog < 0.5 ? TEAL.map((v, i) => v + (GREEN[i]! - v) * prog * 2) : GREEN.map((v, i) => v + (LIME[i]! - v) * (prog - 0.5) * 2);
      return c.map((v, i) => Math.round(v * 0.5 + to[i]! * 0.5));
    };

    const draw = (t: number) => {
      const prog = progRef.current;
      // Particulele vizibile: proporțional cu minutele rămase (un rest discret rămâne, ca bula să nu dispară).
      const visibleN = prog == null ? N : Math.round(N * (0.06 + 0.94 * (1 - prog)));
      // Scurta animație la atingerea țintei: o pulsație de ~1,6 s (nu și la „mișcare redusă”).
      const bAt = burstRef.current;
      const bT = bAt != null && !reduce ? (performance.now() - bAt) / 1600 : 2;
      const burst = bT >= 0 && bT < 1 ? Math.sin(Math.PI * bT) : 0;
      if (bT >= 1) burstRef.current = null;
      const W = w * dpr;
      const H = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.37 * (1 + 0.06 * burst);
      const rotY = t * 0.08;
      const rotX = 0.35 + 0.12 * Math.sin(t * 0.05);
      const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);

      // Haloul exterior și ceața din interiorul membranei.
      const g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.6);
      g.addColorStop(0, 'rgba(60,200,170,0.035)');
      g.addColorStop(0.45, 'rgba(150,240,110,0.09)');
      g.addColorStop(0.7, 'rgba(120,230,150,0.03)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      // Membrana: câteva contururi deformate diferit, de la larg și slab la fin și luminos.
      const layers = 5;
      for (let k = 0; k < layers; k++) {
        const sc = 1 - k * 0.028;
        const ph = k * 1.9;
        const path = new Path2D();
        const M = 140;
        for (let i = 0; i <= M; i++) {
          const q = (i / M) * Math.PI * 2;
          const x = Math.cos(q), y = Math.sin(q);
          const r = sc * radius(x, y, 0.35 * Math.sin(q * 2 + t * 0.2 + ph), t + ph) * (1 + 0.012 * Math.sin(q * 7 + t * 0.9 + ph));
          const X = cx + x * r * R, Y = cy + y * r * R;
          if (i === 0) path.moveTo(X, Y);
          else path.lineTo(X, Y);
        }
        const c0 = colAt(Math.PI * 1.25, k / layers), c1 = colAt(0.75, k / layers);
        const strong = k === 0 ? 1 : k === 1 ? 0.7 : 0.45;
        const stroke = (lw: number, al: number) => {
          const lg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
          lg.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},${al * 0.8})`);
          lg.addColorStop(1, `rgba(${c1[0]},${c1[1]},${c1[2]},${al})`);
          ctx.strokeStyle = lg;
          ctx.lineWidth = lw * dpr;
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
          const x = Math.cos(q), y = Math.sin(q) * (0.75 + 0.2 * Math.sin(k));
          const r = sc * radius(x, y, 0.4, t + k);
          const X = cx + x * r * R, Y = cy + y * r * R;
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        const c = colAt(st + len / 2, k / 7);
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.1)`;
        ctx.lineWidth = 1.1 * dpr;
        ctx.stroke();
      }

      // Particule: rotite în volum, apoi deformate în coordonatele vederii (la fel ca membrana).
      for (let i = 0; i < visibleN; i++) {
        const p = pts[i]!;
        const th = p.th + t * p.sp;
        const s = Math.sqrt(1 - p.u * p.u);
        const x0 = s * Math.cos(th), y0 = p.u, z0 = s * Math.sin(th);
        const x1 = x0 * cY + z0 * sY;
        const z1 = -x0 * sY + z0 * cY;
        const y1 = y0 * cX - z1 * sX;
        const z2 = y0 * sX + z1 * cX;
        const r = p.r * radius(x1, y1, z2, t);
        const f = 2.8 / (2.8 - z2 * r);
        const X = cx + x1 * r * R * f;
        const Y = cy + y1 * r * R * f;
        const depth = (z2 + 1) / 2;
        const dc = Math.hypot(X - cx, Y - cy) / R;
        // Centrul rămâne aerisit pentru text; marginea e mai luminoasă.
        const clear = Math.min(1, Math.max(0.08, (dc - 0.42) / 0.38));
        const rim = 0.6 + 0.6 * Math.max(0, 1 - Math.abs(dc - 1) * 4);
        const a = Math.min(1, (0.4 + 0.7 * depth) * clear * rim * (0.8 + p.tw * Math.sin(t * 1.1 + p.ph)) * (1 + 0.8 * burst));
        if (a <= 0.01) continue;
        const c = tint(colAt(Math.atan2(Y - cy, X - cx), p.hue), prog);
        const rad = p.sz * dpr * (0.7 + 0.6 * depth);
        if (p.big) {
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

  return (
    <button className={`orb ${dim ? 'dim' : ''}`} onClick={onPress} aria-label={label}>
      <canvas ref={canvas} className="orb-cv" aria-hidden="true" />
      <span className="orb-in">{children}</span>
    </button>
  );
}
