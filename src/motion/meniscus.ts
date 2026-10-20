// Capătul lichidului din tuburi (auditul grafic, 20.10.2026): menisc curbat, centrul urmărește progresul, ondulația
// e doar decor și nu schimbă volumul. Fără date ≠ 0: null = nimic desenat (tubul are contur punctat). 0 = fără
// umplere. 100 = lichidul închide complet tubul. La procente mici curbura și particulele se reduc.

export interface Meniscus {
  /** Lățimea până la centrul meniscului (px) = valoarea reală. */
  fillW: number;
  /** Cât rămân în urmă marginile față de centru (px). */
  bulge: number;
  /** 0..1: cât de vizibile sunt ondulația și particulele (mici la procente mici și la plin). */
  detail: number;
  full: boolean;
}

export function meniscus(pct: number | null, W: number, r: number): Meniscus | null {
  if (pct == null || !Number.isFinite(pct) || W <= 0) return null;
  const f = Math.max(0, Math.min(100, pct)) / 100;
  const fillW = W * f;
  if (fillW <= 0) return { fillW: 0, bulge: 0, detail: 0, full: false };
  const room = W - fillW;
  const bulge = Math.max(0, Math.min(r * 1.5, fillW * 0.5, room));
  const detail = Math.max(0, Math.min(1, fillW / (r * 4), room / r));
  return { fillW, bulge, detail, full: room <= 0.5 };
}

/** Poziția frontului la înălțimea v (-1 sus … 1 jos), fără ondulație: centrul = fillW, marginile = fillW − bulge. */
export function frontAt(m: Meniscus, v: number): number {
  const round = m.bulge * Math.sqrt(Math.max(0, 1 - v * v));
  return m.fillW - m.bulge + round;
}

/** Durata umplerii tubului până la valoare (audit grafic G07: 250–400 ms). */
export const FILL_MS = 350;
/** Umplerea la `ms` după schimbarea valorii: de la `from` la `to` în FILL_MS, easeOut cubic; exact `to` la final. */
export function fillTween(from: number, to: number, ms: number): number {
  if (ms >= FILL_MS) return to;
  const p = Math.max(0, ms) / FILL_MS;
  return from + (to - from) * (1 - (1 - p) ** 3);
}
