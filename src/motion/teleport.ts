// Coregrafia „teleportării” AIRON — brief vizual v2 (20.10.2026, „Teleportare lentă, dizolvare 03”), care înlocuiește
// timpii și regula de vizibilitate a Acasă din auditul anterior. Aici doar timpii, stările și formulele pure (testate);
// desenul e în apps/web/src/ui/Cosmic.tsx. Timpii sunt propuneri de design, nu măsurători.
//
// Stări: covered → attract → warp → materialize → readable → dissolve → revealHome → idle.
// Până la revealHome fundalul cosmic e 100% opac: Acasă nu se vede deloc (nici bula, nici cardurile, nici navigația).

export type TeleportState = 'covered' | 'attract' | 'warp' | 'materialize' | 'readable' | 'dissolve' | 'revealHome' | 'idle';

/** Intrarea (ms de la pornire). */
export const PHASES = {
  liniste: [0, 450],
  convergenta: [450, 1050],
  deformare: [1050, 1450],
  impuls: [1300, 1480],
  condensare: [1450, 2200],
  mesaj: [2200, 2500],
} as const;
/** Ieșirea (ms de la „Continuă”). */
export const EXIT = {
  estompare: [0, 250],
  deschidere: [250, 900],
  fragmentare: [900, 1900],
  ecou: [1900, 2600],
  dezvaluire: [2600, 3100],
} as const;
export const ENTRY_MS = PHASES.mesaj[1];
/** Dizolvarea (până începe dezvăluirea Acasă). */
export const DISSOLVE_MS = EXIT.ecou[1];
/** Totalul ieșirii, cu dezvăluirea Acasă. */
export const EXIT_MS = EXIT.dezvaluire[1];
/** „Sari peste”: ajunge la Acasă repede, fără resturi. */
export const SKIP_MS = 200;
/** „Mișcare redusă”: o tranziție simplă. */
export const REDUCED_MS = 180;
/** Varianta scurtă, pentru ferestrele deschise des (ședințe, rețete): din punctul atingerii. */
export const SHORT_OPEN_MS = 420;
/** Shake-ul: o singură tresărire a scenei decorative (nu a textului), ~2 px, ~180 ms, două oscilații amortizate. */
export const SHAKE = { at: PHASES.impuls[0], ms: 180, px: 2 } as const;

export type PhaseName = keyof typeof PHASES | 'repaus' | keyof typeof EXIT;
export const PHASE_LABEL: Record<PhaseName, string> = {
  liniste: 'Liniște / chemare',
  convergenta: 'Convergență',
  deformare: 'Deformare',
  impuls: 'Impuls + shake',
  condensare: 'Condensare',
  mesaj: 'Mesaj',
  repaus: 'Repaus',
  estompare: 'Textul se stinge',
  deschidere: 'Membrana se deschide',
  fragmentare: 'Panglici → picături',
  ecou: 'Ecou',
  dezvaluire: 'Acasă apare',
};

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Progresul 0..1 într-un interval [a, b]. */
export const span = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;

export function stateAt(t: number, out: number | null): TeleportState {
  if (out != null) return out >= EXIT_MS ? 'idle' : out >= DISSOLVE_MS ? 'revealHome' : 'dissolve';
  if (t < PHASES.liniste[1]) return 'covered';
  if (t < PHASES.convergenta[1]) return 'attract';
  if (t < PHASES.deformare[1]) return 'warp';
  if (t < PHASES.condensare[1]) return 'materialize';
  return 'readable';
}

export function phaseAt(t: number, out: number | null): PhaseName {
  if (out != null) {
    for (const k of Object.keys(EXIT) as (keyof typeof EXIT)[]) if (out < EXIT[k][1]) return k;
    return 'dezvaluire';
  }
  if (t >= PHASES.impuls[0] && t < PHASES.impuls[1]) return 'impuls';
  for (const k of ['liniste', 'convergenta', 'deformare', 'condensare', 'mesaj'] as const) if (t < PHASES[k][1]) return k;
  return 'repaus';
}

/**
 * Opacitatea scenei cosmice (fundal + tot ce e în ea): 1 până la revealHome, apoi Acasă apare în ~500 ms.
 * Nu se animă opacitatea scenei cât timp se dizolvă recipientul.
 */
