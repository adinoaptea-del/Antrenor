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
export function releaseAt(s: number, R: number, range: readonly [number, number] = EXIT.deschidere): number {
  const [a, b] = range;
  return a + (b - a) * clamp01((1.15 * R - s) / (2.3 * R));
}
/** Poziția frontului la momentul out (aceeași axă ca releaseAt). */
export function openFront(out: number, R: number, range: readonly [number, number] = EXIT.deschidere): number {
  return 1.15 * R - 2.3 * R * span(out, range);
}

// ——— Transferul spre bula Acasă (cererea proprietarului, 20.10.2026) ———
// La încheierea întâmpinării, dacă bula de Acasă există: textul se stinge, forma se descompune dintr-o parte (cea
// dinspre bulă), iar particulele desprinse curg pe arce spre orbita bulei reale și o construiesc. Descompunerea și
// construcția sunt simultane: construcția = cât din materie a ajuns. Apoi apar antrenamentele din bulă, apoi restul.
export const TRANSFER = {
  estompare: [0, 300],
  desprindere: [300, 1300],
  transfer: [300, 2900],
  continut: [2900, 3400],
  interfata: [3400, 3900],
} as const;
export const TRANSFER_MS = TRANSFER.interfata[1];
export type TransferPhase = keyof typeof TRANSFER;
export const TRANSFER_LABEL: Record<TransferPhase, string> = {
  estompare: 'Mesajul se stinge',
  desprindere: 'Forma se desprinde',
  transfer: 'Transfer spre bulă',
  continut: 'Antrenamentele apar',
  interfata: 'Restul interfeței',
};
export function transferPhaseAt(out: number): TransferPhase {
  if (out < TRANSFER.estompare[1]) return 'estompare';
  if (out < TRANSFER.desprindere[1]) return 'desprindere';
  if (out < TRANSFER.transfer[1]) return 'transfer';
  if (out < TRANSFER.continut[1]) return 'continut';
  return 'interfata';
}
/** Drumul unei particule (0..1): pleacă la rel, ajunge după dur, cu accelerare și încetinire line. */
export function travel(out: number, rel: number, dur: number): number {
  return easeInOut(clamp01((out - rel) / dur));
}
/** Durata drumului: ajunge cel târziu la sfârșitul transferului, oricând ar pleca. */
export function travelDur(rel: number, base: number): number {
  return Math.max(500, Math.min(base, TRANSFER.transfer[1] - rel));
}
/** Conținutul bulei (antrenamentele zilei): 0 până e formată, apoi apare lin. */
export function contentAlpha(out: number): number {
  return easeInOut(span(out, TRANSFER.continut));
}
/** Fundalul cosmic: opac până se arată restul interfeței; apoi se ridică lin. */
export function transferSceneOpacity(out: number): number {
  return 1 - easeInOut(span(out, TRANSFER.interfata));
}

