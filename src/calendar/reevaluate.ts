// Reevaluarea după un import de istoric: istoricul nou schimbă doza de start doar dacă diferența contează.
// Pragul (cel puțin 30 de minute și 15% din săptămână) e o politică de produs, nu o regulă fiziologică: sub el,
// planul rămâne pe loc, ca să nu se miște calendarul la fiecare activitate importată.

export interface ReplanDecision {
  apply: boolean;
  /** Mesajul pentru sportiv: ce s-a schimbat sau de ce rămâne la fel, cu cifrele. */
  message: string;
}

const h = (x: number) => `${(Math.round(x * 10) / 10).toString().replace('.', ',')} h`;

export function decideReplan(input: { currentWeekH: number | null; proposedWeekH: number; historyH: number[]; from: string }): ReplanDecision {
  const hist = input.historyH.length ? `istoricul de ${input.historyH.length} ${input.historyH.length === 1 ? 'săptămână' : 'săptămâni'} (în medie ${h(input.historyH.reduce((a, b) => a + b, 0) / input.historyH.length)} pe săptămână)` : 'fără istoric în ultimele 8 săptămâni';
  if (input.currentWeekH == null) return { apply: true, message: `Am făcut planul din ${hist}: săptămâna de la ${input.from} are ${h(input.proposedWeekH)}.` };
  const diff = input.proposedWeekH - input.currentWeekH;
  if (Math.abs(diff) >= 0.5 && Math.abs(diff) >= 0.15 * Math.max(input.currentWeekH, 0.1)) {
    return { apply: true, message: `Am recalculat nivelul din ${hist}. Săptămâna de la ${input.from}: ${h(input.proposedWeekH)} în loc de ${h(input.currentWeekH)}. Săptămâna asta rămâne cum e.` };
  }
  return { apply: false, message: `Am citit ${hist}. Planul rămâne: săptămâna de la ${input.from} are deja ${h(input.currentWeekH)}, iar istoricul nou ar schimba-o cu mai puțin de 15%.` };
}
