// Wordmark-ul AIRON și intro-ul „wordmark → fire → bulă” (ghidul vizual-tehnic, 21.10.2026). Doar geometrie și cronologie,
// fără DOM: literele sunt căi vector pe linia mediană (monoline, geometrice), aceleași pentru SVG-ul din antet/autentificare
// și pentru canvas-ul întâmpinării, unde fiecare din cele 22 de fire ale sferei pornește ca o bucată de literă și
// se așază pe sferă cu P(t) = (1 − s)·S + s·B(t) + a·F(t, sămânță). Desenul e în apps/web/src/ui/WelcomeFire.tsx.
import { FIRE, clamp01, smooth, span } from './fireStorm.js';

/** Cronologia intro-ului (ms de la pornire) și reperele vizuale. */
export const WM = {
  /** Literele apar (fără mișcare). */
  in: [0, 300] as const,
  /** Cuvântul stă, lizibil. */
  hold: [300, 1500] as const,
  /** Firele se desprind din litere și converg pe sferă; toate ajung până la 3.300 ms. */
  morph: [1500, 3300] as const,
  /** Mesajul și „Continuă” apar treptat; sfera e deja în mișcarea ei obișnuită. */
  reveal: [3300, 3700] as const,
  ready: 3700,
  /** Ceasul intern al întâmpinării: t = T − offset, astfel încât la 3.300 ms sfera e exact cea formată (FIRE.build[1]). */
  offset: 3300 - FIRE.build[1],
  /** Fundalul intro-ului (opac, peste toată aplicația) și culoarea literelor (alb cald, tentă discretă de mentă). */
  bg: '#061010',
  ink: '#EAF2E7',
  inkRgb: [234, 242, 231] as const,
  /** Grosimea tușei și spațiul dintre litere, în unități de înălțime a majusculei (H = 1). */
  stroke: 0.13,
  gap: 0.26,
  /** Lățimea cuvântului: ~64% din lățimea utilă (ghid: 60–68%; la 390 px ≈ 234–265 px), fără să iasă din sferă. */
  widthFrac: 0.64,
  widthRange: [0.6, 0.68] as const,
};

export type IntroPhase = 'wordmark_in' | 'wordmark_hold' | 'wordmark_to_orb' | 'welcome_reveal' | 'welcome_idle' | 'existing_exit';
export function introPhase(T: number, out: number | null): IntroPhase {
  if (out != null) return 'existing_exit';
  if (T < WM.in[1]) return 'wordmark_in';
  if (T < WM.hold[1]) return 'wordmark_hold';
  if (T < WM.morph[1]) return 'wordmark_to_orb';
  if (T < WM.reveal[1]) return 'welcome_reveal';
  return 'welcome_idle';
}
export const INTRO_LABEL: Record<IntroPhase, string> = {
  wordmark_in: 'AIRON apare',
  wordmark_hold: 'AIRON stă',
  wordmark_to_orb: 'Literele devin fire',
  welcome_reveal: 'Mesajul apare',
  welcome_idle: 'Mesajul în sferă',
  existing_exit: 'Ieșirea',
};

/** Literele intră în 0–300 ms, fără mișcare; apoi fiecare bucată pleacă odată cu firul ei (vezi introBlend). */
export const wordmarkAlpha = (T: number) => smooth(span(T, WM.in));
/** Mesajul și „Continuă”: 3.300–3.700 ms (nu în timpul literelor, ca să nu se suprapună în centru). */
export const introTextAlpha = (T: number) => smooth(span(T, WM.reveal));
/** Decorul întâmpinării (nebuloase, praf fin) se aprinde cât timp literele devin fire; la 3.300 ms e complet. */
export const introAmbient = (T: number) => smooth(span(T, WM.morph));

/**
 * Amestecul pentru firul cu întârzierea d (ms): u = clamp((T − 1.500 − d) / (1.800 − d)), s = 6u⁵ − 15u⁴ + 10u³ (poziția),
 * a = 16u²(1 − u)² (anvelopa abaterii F). Oricare ar fi d, u = 1 la 3.300 ms: toate firele ajung pe sferă la timp.
 */
