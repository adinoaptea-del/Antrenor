import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FIRE,
  FIRE_DT,
  FIRE_EXIT_MS,
  buildOf,
  clamp01,
  fireContentAlpha,
  fireSceneOpacity,
  fireShake,
  fireState,
  fireTextAlpha,
  filamentPoint,
  erosionTime,
  grainCount,
  makeFilaments,
  makeGrains,
  makeZones,
  project,
  smooth,
  span,
  stepGrains,
  warpAmp,
  type FireState,
} from '@core/motion/fireStorm.js';
import { makeOrbModel, orbCount, orbLink, orbParticle, orbRegistry, orbVisibleN } from './orbRender';

/**
 * Întâmpinarea „Fire → Furtună → Home” (specificația aprobată, 20.10.2026). Logica e în src/motion/fireStorm.ts.
 *
 * Fire luminoase continue desenează sfera (fără nor de puncte); mesajul (DOM) stă în centrul ei, „Continuă” dedesubt,
 * în afara volumului. La „Continuă” firele se erodează din mai multe zone și se rup în praf; praful e purtat de rafale
 * oblice și turbulență locală (fără centru de rotație, fără spirală sau pâlnie), apoi fiecare granulă e trasă de un
 * resort amortizat critic pe curbele bulei reale de Acasă (bula își lungește firele pe măsură ce se atașează praful).
 * Apoi antrenamentele din bulă, apoi restul interfeței. Fără lichid.
 *
 * Stări: BOOT → LINE_BUILD → WELCOME_IDLE → (CONTINUE) → BREAKUP → STORM → REFORM → HOME_IDLE; „Sari peste” sau
 * o eroare de desen → Acasă imediat (SAFE_HOME); „mișcare redusă” → sferă statică și o estompare scurtă.
 * Un singur ceas al scenei (avansat cu cel mult 50 ms pe cadru: fără recuperări uriașe după fundal) și un pas fix de
 * simulare de 1/60 s; laboratorul derulează cu ceasul lui și resimulează determinist.
 */

