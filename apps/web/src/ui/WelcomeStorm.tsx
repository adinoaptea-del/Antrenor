import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  REDUCED_MS,
  SKIP_MS,
  STORM_OUT,
  STORM_OUT_MS,
  STORM_READY_MS,
  clamp01,
  stormBody,
  stormContentAlpha,
  stormEnergy,
  stormHomeBuild,
  stormParticleFade,
  stormPhaseAt,
  stormRecomposeGlow,
  stormSceneOpacity,
  stormSpin,
  stormTextAlpha,
  type StormPhase,
} from '@core/motion/teleport.js';
import { drawOrbBody, orbCount, orbLink, orbVisibleN, orbRegistry } from './orbRender';

/**
 * Întâmpinarea „furtună” (cererea proprietarului, 20.10.2026): sfera se formează din sute de mii de particule venite
 * de peste tot, exact pe locul și la mărimea bulei de pe Acasă; o parte din ele scriu întâi mesajul, apoi se alătură
 * sferei. Fără „boom” sau shake: fiecare etapă e o curbă lină (src/motion/teleport.ts STORM_*). La „Continuă” un vârtej
 * — haotic, dar estetic, ca o furtună de nisip — descompune sfera și o recompune pe același loc, unde bula reală de
 * Acasă preia (aceeași geometrie, același ceas). Apoi antrenamentele din bulă, apoi restul interfeței.
 *
 * Desen: WebGL (punctele calculate pe placa grafică, din timp — nicio stare între cadre, deci fără salturi); corpul
 * sferei (halou, membrană) pe un canvas 2D dedesubt; textul și butoanele în DOM. Fără WebGL: WelcomeSphere.
 */

type Clock = () => { t: number; out: number | null };
const BASE = '#071012';
const T0 = 12;

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/** Câte particule: sute de mii pe telefoanele puternice, mai puține pe cele slabe (ritmul rămâne același). */
function particleCount(): number {
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (hc >= 6 && mem >= 4) return 220_000;
  if (hc >= 4) return 120_000;
  return 50_000;
}

const homeOrb = () => {
  const el = document.querySelector<HTMLElement>('.azi .orb');
  const r = el?.getBoundingClientRect();
  return el && r && r.width > 20 ? el : null;
};

