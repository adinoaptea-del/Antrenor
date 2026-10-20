import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DISSOLVE_MS,
  EXIT,
  EXIT_MS,
  PHASES,
  REDUCED_MS,
  SKIP_MS,
  BREATH_PERIOD_S,
  clamp01,
  easeInOut,
  easeOut,
  impulse,
  lensPull,
  membranePresence,
  membraneScale,
  openFront,
  releaseAt,
  particleArrival,
  phaseAt,
  sceneOpacity,
  shakeAt,
  span,
  stateAt,
  textAlpha,
  type PhaseName,
} from '@core/motion/teleport.js';

/**
 * Mesajul cosmic: scena de „teleportare” pentru întâmpinare și felicitare (brief vizual v2, 20.10.2026).
 *
 * Straturi (din spate spre față): 1 · Acasă (ascuns și inert până la revealHome) → 2 · ecranul cosmic opac (#071012,
 * tot ecranul, fix) → 3 · câmpul spațial (praf, nebuloase; lentila și shake-ul acționează aici) → 4 · materia
 * (membrană de sticlă, lichid, particule — aceeași simulare de la convergență până la dizolvare) → 5 · text și
 * controale (DOM, stabile, fără refracție peste ele).
 *
 * Intrare ~2,5 s: liniște → convergență pe arce → deformare locală → impuls + un singur shake (~2 px, ~180 ms) →
 * condensare (membrana trece puțin peste echilibru) → mesaj. Mesajul rămâne până la „Continuă”.
 * Ieșire ~2,6 s („03 — Se dizolvă”): textul se stinge → membrana se deschide asimetric → lichidul se întinde în panglici
 * → picături și praf cu inerție → ecou lent. Abia apoi Acasă apare (~0,5 s).
 * „Sari peste” merge în orice fază. „Mișcare redusă”: tranziție simplă de ~180 ms, fără shake, lentilă sau dispersie.
 */

export type CosmicVariant = 'intampinare' | 'reusita';
/** Ceasul scenei: t = ms de la pornire (înghețat la „Continuă”), out = ms de la „Continuă” (null = încă deschis). */
export type CosmicClock = () => { t: number; out: number | null };

const COLS: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];
const BASE = '#071012';
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Bugetul de particule după dispozitiv: dacă scade fluiditatea, scade densitatea, nu se grăbește coregrafia. */
const budget = () => {
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return hc >= 6 ? 1 : hc >= 4 ? 0.75 : 0.5;
};
/** Margine suplimentară a decorului: shake-ul nu descoperă nimic la capetele ecranului. */
const MARGIN = 16;

/** Cardul ședinței (orice element cu data-wid). Păstrat pentru alte ecrane; scena v2 nu mai pornește din el (Acasă e ascuns). */
export const workoutRect = (id: string) => {
  const el = document.querySelector(`[data-wid="${CSS.escape(id)}"]`);
  const r = el?.getBoundingClientRect();
  return r && r.width > 1 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};