export function introBlend(T: number, d: number): { u: number; s: number; a: number; style: number } {
  const u = clamp01((T - WM.morph[0] - d) / (WM.morph[1] - WM.morph[0] - d));
  const s = u * u * u * (u * (u * 6 - 15) + 10);
  const a = 16 * u * u * (1 - u) * (1 - u);
  // Stilul (alb cald, tușă groasă → culoarea firului, linie subțire) o ia înaintea poziției: când bucata începe să se
  // îndoaie e deja fir, nu literă mototolită.
  const style = smooth(Math.min(1, u / 0.55));
  return { u, s, a, style };
}

const hash = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
/** Întârzierea firului k din n: pleacă în ordinea literelor (stânga → dreapta), cu un mic decalaj propriu; maximum ~0,9 s. */
export function introDelay(k: number, n: number): number {
  return Math.round(630 * (n > 1 ? k / (n - 1) : 0) + 280 * hash(k, 91));
}
/**
 * Abaterea F(t, sămânță) a firului k în eșantionul frac (0..1): o unduire lentă proprie fiecărui fir (fără câmp comun de
 * rotație, fără tremur), în unități de amplitudine (înmulțite cu ~0,06 R în desen).
 */
export function introWobble(T: number, k: number, frac: number): [number, number] {
  const ph = hash(k, 17) * Math.PI * 2;
  const ts = T / 1000;
  // Variația de-a lungul firului e lentă (o arcuire, nu un S): sub o jumătate de perioadă pe toată lungimea.
  return [Math.sin(ts * 1.9 + ph + frac * 1.6), Math.cos(ts * 1.5 + ph * 1.7 + frac * 1.3)];
}

// ——— Literele (linia mediană, H = 1, y în jos; tușa 0,13 H; marginea exterioară a tușei atinge exact cutia literei) ———
type Seg = { kind: 'L'; to: [number, number] } | { kind: 'A'; c: [number, number]; r: number; a0: number; a1: number };
export interface StrokeDef {
  letter: 'A' | 'I' | 'R' | 'O' | 'N';
  from: [number, number];
  segs: Seg[];
}
const h = WM.stroke / 2;
const LETTERS: { letter: StrokeDef['letter']; adv: number; strokes: Omit<StrokeDef, 'letter'>[] }[] = (() => {
  // A: două picioare cu vârf comun și bara la 0,64 H (geometric, ferm).
  const ax = 0.86;
  const ay = 0.64;
  const k = (ay - h) / (1 - 2 * h);
  const axl = ax / 2 + (h - ax / 2) * k;
  // R: trunchi, bulă semicirculară în jumătatea de sus, picior drept oblic.
  const rw = 0.7;
  const rb = 0.23;
  const rx = rw - h - rb;
  // O: cerc adevărat (nu zero, nu elipsă îngustă).
  const or = 0.5 - h;
  // N: două trunchiuri și diagonala.
  const nw = 0.8;
  return [
    {
      letter: 'A',
      adv: ax,
      strokes: [
        { from: [h, 1 - h], segs: [{ kind: 'L', to: [ax / 2, h] }, { kind: 'L', to: [ax - h, 1 - h] }] },
        { from: [axl, ay], segs: [{ kind: 'L', to: [ax - axl, ay] }] },
      ],
    },
    { letter: 'I', adv: 0.14, strokes: [{ from: [0.07, h], segs: [{ kind: 'L', to: [0.07, 1 - h] }] }] },
    {
      letter: 'R',
      adv: rw,
      strokes: [
        { from: [h, h], segs: [{ kind: 'L', to: [h, 1 - h] }] },
        { from: [h, h], segs: [{ kind: 'L', to: [rx, h] }, { kind: 'A', c: [rx, h + rb], r: rb, a0: -Math.PI / 2, a1: Math.PI / 2 }, { kind: 'L', to: [h, h + 2 * rb] }] },
        { from: [0.34, h + 2 * rb], segs: [{ kind: 'L', to: [rw - h, 1 - h] }] },
      ],
    },
    {
      letter: 'O',
      adv: 1,
      strokes: [
        {
          from: [0.5, h],
          segs: [
            { kind: 'A', c: [0.5, 0.5], r: or, a0: -Math.PI / 2, a1: Math.PI / 2 },
            { kind: 'A', c: [0.5, 0.5], r: or, a0: Math.PI / 2, a1: (3 * Math.PI) / 2 },
          ],
        },
      ],
    },
    { letter: 'N', adv: nw, strokes: [{ from: [h, 1 - h], segs: [{ kind: 'L', to: [h, h] }, { kind: 'L', to: [nw - h, 1 - h] }, { kind: 'L', to: [nw - h, h] }] }] },
  ];
})();

