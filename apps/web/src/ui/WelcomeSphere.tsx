import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  PHASES,
  REDUCED_MS,
  SKIP_MS,
  SPHERE_EXIT,
  SPHERE_EXIT_MS,
  clamp01,
  easeInOut,
  easeOut,
  impulse,
  lensPull,
  particleArrival,
  phaseAt,
  span,
  sphereContentAlpha,
  sphereLens,
  spherePhaseAt,
  sphereRelease,
  sphereSceneOpacity,
  sphereShake,
  sphereTextAlpha,
  sphereTravelDur,
  sphereWave,
  stateAt,
  type PhaseName,
  type SpherePhase,
} from '@core/motion/teleport.js';
import { drawOrbBody, drawOrbParticle, makeOrbModel, orbCount, orbLink, orbParticle, orbRegistry, orbVisibleN, type OrbParticle } from './orbRender';

/**
 * Întâmpinarea ca sferă vie (cererea proprietarului, 20.10.2026): aceeași sferă ca bula de pe Acasă — aceleași
 * particule, culori, adâncime, luminozitate și mișcare orbitală (ui/orbRender.ts) —, fără lichid, nivel de apă,
 * menisc, reflexii de recipient sau membrană de sticlă. Mesajul stă în centrul volumului.
 *
 * Un singur sistem de particule pe toată secvența: particulele vin din câmp și formează sfera; la „Continuă” spațiul
 * se curbează discret spre sferă, urmează o undă de relaxare și o vibrație scurtă (doar decorul), mesajul se stinge,
 * apoi sfera se descompune dinspre bula de Acasă. Particula i pleacă din sfera de întâmpinare și ajunge exact unde bula
 * reală de Acasă desenează particula i (același model, același ceas): poziția, mărimea, culoarea și faza continuă
 * fără salt; bula reală o preia la sosire și își capătă volumul din ce a ajuns. Apoi antrenamentele din bulă, apoi
 * restul interfeței. Fundalul rămâne cosmic și opac până atunci. „Mișcare redusă”: fără curbare și vibrație.
 */

