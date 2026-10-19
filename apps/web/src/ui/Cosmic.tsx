import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DISSOLVE_MS,
  PHASES,
  clamp01,
  easeIn,
  easeInOut,
  easeOut,
  homeLight,
  impulse,
  lensPull,
  membraneScale,
  particleArrival,
  phaseAt,
  shellPresence,
  span,
  textAlpha,
  type PhaseName,
} from '@core/motion/teleport.js';

/**
 * Mesajul cosmic: scena de „teleportare” comună pentru întâmpinare și felicitare (auditul grafic din 20.10.2026).
 *
 * Mesajul se naște din materia aplicației și se întoarce în ea, într-o singură transformare continuă:
 *  1. chemare: o zonă a fundalului începe să atragă particulele; bula de Acasă își cedează lumina;
 *  2. convergență: particulele vin pe traiectorii curbe, din direcții și adâncimi diferite, cu întârzieri proprii
 *     (din cardul ședinței la felicitare, din bula de Acasă și din câmp la întâmpinare);
 *  3. curbare + impuls: textura decorativă e trasă spre nucleu ca printr-o lentilă, apoi un singur val moale spre
 *     exterior (deformare și lumină locală, fără flash);
 *  4. materializare: energia se condensează într-o membrană care capătă grosime și reflexii, lichidul se adună cu
 *     inerție, forma trece puțin peste echilibru și se calmează;
 *  5. mesaj: textul (DOM, stabil, fără efecte peste litere) apare după stabilizare;
 *  6. repaus: respirație lentă, particule în derivă, lichid discret;
 *  7. reintegrare (~650 ms): textul dispare primul, membrana se desface în particule care se întorc pe curbe în bula
 *     de Acasă, iar bula își recapătă lumina.
 * Doar stratul decorativ se deformează: textul, butoanele și zonele de atingere nu. Închiderea merge în orice fază.
 * „Mișcare redusă”: estompare scurtă, fără atracție, lentilă sau impuls. Fără sunet.
 */

export type CosmicVariant = 'intampinare' | 'reusita';
type Rect = { x: number; y: number; w: number; h: number };
/** Ceasul scenei: t = ms de la pornire (înghețat la închidere), out = ms de la închidere (null = deschis). */
export type CosmicClock = () => { t: number; out: number | null };

const COLS: [number, number, number][] = [
  [70, 205, 210],
  [110, 236, 140],
  [222, 252, 70],
];
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Timpul de citire după lungime (~4 cuvinte pe secundă plus așezare). Folosit la întâmpinare, care se închide singură. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(3500, 2200 + words * 280));
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const homeOrbEl = () => document.querySelector<HTMLElement>('.azi .orb');
/** Bula de pe Acasă, dacă se vede: centrul vizual al scenei și locul unde se întoarce lumina. */
export const homeOrbRect = () => rectOf(homeOrbEl());
/** Cardul ședinței (orice element cu data-wid), cel mai de sus vizibil: de acolo pornește felicitarea. */
export const workoutRect = (id: string) => {
  const els = Array.from(document.querySelectorAll(`[data-wid="${CSS.escape(id)}"]`));
  for (let i = els.length - 1; i >= 0; i--) {
    const r = rectOf(els[i]!);
    if (r) return r;
  }
  return null;
};

/** Bugetul de particule după dispozitiv: mai puține pe telefoane cu puține nuclee. */
const budget = () => {
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return hc >= 6 ? 1 : hc >= 4 ? 0.75 : 0.5;
};

