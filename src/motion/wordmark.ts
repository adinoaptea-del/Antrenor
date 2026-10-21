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
  /** Grosimea de referință a tușei (unități de H; literele au grosimile lor măsurate, 0,149–0,17). */
  stroke: 0.165,
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

// ——— Literele: construcția din imaginea de referință a ghidului (măsurată pe pixeli; H = 1 = înălțimea majusculei, y în jos) ———
// Tușe drepte (capete tăiate, îmbinări ascuțite), fiecare literă decupată în cutia ei: vârful lui A e retezat de linia
// majusculei, picioarele și tălpile sunt tăiate drept de linia de bază, diagonala lui N taie colțurile trunchiurilor.
// Semnele distinctive: A fără bară — o bară scurtă pe piciorul stâng (capăt liber) cu o tăietură orizontală subțire sub
// ea; O e un inel deschis printr-o fantă oblică (≈ 28°) în stânga, puțin deasupra mijlocului; N are diagonala la ≈ 43°.
export type Letter = 'A' | 'I' | 'R' | 'O' | 'N';
type Seg = { kind: 'L'; to: [number, number] } | { kind: 'A'; c: [number, number]; r: number; a0: number; a1: number };
export type Poly = [number, number][];
export interface StrokeDef {
  letter: Letter;
  from: [number, number];
  segs: Seg[];
  /** Grosimea tușei (unități de H). */
  w: number;
  /** Decuparea (evenodd): primul poligon = zona vizibilă, următoarele = găuri (fantele). Coordonate absolute. */
  clip: Poly[];
}
interface LetterDef {
  letter: Letter;
  /** Lățimea cutiei (marginile exterioare ale tușelor). */
  w: number;
  strokes: Omit<StrokeDef, 'letter'>[];
}
const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
/** Dreptunghi rotit: centrul, direcția (unghi, rad), jumătatea lungimii și jumătatea lățimii. */
const band = (cx: number, cy: number, ang: number, hl: number, hw: number): Poly => {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  return [
    [cx - ux * hl - nx * hw, cy - uy * hl - ny * hw],
    [cx + ux * hl - nx * hw, cy + uy * hl - ny * hw],
    [cx + ux * hl + nx * hw, cy + uy * hl + ny * hw],
    [cx - ux * hl + nx * hw, cy - uy * hl + ny * hw],
  ];
};
/** Tăierea unui poligon convex cu semiplanul a·x + b·y ≤ c (Sutherland–Hodgman, o singură muchie). */
const halfPlane = (poly: Poly, a: number, b: number, c: number): Poly => {
  const out: Poly = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
};