type Clock = () => { t: number; out: number | null };
const BASE = '#071012';
const MARGIN = 16;
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const homeOrb = () => {
  const el = document.querySelector<HTMLElement>('.azi .orb');
  const r = el?.getBoundingClientRect();
  return el && r && r.width > 20 ? el : null;
};
const COLS: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];
/** Pseudo-aleator determinist pe index (aceeași valoare la fiecare cadru: fără schimbări bruște de direcție). */
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function WelcomeSphere({
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
  onPhase?: (p: PhaseName | SpherePhase) => void;
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
  const t0 = useRef(performance.now());
  const outAt = useRef<number | null>(null);
  const skipAt = useRef<number | null>(null);
  const done = useRef(false);
  const geo = useRef<{ cx: number; cy: number; R: number } | null>(null);
  const prevFocus = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;
  const realClock: Clock = () => {
    const now = performance.now();
    return outAt.current == null ? { t: now - t0.current, out: null } : { t: outAt.current - t0.current, out: now - outAt.current };
  };
  const clockRef = useRef<Clock>(clock ?? realClock);
  clockRef.current = clock ?? realClock;

  const setHomeInert = (on: boolean) => {
    if (inline) return;
    const root = document.getElementById('root');
    if (root) root.inert = on;
  };
  /** Bula de Acasă revine la desenul obișnuit (ceasul ei continuă din faza la care a ajuns). */
  const unlink = () => {
    const el = orbLink.el;
    orbLink.active = false;
    orbLink.el = null;
    orbLink.arrived = null;
    orbLink.body = 1;
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
    if (outAt.current != null || skipAt.current != null) return;
    if (onRequestContinue) return onRequestContinue();
    if (reduce) {
      skipAt.current = performance.now();
      setLeaving(true);
      window.setTimeout(() => finishRef.current(), REDUCED_MS);
      return;
    }
    outAt.current = performance.now();
    setLeaving(true);
  };
  const skip = () => {
    if (skipAt.current != null) return;
    skipAt.current = performance.now();
    unlink();
    setLeaving(true);
    window.setTimeout(() => finishRef.current(), reduce ? REDUCED_MS : SKIP_MS);
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

  // Locul sferei: sub bula de Acasă (ca transferul să traverseze spațiul), cu mesajul în centrul volumului.
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const R = Math.max(130, Math.min(vw * 0.46, 200, vh * 0.3));
    const orb = homeOrb()?.getBoundingClientRect();
    let cy = vh * 0.46;
    if (orb) cy = Math.max(vh * 0.56, orb.top + orb.height / 2 + R * 0.7);
    cy = Math.min(cy, vh - R - 64);
    cy = Math.max(cy, R + 40);
    geo.current = { cx: vw / 2, cy, R };
    if (box.current) {
      box.current.style.left = `${vw / 2}px`;
      box.current.style.top = `${cy}px`;
      box.current.style.width = `${Math.round(R * 1.08)}px`;
    }
    if (wrap.current) wrap.current.style.opacity = '1';
  }, []);

  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !geo.current) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = 0;
    let VH = 0;
    const fit = () => {
      VW = window.innerWidth;
      VH = window.innerHeight;
      c.width = Math.max(1, Math.round((VW + 2 * MARGIN) * dpr));
      c.height = Math.max(1, Math.round((VH + 2 * MARGIN) * dpr));
      c.style.width = `${VW + 2 * MARGIN}px`;
      c.style.height = `${VH + 2 * MARGIN}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    const N = orbCount();
    const pts = makeOrbModel(N);
    // Praful de fundal: spațiul pe care îl curbează lentila (doar decor).
    const field = Array.from({ length: 140 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), r: 0.35 + hash(i, 3) * 1.1, a: 0.05 + hash(i, 4) * 0.18, ang: hash(i, 5) * 6.28, sp: 1.5 + hash(i, 6) * 5, col: COLS[Math.floor(hash(i, 7) * 3)]! }));
    const nebulae = [0, 1, 2].map((i) => ({ x: 0.2 + hash(i, 11) * 0.6, y: 0.15 + hash(i, 12) * 0.7, r: 0.35 + hash(i, 13) * 0.3, col: COLS[i]!, a: 0.045 + hash(i, 14) * 0.03 }));
    const T0 = 12; // aceeași fază de pornire ca bula de Acasă

    let raf = 0;
    let lastPhase: string | null = null;
    let readyFired = false;
    let arrived: Uint8Array | null = null;
    let lastLeft = 1;

    const draw = () => {
      const now = performance.now();
      const { t, out } = clockRef.current();
      const g = geo.current!;
      const ts = T0 + (t + (out ?? 0)) / 1000; // ceasul sferei (același cu al bulei în transfer)
      const phase = out != null ? spherePhaseAt(out) : phaseAt(t, null);
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseRef.current?.(phase);
      }
      if (!readyFired && stateAt(t, null) === 'readable') {
        readyFired = true;
        setReady(true);
      }
      const skipP = skipAt.current == null ? 0 : clamp01((now - skipAt.current) / SKIP_MS);
      const op = sphereSceneOpacity(out) * (1 - skipP);
      const showing = out != null && out >= SPHERE_EXIT.interfata[0];
      if (wrap.current) {
        wrap.current.style.opacity = op.toFixed(3);
        wrap.current.style.pointerEvents = showing || skipP > 0 ? 'none' : '';
      }
      if (showing) setHomeInert(false);
      const ta = reduce ? 1 : sphereTextAlpha(t, out);
      if (box.current) box.current.style.opacity = ta.toFixed(3);

      const W = (VW + 2 * MARGIN) * dpr;
      const H = (VH + 2 * MARGIN) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const sh = out != null && !reduce ? sphereShake(out) : { x: 0, y: 0 };
      ctx.setTransform(dpr, 0, 0, dpr, (MARGIN + sh.x) * dpr, (MARGIN + sh.y) * dpr);
      const { cx, cy, R } = g;

      // Bula de Acasă (componenta reală) — ținta transferului.
      const orbEl = out != null && skipAt.current == null && !reduce ? homeOrb() : null;
      // Geometria exactă a desenului bulei: canvasul ei (raza = 0,37 din latura mică, ca în Orb).
      const or = orbEl?.querySelector('canvas')?.getBoundingClientRect() ?? orbEl?.getBoundingClientRect();
      const home = or ? { x: or.left + or.width / 2, y: or.top + or.height / 2, R: Math.min(or.width, or.height) * 0.37 } : null;
      const reg = orbEl ? orbRegistry.get(orbEl) : undefined;
      const homeN = orbVisibleN(N, reg?.prog() ?? null);
      const homeProg = reg?.prog() ?? null;
      const dir = home ? (() => {
        const dx = home.x - cx;
        const dy = home.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        return { x: dx / d, y: dy / d };
      })() : { x: 0, y: -1 };

      // Spațiul: la intrare lentila și impulsul (v2), la ieșire curbarea spre sferă și unda de relaxare.
      const pull = reduce ? 0 : out == null ? lensPull(t) : sphereLens(out);
      const wave = reduce ? null : out == null ? impulse(t) : sphereWave(out);
      const LR = R * 2.2;
      const ringR = wave == null ? 0 : R * 0.9 + wave * Math.max(VW, VH) * 0.6;
      const lens = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const f = pull * Math.exp(-(d * d) / (LR * LR));
        let k2 = 1 - 0.35 * f;
        if (wave != null) k2 += (22 * Math.exp(-((d - ringR) ** 2) / (55 * 55)) * (1 - wave)) / d;
        const rot = 0.22 * f;
        const ex = dx * k2;
        const ey = dy * k2;
        return [cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)];
      };
      const live = (t + (out ?? 0)) / 1000;
      for (const nb of nebulae) {
        const [nx, ny] = lens(nb.x * VW, nb.y * VH);
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
        const [x, y] = lens(x0, y0);
        ctx.fillStyle = `rgba(${f.col[0]},${f.col[1]},${f.col[2]},${f.a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (wave != null) {
        const w = 60;
        const gr = ctx.createRadialGradient(cx, cy, Math.max(0, ringR - w), cx, cy, ringR + w);
        gr.addColorStop(0, 'rgba(110,236,140,0)');
        gr.addColorStop(0.5, `rgba(150,245,170,${(0.07 * (1 - wave)).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(70,205,210,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR + w, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Momentul desprinderii fiecărei particule: după poziția ei la începutul desprinderii (determinist).
      const tsRel = T0 + (t + SPHERE_EXIT.desprindere[0]) / 1000;
      let released = 0;
      let arrivedN = 0;
      const flight: { q: OrbParticle; trail: OrbParticle[] }[] = [];
      if (out != null && home && !arrived) arrived = new Uint8Array(N);

      // Corpul sferei de întâmpinare: apare la condensare, se pierde pe măsură ce pleacă particulele.
      const formed = reduce ? 1 : easeInOut(span(t, [PHASES.condensare[0], PHASES.condensare[1]]));

      // Corpul sferei de întâmpinare (halou, membrană, fire): vine la condensare, pleacă odată cu particulele.
      drawOrbBody(ctx, ts, cx, cy, R, 1, formed * Math.pow(lastLeft, 0.8), W / dpr, H / dpr);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const p = pts[i]!;
        const A = orbParticle(p, ts, cx, cy, R, 1, null);
        if (!A) continue;
        // Intrarea: particula vine din câmp pe un arc, cu întârzierea și viteza ei.
        if (out == null && !reduce) {
          const arr = particleArrival(t, hash(i, 21), hash(i, 22));
          if (arr < 1) {
            const sx = hash(i, 23) * VW;
            const sy = hash(i, 24) * VH;
            const bend = (hash(i, 25) - 0.5) * 0.9;
            const mx = (sx + A.x) / 2 - (A.y - sy) * bend;
            const my = (sy + A.y) / 2 + (A.x - sx) * bend;
            const v = 1 - arr;
            let x = v * v * sx + 2 * v * arr * mx + arr * arr * A.x;
            let y = v * v * sy + 2 * v * arr * my + arr * arr * A.y;
            [x, y] = lens(x, y);
            const a = (0.12 + 0.88 * arr) * (arr > 0 ? 1 : 0.5) * Math.max(A.a, 0.25);
            drawOrbParticle(ctx, { ...A, x, y, a }, 1);
            continue;
          }
          const [lx, ly] = lens(A.x, A.y);
          drawOrbParticle(ctx, { ...A, x: lx, y: ly });
          continue;
        }
        if (out == null) {
          drawOrbParticle(ctx, A);
          continue;
        }
        // Ieșirea: curbarea afectează și sfera (decor), apoi transferul.
        const A0 = orbParticle(p, tsRel, cx, cy, R, 1, null)!;
        const s = (A0.x - cx) * dir.x + (A0.y - cy) * dir.y;
        const rel = sphereRelease(s, R, (hash(i, 31) - 0.5) * 160);
        if (out < rel || !home) {
          if (!home && out >= rel) {
            // Fără bula de Acasă: particula se risipește lin în spațiu.
            const u = easeInOut(clamp01((out - rel) / 1600));
            released++;
            const ox = (A.x - cx) / R;
            const oy = (A.y - cy) / R;
            drawOrbParticle(ctx, { ...A, x: A.x + ox * 90 * u, y: A.y + oy * 90 * u - 30 * u }, 1 - u);
            continue;
          }
          const [lx, ly] = lens(A.x, A.y);
          drawOrbParticle(ctx, { ...A, x: lx, y: ly });
          continue;
        }
        released++;
        const dur = sphereTravelDur(rel, 1250 + hash(i, 32) * 650);
        const u = easeInOut(clamp01((out - rel) / dur));
        const targetOk = i < homeN;
        const B = orbParticle(p, ts, home.x, home.y, home.R, 1, homeProg);
        if (!B) continue;
        if (u >= 1) {
          arrivedN++;
          if (targetOk) arrived![i] = 1;
          continue; // de acum o desenează bula reală de Acasă, în același loc
        }
        arrived![i] = 0;
        // Traseu curb: fiecare particulă ocolește pe partea ei (două curente care se reunesc), arc lin, fără zigzag.
        const side = (A0.x - cx) * dir.y - (A0.y - cy) * dir.x >= 0 ? 1 : -1;
        const at = (v: number) => {
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const d = Math.hypot(dx, dy) || 1;
          // Curenții ocolesc larg pe lateral (transport prin spațiu), apoi intră în orbita bulei; amplitudinea e fixă pe
          // particulă, deci traseul e un arc neted, fără schimbări de direcție de la un cadru la altul.
          const amp = (95 + 85 * hash(i, 33) + 40 * A.depth) * side;
          const mx = (A.x + B.x) / 2 + (-dy / d) * amp;
          const my = (A.y + B.y) / 2 + (dx / d) * amp;
          const w = 1 - v;
          return [w * w * A.x + 2 * w * v * mx + v * v * B.x, w * w * A.y + 2 * w * v * my + v * v * B.y] as const;
        };
        const mix = (k: number): OrbParticle => {
          const [x, y] = at(k);
          return {
            x,
            y,
            a: A.a + (B.a * (targetOk ? 1 : 0) - A.a) * k,
            c: A.c.map((v, j) => Math.round(v + (B.c[j]! - v) * k)),
            rad: A.rad + (B.rad - A.rad) * k,
            big: A.big,
            depth: A.depth + (B.depth - A.depth) * k,
          };
        };
        // În zbor, particulele sunt puțin mai luminoase, cu o urmă scurtă și estompată (nu ace).
        const q = mix(u);
        q.a = Math.min(1, Math.max(q.a, 0.35) * 1.15);
        const trail = [0.025, 0.05, 0.075].map((d) => mix(Math.max(0, u - d)));
        flight.push({ q, trail });
      }
      for (const f of flight) {
        f.trail.forEach((tq, k) => drawOrbParticle(ctx, { ...tq, a: f.q.a * [0.4, 0.22, 0.1][k]!, rad: f.q.rad * [0.85, 0.7, 0.55][k]!, big: false }));
        drawOrbParticle(ctx, f.q);
      }
      ctx.globalCompositeOperation = 'source-over';
      lastLeft = out == null ? 1 : 1 - released / N;

      // Bula reală de Acasă: același ceas, particulele sosite, volumul din ce a ajuns; fundalul se deschide peste ea.
      if (orbEl && home && arrived) {
        orbLink.active = true;
        orbLink.el = orbEl;
        orbLink.t = ts;
        orbLink.arrived = arrived;
        const frac = arrivedN / N;
        orbLink.body = Math.min(1, frac / 0.95);
        const inner = orbEl.querySelector<HTMLElement>('.orb-in');
        if (inner) inner.style.opacity = sphereContentAlpha(out!).toFixed(3);
        if (base.current) {
          const hole = Math.min(or!.width, or!.height) * 0.5 * (0.3 + 0.7 * easeOut(orbLink.body));
          const m = `radial-gradient(circle at ${Math.round(home.x)}px ${Math.round(home.y)}px, transparent ${Math.round(hole * 0.8)}px, #000 ${Math.round(hole)}px)`;
          base.current.style.webkitMaskImage = m;
          base.current.style.maskImage = m;
        }
      }

      if (out != null && out >= SPHERE_EXIT_MS && !clock && skipAt.current == null) {
        finishRef.current();
        return;
      }
      if (reduce) return; // un singur cadru: sferă statică
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scene = (
    <div ref={wrap} className={`cosmic welcome-sphere ${reduce ? 'still' : ''} ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Mesajul zilei">
      <div ref={base} className="cosmic-base" style={{ background: BASE }} />
      <canvas ref={cv} className="cosmic-cv" aria-hidden="true" />
      <div className="cosmic-box ws-box" ref={box} style={{ opacity: reduce ? 1 : 0 }}>
        <div className="cosmic-k">{kicker}</div>
        <p className="cosmic-t" aria-live="polite">
          {text}
        </p>
        <button ref={goBtn} className={`cosmic-go ws-go ${ready ? 'on' : ''}`} onClick={go} disabled={!ready || leaving} aria-hidden={!ready}>
          Continuă
        </button>
      </div>
      <button className="cosmic-skip" onClick={skip} disabled={leaving && skipAt.current != null}>
        Sari peste
      </button>
    </div>
  );
  return inline ? scene : createPortal(scene, document.body);
}
