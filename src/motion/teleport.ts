// Coregrafia „teleportării” AIRON (auditul grafic din 20.10.2026): mesajul se naște din materia aplicației și se
// întoarce în ea. Aici doar timpii și formulele pure (testate); desenul e în apps/web/src/ui/Cosmic.tsx.
//
// Stări: idle → attract (chemare + convergență) → warp (curbare + impuls) → materialize → readable → dissolve → idle.
// Timpii sunt puncte de pornire de design, nu măsurători.

export type TeleportState = 'idle' | 'attract' | 'warp' | 'materialize' | 'readable' | 'dissolve';

/** Fazele vizibile (ms de la pornire), în ordinea din brief. */
export const PHASES = {
  chemare: [0, 180],
  convergenta: [180, 420],
  curbare: [420, 550],
  materializare: [550, 900],
  mesaj: [900, 1100],
} as const;
export type PhaseName = keyof typeof PHASES | 'repaus' | 'reintegrare';
export const PHASE_LABEL: Record<PhaseName, string> = {
  chemare: 'Chemare',
  convergenta: 'Convergență',
  curbare: 'Curbare + impuls',
  materializare: 'Materializare',
  mesaj: 'Mesaj',
  repaus: 'Repaus',
  reintegrare: 'Reintegrare',
};
/** Reintegrarea la închidere (ms). */
export const DISSOLVE_MS = 650;
/** Varianta scurtă, pentru ferestrele deschise des (ședințe, rețete): din punctul atingerii. */
export const SHORT_OPEN_MS = 420;

export function stateAt(t: number, out: number | null): TeleportState {
  if (out != null) return out >= DISSOLVE_MS ? 'idle' : 'dissolve';
  if (t < PHASES.convergenta[1]) return 'attract';
  if (t < PHASES.curbare[1]) return 'warp';
  if (t < PHASES.materializare[1]) return 'materialize';
  return 'readable';
}

export function phaseAt(t: number, out: number | null): PhaseName {
  if (out != null) return 'reintegrare';
  for (const k of Object.keys(PHASES) as (keyof typeof PHASES)[]) if (t < PHASES[k][1]) return k;
  return 'repaus';
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Progresul 0..1 într-un interval [a, b]. */
export const span = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;

/**
 * Scara membranei la materializare: pornește mică, trece ușor peste echilibru și se calmează (oscilație amortizată).
 * u = 0..1 în faza de materializare; după faza aceasta rămâne 1.
 */
export function membraneScale(u: number): number {
  if (u <= 0) return 0.55;
  if (u >= 1) return 1;
  return 1 - 0.45 * Math.exp(-5.2 * u) * Math.cos(7.5 * u);
}

/** Opacitatea textului: apare doar după stabilizarea recipientului; la închidere dispare primul (în ~180 ms). */
export function textAlpha(t: number, out: number | null): number {
  const inA = easeOut(span(t, PHASES.mesaj));
  if (out == null) return inA;
  return inA * (1 - clamp01(out / 180));
}

/** Cât de prezent e recipientul (0..1): crește la materializare, se desface la reintegrare (după text). */
export function shellPresence(t: number, out: number | null): number {
  const inP = easeInOut(span(t, PHASES.materializare));
  if (out == null) return inP;
  return inP * (1 - easeIn(clamp01((out - 100) / 380)));
}

/** Lumina bulei de Acasă: cedează la chemare, revine când energia ajunge înapoi (a doua jumătate a reintegrării). */
export function homeLight(t: number, out: number | null): number {
  const yielded = 1 - 0.78 * easeOut(span(t, PHASES.chemare));
  if (out == null) return yielded;
  return yielded + (1 - yielded) * easeInOut(clamp01((out - DISSOLVE_MS * 0.45) / (DISSOLVE_MS * 0.55)));
}

/**
 * Lentila locală (doar pe stratul decorativ): cât de tare e trasă textura spre nucleu (0..1), un singur puls.
 * Impulsul: raza undei moi care pleacă spre exterior după tragere (0..1 din distanța maximă), sau null dacă nu e activ.
 */
export function lensPull(t: number): number {
  const u = span(t, [PHASES.convergenta[1] - 60, PHASES.curbare[0] + 70]);
  const back = span(t, [PHASES.curbare[0] + 70, PHASES.curbare[1] + 60]);
  return Math.sin((Math.PI / 2) * u) * (1 - easeOut(back));
}
export function impulse(t: number): number | null {
  const u = span(t, [PHASES.curbare[0] + 60, PHASES.materializare[0] + 260]);
  return u <= 0 || u >= 1 ? null : easeOut(u);
}

/** Particula „i” pornește cu o întârziere proprie în convergență: nu apar toate deodată. */
export function particleArrival(t: number, delay: number, speed: number): number {
  const [a, b] = PHASES.convergenta;
  const start = PHASES.chemare[1] - 30 + delay * (b - a) * 0.55;
  const dur = (b - a) * (0.55 + 0.6 * (1 - speed)) + 120;
  return easeInOut(clamp01((t - start) / dur));
}

/**
 * Vălul întâmpinării (cererea proprietarului, 20.10.2026): cât mesajul e pe ecran, Acasă abia se întrezărește
 * (~7–8% vizibil); la tranziția spre Acasă vălul se ridică treptat, până la clar, odată cu reintegrarea.
 */
export const WELCOME_VEIL = 0.925;
export function welcomeVeil(out: number | null): number {
  if (out == null) return WELCOME_VEIL;
  return WELCOME_VEIL * (1 - easeInOut(clamp01(out / DISSOLVE_MS)));
}