// ——— Întâmpinarea ca sferă vie (cererea proprietarului, 20.10.2026, „Welcome → Home”) ———
// Întâmpinarea folosește sfera de pe Acasă (aceleași particule, fără lichid sau sticlă). La „Continuă”: fundalul se
// curbează discret spre sferă, o undă de relaxare și o vibrație scurtă amortizată; mesajul se stinge; apoi sfera se
// descompune progresiv dinspre bula de Acasă, iar particulele desprinse călătoresc pe curbe și o construiesc. Timpii
// sunt de pornire, de ajustat vizual.
export const SPHERE_EXIT = {
  curbare: [0, 650],
  unda: [600, 1000],
  estompare: [700, 1000],
  desprindere: [1000, 2900],
  transfer: [1000, 4100],
  continut: [3950, 4400],
  interfata: [4300, 4950],
} as const;
export const SPHERE_EXIT_MS = SPHERE_EXIT.interfata[1];
export const SPHERE_SHAKE_AT = 680;
export type SpherePhase = 'curbare' | 'unda' | 'estompare' | 'desprindere' | 'transfer' | 'continut' | 'interfata';
export const SPHERE_LABEL: Record<SpherePhase, string> = {
  curbare: 'Spațiul se curbează',
  unda: 'Undă + vibrație',
  estompare: 'Mesajul se stinge',
  desprindere: 'Sfera se desprinde',
  transfer: 'Materia ajunge în bulă',
  continut: 'Antrenamentele apar',
  interfata: 'Restul interfeței',
};
export function spherePhaseAt(out: number): SpherePhase {
  if (out < SPHERE_EXIT.unda[0]) return 'curbare';
  if (out < SPHERE_EXIT.estompare[0]) return 'unda';
  if (out < SPHERE_EXIT.estompare[1]) return 'estompare';
  if (out < SPHERE_EXIT.desprindere[1]) return 'desprindere';
  if (out < SPHERE_EXIT.transfer[1]) return 'transfer';
  if (out < SPHERE_EXIT.interfata[0]) return 'continut';
  return 'interfata';
}
/** Curbarea spațiului spre sferă (0..1), înainte de desprindere; se relaxează lin. */
export function sphereLens(out: number): number {
  const up = span(out, [0, 520]);
  const down = span(out, [520, 1000]);
  return Math.sin((Math.PI / 2) * up) * (1 - easeOut(down));
}
/** Unda de relaxare (raza 0..1) sau null. */
export function sphereWave(out: number): number | null {
  const u = span(out, [SPHERE_EXIT.unda[0], SPHERE_EXIT.unda[0] + 800]);
  return u <= 0 || u >= 1 ? null : easeOut(u);
}
/** Vibrația scurtă, amortizată (doar decorul). */
export function sphereShake(out: number): { x: number; y: number } {
  return shakeAt(SHAKE.at + (out - SPHERE_SHAKE_AT));
}
/** Textul: lizibil în timpul curbării, se stinge înaintea transferului. */
export function sphereTextAlpha(t: number, out: number | null): number {
  return textAlpha(t, null) * (out == null ? 1 : 1 - span(out, SPHERE_EXIT.estompare));
}
/** Când pleacă particula, după poziția ei pe direcția spre bulă (s, -R…+R): întâi partea dinspre bulă. */
export function sphereRelease(s: number, R: number, jitter = 0): number {
  return releaseAt(s, R, SPHERE_EXIT.desprindere) + jitter;
}
/** Durata drumului: ajunge cel târziu la sfârșitul transferului. */
export function sphereTravelDur(rel: number, base: number): number {
  return Math.max(600, Math.min(base, SPHERE_EXIT.transfer[1] - rel));
}
export function sphereContentAlpha(out: number): number {
  return easeInOut(span(out, SPHERE_EXIT.continut));
}
export function sphereSceneOpacity(out: number | null): number {
  return out == null ? 1 : 1 - easeInOut(span(out, SPHERE_EXIT.interfata));
}