/** Lățimea totală a cuvântului, în unități de H (litere + spații). */
export const WORDMARK_W = LETTERS.reduce((w, l) => w + l.adv, 0) + WM.gap * (LETTERS.length - 1);
/** Litera și cutia ei (x de start, lățimea), în ordinea cuvântului. */
export function wordmarkBoxes(): { letter: StrokeDef['letter']; x: number; w: number }[] {
  let x = 0;
  return LETTERS.map((l) => {
    const b = { letter: l.letter, x, w: l.adv };
    x += l.adv + WM.gap;
    return b;
  });
}

/** Tușele cuvântului, cu literele așezate la locul lor (coordonate absolute, în unități de H). */
export function wordmarkStrokes(): StrokeDef[] {
  const out: StrokeDef[] = [];
  for (const b of wordmarkBoxes()) {
    const l = LETTERS.find((x) => x.letter === b.letter)!;
    for (const s of l.strokes) {
      out.push({
        letter: l.letter,
        from: [s.from[0] + b.x, s.from[1]],
        segs: s.segs.map((g) => (g.kind === 'L' ? { kind: 'L', to: [g.to[0] + b.x, g.to[1]] } : { ...g, c: [g.c[0] + b.x, g.c[1]] })),
      });
    }
  }
  return out;
}

const f = (x: number, scale: number) => String(Math.round(x * scale * 1000) / 1000);
/** Căile SVG ale literelor (o cale pe literă), scalate (implicit ×100: viewBox „0 0 454 100”, stroke-width 13). */
export function wordmarkPaths(scale = 100): { letter: StrokeDef['letter']; d: string }[] {
  const byLetter = new Map<StrokeDef['letter'], string[]>();
  for (const s of wordmarkStrokes()) {
    let d = `M${f(s.from[0], scale)} ${f(s.from[1], scale)}`;
    for (const g of s.segs) {
      if (g.kind === 'L') d += ` L${f(g.to[0], scale)} ${f(g.to[1], scale)}`;
      else {
        const ex = g.c[0] + g.r * Math.cos(g.a1);
        const ey = g.c[1] + g.r * Math.sin(g.a1);
        const large = Math.abs(g.a1 - g.a0) > Math.PI ? 1 : 0;
        const sweep = g.a1 > g.a0 ? 1 : 0;
        d += ` A${f(g.r, scale)} ${f(g.r, scale)} 0 ${large} ${sweep} ${f(ex, scale)} ${f(ey, scale)}`;
      }
    }
    const arr = byLetter.get(s.letter) ?? [];
    arr.push(d);
    byLetter.set(s.letter, arr);
  }
  return Array.from(byLetter, ([letter, ds]) => ({ letter, d: ds.join(' ') }));
}

/** Tușa ca polilinie (arcele discretizate), cu lungimile cumulate: pentru eșantionare uniformă pe lungime. */
export interface Polyline {
  letter: StrokeDef['letter'];
  pts: [number, number][];
  cum: number[];
  length: number;
}
export function wordmarkPolylines(): Polyline[] {
  return wordmarkStrokes().map((s) => {
    const pts: [number, number][] = [s.from];
    for (const g of s.segs) {
      if (g.kind === 'L') pts.push(g.to);
      else {
        const n = Math.max(8, Math.ceil((Math.abs(g.a1 - g.a0) / (Math.PI * 2)) * 64));
        for (let i = 1; i <= n; i++) {
          const a = g.a0 + ((g.a1 - g.a0) * i) / n;
          pts.push([g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]);
        }
      }
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    return { letter: s.letter, pts, cum, length: cum[cum.length - 1]! };
  });
}
/** Punctul la distanța d (pe lungime) de-a lungul poliliniei. */
export function polylineAt(p: Polyline, d: number): [number, number] {
  const L = p.length;
  const dd = d <= 0 ? 0 : d >= L ? L : d;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i]! < dd) i++;
  const a = p.pts[i - 1]!;
  const b = p.pts[i]!;
  const seg = p.cum[i]! - p.cum[i - 1]!;
  const u = seg > 0 ? (dd - p.cum[i - 1]!) / seg : 0;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Bucata de literă a unui fir: tușa și intervalul ei de lungime. Nicio bucată nu trece de la o tușă la alta. */