export function sceneOpacity(out: number | null): number {
  if (out == null || out < DISSOLVE_MS) return 1;
  return 1 - easeInOut(span(out, EXIT.dezvaluire));
}

/** Opacitatea textului: apare după condensare; la „Continuă” dispare primul (în 250 ms). */
export function textAlpha(t: number, out: number | null): number {
  const inA = easeOut(span(t, PHASES.mesaj));
  if (out == null) return inA;
  return inA * (1 - span(out, EXIT.estompare));
}

/** Scara membranei la condensare: pornește mică, trece ușor peste echilibru și se calmează. */
export function membraneScale(u: number): number {
  if (u <= 0) return 0.55;
  if (u >= 1) return 1;
  return 1 - 0.45 * Math.exp(-5.2 * u) * Math.cos(7.5 * u);
}

/** Cât de prezentă e membrana (0..1) la intrare. La ieșire se deschide pe segmente (openAt), nu printr-un fade global. */
export function membranePresence(t: number): number {
  return easeInOut(span(t, [PHASES.condensare[0] + 100, PHASES.condensare[1]]));
}

/**
 * Momentul (ms de la „Continuă”) la care se desface un punct al membranei, după unghiul lui față de latura care cedează
 * prima: lângă ea la ~250 ms, pe partea opusă la ~900 ms (o zonă de sticlă rămâne recognoscibilă mai mult).
 */
export function openAt(theta: number, openSide: number): number {
  let d = Math.abs(theta - openSide) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  const [a, b] = EXIT.deschidere;
  return a + (b - a) * Math.pow(d / Math.PI, 1.2);
}

/** Lentila locală: cât de tare e tras câmpul spre nucleu (0..1), crește lin și scade amortizat. */
export function lensPull(t: number): number {
  const [a, b] = PHASES.deformare;
  const up = span(t, [a - 100, a + (b - a) * 0.7]);
  const down = span(t, [a + (b - a) * 0.7, b + 350]);
  return Math.sin((Math.PI / 2) * up) * (1 - easeOut(down));
}

/** Impulsul: raza undei moi (0..1) sau null în afara lui. Un singur val. */
export function impulse(t: number): number | null {
  const u = span(t, [PHASES.impuls[0], PHASES.impuls[0] + 700]);
  return u <= 0 || u >= 1 ? null : easeOut(u);
}

/** Shake-ul scenei decorative: deplasarea (px CSS) la momentul t; 0 în afara celor ~180 ms. */
export function shakeAt(t: number): { x: number; y: number } {
  const u = (t - SHAKE.at) / SHAKE.ms;
  if (u < 0 || u > 1) return { x: 0, y: 0 };
  const damp = Math.exp(-3.2 * u) * (1 - u);
  return { x: SHAKE.px * damp * Math.sin(2 * Math.PI * 2 * u), y: SHAKE.px * 0.6 * damp * Math.sin(2 * Math.PI * 2 * u + 1.3) };
}

/** Sosirea particulei „i” în nucleu, la convergență: întârzieri și viteze diferite, fără îngrămădire instantanee. */
export function particleArrival(t: number, delay: number, speed: number): number {
  const [a, b] = PHASES.convergenta;
  const start = a + delay * (b - a) * 0.6;
  const dur = (b - a) * (0.5 + 0.4 * (1 - speed));
  return easeInOut(clamp01((t - start) / dur));
}

/** Respirația formei în repaus: o perioadă de ~10 s (8–12 s cerut). */
export const BREATH_PERIOD_S = 10;

/**
 * Deschiderea membranei ca front care traversează forma dinspre latura care cedează (s = proiecția punctului pe
 * direcția de deschidere, -R…+R): punctele de pe latura deschisă (s ≈ +R) se eliberează la ~250 ms, cele de pe partea
 * opusă la ~900 ms. Același front decide sticla, conturul și particulele (o singură simulare).
 */
export function releaseAt(s: number, R: number): number {
  const [a, b] = EXIT.deschidere;
  return a + (b - a) * clamp01((1.15 * R - s) / (2.3 * R));
}
/** Poziția frontului la momentul out (aceeași axă ca releaseAt). */
export function openFront(out: number, R: number): number {
  return 1.15 * R - 2.3 * R * span(out, EXIT.deschidere);
}