type Clock = () => { t: number; out: number | null };
const BASE = '#071012';
const MARGIN = 16;
const SKIP_MS = 220;
const SHORT_FADE_MS = 200;
const T0 = 12; // aceeași fază de pornire ca bula de Acasă
const SAMPLES = 96;
const COLS: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const homeOrb = () => {
  const el = document.querySelector<HTMLElement>('.azi .orb');
  const r = el?.getBoundingClientRect();
  return el && r && r.width > 20 ? el : null;
};
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function WelcomeFire({
  kicker,
  text,
  clock,
  inline = false,
  onRequestContinue,
  onPhase,
  onClose,
}: {
  kicker: ReactNode;
  text: string;
  clock?: Clock;
  inline?: boolean;
  onRequestContinue?: () => void;
  onPhase?: (p: FireState) => void;
  onClose: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const goBtn = useRef<HTMLButtonElement>(null);
  const reduce = reducedMotion();
  const [ready, setReady] = useState(reduce);
  const [leaving, setLeaving] = useState(false);
  /** Ceasul scenei: t = intrarea (ms), out = ieșirea (ms de la „Continuă”). */
  const scene = useRef<{ t: number; out: number | null }>({ t: reduce ? FIRE.ready : 0, out: null });
  const skipAt = useRef<number | null>(null);
  const done = useRef(false);
  const geo = useRef({ cx: 0, cy: 0, R: 100 });
  const prevFocus = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;
  const clockRef = useRef<Clock>(clock ?? (() => scene.current));
  clockRef.current = clock ?? (() => scene.current);

  const setHomeInert = (on: boolean) => {
    if (inline) return;
    const root = document.getElementById('root');
    if (root) root.inert = on;
  };
  const unlink = () => {
    const el = orbLink.el;
    orbLink.active = false;
    orbLink.el = null;
    orbLink.arrived = null;
    orbLink.body = 1;
    orbLink.reveal = 1;
    const inner = el?.querySelector<HTMLElement>('.orb-in');
    if (inner) inner.style.opacity = '';
  };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    unlink();
    setHomeInert(false);
    if (!inline) document.body.style.overflow = '';
    const el = prevFocus.current as HTMLElement | null;
    if (el && document.contains(el) && typeof el.focus === 'function') el.focus({ preventScroll: true });
    onCloseRef.current();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    setHomeInert(true);
    if (!inline) document.body.style.overflow = 'hidden';
    return () => {
      unlink();
      setHomeInert(false);
      if (!inline) document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = () => {
    // Dublu tap: un singur transfer.
    if (scene.current.out != null || skipAt.current != null || done.current) return;
    if (onRequestContinue) return onRequestContinue();
    if (reduce) {
      skipAt.current = performance.now();
      setLeaving(true);
      window.setTimeout(() => finishRef.current(), SHORT_FADE_MS);
      return;
    }
    scene.current = { t: scene.current.t, out: 0 };
    setLeaving(true);
  };
  const skip = () => {
    if (skipAt.current != null || done.current) return;
    skipAt.current = performance.now();
    unlink();
    setLeaving(true);
    window.setTimeout(() => finishRef.current(), reduce ? SHORT_FADE_MS : SKIP_MS);
  };
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (ready) goBtn.current?.focus({ preventScroll: true });
  }, [ready]);

  /** Așezarea: centrul la ~45% din înălțimea utilă, diametrul min(82vw, 390px), redus dacă textul sau butonul nu încap. */
  const layout = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cy = vh * 0.45;
    const gap = 22;
    const btnH = 48;
    const bottom = 70; // „Sari peste”
    let D = Math.min(vw * 0.82, 390);
    D = Math.min(D, 2 * (vh - bottom - btnH - gap - cy), 2 * (cy - 14));
    D = Math.max(D, 180);
    // Firele respiră și unele vin din afară: raza de bază lasă loc conturului.
    let R = D / 2 / 1.05;
    const b = box.current;
    if (b) {
      b.style.left = `${vw / 2}px`;
      b.style.top = `${cy}px`;
      // Centrul sferei e liber (≥ 0,6 R): textul stă în el; dacă nu încape pe înălțime, sfera crește până la limită.
      b.style.width = `${Math.round(R * 1.22)}px`;
      const h = b.getBoundingClientRect().height;
      if (h > R * 1.2) R = Math.min(D / 2 / 1.05 * 1.12, h / 1.2);
    }
    if (goBtn.current) {
      goBtn.current.style.left = `${vw / 2}px`;
      goBtn.current.style.top = `${Math.round(cy + R * 1.05 + gap)}px`;
    }
    geo.current = { cx: vw / 2, cy, R };
  };
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useLayoutEffect(() => {
    layoutRef.current();
    if (wrap.current) wrap.current.style.opacity = '1';
    // Ancora se măsoară după încărcarea fonturilor; din nou la redimensionare și la rotirea ecranului.
    document.fonts?.ready.then(() => layoutRef.current()).catch(() => undefined);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layoutRef.current()) : null;
    ro?.observe(document.documentElement);
    const onRot = () => layoutRef.current();
    window.addEventListener('orientationchange', onRot);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', onRot);
    };
  }, []);

  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) {
      finishRef.current(); // fără canvas: direct Acasă
      return;
    }
    let VW = 0;
    let VH = 0;
    let dpr = 1;
    const fit = () => {
      VW = window.innerWidth;
      VH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, VW < 700 ? 1.5 : 2);
      c.width = Math.max(1, Math.round((VW + 2 * MARGIN) * dpr));
      c.height = Math.max(1, Math.round((VH + 2 * MARGIN) * dpr));
      c.style.width = `${VW + 2 * MARGIN}px`;
      c.style.height = `${VH + 2 * MARGIN}px`;
    };
    fit();
    window.addEventListener('resize', fit);

    const fils = makeFilaments();
    const zones = makeZones();
    // Momentul ruperii fiecărui eșantion de fir (aceeași formulă ca nașterea prafului).
    const erodeAt = fils.map((f) =>
      Float32Array.from({ length: SAMPLES + 1 }, (_, j) => {
        const s = f.s0 + (j / SAMPLES) * Math.PI * 2;
        const cs = Math.cos(s);
        const sn = Math.sin(s);
        return erosionTime([cs * f.u[0] + sn * f.v[0], cs * f.u[1] + sn * f.v[1], cs * f.u[2] + sn * f.v[2]], zones, (hash(j, f.start) - 0.5) * 80);
      }),
    );
    const n = grainCount(VW, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 8) : 8);
    const g = makeGrains(n, fils, zones);
    const N = orbCount();
    const pts = makeOrbModel(N);
    const ringAng = Float32Array.from({ length: n }, (_, i) => (i * 2.39996323) % (Math.PI * 2));
    const ringR = Float32Array.from({ length: n }, (_, i) => 0.93 + hash(i, 41) * 0.1);
    let arrived = new Uint8Array(N);
    let simOut = 0;
    let orbAtt = 0;
    let ringAtt = 0;
    const field = Array.from({ length: 150 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), r: 0.35 + hash(i, 3) * 1.0, a: 0.04 + hash(i, 4) * 0.16, ang: hash(i, 5) * 6.28, sp: 1.5 + hash(i, 6) * 5, col: COLS[Math.floor(hash(i, 7) * 3)]! }));
    const nebulae = [0, 1, 2].map((i) => ({ x: 0.2 + hash(i, 11) * 0.6, y: 0.15 + hash(i, 12) * 0.7, r: 0.35 + hash(i, 13) * 0.3, col: COLS[i]!, a: 0.045 + hash(i, 14) * 0.03 }));

    const resetSim = () => {
      g.born.fill(0);
      g.attached.fill(0);
      arrived = new Uint8Array(N);
      simOut = 0;
      orbAtt = 0;
      ringAtt = 0;
    };

    let raf = 0;
    let last = performance.now();
    let lastState: FireState | null = null;
    let readyFired = reduce;
    const onVis = () => {
      last = performance.now(); // la revenire: fără recuperare
    };
    document.addEventListener('visibilitychange', onVis);

    const draw = () => {
      const now = performance.now();
      // Ceasul propriu avansează cu cel mult 50 ms pe cadru (pauză în fundal, fără salturi la revenire).
      if (!clock && !document.hidden) {
        const d = Math.min(50, now - last);
        const s = scene.current;
        if (!reduce) scene.current = s.out == null ? { t: s.t + d, out: null } : { t: s.t, out: s.out + d };
      }
      last = now;
      const { t, out } = clockRef.current();
      const st = fireState(t, out);
      if (st !== lastState) {
        lastState = st;
        onPhaseRef.current?.(st);
      }
      if (!readyFired && t >= FIRE.ready) {
        readyFired = true;
        setReady(true);
      }
      const skipP = skipAt.current == null ? 0 : clamp01((now - skipAt.current) / SKIP_MS);
      const op = fireSceneOpacity(out) * (1 - skipP);
      const showing = out != null && out >= FIRE.exit.interface[0];
      if (wrap.current) {
        wrap.current.style.opacity = op.toFixed(3);
        wrap.current.style.pointerEvents = showing || skipP > 0 ? 'none' : '';
      }
      if (showing) setHomeInert(false);
      if (box.current) box.current.style.opacity = (reduce ? 1 : fireTextAlpha(t, out)).toFixed(3);
      if (goBtn.current && out != null) goBtn.current.style.opacity = (1 - smooth(span(out, FIRE.exit.textOut))).toFixed(3);

      const W = (VW + 2 * MARGIN) * dpr;
      const H = (VH + 2 * MARGIN) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const [shx, shy] = reduce ? [0, 0] : fireShake(out);
      ctx.setTransform(dpr, 0, 0, dpr, (MARGIN + shx) * dpr, (MARGIN + shy) * dpr);
      const { cx, cy, R } = geo.current;
      const ts = T0 + (t + (out ?? 0)) / 1000;

      // Fundalul: nebuloase și praf fin; la ruperea firelor spațiul se deformează discret (2–6 px).
      const wa = reduce ? 0 : warpAmp(out);
      const warp = (x: number, y: number): [number, number] => (wa ? [x + wa * Math.sin(y * 0.013 + ts * 3), y + wa * Math.cos(x * 0.011 - ts * 2.4)] : [x, y]);
      const live = (t + (out ?? 0)) / 1000;
      for (const nb of nebulae) {
        const [nx, ny] = warp(nb.x * VW, nb.y * VH);
        const rr = nb.r * Math.max(VW, VH);
        const gr = ctx.createRadialGradient(nx, ny, 0, nx, ny, rr);
        gr.addColorStop(0, `rgba(${nb.col[0]},${nb.col[1]},${nb.col[2]},${nb.a})`);
        gr.addColorStop(1, `rgba(${nb.col[0]},${nb.col[1]},${nb.col[2]},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(nx - rr, ny - rr, rr * 2, rr * 2);
      }
      ctx.globalCompositeOperation = 'lighter';
      const FW = VW + 2 * MARGIN;
      const FH = VH + 2 * MARGIN;
      for (const f of field) {
        const x0 = ((((f.x * FW + Math.cos(f.ang) * f.sp * live) % FW) + FW) % FW) - MARGIN;
        const y0 = ((((f.y * FH + Math.sin(f.ang) * f.sp * live) % FH) + FH) % FH) - MARGIN;
        const [x, y] = warp(x0, y0);
        ctx.fillStyle = `rgba(${f.col[0]},${f.col[1]},${f.col[2]},${f.a.toFixed(3)})`;
        ctx.fillRect(x - f.r, y - f.r, f.r * 2, f.r * 2);
      }

      // Firele: arc continuu, halou + miez; spatele sferei mai stins decât fața. La ieșire, eșantioanele se rup.
      const px = new Float32Array(SAMPLES + 1);
      const py = new Float32Array(SAMPLES + 1);
      const pd = new Float32Array(SAMPLES + 1);
      const tBuild = reduce ? FIRE.build[1] + 1000 : t;
      for (let k = 0; k < fils.length; k++) {
        const f = fils[k]!;
        const { reveal, scale } = buildOf(f, tBuild);
        if (reveal <= 0) continue;
        const jEnd = Math.min(SAMPLES, Math.ceil(reveal * SAMPLES));
        for (let j = 0; j <= jEnd; j++) {
          const s = f.s0 + (Math.min(j / SAMPLES, reveal) * Math.PI * 2);
          const p = filamentPoint(f, s, ts, R);
          const q = project([p[0] * scale, p[1] * scale, p[2] * scale], cx, cy, R);
          px[j] = q.x;
          py[j] = q.y;
          pd[j] = q.depth;
        }
        const ea = erodeAt[k]!;
        const col = COLS[f.col]!;
        for (let bk = 0; bk < 3; bk++) {
          const A = [0.3, 0.62, 1][bk]!;
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            let any = false;
            let fray = 0;
            for (let j = 0; j < jEnd; j++) {
              const dm = (pd[j]! + pd[j + 1]!) / 2;
              if (Math.min(2, Math.floor(dm * 3)) !== bk) continue;
              if (out != null) {
                const e = Math.min(ea[j]!, ea[j + 1]!);
                if (out >= e) continue;
                if (e - out < 140) fray = Math.max(fray, 1 - (e - out) / 140);
              }
              ctx.moveTo(px[j]!, py[j]!);
              ctx.lineTo(px[j + 1]!, py[j + 1]!);
              any = true;
            }
            if (!any) continue;
            const a = pass === 0 ? 0.1 * A : 0.82 * A * (1 + 0.4 * fray);
            ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, a).toFixed(3)})`;
            ctx.lineWidth = pass === 0 ? f.width * 4.5 : f.width;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        }
        // Capătul care desenează, cât timp firul se lungește.
        if (out == null && reveal < 1) {
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.85)`;
          ctx.beginPath();
          ctx.arc(px[jEnd]!, py[jEnd]!, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Praful: simulat cu pas fix. Laboratorul poate derula înapoi: atunci se resimulează determinist de la 0.
      const orbEl = out != null && skipAt.current == null && !reduce ? homeOrb() : null;
      const or = orbEl?.querySelector('canvas')?.getBoundingClientRect() ?? orbEl?.getBoundingClientRect();
      const home = or ? { x: or.left + or.width / 2, y: or.top + or.height / 2, R: Math.min(or.width, or.height) * 0.37 } : null;
      const reg = orbEl ? orbRegistry.get(orbEl) : undefined;
      const homeProg = reg?.prog() ?? null;
      const homeN = orbVisibleN(N, homeProg);
      let ringN = 0;
      if (out != null && !reduce) {
        if (out < simOut) resetSim();
        const source = (i: number): [number, number, number, number] => {
          const f = fils[g.srcF[i]!]!;
          const s = g.srcS[i]!;
          const tt = T0 + (t + simOut) / 1000;
          const a = project(filamentPoint(f, s, tt, R), cx, cy, R);
          const b = project(filamentPoint(f, s + 0.02, tt, R), cx, cy, R);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          // Spre tangentă și puțin spre exterior.
          const ox = (a.x - cx) / R;
          const oy = (a.y - cy) / R;
          return [a.x, a.y, (dx / d) * 0.8 + ox * 0.4, (dy / d) * 0.8 + oy * 0.4];
        };
        const target = (i: number): [number, number] | null => {
          if (!home) return null;
          const tt = T0 + (t + simOut) / 1000;
          if (i < homeN) {
            const q = orbParticle(pts[i]!, tt, home.x, home.y, home.R, 1, homeProg);
            if (q) return [q.x, q.y];
          }
          const a = ringAng[i]! + tt * 0.05;
          const r = home.R * ringR[i]!;
          return [home.x + Math.cos(a) * r, home.y + Math.sin(a) * r * 0.98];
        };
        const onAttach = (i: number) => {
          if (i < homeN && i < N) {
            arrived[i] = 1;
            orbAtt++;
          } else ringAtt++;
        };
        let steps = 0;
        const cap = clock ? 100000 : 8;
        while (simOut + FIRE_DT * 1000 <= out && steps < cap) {
          simOut += FIRE_DT * 1000;
          stepGrains(g, simOut, simOut / 1000, source, target, onAttach);
          steps++;
        }
        if (steps >= cap) simOut = out; // nu recuperăm: ceasul propriu oricum avansează cu ≤ 50 ms
        ringN = Math.max(1, n - Math.min(homeN, N));

        // Desenul prafului: granule fine, pe trei straturi de adâncime, aditiv.
        const handoff = out >= FIRE.exit.handoff;
        const noHomeFade = home ? 1 : 1 - smooth(span(out, [FIRE.exit.gather[0], FIRE.exit.gather[1] - 600]));
        if (!handoff && noHomeFade > 0) {
          for (let ci = 0; ci < 3; ci++) {
            const col = COLS[ci]!;
            for (let bk = 0; bk < 3; bk++) {
              const a = [0.32, 0.55, 0.85][bk]! * noHomeFade;
              ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
              for (let i = 0; i < n; i++) {
                if (!g.born[i] || g.attached[i] || g.col[i] !== ci) continue;
                const d = g.depth[i]!;
                if (Math.min(2, Math.floor(d * 3)) !== bk) continue;
                const sz = g.size[i]!;
                ctx.fillRect(g.x[i]! - sz, g.y[i]! - sz, sz * 2, sz * 2);
              }
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';

        // Bula reală de Acasă: același ceas; particulele sosite, firele care se lungesc; fundalul se deschide peste ea.
        if (orbEl && home) {
          orbLink.active = true;
          orbLink.el = orbEl;
          orbLink.t = ts;
          if (handoff) arrived.fill(1);
          orbLink.arrived = arrived;
          const fo = handoff ? 1 : orbAtt / Math.max(1, Math.min(homeN, N));
          const fr = handoff ? 1 : ringAtt / ringN;
          orbLink.body = smooth(Math.min(1, fo / 0.9));
          orbLink.reveal = smooth(Math.min(1, fr / 0.9));
          const inner = orbEl.querySelector<HTMLElement>('.orb-in');
          if (inner) inner.style.opacity = fireContentAlpha(out).toFixed(3);
          if (base.current) {
            const open = smooth(span(out, [FIRE.exit.gather[0], FIRE.exit.handoff]));
            const hole = Math.min(or!.width, or!.height) * 0.5 * (0.25 + 0.75 * open);
            const m = `radial-gradient(circle at ${Math.round(home.x)}px ${Math.round(home.y)}px, transparent ${Math.round(hole * 0.8)}px, #000 ${Math.round(hole)}px)`;
            base.current.style.webkitMaskImage = m;
            base.current.style.maskImage = m;
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      if (out != null && out >= FIRE_EXIT_MS && !clock && skipAt.current == null) {
        finishRef.current();
        return;
      }
      raf = requestAnimationFrame(safeDraw);
    };
    // Orice eroare de desen: Acasă imediat, fără ecran gol.
    const safeDraw = () => {
      try {
        draw();
      } catch {
        cancelAnimationFrame(raf);
        unlink();
        finishRef.current();
      }
    };
    raf = requestAnimationFrame(safeDraw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sceneEl = (
    <div ref={wrap} className={`cosmic welcome-fire ${reduce ? 'still' : ''} ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Mesajul zilei">
      <div ref={base} className="cosmic-base" style={{ background: BASE }} />
      <canvas ref={cv} className="cosmic-cv" aria-hidden="true" />
      <div className="cosmic-box wf-box" ref={box} style={{ opacity: reduce ? 1 : 0 }}>
        <div className="cosmic-k">{kicker}</div>
        <p className="cosmic-t" aria-live="polite">
          {text}
        </p>
      </div>
      <button ref={goBtn} className={`cosmic-go wf-go ${ready ? 'on' : ''}`} onClick={go} disabled={!ready || leaving} aria-hidden={!ready}>
        Continuă
      </button>
      <button className="cosmic-skip" onClick={skip} disabled={skipAt.current != null}>
        Sari peste
      </button>
    </div>
  );
  return inline ? sceneEl : createPortal(sceneEl, document.body);
}