export interface Chunk {
  stroke: number;
  letter: StrokeDef['letter'];
  from: number;
  to: number;
}
/**
 * Împărțirea tușelor între cele n fire: fiecare tușă primește cel puțin un fir (dacă n ≥ numărul tușelor), restul se dau
 * pe rând tușei cu cea mai mare lungime pe fir — determinist, aceeași împărțire la fiecare pornire.
 */
export function wordmarkChunks(n: number, polys = wordmarkPolylines()): Chunk[] {
  const m = polys.length;
  const count = new Array<number>(m).fill(0);
  if (n >= m) {
    count.fill(1);
    for (let left = n - m; left > 0; left--) {
      let best = 0;
      for (let i = 1; i < m; i++) if (polys[i]!.length / (count[i]! + 1) > polys[best]!.length / (count[best]! + 1)) best = i;
      count[best]!++;
    }
  } else {
    // Prea puține fire pentru toate tușele: cele mai lungi primesc câte un fir.
    const order = polys.map((p, i) => [p.length, i] as const).sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < n; i++) count[order[i]![1]] = 1;
  }
  const out: Chunk[] = [];
  polys.forEach((p, i) => {
    for (let c = 0; c < count[i]!; c++) out.push({ stroke: i, letter: p.letter, from: (p.length * c) / count[i]!, to: (p.length * (c + 1)) / count[i]! });
  });
  return out;
}

/** Eșantioanele S ale firului k (samples + 1 puncte, uniforme pe lungime), în unități de H: [x0, y0, x1, y1, …]. */
export function wordmarkSamples(n: number, samples: number): Float32Array[] {
  const polys = wordmarkPolylines();
  const chunks = wordmarkChunks(n, polys);
  return Array.from({ length: n }, (_, k) => {
    const out = new Float32Array((samples + 1) * 2);
    const c = chunks[k];
    if (!c) return out;
    const p = polys[c.stroke]!;
    for (let j = 0; j <= samples; j++) {
      const [x, y] = polylineAt(p, c.from + ((c.to - c.from) * j) / samples);
      out[2 * j] = x;
      out[2 * j + 1] = y;
    }
    return out;
  });
}
/** Lungimea bucății de literă a fiecărui fir (unități de H). */
export function wordmarkChunkLengths(n: number): Float32Array {
  const chunks = wordmarkChunks(n);
  return Float32Array.from({ length: n }, (_, k) => (chunks[k] ? chunks[k]!.to - chunks[k]!.from : 0));
}
/**
 * Cât din cercul firului e desfășurat la amestecul s: la s = 0 doar bucata de literă (lungimea ei raportată la
 * circumferință), la s = 1 tot cercul. Firul se „derulează” din literă și se așază pe sferă, în loc să devină un inel
 * mic care se umflă.
 */
export function introArc(s: number, chunkPx: number, circumferencePx: number): number {
  const l0 = Math.min(1, chunkPx / Math.max(1, circumferencePx));
  return l0 + (1 - l0) * s;
}

/**
 * Așezarea cuvântului pe ecran: lățimea ≈ 64% din lățimea ferestrei (între 60% și 68%), dar nu mai mult decât încape în
 * centrul liber al sferei (0,86 · diametru), centrul optic = centrul sferei din așezarea reală. Returnează H (px) și
 * colțul stânga-sus.
 */
export function wordmarkFit(vw: number, cx: number, cy: number, R: number): { H: number; W: number; x0: number; y0: number } {
  const lo = vw * WM.widthRange[0];
  const hi = vw * WM.widthRange[1];
  let W = Math.min(hi, Math.max(lo, vw * WM.widthFrac));
  W = Math.min(W, 2 * R * 0.86);
  const H = W / WORDMARK_W;
  return { H, W, x0: cx - W / 2, y0: cy - H / 2 };
}
