import { useState } from 'react';
import { useMe } from '../data/store';
import { dayIndex } from '../data/model';
import { randomMotivation } from '../data/motivation';
import { CosmicMessage, homeOrbRect } from './Cosmic';

/**
 * Întâmpinarea de la intrarea în aplicație: mesajul cosmic, varianta „întâmpinare”, discret peste Acasă (care rămâne
 * vizibil). Se închide singur după timpul de citire sau imediat la atingere; lumina se întoarce în bula de Acasă.
 */
const SHOWN_KEY = 'airon-welcome-at';
/** Întâmpinarea nu se repetă la o reîncărcare sau o revenire scurtă: cel mult o dată la 30 de minute. */
export const WELCOME_GAP_MS = 30 * 60 * 1000;
export function welcomeDue(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(SHOWN_KEY) ?? 0);
    return !at || now - at > WELCOME_GAP_MS;
  } catch {
    return true;
  }
}
export function markWelcome(now = Date.now()) {
  try {
    localStorage.setItem(SHOWN_KEY, String(now));
  } catch {
    /* fără stocare: poate reapărea la reîncărcare */
  }
}

export function Memento({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [msg] = useState(randomMotivation);
  const [, mark] = useState(() => {
    markWelcome();
    return 0;
  });
  void mark;
  const d = dayIndex(me);
  return <CosmicMessage variant="intampinare" kicker={d ? `Ziua ${d.day} din ${d.total}` : (me.user.raceName ?? 'AIRON')} text={msg} seed={7} returnTo={homeOrbRect} onClose={onClose} />;
}