const VS = `
precision highp float;
attribute vec4 aA; // câmp x, y (0..1), u, th
attribute vec4 aB; // r, viteză orbitală, întârziere, durată
attribute vec4 aC; // haos k, nuanță, mărime, fază
attribute vec3 aD; // țintă text x, y (px), e text (0/1)
uniform vec2 uRes;
uniform vec2 uC;
uniform float uR;
uniform float uDpr;
uniform float uT;
uniform float uIn;
uniform float uE;
uniform float uPhi;
uniform float uFade;
uniform float uOut;
uniform float uDen;
uniform float uFieldA;
uniform float uTextA;
uniform float uFlightA;
uniform float uRc;
varying vec4 vCol;
const float PI = 3.14159265;
float eio(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
float orbRad(vec3 p, float t) {
  return 1.0 + 0.06 * sin(2.1 * p.x + t * 0.62) + 0.05 * sin(2.6 * p.y - t * 0.44 + 1.3) + 0.04 * sin(3.1 * p.z + t * 0.3 + 2.1)
    + 0.035 * sin(3.7 * (p.x - p.y) - t * 0.51) + 0.02 * sin(5.3 * p.x * p.y + t * 0.37);
}
vec3 colAt(float ang, float k) {
  vec3 LIME = vec3(222.0, 252.0, 70.0) / 255.0;
  vec3 GREEN = vec3(110.0, 236.0, 140.0) / 255.0;
  vec3 TEAL = vec3(70.0, 205.0, 210.0) / 255.0;
  float f = (cos(ang - 0.75) + 1.0) / 2.0;
  float g = clamp(f * 0.85 + (k - 0.5) * 0.3, 0.0, 1.0);
  vec3 c = g > 0.5 ? mix(GREEN, LIME, (g - 0.5) * 2.0) : mix(TEAL, GREEN, g * 2.0);
  return min(c + vec3(30.0, 20.0, 40.0) / 255.0, vec3(1.0));
}
void main() {
  // Poziția pe sferă: exact modelul bulei de Acasă (rotație, deformare, perspectivă, culoare, adâncime).
  float rotY = uT * 0.08;
  float rotX = 0.35 + 0.12 * sin(uT * 0.05);
  float cY = cos(rotY), sY = sin(rotY), cX = cos(rotX), sX = sin(rotX);
  float th = aA.w + uT * aB.y;
  float s = sqrt(max(0.0, 1.0 - aA.z * aA.z));
  vec3 p0 = vec3(s * cos(th), aA.z, s * sin(th));
  float x1 = p0.x * cY + p0.z * sY;
  float z1 = -p0.x * sY + p0.z * cY;
  float y1 = p0.y * cX - z1 * sX;
  float z2 = p0.y * sX + z1 * cX;
  float r = aB.x * orbRad(vec3(x1, y1, z2), uT);
  float f = 2.8 / (2.8 - z2 * r);
  vec2 S = uC + vec2(x1, y1) * r * uR * f;
  float depth = (z2 + 1.0) / 2.0;
  float dc = length(S - uC) / uR;
  float clearK = clamp((dc - 0.42) / 0.38, 0.08, 1.0);
  float rim = 0.6 + 0.6 * max(0.0, 1.0 - abs(dc - 1.0) * 4.0);
  float aS = min(1.0, (0.4 + 0.7 * depth) * clearK * rim * (0.8 + 0.3 * sin(uT * 1.1 + aC.w * 6.28))) * uDen;
  vec3 col = colAt(atan(S.y - uC.y, S.x - uC.x), aC.y);
  float size = aC.z * (0.7 + 0.6 * depth);

  // Intrarea: din praful de peste tot, pe o spirală lină spre țintă (literele mesajului sau sfera).
  vec2 F = aA.xy * uRes * 1.3 - uRes * 0.15;
  float e = eio((uIn - aB.z) / aB.w);
  vec2 target = S;
  float aT = aS;
  if (aD.z > 0.5) {
    // Particulele mesajului: scriu textul, apoi, după ce apare textul clar, se alătură lin sferei.
    // Literele din particule se sting cât apare textul clar, apoi particulele se alătură sferei.
    float m = eio((uIn - 4000.0 - aC.x * 900.0) / 2200.0);
    float dim = 1.0 - 0.85 * eio((uIn - 3500.0) / 800.0);
    target = mix(aD.xy, S, m);
    aT = mix(uTextA * dim, aS, m);
    size = mix(aC.z * 0.9, size, m);
  }
  vec2 dF = F - uC;
  vec2 dT = target - uC;
  float aF = atan(dF.y, dF.x);
  float aTg = atan(dT.y, dT.x);
  float da = mod(aTg - aF + PI, 2.0 * PI) - PI;
  float wind = (aC.x > 0.5 ? 1.0 : -1.0) * 2.0 * PI * step(0.35, aC.x);
  float ang = aF + (da + wind) * e;
  float rr = mix(length(dF), length(dT), e) + sin(e * PI) * 40.0 * uDpr * (aC.x - 0.5);
  vec2 P = e >= 1.0 ? target : uC + vec2(cos(ang), sin(ang)) * rr;
  float aField = uFieldA * (0.4 + 0.6 * aC.y) * clamp(uIn / 700.0, 0.0, 1.0);
  // În drum, particulele se văd (curenți de praf), nu doar când ajung.
  float a = mix(aField, aT, e) + uFlightA * sqrt(max(0.0, sin(e * PI)));
  size = mix(0.7, size, e);

  // Ieșirea: vârtejul. Rotație diferențiată (unele în sens invers), raza se umflă și se aplatizează într-un disc,
  // turbulență lină în timp — apoi energia se stinge și particulele se așază din nou pe sferă, pe același loc.
  if (uOut >= 0.0) {
    // Vârtejul: discul se umflă în jurul sferei, rotația e diferențiată (rapid aproape de centru, lent la margine),
    // așa că materia se trage singură în brațe spirale; turbulența e lină în timp. Apoi energia se stinge și
    // particulele se așază înapoi pe sferă, pe același loc.
    vec2 d = P - uC;
    float r0 = length(d);
    float a0 = atan(d.y, d.x);
    float rr2 = r0 * (1.0 + uE * (0.25 + 0.85 * aC.x)) + uE * (6.0 + 26.0 * aC.y) * uDpr;
    float rn = rr2 / uR;
    float dir = aC.x > 0.12 ? 1.0 : -0.5;
    float ang2 = a0 + uPhi * dir * (0.5 + 0.9 * aC.x) / (0.45 + 0.75 * rn) + uE * 0.9 * rn;
    // Brațele: majoritatea particulelor sunt trase spre trei spirale (cât e energia mare); restul rămân praf difuz.
    float arm = 2.0 * PI / 3.0;
    float ph = mod(ang2 - 2.4 * rn - uPhi * 0.35, arm) - arm * 0.5;
    float pullK = aC.y > 0.28 ? 0.82 : 0.25;
    ang2 -= ph * uE * pullK;
    vec2 Q = vec2(cos(ang2), sin(ang2) * (1.0 - 0.35 * uE)) * rr2;
    Q += uE * vec2(sin(uT * 1.3 + aC.w * 6.3 + rn * 2.0), cos(uT * 1.1 + aC.w * 4.1 - rn * 1.7)) * (5.0 + 16.0 * aC.x) * uDpr;
    P = uC + Q;
    a = max(a * (1.0 + 0.55 * uE), uFlightA * 1.4 * uE * (0.45 + aC.y));
    size = size * (1.0 + 0.3 * uE);
    col = mix(col, vec3(0.88, 0.95, 0.6), 0.25 * uE);
    // Recompunerea: materia se vede cât se adună înapoi pe sferă (fără gol între vârtej și bula reală).
    a = max(a, uFlightA * 0.9 * uRc * (0.4 + aC.y) * (0.5 + 0.5 * clamp((length(P - uC) / uR - 0.55) / 0.4, 0.0, 1.0)));
  }
  a *= uFade;
  vec2 clip = (P / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, size * uDpr);
  vCol = vec4(col, a);
}`;
const FS = `
precision mediump float;
varying vec4 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float m = smoothstep(0.5, 0.12, d);
  float a = vCol.a * m;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;

/** Pseudo-aleator determinist, fără corelații între indici vecini (altfel apar dungi în vârtej). */
const hash = (i: number, k: number) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export function WelcomeStorm({
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
  onPhase?: (p: StormPhase) => void;
  onClose: () => void;
}) {
  const gl$ = useRef<HTMLCanvasElement>(null);
  const body$ = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const kick = useRef<HTMLDivElement>(null);
  const para = useRef<HTMLParagraphElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const goBtn = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const t0 = useRef(performance.now());
  const outAt = useRef<number | null>(null);
  const skipAt = useRef<number | null>(null);
  const done = useRef(false);
  const geo = useRef<{ cx: number; cy: number; R: number; size: number } | null>(null);
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
    outAt.current = performance.now();
    setLeaving(true);
  };
  const skip = () => {
    if (skipAt.current != null) return;
    skipAt.current = performance.now();
    unlink();
    setLeaving(true);
    window.setTimeout(() => finishRef.current(), SKIP_MS);
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

  // Locul: exact bula de Acasă (centrul și raza desenului ei); fără Acasă, centrul ecranului, la aceeași mărime.
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cvs = homeOrb()?.querySelector('canvas')?.getBoundingClientRect();
    const size = cvs ? Math.min(cvs.width, cvs.height) : Math.min(vw - 32, 360);
    const cx = cvs ? cvs.left + cvs.width / 2 : vw / 2;
    const cy = cvs ? cvs.top + cvs.height / 2 : vh * 0.42;
    geo.current = { cx, cy, R: size * 0.37, size };
    const b = box.current;
    if (b) {
      b.style.left = `${cx}px`;
      b.style.top = `${cy}px`;
      b.style.width = `${Math.round(size * 0.6)}px`;
    }
    if (goBtn.current) {
      goBtn.current.style.top = `${Math.round(cy + size * 0.5 + 10)}px`;
      goBtn.current.style.left = `${cx}px`;
    }
    if (wrap.current) wrap.current.style.opacity = '1';
  }, []);

  useEffect(() => {
    const c = gl$.current;
    const cb = body$.current;
    const g = geo.current;
    if (!c || !cb || !g) return;
    const gl = (c.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    const b2 = cb.getContext('2d');
    if (!gl || !b2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = 0;
    let VH = 0;
    const fit = () => {
      VW = window.innerWidth;
      VH = window.innerHeight;
      for (const el of [c, cb]) {
        el.width = Math.max(1, Math.round(VW * dpr));
        el.height = Math.max(1, Math.round(VH * dpr));
        el.style.width = `${VW}px`;
        el.style.height = `${VH}px`;
      }
      gl.viewport(0, 0, c.width, c.height);
    };
    fit();
    window.addEventListener('resize', fit);

    // Programul.
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[AIRON] shader:', gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[AIRON] program:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // Țintele mesajului: textul desenat pe un canvas cu același font și aceleași rânduri, eșantionat în puncte.
    const textPts: number[] = [];
    {
      const k = kick.current;
      const p = para.current;
      const oc = document.createElement('canvas');
      oc.width = VW;
      oc.height = VH;
      const o = oc.getContext('2d');
      if (o && k && p) {
        // Fiecare cuvânt exact unde îl așază DOM-ul (aceleași rânduri, același font): literele din particule
        // coincid cu textul clar care apare peste ele.
        const drawWords = (el: HTMLElement) => {
          const cs = getComputedStyle(el);
          o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          o.fillStyle = '#fff';
          o.textAlign = 'left';
          o.textBaseline = 'middle';
          const ls = parseFloat(cs.letterSpacing) || 0;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const range = document.createRange();
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const txt = n.textContent ?? '';
            const re = /\S+/g;
            for (let m = re.exec(txt); m; m = re.exec(txt)) {
              range.setStart(n, m.index);
              range.setEnd(n, m.index + m[0].length);
              const r = range.getBoundingClientRect();
              if (!r.width) continue;
              if (ls) {
                let x = r.left;
                for (const ch of m[0]) {
                  o.fillText(ch, x, r.top + r.height / 2);
                  x += o.measureText(ch).width + ls;
                }
              } else o.fillText(m[0], r.left, r.top + r.height / 2);
            }
          }
        };
        drawWords(k);
        drawWords(p);
        const img = o.getImageData(0, 0, VW, VH).data;
        for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) if (img[(y * VW + x) * 4 + 3]! > 110) textPts.push(x, y);
      }
    }

    // Particulele (o singură dată): unde sunt în praf, unde stau pe sferă, când pornesc, cât de haotice sunt.
    const N = particleCount();
    const nText = Math.min(Math.floor(N * 0.22), (textPts.length / 2) * 5);
    const A = new Float32Array(N * 4);
    const Bv = new Float32Array(N * 4);
    const C = new Float32Array(N * 4);
    const D = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const shell = hash(i, 3) < 0.85;
      const isText = i < nText && textPts.length > 0;
      A[i * 4] = hash(i, 1);
      A[i * 4 + 1] = hash(i, 2);
      A[i * 4 + 2] = hash(i, 4) * 2 - 1;
      A[i * 4 + 3] = hash(i, 5) * Math.PI * 2;
      Bv[i * 4] = shell ? 0.93 + hash(i, 6) * 0.1 : 0.3 + hash(i, 6) * 0.6;
      Bv[i * 4 + 1] = (0.03 + hash(i, 7) * 0.06) * (hash(i, 8) < 0.5 ? -1 : 1);
      // Sosirea: mesajul se scrie puțin înaintea sferei; fiecare particulă cu întârzierea și durata ei.
      Bv[i * 4 + 2] = (isText ? 250 : 450) + hash(i, 9) * (isText ? 1200 : 1500);
      Bv[i * 4 + 3] = 1500 + hash(i, 10) * 1000;
      C[i * 4] = hash(i, 11);
      C[i * 4 + 1] = hash(i, 12);
      const big = hash(i, 13) < 0.025;
      C[i * 4 + 2] = big ? 2.2 + hash(i, 14) * 1.6 : 0.6 + hash(i, 14) * 1.1;
      C[i * 4 + 3] = hash(i, 15);
      if (isText) {
        const j = Math.floor(hash(i, 16) * (textPts.length / 2));
        D[i * 3] = (textPts[j * 2]! + (hash(i, 17) - 0.5)) * dpr;
        D[i * 3 + 1] = (textPts[j * 2 + 1]! + (hash(i, 18) - 0.5)) * dpr;
        D[i * 3 + 2] = 1;
      }
    }
    const attr = (name: string, data: Float32Array, size: number) => {
      const loc = gl.getAttribLocation(prog, name);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attr('aA', A, 4);
    attr('aB', Bv, 4);
    attr('aC', C, 4);
    attr('aD', D, 3);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U('uRes'),
      uC = U('uC'),
      uR = U('uR'),
      uDpr = U('uDpr'),
      uT = U('uT'),
      uIn = U('uIn'),
      uE = U('uE'),
      uPhi = U('uPhi'),
      uFade = U('uFade'),
      uOut = U('uOut');
    const uRcLoc = U('uRc');
    // Luminozitatea pe particulă scade cu numărul lor: sfera are aceeași strălucire ca bula de Acasă, nu un inel alb.
    gl.uniform1f(U('uDen'), Math.min(1, 4200 / N));
    gl.uniform1f(U('uFieldA'), 0.3 * Math.min(1, 30000 / N) ** 0.5);
    gl.uniform1f(U('uFlightA'), 0.3 * Math.min(1, 30000 / N) ** 0.5);
    // Literele: câte particule cad pe un pixel de text → alfa per particulă, ca textul să lumineze, nu să ardă.
    gl.uniform1f(U('uTextA'), Math.min(0.9, Math.max(0.08, 1.8 / Math.max(1, nText / Math.max(1, textPts.length / 2)))));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    // Bula reală de Acasă: preia pe același loc, cu același ceas; particulele ei apar treptat, în ordine amestecată.
    const orbEl = homeOrb();
    const reg = orbEl ? orbRegistry.get(orbEl) : undefined;
    const homeN = orbVisibleN(orbCount(), reg?.prog() ?? null);
    const order = Array.from({ length: orbCount() }, (_, i) => i).sort((a, b) => hash(a, 41) - hash(b, 41));
    const arrived = new Uint8Array(orbCount());

    let raf = 0;
    let lastPhase: StormPhase | null = null;
    let readyFired = false;
    const draw = () => {
      const now = performance.now();
      const { t, out } = clockRef.current();
      const ts = T0 + (t + (out ?? 0)) / 1000;
      const phase = stormPhaseAt(t, out);
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseRef.current?.(phase);
      }
      if (!readyFired && t >= STORM_READY_MS) {
        readyFired = true;
        setReady(true);
      }
      const skipP = skipAt.current == null ? 0 : clamp01((now - skipAt.current) / SKIP_MS);
      const showing = out != null && out >= STORM_OUT.interfata[0];
      if (wrap.current) {
        wrap.current.style.opacity = (stormSceneOpacity(out) * (1 - skipP)).toFixed(3);
        wrap.current.style.pointerEvents = showing || skipP > 0 ? 'none' : '';
      }
      if (showing) setHomeInert(false);
      const ta = stormTextAlpha(t, out);
      if (box.current) box.current.style.opacity = ta.toFixed(3);
      // „Continuă” se stinge odată cu mesajul (nu rămâne peste vârtej).
      if (goBtn.current && out != null) goBtn.current.style.opacity = ta.toFixed(3);

      const W = c.width;
      const H = c.height;
      const E = stormEnergy(out);
      // Corpul sferei (2D): halou și membrană, ca bula de Acasă.
      b2.setTransform(1, 0, 0, 1, 0, 0);
      b2.clearRect(0, 0, W, H);
      drawOrbBody(b2, ts, g.cx * dpr, g.cy * dpr, g.R * dpr, dpr, stormBody(t, out), W, H);
      // Particulele (WebGL).
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, W, H);
      gl.uniform2f(uC, g.cx * dpr, g.cy * dpr);
      gl.uniform1f(uR, g.R * dpr);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uT, ts);
      gl.uniform1f(uIn, t);
      gl.uniform1f(uE, E);
      gl.uniform1f(uPhi, stormSpin(out));
      gl.uniform1f(uFade, stormParticleFade(out));
      gl.uniform1f(uRcLoc, stormRecomposeGlow(out));
      gl.uniform1f(uOut, out == null ? -1 : out);
      gl.drawArrays(gl.POINTS, 0, N);

      // Bula reală: volum și particule din ce s-a recompus; fundalul se deschide doar peste ea.
      if (orbEl && out != null && skipAt.current == null) {
        const build = stormHomeBuild(out);
        const k = Math.round(build * order.length);
        for (let j = 0; j < order.length; j++) arrived[order[j]!] = j < k && order[j]! < homeN ? 1 : 0;
        orbLink.active = true;
        orbLink.el = orbEl;
        orbLink.t = ts;
        orbLink.arrived = arrived;
        orbLink.body = build;
        const inner = orbEl.querySelector<HTMLElement>('.orb-in');
        if (inner) inner.style.opacity = stormContentAlpha(out).toFixed(3);
        if (base.current) {
          const hole = g.size * 0.5 * (0.2 + 0.8 * build);
          const m = `radial-gradient(circle at ${Math.round(g.cx)}px ${Math.round(g.cy)}px, transparent ${Math.round(hole * 0.78)}px, #000 ${Math.round(hole)}px)`;
          base.current.style.webkitMaskImage = m;
          base.current.style.maskImage = m;
        }
      }
      if (out != null && out >= STORM_OUT_MS && !clock && skipAt.current == null) {
        finishRef.current();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scene = (
    <div ref={wrap} className={`cosmic welcome-storm ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Mesajul zilei">
      <div ref={base} className="cosmic-base" style={{ background: BASE }} />
      <canvas ref={body$} className="ws-layer" aria-hidden="true" />
      <canvas ref={gl$} className="ws-layer" aria-hidden="true" />
      <div className="cosmic-box ws-box" ref={box} style={{ opacity: 0 }}>
        <div className="cosmic-k" ref={kick}>
          {kicker}
        </div>
        <p className="cosmic-t" ref={para} aria-live="polite">
          {text}
        </p>
      </div>
      <button ref={goBtn} className={`cosmic-go storm-go ${ready ? 'on' : ''}`} onClick={go} disabled={!ready || leaving} aria-hidden={!ready}>
        Continuă
      </button>
      <button className="cosmic-skip" onClick={skip} disabled={leaving && skipAt.current != null}>
        Sari peste
      </button>
    </div>
  );
  return inline ? scene : createPortal(scene, document.body);
}

/** Pentru teste/diagnoză: momentul în care vârtejul e la maxim. */
export const STORM_PEAK_MS = STORM_OUT.vartej[1];