export function CosmicMessage({
  variant,
  kicker,
  text,
  seed = 7,
  clock,
  inline = false,
  onRequestContinue,
  onPhase,
  onClose,
}: {
  variant: CosmicVariant;
  kicker: ReactNode;
  text: string;
  seed?: number;
  /** Laboratorul grafic dă propriul ceas (replay, pauză pe faze). */
  clock?: CosmicClock;
  /** În laborator scena stă în pagina laboratorului, nu peste aplicație. */
  inline?: boolean;
  /** În laborator, „Continuă” pornește ieșirea pe ceasul laboratorului. */
  onRequestContinue?: () => void;
  onPhase?: (p: PhaseName) => void;
  onClose: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const goBtn = useRef<HTMLButtonElement>(null);
  const reduce = reducedMotion();
  const [ready, setReady] = useState(reduce);
  const [leaving, setLeaving] = useState(false);
  const t0 = useRef(performance.now());
  const outAt = useRef<number | null>(null);
  const skipAt = useRef<number | null>(null);
  const done = useRef(false);
  const prevFocus = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  const realClock: CosmicClock = () => {
    const now = performance.now();
    return outAt.current == null ? { t: now - t0.current, out: null } : { t: outAt.current - t0.current, out: now - outAt.current };
  };
  const clockRef = useRef<CosmicClock>(clock ?? realClock);
  clockRef.current = clock ?? realClock;

  // Acasă: ascuns și neinteractiv cât ține scena (cititorul de ecran rămâne în scenă), apoi revine.
  const setHomeInert = (on: boolean) => {
    if (inline) return;
    const root = document.getElementById('root');
    if (root) root.inert = on;
  };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    setHomeInert(false);
    document.body.style.overflow = '';
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
      setHomeInert(false);
      if (!inline) document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** „Continuă”: pornește dizolvarea o singură dată (dublu tap nu lansează a doua ieșire). */
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
  /** „Sari peste”: din orice fază, repede și fără resturi la Acasă. */
  const skip = () => {
    if (skipAt.current != null) return;
    skipAt.current = performance.now();
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

  useLayoutEffect(() => {
    if (reduce || !wrap.current) return;
    wrap.current.style.opacity = '1';
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
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
    const oc = document.createElement('canvas');

    let s = seed * 9973 + 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const k = budget();
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const refl = -2.3 + rnd() * 0.5; // reflexia principală, sus-stânga
    const openSide = -0.55 + (rnd() - 0.5) * 0.3; // latura care cedează prima: dreapta-sus (panglicile urcă spre dreapta)
    const flow = { x: Math.cos(openSide), y: Math.sin(openSide) };
    const w0 = (2 * Math.PI) / BREATH_PERIOD_S;

    // Câmpul spațial: praf pe trei adâncimi, cu derivă lentă și independentă; câteva nebuloase difuze.
    const field = Array.from({ length: Math.round(170 * k) }, () => {
      const depth = rnd();
      return { x: rnd(), y: rnd(), r: 0.35 + depth * 1.2, a: 0.06 + depth * 0.22, ang: rnd() * 6.28, sp: 1.5 + depth * 6, wf: 0.05 + rnd() * 0.12, ph: rnd() * 6.28, col: COLS[Math.floor(rnd() * 3)]! };
    });
    const nebulae = Array.from({ length: 3 }, (_, i) => ({ x: 0.2 + rnd() * 0.6, y: 0.15 + rnd() * 0.7, r: 0.35 + rnd() * 0.3, col: COLS[i]!, a: 0.05 + rnd() * 0.03, ph: rnd() * 6.28 }));
    // Particulele materiei: pornesc ca praf din câmp, se adună în nucleu, devin membrană / inel / nor.
    const LAYERS: [number, number, number][] = [
      [110, 0.7, 0.5],
      [52, 1.3, 0.62],
      [16, 2.6, 0.32],
    ];
    const matter = LAYERS.flatMap(([n, r, a], depth) =>
      Array.from({ length: Math.round(n * k) }, () => {
        const kind = rnd();
        return {
          kind: kind < 0.55 ? 'rim' : kind < 0.85 ? 'ring' : 'outer',
          th: rnd() * Math.PI * 2,
          u: 0.15 + rnd() * 0.8,
          inset: rnd() * 10,
          w: (0.02 + rnd() * 0.05) * (rnd() < 0.5 ? -1 : 1),
          r: r * (0.6 + rnd() * 0.8),
          a: a * (0.55 + rnd() * 0.6),
          ph: rnd() * 6.28,
          col: COLS[Math.floor(rnd() * 3)]!,
          depth,
          fx: rnd(),
          fy: rnd(),
          nr: Math.sqrt(rnd()) * 0.32,
          na: rnd() * 6.28,
          delay: rnd(),
          speed: rnd() * (0.5 + depth * 0.25),
          bend: (rnd() - 0.5) * 1.2,
          cdelay: rnd(),
          // ieșirea
          L: 110 + depth * 90 + rnd() * 140,
          dur: 1350 + rnd() * 450,
          echo: rnd() < 0.15,
          jx: rnd() - 0.5,
          jy: rnd() - 0.5,
          zph: rnd() * 6.28,
        };
      }),
    );
    // Materia liberată din lichid și din peretele membranei la ieșire (pozițiile se iau din forma de la „Continuă”).
    const liquidSeeds = Array.from({ length: Math.round(110 * k) }, () => ({ ux: rnd(), uy: rnd(), r: 0.6 + rnd() * 1.6, a: 0.4 + rnd() * 0.5, L: 90 + rnd() * 200, dur: 1300 + rnd() * 500, jx: rnd() - 0.5, jy: rnd() - 0.5, zph: rnd() * 6.28, col: COLS[rnd() < 0.5 ? 0 : 1]!, echo: rnd() < 0.08 }));
    const N = 84;
    const wallSeeds = Array.from({ length: N * 2 }, (_, i) => ({ i: Math.floor(i / 2), inset: (i % 2) * 7 + rnd() * 3, L: 140 + rnd() * 220, dur: 1300 + rnd() * 450, jx: rnd() - 0.5, jy: rnd() - 0.5, zph: rnd() * 6.28, col: COLS[i % 3]!, echo: rnd() < 0.08 }));

    const superR = (th: number, a: number, b: number, n: number) => {
      const cs = Math.abs(Math.cos(th));
      const sn = Math.abs(Math.sin(th));
      return Math.pow(Math.pow(cs / a, n) + Math.pow(sn / b, n), -1 / n);
    };
    // Respirația formei: perioade în jur de 10 s, cu variații independente (organic, nu metronom).
    const wobble = (th: number, lv: number) => 1 + 0.04 * Math.sin(th + ph[0]!) + 0.04 * Math.sin(2 * th + ph[1]! + lv * w0) + 0.026 * Math.sin(3 * th + ph[2]! - lv * w0 * 0.8) + 0.014 * Math.sin(5 * th + ph[3]! + lv * w0 * 1.2);
    const quad = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number, u: number): [number, number] => {
      const v = 1 - u;
      return [v * v * ax + 2 * v * u * cx + u * u * bx, v * v * ay + 2 * v * u * cy + u * u * by];
    };
    const angDist = (a: number, b: number) => {
      let d = Math.abs(a - b) % (Math.PI * 2);
      return d > Math.PI ? Math.PI * 2 - d : d;
    };
    /**
     * Traseul unei bucăți de materie după eliberare: panglică pe arc (direcția se rotește pe parcurs, deci se curbează
     * și se răsucește), cu inerție (încetinește). Vecinii de pe membrană au aceeași curbură și rămân împreună, apoi se
     * rup în picături (jitter care crește spre final).
     */
    const ribbon = (x0: number, y0: number, th: number, tau: number, L: number, jx: number, jy: number, zph: number, depth: number) => {
      const sector = Math.sin(th * 2 + ph[1]!) ;
      const nx = Math.cos(th);
      const ny = Math.sin(th);
      const bx = 0.6 * nx + 0.75 * flow.x + 0.1;
      const by = 0.6 * ny + 0.75 * flow.y - 0.4;
      const phi0 = Math.atan2(by, bx) + sector * 0.35;
      // Curbura: majoritatea se arcuiesc în sus (spre stânga direcției de mers), cu intensități diferite pe sectoare.
      const kap = -(1.1 + 0.9 * (0.5 + 0.5 * Math.sin(th * 3 + ph[2]!))) * (0.85 + depth * 0.2);
      const sArc = L * (1 - Math.pow(1 - tau, 2.2));
      const ang = (kap * sArc) / L;
      const x = x0 + (L / kap) * (Math.sin(phi0 + ang) - Math.sin(phi0));
      const y = y0 - (L / kap) * (Math.cos(phi0 + ang) - Math.cos(phi0));
      const jit = tau * tau * 26;
      const z = Math.sin(tau * 3.4 + sector * 2 + zph * 0.3);
      return { x: x + jx * jit, y: y + jy * jit, z };
    };

    let lastPhase: PhaseName | null = null;
    let raf = 0;
    let readyFired = false;

    const draw = () => {
      const now = performance.now();
      const { t, out } = clockRef.current();
      const live = (t + (out ?? 0)) / 1000;
      const phase = phaseAt(t, out);
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseRef.current?.(phase);
      }
      const st = stateAt(t, out);
      if (!readyFired && st === 'readable') {
        readyFired = true;
        setReady(true);
      }
      // Scena (fundal opac + tot ce e în ea): 100% până la revealHome; apoi Acasă apare. „Sari peste”: 200 ms.
      const skipP = skipAt.current == null ? 0 : clamp01((now - skipAt.current) / SKIP_MS);
      const op = sceneOpacity(out) * (1 - skipP);
      if (wrap.current) {
        wrap.current.style.opacity = op.toFixed(3);
        wrap.current.style.pointerEvents = st === 'revealHome' || skipP > 0 ? 'none' : '';
      }
      if (st === 'revealHome') setHomeInert(false);
      const ta = textAlpha(t, out);
      if (box.current) box.current.style.opacity = ta.toFixed(3);

      const W = (VW + 2 * MARGIN) * dpr;
      const H = (VH + 2 * MARGIN) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const r = box.current?.getBoundingClientRect();
      if (W < 4 || H < 4 || !r) {
        raf = requestAnimationFrame(draw);
        return;
      }
      // Coordonate CSS ale ecranului; decorul are margine și tresare (shake) doar la impuls.
      const sh = out == null ? shakeAt(t) : { x: 0, y: 0 };
      ctx.setTransform(dpr, 0, 0, dpr, (MARGIN + sh.x) * dpr, (MARGIN + sh.y) * dpr);
      const hw = r.width / 2;
      const hh = r.height / 2;
      const cx = r.left + hw;
      const cy = r.top + hh;
      const A = hw + Math.min(46, VW * 0.11);
      const B = hh + Math.min(50, VW * 0.12);
      const R = Math.max(A, B);
      const breathe = out == null ? live : t / 1000;
      const ms = membraneScale(span(t, PHASES.condensare));
      const shellAt = (th: number) => superR(th, A, B, 2.5) * wobble(th, breathe) * ms;
      const innerAt = (th: number) => superR(th, hw * 0.98, hh * 0.98, 4);

      // Lentila (doar stratul decorativ) cu o curgere asimetrică lentă; impulsul împinge moale spre exterior.
      const pull = out == null ? lensPull(t) : 0;
      const imp = out == null ? impulse(t) : null;
      const LR = R * 2.4;
      const ringR = imp == null ? 0 : R * 0.5 + imp * Math.max(VW, VH) * 0.6;
      const lens = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const f = pull * Math.exp(-(d * d) / (LR * LR));
        let k2 = 1 - 0.45 * f;
        if (imp != null) k2 += (24 * Math.exp(-((d - ringR) ** 2) / (50 * 50)) * (1 - imp)) / d;
        const rot = 0.32 * f;
        const ex = dx * k2;
        const ey = dy * k2;
        return [cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)];
      };

      // 3 · Câmpul spațial.
      for (const nb of nebulae) {
        const [nx, ny] = lens((nb.x + 0.03 * Math.sin(live * 0.05 + nb.ph)) * VW, (nb.y + 0.03 * Math.cos(live * 0.04 + nb.ph)) * VH);
        const rr = nb.r * Math.max(VW, VH);
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, rr);
        g.addColorStop(0, `rgba(${nb.col[0]},${nb.col[1]},${nb.col[2]},${nb.a})`);
        g.addColorStop(1, `rgba(${nb.col[0]},${nb.col[1]},${nb.col[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(nx - rr, ny - rr, rr * 2, rr * 2);
      }
      ctx.globalCompositeOperation = 'lighter';
      const calm = span(t, PHASES.liniste);
      const fieldPos = (fx: number, fy: number, ang: number, sp: number, wf: number, fph: number): [number, number] => {
        const a = ang + 0.7 * Math.sin(live * wf + fph);
        const x = (((fx * (VW + 2 * MARGIN) + Math.cos(a) * sp * live) % (VW + 2 * MARGIN)) + (VW + 2 * MARGIN)) % (VW + 2 * MARGIN) - MARGIN;
        const y = (((fy * (VH + 2 * MARGIN) + Math.sin(a) * sp * live) % (VH + 2 * MARGIN)) + (VH + 2 * MARGIN)) % (VH + 2 * MARGIN) - MARGIN;
        return [x, y];
      };
      for (const f of field) {
        let [x, y] = fieldPos(f.x, f.y, f.ang, f.sp, f.wf, f.ph);
        // Chemarea: particulele din jurul nucleului își schimbă lent direcția spre el.
        const d = Math.hypot(x - cx, y - cy);
        const near = Math.exp(-(d * d) / ((LR * 1.2) ** 2));
        const lean = 0.08 * easeInOut(calm) * near * (out == null ? 1 : 0);
        x += (cx - x) * lean;
        y += (cy - y) * lean;
        [x, y] = lens(x, y);
        ctx.fillStyle = `rgba(${f.col[0]},${f.col[1]},${f.col[2]},${f.a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (imp != null) {
        const w = 56;
        const g = ctx.createRadialGradient(cx, cy, Math.max(0, ringR - w), cx, cy, ringR + w);
        g.addColorStop(0, 'rgba(110,236,140,0)');
        g.addColorStop(0.5, `rgba(150,245,170,${(0.08 * (1 - imp)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(70,205,210,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR + w, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lumina nucleului la deformare (fără flash): se adună și se stinge în membrană.
      const core = out == null ? Math.sin(Math.PI * span(t, [PHASES.convergenta[1] - 200, PHASES.condensare[0] + 400])) : 0;
      if (core > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
        g.addColorStop(0, `rgba(222,252,70,${(0.12 * core).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(110,236,140,${(0.07 * core).toFixed(3)})`);
        g.addColorStop(1, 'rgba(70,205,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
      }
      ctx.globalCompositeOperation = 'source-over';

      // 4 · Materia. Membrana: la ieșire rămân doar segmentele încă nedesfăcute (o zonă de sticlă recognoscibilă).
      const proj = (x: number, y: number) => (x - cx) * flow.x + (y - cy) * flow.y;
      const P: { x: number; y: number; th: number; open: number }[] = [];
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const rr = shellAt(th);
        const x = cx + Math.cos(th) * rr;
        const y = cy + Math.sin(th) * rr;
        // Marginea se rupe neregulat: mici decalaje între segmente vecine.
        P.push({ x, y, th, open: releaseAt(proj(x, y), R) + 40 * Math.sin(i * 2.3 + ph[3]!) });
      }
      const pres = membranePresence(t);
      const kept = out == null ? P.map(() => true) : P.map((p) => out < p.open);
      const keptFrac = kept.filter(Boolean).length / N;
      if (pres > 0.01 && keptFrac > 0) {
        // Sticla și lichidul se desenează întregi; la ieșire, un front moale le „deschide” dinspre latura care cedează.
        const region = new Path2D();
        P.forEach((p, i) => (i === 0 ? region.moveTo(p.x, p.y) : region.lineTo(p.x, p.y)));
        region.closePath();
        const target = out == null ? ctx : (oc.getContext('2d') as CanvasRenderingContext2D);
        const main = ctx;
        if (out != null) {
          if (oc.width !== c.width || oc.height !== c.height) {
            oc.width = c.width;
            oc.height = c.height;
          }
          target.setTransform(1, 0, 0, 1, 0, 0);
          target.clearRect(0, 0, oc.width, oc.height);
          target.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
        }
        const ctx2 = target;
        ctx2.save();
        ctx2.globalAlpha = pres;
        const glass = ctx2.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
        glass.addColorStop(0, 'rgba(4,9,10,0.96)');
        glass.addColorStop(0.62, 'rgba(8,16,17,0.9)');
        glass.addColorStop(1, 'rgba(22,38,36,0.8)');
        ctx2.fillStyle = glass;
        ctx2.fill(region);
        ctx2.clip(region);
        // Lichidul: se adună cu inerție și se leagănă amortizat.
        const lu = span(t, [PHASES.condensare[0] + 250, PHASES.mesaj[1] + 500]);
        const level = 0.27 * (lu <= 0 ? 0 : 1 - Math.exp(-4 * lu) * Math.cos(6 * lu));
        const slosh = 0.07 * Math.exp(-3 * lu) * Math.sin(9 * lu);
        const energy = variant === 'reusita' && out == null ? 1 + 1.6 * Math.exp(-Math.max(0, t - 2300) / 900) * (t > 2250 ? 1 : 0) : 1;
        const top = cy - B * ms;
        const hgt = 2 * B * ms;
        const left = cx - A * 1.15;
        const right = cx + A * 1.15;
        const surf = (u: number) => top + hgt * (1 - level) + (u - 0.5) * hgt * slosh + (Math.sin(u * 7 + breathe * w0 * 3) * 2.2 + Math.sin(u * 13 - breathe * w0 * 2) * 1.1) * energy;
        if (level > 0.005) {
          const lq = new Path2D();
          lq.moveTo(left, top + hgt + 30);
          for (let i = 0; i <= 40; i++) lq.lineTo(left + ((right - left) * i) / 40, surf(i / 40));
          lq.lineTo(right, top + hgt + 30);
          lq.closePath();
          const lg = ctx2.createLinearGradient(0, surf(0.5) - 10, 0, top + hgt);
          lg.addColorStop(0, 'rgba(222,252,70,0.2)');
          lg.addColorStop(0.18, 'rgba(110,236,140,0.15)');
          lg.addColorStop(1, 'rgba(70,205,210,0.08)');
          ctx2.fillStyle = lg;
          ctx2.fill(lq);
          ctx2.beginPath();
          for (let i = 0; i <= 40; i++) {
            const x = left + ((right - left) * i) / 40;
            if (i === 0) ctx2.moveTo(x, surf(0));
            else ctx2.lineTo(x, surf(i / 40));
          }
          ctx2.strokeStyle = 'rgba(232,255,140,0.3)';
          ctx2.lineWidth = 1;
          ctx2.stroke();
          if (variant === 'reusita' && out == null) {
            const q = span(t, [2300, 3500]);
            if (q > 0 && q < 1) {
              const x = left + (right - left + 160) * easeInOut(q) - 80;
              const wv = ctx2.createLinearGradient(x - 70, 0, x + 70, 0);
              wv.addColorStop(0, 'rgba(110,236,140,0)');
              wv.addColorStop(0.5, `rgba(222,252,70,${(0.15 * Math.sin(Math.PI * q)).toFixed(3)})`);
              wv.addColorStop(1, 'rgba(70,205,210,0)');
              ctx2.fillStyle = wv;
              ctx2.fillRect(x - 70, top, 140, hgt);
            }
          }
        }
        // Grosimea sticlei: bandă interioară, mai luminoasă spre reflexie.
        const thick = easeOut(span(t, [PHASES.condensare[0] + 300, PHASES.condensare[1]]));
        for (let i = 0; i < N; i++) {
          const lit = 0.04 + 0.16 * Math.pow(Math.max(0, Math.cos(P[i]!.th - refl)), 3) + 0.05 * Math.pow(Math.max(0, Math.cos(P[i]!.th - refl - Math.PI)), 4);
          ctx2.strokeStyle = `rgba(150,240,190,${(lit * thick).toFixed(3)})`;
          ctx2.lineWidth = 14;
          ctx2.beginPath();
          ctx2.moveTo(P[i]!.x, P[i]!.y);
          ctx2.lineTo(P[(i + 1) % N]!.x, P[(i + 1) % N]!.y);
          ctx2.stroke();
        }
        ctx2.restore();
        if (out != null) {
          const b = openFront(out, R);
          const g = ctx2.createLinearGradient(cx + flow.x * (b + 55), cy + flow.y * (b + 55), cx + flow.x * (b - 55), cy + flow.y * (b - 55));
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(0,0,0,1)');
          ctx2.save();
          ctx2.globalCompositeOperation = 'destination-in';
          ctx2.fillStyle = g;
          ctx2.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
          ctx2.restore();
          main.save();
          main.setTransform(1, 0, 0, 1, 0, 0);
          main.drawImage(oc, sh.x * dpr, sh.y * dpr);
          main.restore();
        }
        // Conturul: intensitate inegală, un singur inel subțire; doar segmentele încă întregi.
        const form = easeOut(span(t, [PHASES.condensare[0] + 100, PHASES.condensare[0] + 700]));
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          if (!kept[i] || !kept[j]) continue;
          const th = P[i]!.th;
          // Marginea care e pe cale să cedeze se subțiază și pâlpâie înainte să se rupă.
          const edge = out == null ? 1 : clamp01((P[i]!.open - out) / 120);
          const lit = 0.1 + 0.62 * Math.pow(Math.max(0, Math.cos(th - refl)), 4) + 0.2 * Math.pow(Math.max(0, Math.cos(th - refl - Math.PI)), 6) + 0.1 * (0.5 + 0.5 * Math.sin(3 * th + ph[1]! + breathe * w0));
          const col = COLS[i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0]!;
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(lit * form * pres * edge).toFixed(3)})`;
          ctx.lineWidth = 1.1 + 1.3 * lit;
          ctx.beginPath();
          ctx.moveTo(P[i]!.x, P[i]!.y);
          ctx.lineTo(P[j]!.x, P[j]!.y);
          ctx.stroke();
        }
        const rf = easeOut(span(t, [PHASES.condensare[0] + 400, PHASES.condensare[1] + 100])) * pres;
        const arc = (c0: number, len: number, inset: number, alpha: number, width: number) => {
          ctx.beginPath();
          let started = false;
          for (let j = 0; j <= 16; j++) {
            const th = c0 - len / 2 + (len * j) / 16;
            const rx = cx + Math.cos(th) * shellAt(th);
            const ry = cy + Math.sin(th) * shellAt(th);
            if (out != null && out >= releaseAt(proj(rx, ry), R)) {
              started = false;
              continue;
            }
            const rr = shellAt(th) - inset;
            const x = cx + Math.cos(th) * rr;
            const y = cy + Math.sin(th) * rr;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(240,255,245,${alpha.toFixed(3)})`;
          ctx.lineWidth = width;
          ctx.stroke();
        };
        if (rf > 0.01) {
          arc(refl, 0.55, 6, 0.42 * rf, 2);
          arc(refl + Math.PI, 0.4, 5, 0.1 * rf, 1.2);
        }
        ctx.restore();
      }

      // Particulele materiei.
      ctx.globalCompositeOperation = 'lighter';
      const burst = variant === 'reusita' && out == null ? 1 + 0.22 * Math.sin(Math.PI * span(t, [2250, 3100])) : 1;
      const dot = (x: number, y: number, rad: number, col: [number, number, number], a: number, glow: boolean) => {
        if (a < 0.01) return;
        if (glow) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
          g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(a * 0.55).toFixed(3)})`);
          g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, rad * 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      const streak = (x0: number, y0: number, x1: number, y1: number, w: number, col: [number, number, number], a: number) => {
        if (a < 0.01 || Math.hypot(x1 - x0, y1 - y0) < 0.5) return;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      };
      /** O bucată de materie eliberată: panglică (filament) → picătură → praf; centrul se golește înaintea periferiei. */
      const released = (x0: number, y0: number, th: number, rel: number, L: number, dur: number, rad: number, col: [number, number, number], a0: number, jx: number, jy: number, zph: number, depth: number, echo: boolean) => {
        if (out == null) return false;
        if (out < rel) return false;
        const d2 = echo ? Math.max(dur, DISSOLVE_MS - rel - 20) : Math.min(dur, DISSOLVE_MS - rel - 60);
        const tau = clamp01((out - rel) / d2);
        const p = ribbon(x0, y0, th, tau, L * (echo ? 1.35 : 1), jx, jy, zph, depth);
        const fromC = Math.hypot(p.x - cx, p.y - cy) / (R * 2.6);
        const fStart = echo ? 0.75 : 0.45 + 0.35 * clamp01(fromC);
        const fade = 1 - easeInOut(clamp01((tau - fStart) / (1 - fStart)));
        const a = a0 * Math.min(1, (out - rel) / 90) * fade * (0.75 + 0.25 * p.z);
        const size = rad * (1 + 0.45 * p.z);
        if (tau < 0.4) {
          // Filament: o bucată scurtă din arcul propriu (curbă, nu segment drept), mai subțire spre coadă.
          const Ls = L * (echo ? 1.35 : 1);
          const pts = [0.11, 0.075, 0.04, 0].map((d) => ribbon(x0, y0, th, Math.max(0, tau - d), Ls, jx, jy, zph, depth));
          for (let i = 1; i < pts.length; i++) {
            const w = Math.max(0.6, size * (0.5 + 0.35 * i));
            ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(a * 0.75 * (i / (pts.length - 1))).toFixed(3)})`;
            ctx.lineWidth = w;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
            ctx.lineTo(pts[i]!.x, pts[i]!.y);
            ctx.stroke();
          }
        } else if (tau < 0.72) dot(p.x, p.y, size * (1.2 - (tau - 0.4)), col, a, size > 1.6);
        else dot(p.x, p.y, Math.max(0.45, size * 0.5), col, a * 0.8, false);
        return true;
      };
      for (const q of matter) {
        // Poziția în formă (repaus): pe membrană, în inel sau în norul din jur.
        const slot = (lv: number): [number, number] => {
          const th = q.th + (q.kind === 'rim' ? q.w * 0.25 : q.w) * lv;
          const rs = superR(th, A, B, 2.5) * wobble(th, lv) * Math.max(0.6, ms);
          let rr: number;
          if (q.kind === 'rim') rr = rs - q.inset;
          else if (q.kind === 'ring') {
            const ri = innerAt(th);
            rr = ri + (rs - ri) * (q.u + 0.05 * Math.sin(lv * 0.8 + q.ph)) * burst;
          } else rr = rs + (8 + q.u * 60) * burst;
          return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr];
        };
        const [sx0, sy0] = slot(breathe);
        const thNow = Math.atan2(sy0 - cy, sx0 - cx);
        if (out != null) {
          const rel = releaseAt(proj(sx0, sy0), R) + (q.kind === 'rim' ? 0 : 60 + q.cdelay * 80);
          if (released(sx0, sy0, thNow, rel, q.L, q.dur, q.r, q.col, q.a, q.jx, q.jy, q.zph, q.depth, q.echo)) continue;
          dot(sx0, sy0, q.r, q.col, q.a * (0.7 + 0.3 * Math.sin(live * 0.9 + q.ph)), q.depth === 2);
          continue;
        }
        // Intrarea: praf în câmp → arc spre nucleu → membrana / inelul / norul.
        const [fx, fy] = fieldPos(q.fx, q.fy, q.na, 3 + q.depth * 4, 0.08, q.ph);
        const nxp = cx + Math.cos(q.na) * q.nr * R;
        const nyp = cy + Math.sin(q.na) * q.nr * R * 0.8;
        const arr = particleArrival(t, q.delay, q.speed);
        const cond = easeInOut(span(t, [PHASES.condensare[0] + q.cdelay * 250, PHASES.condensare[1] - 150 + q.cdelay * 100]));
        let x: number;
        let y: number;
        let tail: [number, number] | null = null;
        let a = q.a;
        if (cond > 0) {
          [x, y] = [nxp + (sx0 - nxp) * cond, nyp + (sy0 - nyp) * cond];
        } else if (arr > 0) {
          const mx = (fx + nxp) / 2 - (nyp - fy) * q.bend;
          const my = (fy + nyp) / 2 + (nxp - fx) * q.bend;
          [x, y] = quad(fx, fy, mx, my, nxp, nyp, arr);
          if (arr < 1) tail = quad(fx, fy, mx, my, nxp, nyp, Math.max(0, arr - 0.12));
          a = Math.min(0.95, a * (0.6 + 0.9 * arr) * (arr < 1 ? 1.4 : 1));
          // Nucleul respiră ușor până la condensare.
          if (arr >= 1) {
            x += Math.sin(live * 1.3 + q.ph) * 3;
            y += Math.cos(live * 1.1 + q.ph) * 3;
          }
        } else {
          // Încă praf în câmp (aceeași particulă, aceeași poziție: continuitate).
          [x, y] = [fx, fy];
          a = q.a * 0.5;
        }
        [x, y] = lens(x, y);
        if (tail) {
          const [tx, ty] = lens(tail[0], tail[1]);
          streak(tx, ty, x, y, q.r, q.col, a * 0.8);
        }
        dot(x, y, q.r, q.col, a * (0.7 + 0.3 * Math.sin(live * 0.9 + q.ph)), q.depth === 2);
      }
      // Lichidul și peretele membranei se transformă și ele în panglici, picături și praf.
      if (out != null) {
        const lu = 1;
        const level = 0.27 * lu;
        for (const sd of liquidSeeds) {
          const x0 = cx + (sd.ux - 0.5) * 2 * A * 0.92;
          const top = cy + B * (1 - 2 * level);
          const y0 = top + sd.uy * (cy + B - top) * 0.85;
          const th = Math.atan2(y0 - cy, x0 - cx);
          if (Math.hypot(x0 - cx, y0 - cy) > shellAt(th) - 4) continue;
          const rel = releaseAt(proj(x0, y0), R) + 90;
          if (!released(x0, y0, th, rel, sd.L, sd.dur, sd.r, sd.col, sd.a, sd.jx, sd.jy, sd.zph, 1, sd.echo)) continue;
        }
        for (const sd of wallSeeds) {
          const p = P[sd.i]!;
          const x0 = cx + Math.cos(p.th) * (Math.hypot(p.x - cx, p.y - cy) - sd.inset);
          const y0 = cy + Math.sin(p.th) * (Math.hypot(p.x - cx, p.y - cy) - sd.inset);
          released(x0, y0, p.th, p.open, sd.L, sd.dur, 1.1, sd.col, 0.75, sd.jx, sd.jy, sd.zph, 1, sd.echo);
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      if (skipAt.current == null && out != null && out >= EXIT_MS && !clock) {
        finishRef.current();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
    // Scena pornește o singură dată pe mesaj.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = variant === 'reusita' ? 'Antrenament finalizat' : 'Mesajul zilei';
  const scene = (
    <div ref={wrap} className={`cosmic cosmic-${variant} ${reduce ? 'still' : ''} ${leaving ? 'leaving' : ''} ${inline ? 'inline' : ''}`} role="dialog" aria-modal="true" aria-label={label} style={{ background: BASE }}>
      {!reduce && <canvas ref={cv} className="cosmic-cv" aria-hidden="true" />}
      <div className={`cosmic-box ${reduce ? 'glass' : ''}`} ref={box} style={{ opacity: reduce ? undefined : 0 }}>
        <div className="cosmic-k">{kicker}</div>
        {variant === 'reusita' && (
          <svg className="cosmic-ok" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10.5" />
            <path d="M7.5 12.3l3 3 6-6.2" />
          </svg>
        )}
        <p className="cosmic-t" aria-live="polite">
          {text}
        </p>
        <button ref={goBtn} className={`cosmic-go ${ready ? 'on' : ''}`} onClick={go} disabled={!ready || leaving} aria-hidden={!ready}>
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
