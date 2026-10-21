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
  gatherWeight,
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
import { WM, introAmbient, introArc, introBlend, introDelay, introPhase, introTextAlpha, introWobble, wordmarkAlpha, wordmarkChunks, wordmarkFit, wordmarkPolylines, wordmarkSamples, type IntroPhase } from '@core/motion/wordmark.js';
import { makeOrbModel, membranePoint, orbCount, orbLink, orbParticle, orbRadius, orbRegistry, orbVisibleN } from './orbRender';

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
 *
 * Intro-ul (`intro`, ghidul vizual-tehnic din 21.10.2026; doar întâmpinarea din Memento, nu felicitările): pe același
 * ceas, înainte de sferă, wordmark_in (0–0,3 s) → wordmark_hold (0,3–1,5 s) → wordmark_to_orb (1,5–3,3 s) →
 * welcome_reveal (3,3–3,7 s) → welcome_idle → ieșirea existentă. Literele AIRON sunt desenate chiar de cele 22 de fire
 * ale sferei (fiecare fir e o bucată de literă), care se desprind decalat și se așază pe sferă cu
 * P = (1 − s)·S + s·B(t) + a·F; la 3,3 s poziția e exact B(t), adică sfera formată — nu există un cadru de trecere.
 * Ceasul intern al întâmpinării e t = T − 2.100 ms. Mișcare redusă: direct întâmpinarea lizibilă, cu estomparea scurtă.
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
  intro = false,
  onRequestContinue,
  onPhase,
  onClose,
}: {
  kicker: ReactNode;
  text: string;
  clock?: Clock;
  inline?: boolean;
  /** Intro-ul AIRON înaintea sferei (wordmark → fire → bulă); ceasul `t` e atunci ceasul intro-ului (T). */
  intro?: boolean;
  onRequestContinue?: () => void;
  onPhase?: (p: FireState | IntroPhase) => void;
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
  /** Ceasul scenei: t = intrarea (ms; cu intro, ceasul intro-ului), out = ieșirea (ms de la „Continuă”). */
  const scene = useRef<{ t: number; out: number | null }>({ t: reduce ? (intro ? WM.ready : FIRE.ready) : 0, out: null });
  const skipAt = useRef<number | null>(null);
  const done = useRef(false);
  const geo = useRef({ cx: 0, cy: 0, R: 100 });
  /** Culoarea fundalului de Acasă (din body), ținta fundalului cosmic la predare (G08). */
  const homeBg = useRef<[number, number, number]>((() => {
    try {
      const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [14, 17, 18];
    } catch {
      return [14, 17, 18];
    }
  })());
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
    // Intro: bucata de literă a fiecărui fir (eșantioane S, în unități de H) și întârzierea cu care se desprinde.
    // Bucățile sunt în ordinea cuvântului (A → N); firul k primește bucata chunkOf[k]: firele sunt ordonate după culoare
    // (turcoaz → verde → lime), ca în imaginea ghidului — A se desprinde în turcoaz, N în lime.
    const wmPolys = intro && !reduce ? wordmarkPolylines() : null;
    const wmChunks = wmPolys ? wordmarkChunks(fils.length, wmPolys) : null;
    const wmS = wmPolys ? wordmarkSamples(fils.length, SAMPLES) : null;
    const order = fils.map((_, k) => k).sort((a, b) => fils[a]!.col - fils[b]!.col || fils[a]!.start - fils[b]!.start);
    const chunkOf = new Int16Array(fils.length);
    order.forEach((k, c) => (chunkOf[k] = c));
    const wm = wmS ? fils.map((_, k) => wmS[chunkOf[k]!]!) : null;
    const wmLen = Float32Array.from(fils, (_, k) => (wmChunks ? wmChunks[chunkOf[k]!]!.to - wmChunks[chunkOf[k]!]!.from : 0));
    const wmDelay = fils.map((_, k) => introDelay(chunkOf[k]!, fils.length));
    /** Grosimea tușei bucății firului k (unități de H) și tușa (pentru decupare). */
    const wmW = Float32Array.from(fils, (_, k) => (wmChunks && wmPolys ? wmPolys[wmChunks[chunkOf[k]!]!.stroke]!.w : WM.stroke));
    const wmStroke = Int16Array.from(fils, (_, k) => (wmChunks ? wmChunks[chunkOf[k]!]!.stroke : 0));
    const INK = WM.inkRgb;
    // Literele încă întregi se desenează pe un canvas separat (decupate exact în cutia literei), apoi se așază pe scenă
    // de două ori: o dată estompate (strălucirea moale din ghid), o dată clare.
    const off = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const offCtx = off?.getContext('2d') ?? null;
    const canBlur = !!offCtx && 'filter' in offCtx;
    // Momentul ruperii fiecărui eșantion de fir (aceeași formulă ca nașterea prafului).
    const erodeAt = fils.map((f) =>
      Float32Array.from({ length: SAMPLES + 1 }, (_, j) => {
        const s = f.s0 + (j / SAMPLES) * Math.PI * 2;
        const cs = Math.cos(s);
        const sn = Math.sin(s);
        return erosionTime([cs * f.u[0] + sn * f.v[0], cs * f.u[1] + sn * f.v[1], cs * f.u[2] + sn * f.v[2]], zones, (hash(j, f.start) - 0.5) * 80);
      }),
    );
    // Tampoanele firelor (fără alocări pe cadru): pozițiile proiectate, adâncimea, capătul desenat și amestecul intro.
    const PX = fils.map(() => new Float32Array(SAMPLES + 1));
    const PY = fils.map(() => new Float32Array(SAMPLES + 1));
    const PD = fils.map(() => new Float32Array(SAMPLES + 1));
    const jEndK = new Int16Array(fils.length);
    /** Amestecul de stil al firului k (0 = literă, 1 = fir); în afara intro-ului 1. */
    const sK = new Float32Array(fils.length).fill(1);
    const n = grainCount(VW, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 8) : 8);
    const g = makeGrains(n, fils, zones);
    const N = orbCount();
    const pts = makeOrbModel(N);
    // Auditul grafic G01: praful care nu devine particulă a bulei se așază pe curbele membranei (5 straturi, aceeași
    // formă ca drawOrbBody) sau în volumul ei (~20%), nu pe un cerc perfect — altfel apar două orbite suprapuse.
    const ringAng = Float32Array.from({ length: n }, (_, i) => (i * 2.39996323) % (Math.PI * 2));
    const ringLayer = Uint8Array.from({ length: n }, (_, i) => Math.floor(hash(i, 41) * 5));
    const ringIn = Float32Array.from({ length: n }, (_, i) => (hash(i, 43) < 0.2 ? 0.62 + hash(i, 44) * 0.25 : 0));
    let arrived = new Uint8Array(N);
    const bucket = new Uint8Array(n);
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
    let lastState: FireState | IntroPhase | null = null;
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
      const { t: T, out } = clockRef.current();
      // Cu intro, ceasul scenei e T; întâmpinarea rulează pe t = T − 2.100 ms (sfera formată exact la 3.300 ms).
      const t = intro ? T - WM.offset : T;
      /** Intro în desfășurare (literele încă nu sunt toate pe sferă). */
      const inIntro = intro && !reduce && out == null && T < WM.morph[1];
      const st: FireState | IntroPhase = intro && out == null && T < WM.reveal[1] ? introPhase(T, out) : fireState(t, out);
      if (st !== lastState) {
        lastState = st;
        onPhaseRef.current?.(st);
      }
      if (!readyFired && (intro ? T >= WM.ready : t >= FIRE.ready)) {
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
      if (box.current) box.current.style.opacity = (reduce ? 1 : intro && out == null ? introTextAlpha(T) : fireTextAlpha(t, out)).toFixed(3);
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
      // Intro: fundal #061010 curat cât stă cuvântul; decorul întâmpinării se aprinde cât literele devin fire (complet la 3,3 s).
      const amb = inIntro ? introAmbient(T) : 1;
      // G08: lumina verde a fundalului se stinge în aceeași cronologie cu transferul bulei; baza trece spre culoarea Acasă.
      const toHome = out == null ? 0 : smooth(span(out, [FIRE.exit.gather[0], FIRE.exit.interface[1]]));
      if (base.current) {
        const [r0, g0, b0] = inIntro ? [6 + amb, 16, 16 + 2 * amb] : [7, 16, 18];
        const [r1, g1, b1] = homeBg.current;
        base.current.style.background = `rgb(${Math.round(r0 + (r1 - r0) * toHome)},${Math.round(g0 + (g1 - g0) * toHome)},${Math.round(b0 + (b1 - b0) * toHome)})`;
      }
      for (const nb of nebulae) {
        if (amb <= 0) break;
        const [nx, ny] = warp(nb.x * VW, nb.y * VH);
        const rr = nb.r * Math.max(VW, VH);
        const gr = ctx.createRadialGradient(nx, ny, 0, nx, ny, rr);
        gr.addColorStop(0, `rgba(${nb.col[0]},${nb.col[1]},${nb.col[2]},${(nb.a * amb * (1 - toHome)).toFixed(4)})`);
        gr.addColorStop(1, `rgba(${nb.col[0]},${nb.col[1]},${nb.col[2]},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(nx - rr, ny - rr, rr * 2, rr * 2);
      }
      ctx.globalCompositeOperation = 'lighter';
      const FW = VW + 2 * MARGIN;
      const FH = VH + 2 * MARGIN;
      for (const f of field) {
        if (amb <= 0) break;
        const x0 = ((((f.x * FW + Math.cos(f.ang) * f.sp * live) % FW) + FW) % FW) - MARGIN;
        const y0 = ((((f.y * FH + Math.sin(f.ang) * f.sp * live) % FH) + FH) % FH) - MARGIN;
        const [x, y] = warp(x0, y0);
        ctx.fillStyle = `rgba(${f.col[0]},${f.col[1]},${f.col[2]},${(f.a * amb).toFixed(3)})`;
        ctx.fillRect(x - f.r, y - f.r, f.r * 2, f.r * 2);
      }

      // Firele: arc continuu, halou + miez; spatele sferei mai stins decât fața. La ieșire, eșantioanele se rup.
      // Intro: firele nu se „desenează pe lungime” (formarea e înlocuită de desprinderea din litere): B(t) e sfera formată.
      const tBuild = reduce || inIntro ? FIRE.build[1] + 1000 : t;
      const wfit = inIntro ? wordmarkFit(VW, cx, cy, R) : null;
      const wAlpha = inIntro ? wordmarkAlpha(T) : 1;
      const wobbleAmp = 0.035 * R;
      // 1) Geometria fiecărui fir: P = (1 − s)·S + s·B(t) + a·F (intro) sau B(t) cu formarea existentă.
      for (let k = 0; k < fils.length; k++) {
        const f = fils[k]!;
        const { reveal, scale } = buildOf(f, tBuild);
        jEndK[k] = reveal <= 0 ? -1 : Math.min(SAMPLES, Math.ceil(reveal * SAMPLES));
        if (reveal <= 0) continue;
        const bl = wfit && wm ? introBlend(T, wmDelay[k]!) : null;
        sK[k] = bl ? bl.style : 1;
        const px = PX[k]!;
        const py = PY[k]!;
        const pd = PD[k]!;
        // Intro: firul se derulează din literă — arcul desfășurat crește de la lungimea bucății la tot cercul.
        const arc = bl && wfit ? introArc(bl.s, wmLen[k]! * wfit.H, 2 * Math.PI * R * f.rf) : 1;
        for (let j = 0; j <= jEndK[k]!; j++) {
          const s = f.s0 + (Math.min(j / SAMPLES, reveal) * Math.PI * 2 * arc);
          if (bl && wfit && wm) {
            const S = wm[k]!;
            const sx = wfit.x0 + S[2 * j]! * wfit.H;
            const sy = wfit.y0 + S[2 * j + 1]! * wfit.H;
            if (bl.s <= 0) {
              px[j] = sx;
              py[j] = sy;
              pd[j] = 1;
              continue;
            }
            const q = project(filamentPoint(f, s, ts, R), cx, cy, R);
            const [fx, fy] = bl.a > 0 ? introWobble(T, k, j / SAMPLES) : [0, 0];
            px[j] = (1 - bl.s) * sx + bl.s * q.x + bl.a * wobbleAmp * fx;
            py[j] = (1 - bl.s) * sy + bl.s * q.y + bl.a * wobbleAmp * fy;
            pd[j] = 1 - bl.s + bl.s * q.depth;
            continue;
          }
          const p = filamentPoint(f, s, ts, R);
          const q = project([p[0] * scale, p[1] * scale, p[2] * scale], cx, cy, R);
          px[j] = q.x;
          py[j] = q.y;
          pd[j] = q.depth;
        }
      }
      // 2) Intro, stilul literei: bucățile încă neplecate se desenează exact ca literele din ghid — tușe drepte (capete
      //    tăiate, îmbinări ascuțite), fiecare decupată în cutia literei ei (fantele lui A și O, colțurile lui N) — pe
      //    canvas-ul separat, apoi pe scenă estompate (strălucire moale) și clare. Bucățile care pleacă se desenează pe
      //    scenă în același alb, cu intensitatea 1 − s: lumina trece treptat de la literă la fir pe aceeași linie.
      if (wfit && wAlpha > 0 && wmPolys && wmChunks) {
        const Hh = wfit.H;
        const m = Math.ceil(0.45 * Hh);
        const ox = Math.floor(wfit.x0 - m);
        const oy = Math.floor(wfit.y0 - m);
        const ow = Math.ceil(wfit.W + 2 * m);
        const oh = Math.ceil(Hh + 2 * m);
        ctx.globalCompositeOperation = 'source-over';
        if (off && offCtx) {
          if (off.width !== Math.ceil(ow * dpr) || off.height !== Math.ceil(oh * dpr)) {
            off.width = Math.ceil(ow * dpr);
            off.height = Math.ceil(oh * dpr);
          }
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          offCtx.clearRect(0, 0, off.width, off.height);
          offCtx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
          offCtx.lineCap = 'butt';
          offCtx.lineJoin = 'miter';
          offCtx.miterLimit = 12;
          offCtx.strokeStyle = `rgb(${INK[0]},${INK[1]},${INK[2]})`;
          let any = false;
          for (let si = 0; si < wmPolys.length; si++) {
            const poly = wmPolys[si]!;
            offCtx.save();
            offCtx.beginPath();
            for (const ring of poly.clip) {
              ring.forEach((pt, i) => (i === 0 ? offCtx.moveTo(wfit.x0 + pt[0] * Hh, wfit.y0 + pt[1] * Hh) : offCtx.lineTo(wfit.x0 + pt[0] * Hh, wfit.y0 + pt[1] * Hh)));
              offCtx.closePath();
            }
            offCtx.clip('evenodd');
            offCtx.beginPath();
            let anyHere = false;
            for (let k = 0; k < fils.length; k++) {
              if (wmStroke[k] !== si || jEndK[k]! < 0 || sK[k]! > 0) continue;
              const px = PX[k]!;
              const py = PY[k]!;
              offCtx.moveTo(px[0]!, py[0]!);
              for (let j = 1; j <= jEndK[k]!; j++) offCtx.lineTo(px[j]!, py[j]!);
              anyHere = true;
            }
            if (anyHere) {
              offCtx.lineWidth = poly.w * Hh;
              offCtx.stroke();
              any = true;
            }
            offCtx.restore();
          }
          if (any) {
            ctx.save();
            if (canBlur) {
              ctx.globalAlpha = 0.5 * wAlpha;
              ctx.filter = `blur(${(0.12 * Hh).toFixed(1)}px)`;
              ctx.drawImage(off, ox, oy, ow, oh);
              ctx.filter = 'none';
            }
            ctx.globalAlpha = wAlpha;
            ctx.drawImage(off, ox, oy, ow, oh);
            ctx.restore();
          }
        }
        // Bucățile care pleacă: fără decupare (sunt deja în mișcare), capete drepte, îmbinări rotunde (fără vârfuri).
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        for (let k = 0; k < fils.length; k++) {
          const sMix = sK[k]!;
          if (jEndK[k]! < 0 || sMix <= 0 || sMix >= 1) continue;
          const px = PX[k]!;
          const py = PY[k]!;
          const la = (1 - sMix) * wAlpha;
          const lw = wmW[k]! * Hh * (1 - sMix) + fils[k]!.width * sMix;
          ctx.beginPath();
          ctx.moveTo(px[0]!, py[0]!);
          for (let j = 1; j <= jEndK[k]!; j++) ctx.lineTo(px[j]!, py[j]!);
          ctx.strokeStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},${(0.1 * la).toFixed(3)})`;
          ctx.lineWidth = lw * 2.4;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},${la.toFixed(3)})`;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        ctx.lineJoin = 'miter';
        ctx.globalCompositeOperation = 'lighter';
      }
      // 3) Stilul firului (culoarea lui, subțire, aditiv), cu intensitatea s în intro: lumina trece treptat de la literă la
      //    fir pe aceeași linie — nicio copie a cuvântului nu rămâne în urmă.
      for (let k = 0; k < fils.length; k++) {
        const f = fils[k]!;
        const jEnd = jEndK[k]!;
        const sMix = sK[k]!;
        if (jEnd < 0 || sMix <= 0) continue;
        const px = PX[k]!;
        const py = PY[k]!;
        const pd = PD[k]!;
        const ea = erodeAt[k]!;
        const col = COLS[f.col]!;
        for (let bk = 0; bk < 3; bk++) {
          const A = [0.3, 0.62, 1][bk]! * sMix;
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
            // G04: capătul care se rupe se stinge spre praf (nu se aprinde): fără dublarea luminii fir + granulă.
            const a = pass === 0 ? 0.1 * A * (1 - 0.5 * fray) : 0.82 * A * (1 - 0.45 * fray);
            ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, a).toFixed(3)})`;
            ctx.lineWidth = pass === 0 ? f.width * 4.5 : f.width;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        }
        // Capătul care desenează, cât timp firul se lungește.
        if (out == null && jEnd < SAMPLES) {
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
          const q = ringAng[i]!;
          const inner = ringIn[i]!;
          if (inner > 0) {
            const x = Math.cos(q),
              y = Math.sin(q) * 0.85;
            const r = inner * orbRadius(x, y, 0.4, tt) * home.R;
            return [home.x + x * r, home.y + y * r];
          }
          return membranePoint(q, ringLayer[i]!, tt, home.x, home.y, home.R);
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
        // Fără salt la predare: ce n-a ajuns încă se stinge în ultimele 250 ms, în loc să dispară dintr-un cadru în altul.
        const noHomeFade = (home ? 1 : 1 - smooth(span(out, [FIRE.exit.gather[0], FIRE.exit.gather[1] - 600]))) * (1 - smooth(span(out, [FIRE.exit.handoff - 250, FIRE.exit.handoff])));
        if (!handoff && noHomeFade > 0) {
          // G04: același material ca bula — granule moi, expunere controlată. Lumina scade pe măsură ce praful se
          // strânge (zona densă de lângă membrană nu se mai aprinde până la alb), iar bula preia materia la atașare.
          // Un singur calcul pe granulă și cadru: găleata (culoare × adâncime × cât s-a strâns), apoi 27 de treceri ieftine.
          for (let i = 0; i < n; i++) {
            if (!g.born[i] || g.attached[i]) {
              bucket[i] = 255;
              continue;
            }
            const w = gatherWeight(out, g.stagger[i]!);
            bucket[i] = g.col[i]! * 9 + Math.min(2, Math.floor(g.depth[i]! * 3)) * 3 + (w < 0.33 ? 0 : w < 0.75 ? 1 : 2);
          }
          for (let key = 0; key < 27; key++) {
            const col = COLS[Math.floor(key / 9)]!;
            const a0 = [0.2, 0.36, 0.56][Math.floor(key / 3) % 3]! * [1, 0.7, 0.4][key % 3]! * noHomeFade;
            ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a0.toFixed(3)})`;
            for (let i = 0; i < n; i++) {
              if (bucket[i] !== key) continue;
              const sz = g.size[i]!;
              if (sz > 1.3) {
                ctx.beginPath();
                ctx.arc(g.x[i]!, g.y[i]!, sz, 0, Math.PI * 2);
                ctx.fill();
              } else ctx.fillRect(g.x[i]! - sz, g.y[i]! - sz, sz * 2, sz * 2);
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
    <div ref={wrap} className={`cosmic welcome-fire ${intro ? 'with-intro' : ''} ${reduce ? 'still' : ''} ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label={intro ? 'AIRON — mesajul zilei' : 'Mesajul zilei'}>
      <div ref={base} className="cosmic-base" style={{ background: intro && !reduce ? WM.bg : BASE }} />
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