// ——— Întâmpinarea „furtună” (cererea proprietarului, 20.10.2026, 11:07) ———
// Sfera de întâmpinare se formează din sute de mii de particule venite de peste tot, exact pe locul bulei de Acasă.
// Fără „boom” și fără shake: fiecare etapă e o curbă lină care se suprapune cu următoarea (nicio treaptă). La trecerea
// spre Acasă, un vârtej (ca o furtună de nisip: haotic, dar estetic) descompune sfera și recompune, pe același loc,
// bula reală de Acasă. Timpi de pornire, de ajustat vizual.
export const STORM_IN = {
  praf: [0, 700],
  adunare: [400, 3300],
  forma: [2800, 3900],
  mesaj: [3400, 4200],
} as const;
export const STORM_READY_MS = 3900;
export const STORM_OUT = {
  stinge: [0, 700],
  vartej: [300, 1900],
  recompunere: [1900, 3900],
  preluare: [2600, 4300],
  continut: [4300, 4900],
  interfata: [4700, 5400],
} as const;
export const STORM_OUT_MS = STORM_OUT.interfata[1];
export type StormPhase = keyof typeof STORM_IN | 'repaus' | keyof typeof STORM_OUT;
export const STORM_LABEL: Record<StormPhase, string> = {
  praf: 'Praf în spațiu',
  adunare: 'Particulele se adună',
  forma: 'Sfera prinde formă',
  mesaj: 'Mesajul',
  repaus: 'Repaus',
  stinge: 'Mesajul se stinge',
  vartej: 'Vârtejul crește',
  recompunere: 'Vârtejul recompune bula',
  preluare: 'Bula de Acasă preia',
  continut: 'Antrenamentele apar',
  interfata: 'Restul interfeței',
};
export function stormPhaseAt(t: number, out: number | null): StormPhase {
  if (out == null) {
    if (t < STORM_IN.praf[1]) return 'praf';
    if (t < STORM_IN.forma[0]) return 'adunare';
    if (t < STORM_IN.mesaj[0]) return 'forma';
    if (t < STORM_IN.mesaj[1]) return 'mesaj';
    return 'repaus';
  }
  if (out < STORM_OUT.vartej[0]) return 'stinge';
  if (out < STORM_OUT.vartej[1]) return 'vartej';
  if (out < STORM_OUT.preluare[0]) return 'recompunere';
  if (out < STORM_OUT.continut[0]) return 'preluare';
  if (out < STORM_OUT.interfata[0]) return 'continut';
  return 'interfata';
}
/** Energia vârtejului (0..1): crește lin, apoi se stinge lin; un singur clopot, fără trepte. */
export function stormEnergy(out: number | null): number {
  if (out == null) return 0;
  return easeInOut(span(out, STORM_OUT.vartej)) * (1 - easeInOut(span(out, STORM_OUT.recompunere)));
}
/** Rotația acumulată a vârtejului (rad): integrala vitezei unghiulare (proporțională cu energia), deci pornește și se oprește lin. */
export function stormSpin(out: number | null, maxRadPerS = 6.5): number {
  if (out == null || out <= STORM_OUT.vartej[0]) return 0;
  const end = Math.min(out, STORM_OUT.recompunere[1]);
  let acc = 0;
  const step = 10;
  for (let x = STORM_OUT.vartej[0]; x < end; x += step) acc += stormEnergy(x + step / 2) * maxRadPerS * (Math.min(step, end - x) / 1000);
  return acc;
}
export function stormTextAlpha(t: number, out: number | null): number {
  return easeInOut(span(t, STORM_IN.mesaj)) * (out == null ? 1 : 1 - easeInOut(span(out, STORM_OUT.stinge)));
}
/** Corpul sferei (halou, membrană): apare la formă, pleacă lin când pornește vârtejul. */
export function stormBody(t: number, out: number | null): number {
  return easeInOut(span(t, STORM_IN.forma)) * (out == null ? 1 : 1 - easeInOut(span(out, [200, 1400])));
}
/** Particulele furtunii se sting cât bula reală le preia locul. */
export function stormParticleFade(out: number | null): number {
  return out == null ? 1 : 1 - easeInOut(span(out, [3700, 4700]));
}
/** Cât din bula reală de Acasă e construită (volum + particule). */
export function stormHomeBuild(out: number | null): number {
  return out == null ? 0 : easeInOut(span(out, STORM_OUT.preluare));
}
export function stormContentAlpha(out: number | null): number {
  return out == null ? 0 : easeInOut(span(out, STORM_OUT.continut));
}
export function stormSceneOpacity(out: number | null): number {
  return out == null ? 1 : 1 - easeInOut(span(out, STORM_OUT.interfata));
}

/** Lumina recompunerii: particulele rămân vizibile cât se adună înapoi în sferă, până preia bula reală (fără gol întunecat). */
export function stormRecomposeGlow(out: number | null): number {
  if (out == null) return 0;
  return easeInOut(span(out, [1400, 2600])) * (1 - easeInOut(span(out, [3300, 4500])));
}