const LETTERS: LetterDef[] = (() => {
  // A: cutia 1,00 H; picioare la 22,4° (tușă 0,16), vârful la linia majusculei (capul plat ≈ 0,17 H), tălpile la
  // x = 0,087 și 0,913; bara scurtă pe piciorul stâng la y ∈ [0,577; 0,731], capăt liber la x = 0,567; tăietura
  // orizontală a piciorului stâng chiar sub bară, y ∈ [0,722; 0,781].
  const aw = 0.16;
  const slope = 0.413;
  const ext = 0.1; // prelungire dincolo de linia majusculei / de bază: decuparea taie drept
  const A: LetterDef = {
    letter: 'A',
    w: 1,
    strokes: [
      { from: [0.087 - slope * ext, 1 + ext], segs: [{ kind: 'L', to: [0.5 + slope * ext, -ext] }], w: aw, clip: [rect(0, 0, 1, 1), rect(-0.05, 0.722, 0.42, 0.781)] },
      { from: [0.913 + slope * ext, 1 + ext], segs: [{ kind: 'L', to: [0.5 - slope * ext, -ext] }], w: aw, clip: [rect(0, 0, 1, 1)] },
      { from: [0.23, 0.654], segs: [{ kind: 'L', to: [0.567, 0.654] }], w: aw, clip: [rect(0, 0, 1, 1)] },
    ],
  };
  // I: un trunchi de 0,17.
  const I: LetterDef = { letter: 'I', w: 0.17, strokes: [{ from: [0.085, -ext], segs: [{ kind: 'L', to: [0.085, 1 + ext] }], w: 0.17, clip: [rect(0, 0, 0.17, 1)] }] };
  // R: cutia 0,787; trunchi; bula = linie dreaptă sus, semicerc (r = 0,2265) în dreapta, linie dreaptă înapoi la
  // y = 0,538; piciorul pleacă de pe linia de jos a bulei (x = 0,375) la 33,7°, tăiat drept de linia de bază.
  const rw = 0.17;
  const rb = 0.2265;
  const rx = 0.401;
  const R: LetterDef = {
    letter: 'R',
    w: 0.787,
    strokes: [
      { from: [0.085, -ext], segs: [{ kind: 'L', to: [0.085, 1 + ext] }], w: rw, clip: [rect(0, 0, 0.787, 1)] },
      {
        from: [0.085, 0.085],
        segs: [{ kind: 'L', to: [rx, 0.085] }, { kind: 'A', c: [rx, 0.085 + rb], r: rb, a0: -Math.PI / 2, a1: Math.PI / 2 }, { kind: 'L', to: [0.085, 0.085 + 2 * rb] }],
        w: rw,
        clip: [rect(0, 0, 0.787, 1)],
      },
      { from: [0.375, 0.085 + 2 * rb], segs: [{ kind: 'L', to: [0.683 + 0.667 * ext, 1 + ext] }], w: rw, clip: [rect(0, 0, 0.787, 1)] },
    ],
  };
  // O: inel (raza exterioară 0,521, tușă 0,17, raza mediană 0,435), centrat la 0,5 (depășește puțin liniile), deschis
  // printr-o fantă oblică (28°, lată 0,178) centrată pe inel, în stânga, la 0,048 deasupra mijlocului.
  const orc = 0.435;
  const ocx = 0.521;
  const gapAng = Math.asin(0.048 / orc);
  const O: LetterDef = {
    letter: 'O',
    w: 1.042,
    strokes: [
      {
        from: [ocx + orc * Math.cos(Math.PI + 0.23), 0.5 + orc * Math.sin(Math.PI + 0.23)],
        segs: [{ kind: 'A', c: [ocx, 0.5], r: orc, a0: Math.PI + 0.23, a1: 3 * Math.PI - 0.01 }],
        w: 0.17,
        clip: [rect(-0.05, -0.08, 1.09, 1.08), band(ocx - orc * Math.cos(gapAng), 0.5 - 0.048, (28 * Math.PI) / 180, 0.3, 0.089)],
      },
    ],
  };
  // N: cutia 0,788; trunchiuri de 0,155; diagonala (0,149) pe linia x = 0,922·y − 0,0505 — marginea ei de jos trece prin
  // (0,051; 0) și taie vârful trunchiului stâng, marginea de sus prin (0,77; 1) și taie baza trunchiului drept.
  const nb = 0.788;
  const nw = 0.155;
  const nbox = rect(0, 0, nb, 1);
  const N: LetterDef = {
    letter: 'N',
    w: nb,
    strokes: [
      // trunchiul stâng: doar la stânga marginii de jos a diagonalei (x − 0,922·y ≤ 0,051)
      { from: [nw / 2, -ext], segs: [{ kind: 'L', to: [nw / 2, 1 + ext] }], w: nw, clip: [halfPlane(nbox, 1, -0.922, 0.051)] },
      { from: [0.922 * -ext - 0.0505, -ext], segs: [{ kind: 'L', to: [0.922 * (1 + ext) - 0.0505, 1 + ext] }], w: 0.149, clip: [nbox] },
      // trunchiul drept: doar la dreapta marginii de sus a diagonalei (x − 0,922·y ≥ −0,152)
      { from: [nb - nw / 2, -ext], segs: [{ kind: 'L', to: [nb - nw / 2, 1 + ext] }], w: nw, clip: [halfPlane(nbox, -1, 0.922, 0.152)] },
    ],
  };
  return [A, I, R, O, N];
})();
/** Poziția fiecărei litere (marginea stângă a cutiei), măsurată în imaginea de referință: spațiere optică, nu uniformă. */
const LETTER_X: Record<Letter, number> = { A: 0, I: 1.54, R: 2.327, O: 3.556, N: 5.135 };