export function CosmicMessage({
  variant,
  kicker,
  text,
  hint = 'atinge ca să închizi',
  origin,
  anchor = homeOrbRect,
  seed = 7,
  clock,
  onRequestClose,
  onPhase,
  onClose,
}: {
  variant: CosmicVariant;
  kicker: ReactNode;
  text: string;
  hint?: string;
  /** De unde pornesc particulele (cardul ședinței); null = din bula de Acasă și din câmp. */
  origin?: () => Rect | null;
  /** Bula de Acasă: centrul scenei și ținta reintegrării; null = centrul ecranului, lumina se pierde în fundal. */
  anchor?: () => Rect | null;
  seed?: number;
  /** Laboratorul grafic dă propriul ceas (replay, pauză pe faze); altfel ceasul e cel real. */
  clock?: CosmicClock;
  /** În laborator, atingerea cere închiderea (laboratorul pornește reintegrarea pe ceasul lui). */
  onRequestClose?: () => void;
  onPhase?: (p: PhaseName) => void;
  onClose: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const reduce = reducedMotion();
  const [out, setOut] = useState(false);
  const t0 = useRef(performance.now());
  const outAt = useRef<number | null>(null);
  const done = useRef(false);
  const prevFocus = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
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

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const el = prevFocus.current as HTMLElement | null;
    if (el && document.contains(el) && typeof el.focus === 'function') el.focus({ preventScroll: true });
    onCloseRef.current();
  };
  const close = () => {
    if (onRequestClose) return onRequestClose();
    if (outAt.current != null) return;
    outAt.current = performance.now();
    setOut(true);
    if (reduce) window.setTimeout(finish, 260);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Locul scenei: centrul bulei de Acasă (un singur obiect dominant), altfel centrul ecranului; păstrat în ecran.
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = anchor?.() ?? null;
    const b = box.current?.getBoundingClientRect();
    const bh = b?.height ?? 140;
    const below = variant === 'reusita' ? 130 : 60;
    let x = a ? a.x + a.w / 2 : vw / 2;
    let y = a ? a.y + a.h / 2 : vh * 0.44;
    const mx = Math.min(170, vw / 2);
    x = Math.min(Math.max(x, mx), vw - mx) || vw / 2;
    y = Math.min(Math.max(y, bh / 2 + 80), vh - bh / 2 - below);
    setPos({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Întâmpinarea se închide singură după ce textul a fost vizibil cât să fie citit; timpul stă cât aplicația e în fundal.
  useEffect(() => {
    if (clock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    if (variant !== 'intampinare') return () => window.removeEventListener('keydown', onKey);
    let left = PHASES.mesaj[1] + readingMs(text);
    let start = performance.now();
    let tm = 0;
    const arm = () => {
      window.clearTimeout(tm);
      start = performance.now();
      tm = window.setTimeout(() => closeRef.current(), Math.max(0, left));
    };
    const onVis = () => {
      if (document.hidden) {
        window.clearTimeout(tm);
        left -= performance.now() - start;
      } else arm();
    };
    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(tm);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey);
    };
  }, [variant, text, clock]);

  useEffect(() => {
    if (reduce || !pos) return;
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = 0;
    let VH = 0;
    const fit = () => {
      VW = window.innerWidth;
      VH = window.innerHeight;
      c.width = Math.max(1, Math.round(VW * dpr));
      c.height = Math.max(1, Math.round(VH * dpr));
    };
    fit();
    window.addEventListener('resize', fit);

    let s = seed * 9973 + 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const k = budget();
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const refl = -2.3 + rnd() * 0.5; // unghiul reflexiei principale (sus-stânga, ușor diferit la fiecare mesaj)
    const orbEl = homeOrbEl();
    const anc = anchor?.() ?? null;
    const org = origin?.() ?? null;
    const home = anc ? { x: anc.x + anc.w / 2, y: anc.y + anc.h / 2, r: Math.min(anc.w, anc.h) * 0.36 } : null;
    // Câmpul: praful deja prezent pe ecran (textura decorativă pe care o curbează lentila).
    const field = Array.from({ length: Math.round(120 * k) }, () => ({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.1, a: 0.08 + rnd() * 0.22, ph: rnd() * 6.28, col: COLS[Math.floor(rnd() * 3)]! }));
    // Particulele mesajului: pornesc din card / bulă / câmp și ajung în inelul din jurul textului.
    const LAYERS: [number, number, number][] = [
      [96, 0.7, 0.45],
      [44, 1.3, 0.6],
      [14, 2.8, 0.3],
    ];
    const pts = LAYERS.flatMap(([n, r, a], depth) =>
      Array.from({ length: Math.round(n * k) }, () => {
        const from = org ? 'card' : home && rnd() < 0.55 ? 'home' : 'field';
        const ang = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd());
        return {
          th: rnd() * Math.PI * 2,
          u: rnd() < 0.3 ? 1.08 + rnd() * 0.6 : 0.18 + rnd() * 0.78,
          w: (0.04 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1) * (1 + depth * 0.4),
          r: r * (0.6 + rnd() * 0.8),
          a: a * (0.5 + rnd() * 0.6),
          ph: rnd() * 6.28,
          col: COLS[Math.floor(rnd() * 3)]!,
          depth,
          delay: rnd(),
          speed: rnd() * (0.5 + depth * 0.25),
          bend: (rnd() - 0.5) * 1.1,
          bendOut: (rnd() - 0.5) * 1.2,
          lagOut: rnd() * 0.35,
          sx: from === 'card' && org ? org.x + rnd() * org.w : from === 'home' && home ? home.x + Math.cos(ang) * home.r * rr : rnd() * 1e9,
          sy: from === 'card' && org ? org.y + rnd() * org.h : from === 'home' && home ? home.y + Math.sin(ang) * home.r * rr : rnd() * 1e9,
          field: from === 'field',
          fx: rnd(),
          fy: rnd(),
          tx: rnd(),
          ty: rnd(),
        };
      }),
    );

    const superR = (th: number, a: number, b: number, n: number) => {
      const cs = Math.abs(Math.cos(th));
      const sn = Math.abs(Math.sin(th));
      return Math.pow(Math.pow(cs / a, n) + Math.pow(sn / b, n), -1 / n);
    };
    // Respirație lentă a formei (asimetrie fixă + mișcare); la ieșire forma nu se mai mișcă.
    const wobble = (th: number, live: number) => 1 + 0.04 * Math.sin(th + ph[0]!) + 0.045 * Math.sin(2 * th + ph[1]! + live * 0.23) + 0.03 * Math.sin(3 * th + ph[2]! - live * 0.17) + 0.015 * Math.sin(5 * th + ph[3]! + live * 0.31);
    const N = 84;
    const quad = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number, u: number): [number, number] => {
      const v = 1 - u;
      return [v * v * ax + 2 * v * u * cx + u * u * bx, v * v * ay + 2 * v * u * cy + u * u * by];
    };
    let lastPhase: PhaseName | null = null;
    let raf = 0;

    const draw = () => {
      const { t, out } = clockRef.current();
      const live = (t + (out ?? 0)) / 1000;
      const phase = phaseAt(t, out);
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseRef.current?.(phase);
      }
      const W = VW * dpr;
      const H = VH * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Textul (DOM) urmează același ceas: apare după stabilizare, dispare primul.
      const ta = textAlpha(t, out);
      if (box.current) box.current.style.opacity = ta.toFixed(3);
      if (go.current) go.current.style.opacity = ta.toFixed(3);
      if (orbEl) {
        const hl = homeLight(t, out);
        orbEl.style.opacity = hl.toFixed(3);
        orbEl.style.filter = hl < 0.99 ? `saturate(${(0.5 + 0.5 * hl).toFixed(2)})` : '';
      }
      const r = box.current?.getBoundingClientRect();
      if (W < 4 || H < 4 || !r) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const hw = r.width / 2;
      const hh = r.height / 2;
      const cx = r.left + hw;
      const cy = r.top + hh;
      // Peretele: margini proporționale cu ecranul (pe telefoane înguste sau cu text mărit nu iese din ecran).
      const A = hw + Math.min(46, VW * 0.11);
      const B = hh + Math.min(50, VW * 0.12);
      const R = Math.max(A, B);
      const tin = t;
      const breathe = out == null ? live : t / 1000;
      const ms = membraneScale(span(tin, PHASES.materializare));
      const pres = shellPresence(tin, out);
      const shellAt = (th: number) => superR(th, A, B, 2.5) * wobble(th, breathe) * ms;
      const innerAt = (th: number) => superR(th, hw * 0.98, hh * 0.98, 4);
      const env = easeOut(span(tin, [0, 420])) * (out == null ? 1 : 1 - easeInOut(clamp01(out / DISSOLVE_MS)));

      // Scena din spate pierde puțin din energie: mai întunecat lângă nucleu, ușor peste tot.
      const dim = ctx.createRadialGradient(cx * dpr, cy * dpr, R * 0.3 * dpr, cx * dpr, cy * dpr, Math.max(VW, VH) * dpr);
      const base = variant === 'reusita' ? 0.42 : 0.3;
      dim.addColorStop(0, `rgba(3,7,7,${(base + 0.25) * env})`);
      dim.addColorStop(1, `rgba(3,7,7,${base * env})`);
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, W, H);

      // Lentila și impulsul (doar pe stratul decorativ): textura e trasă spre nucleu, apoi împinsă de o undă moale.
      const pull = out == null ? lensPull(tin) : 0;
      const imp = out == null ? impulse(tin) : null;
      const L = R * 2.2;
      const ringR = imp == null ? 0 : R * 0.6 + imp * Math.max(VW, VH) * 0.55;
      const lens = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        let f = 1 - 0.42 * pull * Math.exp(-(d * d) / (L * L));
        if (imp != null) f += (26 * Math.exp(-((d - ringR) ** 2) / (40 * 40)) * (1 - imp)) / d;
        return [cx + dx * f, cy + dy * f];
      };
      ctx.globalCompositeOperation = 'lighter';
      const attract = easeOut(span(tin, PHASES.chemare));
      for (const f of field) {
        const fx = f.x * VW + Math.sin(live * 0.2 + f.ph) * 4;
        const fy = f.y * VH + Math.cos(live * 0.17 + f.ph) * 4;
        const d = Math.hypot(fx - cx, fy - cy);
        // Chemarea: praful din jurul nucleului se aprinde și începe să alunece spre el.
        const near = Math.exp(-(d * d) / ((L * 1.4) ** 2));
        const drift = 0.12 * attract * near * (out == null ? 1 : 1 - clamp01(out / DISSOLVE_MS));
        const [lx, ly] = lens(fx + (cx - fx) * drift, fy + (cy - fy) * drift);
        const a = f.a * (0.4 + 0.6 * env) * (1 + 1.2 * near * attract);
        ctx.fillStyle = `rgba(${f.col[0]},${f.col[1]},${f.col[2]},${Math.min(0.6, a).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(lx * dpr, ly * dpr, f.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lumina locală a curbării (fără flash): un nucleu verde-lime care se adună și se stinge în membrană.
      const core = Math.sin(Math.PI * span(tin, [PHASES.convergenta[0] + 80, PHASES.materializare[0] + 200])) * (out == null ? 1 : 0);
      if (core > 0.01) {
        const g = ctx.createRadialGradient(cx * dpr, cy * dpr, 0, cx * dpr, cy * dpr, R * 1.1 * dpr);
        g.addColorStop(0, `rgba(222,252,70,${(0.16 * core).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(110,236,140,${(0.1 * core).toFixed(3)})`);
        g.addColorStop(1, 'rgba(70,205,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect((cx - R * 1.2) * dpr, (cy - R * 1.2) * dpr, R * 2.4 * dpr, R * 2.4 * dpr);
      }
      if (imp != null) {
        // Unda: o bandă difuză (gradient radial), nu un inel desenat.
        const w = 46;
        const g = ctx.createRadialGradient(cx * dpr, cy * dpr, Math.max(0, ringR - w) * dpr, cx * dpr, cy * dpr, (ringR + w) * dpr);
        const a = 0.09 * (1 - imp);
        g.addColorStop(0, 'rgba(110,236,140,0)');
        g.addColorStop(0.5, `rgba(150,245,170,${a.toFixed(3)})`);
        g.addColorStop(1, 'rgba(70,205,210,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx * dpr, cy * dpr, (ringR + w) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Membrana: sticlă fumurie cu grosime, reflexii asimetrice și contur cu intensitate variabilă.
      const P: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const rr = shellAt(th);
        P.push([(cx + Math.cos(th) * rr) * dpr, (cy + Math.sin(th) * rr) * dpr]);
      }
      const path = new Path2D();
      const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
      const m0 = mid(P[N - 1]!, P[0]!);
      path.moveTo(m0[0], m0[1]);
      for (let i = 0; i < N; i++) {
        const m = mid(P[i]!, P[(i + 1) % N]!);
        path.quadraticCurveTo(P[i]![0], P[i]![1], m[0], m[1]);
      }
      path.closePath();
      if (pres > 0.01) {
        const X = cx * dpr;
        const Y = cy * dpr;
        ctx.save();
        ctx.globalAlpha = pres;
        const glass = ctx.createRadialGradient(X, Y, 0, X, Y, R * 1.05 * dpr);
        glass.addColorStop(0, 'rgba(5,9,9,0.95)');
        glass.addColorStop(0.62, 'rgba(8,15,15,0.9)');
        glass.addColorStop(1, 'rgba(20,34,32,0.8)');
        ctx.fillStyle = glass;
        ctx.fill(path);
        ctx.clip(path);
        // Lichidul: o masă care se adună cu inerție (urcă, trece puțin, se așază) și se leagănă amortizat.
        const lu = span(tin, [PHASES.materializare[0] + 80, PHASES.mesaj[1] + 300]);
        const level = 0.27 * (lu <= 0 ? 0 : 1 - Math.exp(-4 * lu) * Math.cos(6 * lu));
        const slosh = 0.07 * Math.exp(-3 * lu) * Math.sin(9 * lu);
        const energy = variant === 'reusita' ? 1 + 2 * Math.exp(-Math.max(0, tin - 1000) / 600) * (tin > 950 ? 1 : 0) : 1;
        const top = (cy - B * ms) * dpr;
        const hgt = 2 * B * ms * dpr;
        const left = (cx - A * 1.15) * dpr;
        const right = (cx + A * 1.15) * dpr;
        const surf = (u: number) => top + hgt * (1 - level) + (u - 0.5) * hgt * slosh + (Math.sin(u * 7 + breathe * 0.6) * 2.2 + Math.sin(u * 13 - breathe * 0.41) * 1.1) * energy * dpr;
        if (level > 0.005) {
          const lq = new Path2D();
          lq.moveTo(left, top + hgt + 30 * dpr);
          const M = 40;
          for (let i = 0; i <= M; i++) lq.lineTo(left + ((right - left) * i) / M, surf(i / M));
          lq.lineTo(right, top + hgt + 30 * dpr);
          lq.closePath();
          const lg = ctx.createLinearGradient(0, surf(0.5) - 10 * dpr, 0, top + hgt);
          lg.addColorStop(0, 'rgba(222,252,70,0.2)');
          lg.addColorStop(0.18, 'rgba(110,236,140,0.15)');
          lg.addColorStop(1, 'rgba(70,205,210,0.08)');
          ctx.fillStyle = lg;
          ctx.fill(lq);
          ctx.beginPath();
          for (let i = 0; i <= 40; i++) {
            const x = left + ((right - left) * i) / 40;
            if (i === 0) ctx.moveTo(x, surf(0));
            else ctx.lineTo(x, surf(i / 40));
          }
          ctx.strokeStyle = 'rgba(232,255,140,0.3)';
          ctx.lineWidth = dpr;
          ctx.stroke();
          // Valul de lumină al reușitei: o bandă moale traversează lichidul o dată (alfa mic, margini difuze).
          if (variant === 'reusita' && out == null) {
            const q = span(tin, [950, 2000]);
            if (q > 0 && q < 1) {
              const x = left + (right - left + 160 * dpr) * easeInOut(q) - 80 * dpr;
              const wv = ctx.createLinearGradient(x - 70 * dpr, 0, x + 70 * dpr, 0);
              wv.addColorStop(0, 'rgba(110,236,140,0)');
              wv.addColorStop(0.5, `rgba(222,252,70,${(0.16 * Math.sin(Math.PI * q)).toFixed(3)})`);
              wv.addColorStop(1, 'rgba(70,205,210,0)');
              ctx.fillStyle = wv;
              ctx.fillRect(x - 70 * dpr, top, 140 * dpr, hgt);
            }
          }
        }
        // Grosimea sticlei: o bandă interioară, mai luminoasă pe partea reflexiei, aproape stinsă în rest.
        const thick = easeOut(span(tin, [PHASES.materializare[0] + 120, PHASES.materializare[1]]));
        if (thick > 0.01) {
          for (let i = 0; i < N; i++) {
            const th = (i / N) * Math.PI * 2;
            const lit = 0.04 + 0.16 * Math.pow(Math.max(0, Math.cos(th - refl)), 3) + 0.05 * Math.pow(Math.max(0, Math.cos(th - refl - Math.PI)), 4);
            const a = P[i]!;
            const b = P[(i + 1) % N]!;
            ctx.strokeStyle = `rgba(150,240,190,${(lit * thick).toFixed(3)})`;
            ctx.lineWidth = 14 * dpr;
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
          }
        }
        ctx.restore();
        // Conturul: intensitate discontinuă (luminos lângă reflexie, slab în rest), un singur inel subțire.
        const form = easeOut(span(tin, [PHASES.materializare[0], PHASES.materializare[0] + 260]));
        ctx.save();
        ctx.lineCap = 'round';
        const brk = out == null ? 0 : clamp01((out - 100) / 380);
        for (let i = 0; i < N; i++) {
          const th = (i / N) * Math.PI * 2;
          // La reintegrare, conturul se rupe în bucăți înainte să dispară.
          if (brk > 0 && Math.sin(i * 2.7 + ph[0]!) < brk * 2 - 1) continue;
          const lit = 0.1 + 0.62 * Math.pow(Math.max(0, Math.cos(th - refl)), 4) + 0.2 * Math.pow(Math.max(0, Math.cos(th - refl - Math.PI)), 6) + 0.1 * (0.5 + 0.5 * Math.sin(3 * th + ph[1]! + breathe * 0.4));
          const col = COLS[i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0]!;
          const a = P[i]!;
          const b = P[(i + 1) % N]!;
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(lit * form * pres).toFixed(3)})`;
          ctx.lineWidth = (1.1 + 1.3 * lit) * dpr;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
        // Reflexia principală, îngustă, pe o parte; una secundară, slabă, pe partea opusă.
        const rf = easeOut(span(tin, [PHASES.materializare[0] + 180, PHASES.materializare[1] + 80])) * pres;
        const arc = (c0: number, len: number, inset: number, alpha: number, width: number) => {
          ctx.beginPath();
          const n = 16;
          for (let j = 0; j <= n; j++) {
            const th = c0 - len / 2 + (len * j) / n;
            const rr = shellAt(th) - inset;
            const x = (cx + Math.cos(th) * rr) * dpr;
            const y = (cy + Math.sin(th) * rr) * dpr;
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(240,255,245,${alpha.toFixed(3)})`;
          ctx.lineWidth = width * dpr;
          ctx.stroke();
        };
        if (rf > 0.01) {
          arc(refl, 0.55, 6, 0.42 * rf, 2);
          arc(refl + Math.PI, 0.4, 5, 0.1 * rf, 1.2);
        }
        ctx.restore();
      }

      // Particulele mesajului: convergență pe curbe, inel în repaus, întoarcere pe curbe în bula de Acasă.
      ctx.globalCompositeOperation = 'lighter';
      const burst = variant === 'reusita' && out == null ? 1 + 0.28 * Math.sin(Math.PI * span(tin, [950, 1650])) : 1;
      const backTo = home && out != null ? home : null;
      for (const q of pts) {
        const ringAt = (lv: number): [number, number] => {
          const th = q.th + q.w * lv;
          const ri = innerAt(th);
          const rs = superR(th, A, B, 2.5) * wobble(th, lv) * Math.max(0.7, ms);
          const u = (q.u + 0.05 * Math.sin(lv * 0.8 + q.ph)) * burst;
          const rr = q.u > 1 ? rs + (u - 1) * 80 : ri + (rs - ri) * u;
          return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr];
        };
        const sx = q.field ? q.fx * VW : q.sx;
        const sy = q.field ? q.fy * VH : q.sy;
        const arr = particleArrival(tin, q.delay, q.speed);
        let [x, y] = ringAt(breathe);
        let a = q.a * (0.65 + 0.35 * Math.sin(live * 0.9 + q.ph));
        let tail = 0;
        let px = x;
        let py = y;
        if (arr < 1) {
          // Traseu curb: punctul de control e deplasat lateral, diferit la fiecare particulă.
          const mx = (sx + x) / 2 - (y - sy) * q.bend;
          const my = (sy + y) / 2 + (x - sx) * q.bend;
          [x, y] = quad(sx, sy, mx, my, x, y, arr);
          [px, py] = quad(sx, sy, mx, my, ringAt(breathe)[0], ringAt(breathe)[1], Math.max(0, arr - 0.16));
          [x, y] = lens(x, y);
          // În drum: mai vizibile (cauza apariției trebuie să se vadă), cu dâră.
          a = Math.min(0.95, a * ((q.field ? 0.35 : 0.6) + 0.9 * Math.max(attract * 0.5, arr)) * (arr > 0 ? 1.5 : 1));
          tail = arr > 0 && arr < 1 ? 1 : 0;
        }
        if (out != null) {
          const u = easeInOut(clamp01((out - 120 - q.lagOut * 200) / (DISSOLVE_MS - 120 - q.lagOut * 200)));
          if (backTo) {
            const tx = backTo.x + (q.tx - 0.5) * backTo.r * 1.4;
            const ty = backTo.y + (q.ty - 0.5) * backTo.r * 1.4;
            const mx = (x + tx) / 2 - (ty - y) * q.bendOut;
            const my = (y + ty) / 2 + (tx - x) * q.bendOut;
            const u2 = Math.max(0, u - 0.06);
            [px, py] = quad(x, y, mx, my, tx, ty, u2);
            [x, y] = quad(x, y, mx, my, tx, ty, u);
            tail = u > 0 && u < 1 ? 1 : 0;
            a *= 1 - 0.6 * easeIn(u);
          } else {
            const th = Math.atan2(y - cy, x - cx);
            x += Math.cos(th) * 50 * u;
            y += Math.sin(th) * 50 * u - 20 * u;
            a *= 1 - u;
          }
        }
        if (a < 0.01) continue;
        const [r0, g0, b0] = q.col;
        const X = x * dpr;
        const Y = y * dpr;
        if (tail && Math.hypot(x - px, y - py) > 1) {
          const tg = ctx.createLinearGradient(px * dpr, py * dpr, X, Y);
          tg.addColorStop(0, `rgba(${r0},${g0},${b0},0)`);
          tg.addColorStop(1, `rgba(${r0},${g0},${b0},${(a * 0.8).toFixed(3)})`);
          ctx.strokeStyle = tg;
          ctx.lineWidth = q.r * dpr;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px * dpr, py * dpr);
          ctx.lineTo(X, Y);
          ctx.stroke();
        }
        if (q.depth === 2) {
          const bg = ctx.createRadialGradient(X, Y, 0, X, Y, q.r * 2.4 * dpr);
          bg.addColorStop(0, `rgba(${r0},${g0},${b0},${(a * 0.5).toFixed(3)})`);
          bg.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(X, Y, q.r * 2.4 * dpr, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${r0},${g0},${b0},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(X, Y, q.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Fragmentele membranei, la reintegrare: din contur, pe curbe, spre bulă (sau se sting în fundal).
      if (out != null && out > 100) {
        const u = easeInOut(clamp01((out - 100) / (DISSOLVE_MS - 100)));
        for (let i = 0; i < N; i += 2) {
          const p0 = P[i]!;
          const x0 = p0[0] / dpr;
          const y0 = p0[1] / dpr;
          const col = COLS[i % 3]!;
          let x: number;
          let y: number;
          if (backTo) {
            const tx = backTo.x + Math.cos(i) * backTo.r * 0.5;
            const ty = backTo.y + Math.sin(i) * backTo.r * 0.5;
            const bend = ((i * 37) % 11) / 11 - 0.5;
            [x, y] = quad(x0, y0, (x0 + tx) / 2 - (ty - y0) * bend, (y0 + ty) / 2 + (tx - x0) * bend, tx, ty, u);
          } else {
            x = x0 + (x0 - cx) * 0.4 * u;
            y = y0 + (y0 - cy) * 0.4 * u - 16 * u;
          }
          const a = 0.7 * (1 - easeIn(u)) * Math.min(1, (out - 100) / 120);
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x * dpr, y * dpr, (0.8 + (i % 3) * 0.5) * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      if (out != null && out >= DISSOLVE_MS && !clock) {
        if (orbEl) {
          orbEl.style.opacity = '';
          orbEl.style.filter = '';
          orbEl.classList.add('orb-absorb');
          window.setTimeout(() => orbEl.classList.remove('orb-absorb'), 900);
        }
        ctx.clearRect(0, 0, W, H);
        finish();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      if (orbEl) {
        orbEl.style.opacity = '';
        orbEl.style.filter = '';
      }
    };
    // Scena pornește o singură dată pe mesaj.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : { left: '50%', top: '44%' };
  return (
    <div className={`cosmic cosmic-${variant} ${out ? 'out' : ''} ${reduce ? 'still' : ''}`} onClick={close} role={variant === 'reusita' ? 'dialog' : 'status'} aria-label={variant === 'reusita' ? 'Antrenament finalizat' : 'Mesajul zilei'}>
      {!reduce && <canvas ref={cv} className="cosmic-cv" aria-hidden="true" />}
      <div className={`cosmic-box ${reduce ? 'glass' : ''}`} ref={box} style={{ ...style, opacity: reduce ? undefined : 0 }}>
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
        {variant === 'intampinare' && (
          <button
            className="cosmic-x"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            {hint}
          </button>
        )}
        {variant === 'reusita' && (
          <button
            ref={go}
            className="cosmic-go"
            autoFocus
            style={{ opacity: reduce ? undefined : 0 }}
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            Continuă
          </button>
        )}
      </div>
    </div>
  );
}
