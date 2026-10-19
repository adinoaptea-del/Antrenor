// Propunerile antrenorului AI (auditul v2, V2-14): arhitectura e un singur model + motor determinist. Modelul NU
// activează nimic. O observație relevantă devine o propunere structurată (acțiune permisă, ședința, parametri, dovezi
// din pachet); validatorul de aici o acceptă sau o respinge; o propunere acceptată devine o SUGESTIE pe ședință, pe care
// codul o activează doar după confirmarea sportivului. O propunere respinsă nu modifică planul și nu e prezentată ca
// activă (mesajul nu are voie să spună „am schimbat / am redus / am mutat”).

import type { Packet } from '../collector/packet.js';
import type { Proposal } from './schema.js';

export type ProposalVerdict = { ok: true; workoutId: string; actiune: Proposal['actiune']; minutes: number | null; motiv: string; dovezi: string[] } | { ok: false; reason: string };

/** Valoarea unui câmp din pachet după cale („hrv.azi”, „plan_azi_toate[0].durata_planificata”). */
export function fieldAt(p: unknown, path: string): unknown {
  let cur: unknown = p;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function validateProposal(prop: Proposal | null | undefined, p: Packet, decision: 'verde' | 'galben' | 'rosu' | 'stop'): ProposalVerdict | null {
  if (!prop) return null;
  if (decision === 'rosu' || decision === 'stop') return { ok: false, reason: `ziua e ${decision}: nu se adaptează o ședință care oricum nu se face` };
  const list = prop.tinta === 'azi' ? p.plan_azi_toate : p.plan_maine_toate;
  const w = list?.[prop.index];
  if (!w) return { ok: false, reason: `nu există ședința ${prop.tinta}[${prop.index}]` };
  const dovezi = (prop.dovezi ?? []).filter((d) => {
    const v = fieldAt(p, d);
    return v != null && !(Array.isArray(v) && v.length === 0) && v !== '';
  });
  if (!dovezi.length) return { ok: false, reason: 'fără dovezi din pachet (câmpurile citate lipsesc sau sunt goale)' };
  if (prop.actiune === 'usureaza') {
    const intense = w.tip === 'calitate' || w.tip === 'brick' || w.tip === 'lung';
    if (!intense) return { ok: false, reason: 'ședința e deja ușoară' };
    return { ok: true, workoutId: w.id, actiune: 'usureaza', minutes: null, motiv: prop.motiv, dovezi };
  }
  const min = prop.minute;
  const lo = Math.max(20, Math.round(w.durata_planificata * 0.5));
  if (min == null || min < lo || min > w.durata_planificata - 5) return { ok: false, reason: `durata propusă (${min ?? '—'} min) în afara limitelor: între ${lo} și ${w.durata_planificata - 5} min` };
  return { ok: true, workoutId: w.id, actiune: 'scurteaza', minutes: min, motiv: prop.motiv, dovezi };
}

/** Mesajul nu poate prezenta ca activă o schimbare pe care n-a făcut-o codul. */
const CLAIM = /\bam (mutat|schimbat|redus|scurtat|modificat|înlocuit|inlocuit|anulat)\b|\bam pus în plan\b|\bam actualizat planul\b/i;
export function claimsActivation(text: string): boolean {
  return CLAIM.test(text);
}
