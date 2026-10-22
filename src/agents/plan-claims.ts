// B1 (auditul consolidat, 22.10.2026): textul antrenorului AI nu poate prescrie altceva decât ședința din calendar.
// Nu interzicem cuvinte („tempo”, „interval”, „Z4”): le citim în context. Fiecare propoziție (frază) e legată de ziua
// la care se referă (azi / mâine) și comparată cu ședințele acelei zile: zona maximă permisă, intensitatea, sportul.
// Frazele negate („fără Z4”, „nu forța”) și cele despre trecut („ieri ai făcut intervale”) nu sunt prescripții.
import type { Packet } from '../collector/packet.js';
import type { Sport } from '../types.js';

type Session = { sport: Sport; tip: string; zone_tinta?: number[]; structura?: string | null };
type Decision = 'verde' | 'galben' | 'rosu' | 'stop';

const NEG = /(^|\s)(nu|n-|fără|fara|evită|evita|nicidecum|niciun|nicio|deloc|interzis|renunță la|renunta la)(\s|$)/i;
const PAST = /(?<!\p{L})(ieri|alaltăieri|săptămâna trecută|saptamana trecuta|ai făcut|ai facut|ai avut|a fost|ai alergat|ai pedalat|ai înotat|ai inotat|data trecută|data trecuta|anterior|înainte de)(?!\p{L})/iu;
const TOMORROW = /(?<!\p{L})(mâine|maine)(?!\p{L})/iu;
const INTENSE = /(?<!\p{L})(interval\p{L}*|tempo|prag\p{L}*|sprint\p{L}*|vo2\p{L}*|repet[aă]ri\s+(rapide|tari)|în\s+for[țt][aă]|la\s+maxim|all[- ]?out|accelerări\s+tari)(?!\p{L})/iu;
const SPORT_WORDS: [Sport, RegExp][] = [
  ['inot', /(?<!\p{L})(înot\p{L}*|inot\p{L}*|bazin\p{L}*)(?!\p{L})/iu],
  ['bicicleta', /(?<!\p{L})(biciclet\p{L}*|pedal\p{L}*|ciclism|rol[aă]|ture?\s+pe\s+biciclet\p{L}*)(?!\p{L})/iu],
  ['alergare', /(?<!\p{L})(alerg\p{L}*|aleargă|alearga|jogging)(?!\p{L})/iu],
  ['forta', /(?<!\p{L})(sal[aă]|for[țt][aă]|genuflexi\p{L}*|greut[aă][țt]i)(?!\p{L})/iu],
];
const SUBSTITUTE = /(?<!\p{L})(în schimb|in schimb|în loc|in loc|înlocu\p{L}*|inlocu\p{L}*|schimbă pe|schimba pe)(?!\p{L})/iu;

function zonesIn(t: string): number[] {
  const out: number[] = [];
  for (const m of t.matchAll(/\bZ\s?([1-5])(?:\s?[–-]\s?Z?\s?([1-5]))?/gi)) {
    out.push(Number(m[1]));
    if (m[2]) out.push(Number(m[2]));
  }
  return out;
}

/** Zona maximă permisă pentru ziua respectivă: cea din ședințe (ținta + structura), plafonată la Z2 în zilele care nu sunt verzi. */
export function allowedMaxZone(sessions: Session[], decision: Decision | null): number {
  let z = 0;
  for (const s of sessions) {
    for (const x of s.zone_tinta ?? []) z = Math.max(z, x);
    for (const x of zonesIn(s.structura ?? '')) z = Math.max(z, x);
    if (s.tip === 'calitate' && z < 3) z = Math.max(z, 3);
  }
  if (sessions.length === 0) z = 2; // zi fără ședință: doar mișcare ușoară
  if (decision && decision !== 'verde') z = Math.min(z || 2, 2);
  return z || 2;
}

function intenseAllowed(sessions: Session[], decision: Decision | null): boolean {
  if (decision && decision !== 'verde') return false;
  return sessions.some((s) => s.tip === 'calitate' || INTENSE.test(s.structura ?? '') || (s.zone_tinta ?? []).some((z) => z >= 3));
}

/** Bucățile de text care pot fi prescripții (propoziții împărțite la , ; : și „dar/iar”). */
function clauses(text: string): { clause: string; sentence: string }[] {
  const out: { clause: string; sentence: string }[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    for (const clause of sentence.split(/[;,:]|\s(?:dar|iar|însă|insa)\s/i)) if (clause.trim()) out.push({ clause: clause.trim(), sentence });
  }
  return out;
}

/** Problemele: prescripții din text care contrazic calendarul zilei la care se referă. Gol = textul e coerent cu planul. */
export function planContradictions(text: string, p: Packet, decision: Decision | null): string[] {
  const today: Session[] = (p.plan_azi_toate ?? []).filter((s) => s.tip !== 'odihna');
  const tomorrow: Session[] = ((p as Packet & { plan_maine_toate?: Session[] }).plan_maine_toate ?? []).filter((s) => s.tip !== 'odihna');
  const problems: string[] = [];
  for (const { clause, sentence } of clauses(text)) {
    if (NEG.test(clause) || PAST.test(clause) || PAST.test(sentence)) continue;
    const isTomorrow = TOMORROW.test(clause) || (TOMORROW.test(sentence) && !/(?<!\p{L})azi(?!\p{L})/iu.test(sentence));
    const sessions = isTomorrow ? tomorrow : today;
    const dec = isTomorrow ? null : decision; // decizia de mâine nu e luată încă
    const label = isTomorrow ? 'mâine' : 'azi';
    const maxZ = allowedMaxZone(sessions, dec);
    const zs = zonesIn(clause);
    if (zs.length && Math.max(...zs) > maxZ) problems.push(`prescripție în Z${Math.max(...zs)} pentru ${label}, dar planul${dec && dec !== 'verde' ? ` (zi ${dec})` : ''} permite cel mult Z${maxZ}: „${clause.slice(0, 80)}”`);
    else if (!zs.length && INTENSE.test(clause) && !intenseAllowed(sessions, dec)) problems.push(`intensitate („${INTENSE.exec(clause)![0]}”) pentru ${label}, dar ședința ${label} e ușoară${dec && dec !== 'verde' ? ` / zi ${dec}` : ''}: „${clause.slice(0, 80)}”`);
    // Sport schimbat: o ședință dintr-un sport care nu e în plan, propusă în locul celei din plan.
    if (SUBSTITUTE.test(clause) || SUBSTITUTE.test(sentence)) {
      const planned = new Set(sessions.map((s) => s.sport));
      for (const [sport, re] of SPORT_WORDS) {
        if (re.test(clause) && !planned.has(sport) && sessions.length) problems.push(`alt sport (${sport}) în locul ședinței din plan pentru ${label}: „${clause.slice(0, 80)}” — schimbarea sportului se propune structurat, nu în text`);
      }
    }
  }
  return [...new Set(problems)];
}