/** Lățimea totală a cuvântului, în unități de H. */
export const WORDMARK_W = LETTER_X.N + LETTERS[4]!.w;
/** Litera și cutia ei (x de start, lățimea), în ordinea cuvântului. */
export function wordmarkBoxes(): { letter: Letter; x: number; w: number }[] {
  return LETTERS.map((l) => ({ letter: l.letter, x: LETTER_X[l.letter], w: l.w }));
}

const shift = (p: [number, number], dx: number): [number, number] => [p[0] + dx, p[1]];
/** Tușele cuvântului, cu literele așezate la locul lor (coordonate absolute, în unități de H). */
export function wordmarkStrokes(): StrokeDef[] {
  const out: StrokeDef[] = [];
  for (const l of LETTERS) {
    const dx = LETTER_X[l.letter];
    for (const s of l.strokes) {
      out.push({
        letter: l.letter,
        from: shift(s.from, dx),
        segs: s.segs.map((g) => (g.kind === 'L' ? { kind: 'L', to: shift(g.to, dx) } : { ...g, c: shift(g.c, dx) })),
        w: s.w,
        clip: s.clip.map((poly) => poly.map((p) => shift(p, dx))),
      });
    }
  }
  return out;
}

const f = (x: number, scale: number) => String(Math.round(x * scale * 1000) / 1000);
const polyD = (poly: Poly, scale: number) => `M${poly.map((p) => `${f(p[0], scale)} ${f(p[1], scale)}`).join(' L')} Z`;
/** Calea SVG a unei tușe (linia mediană), scalată. */
export function strokePath(s: StrokeDef, scale = 100): string {
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
  return d;
}
/** Calea SVG a decupării (evenodd), scalată. */
export function clipPath(s: StrokeDef, scale = 100): string {
  return s.clip.map((poly) => polyD(poly, scale)).join(' ');
}
/**
 * Căile SVG ale cuvântului: fiecare tușă cu grosimea și decuparea ei (implicit ×100: viewBox „0 0 592 100”).
 * Se desenează cu stroke-linecap="butt", stroke-linejoin="miter", fill="none".
 */
export function wordmarkPaths(scale = 100): { letter: Letter; d: string; width: number; clip: string }[] {
  return wordmarkStrokes().map((s) => ({ letter: s.letter, d: strokePath(s, scale), width: s.w * scale, clip: clipPath(s, scale) }));
}

/** Tușa ca polilinie (arcele discretizate), cu lungimile cumulate: pentru eșantionare uniformă pe lungime. */
export interface Polyline {
  letter: Letter;
  pts: [number, number][];
  cum: number[];
  length: number;
  w: number;
  clip: Poly[];
}
export function wordmarkPolylines(): Polyline[] {
  return wordmarkStrokes().map((s) => {
    const pts: [number, number][] = [s.from];
    for (const g of s.segs) {
      if (g.kind === 'L') pts.push(g.to);
      else {
        const n = Math.max(8, Math.ceil((Math.abs(g.a1 - g.a0) / (Math.PI * 2)) * 96));
        for (let i = 1; i <= n; i++) {
          const a = g.a0 + ((g.a1 - g.a0) * i) / n;
          pts.push([g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]);
        }
      }
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    return { letter: s.letter, pts, cum, length: cum[cum.length - 1]!, w: s.w, clip: s.clip };
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
  letter: Letter;
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

/** Bucățile vecine se suprapun puțin (unități de H): la îmbinările capetelor drepte nu rămâne o linie subțire de fundal. */
export const CHUNK_OVERLAP = 0.02;
/** Eșantioanele S ale firului k (samples + 1 puncte, uniforme pe lungime), în unități de H: [x0, y0, x1, y1, …]. */
export function wordmarkSamples(n: number, samples: number): Float32Array[] {
  const polys = wordmarkPolylines();
  const chunks = wordmarkChunks(n, polys);
  return Array.from({ length: n }, (_, k) => {
    const out = new Float32Array((samples + 1) * 2);
    const c = chunks[k];
    if (!c) return out;
    const p = polys[c.stroke]!;
    const from = Math.max(0, c.from - CHUNK_OVERLAP);
    const to = Math.min(p.length, c.to + CHUNK_OVERLAP);
    for (let j = 0; j <= samples; j++) {
      const [x, y] = polylineAt(p, from + ((to - from) * j) / samples);
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
