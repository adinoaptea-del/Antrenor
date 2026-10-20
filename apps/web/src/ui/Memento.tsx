import { useState } from 'react';
import { useMe } from '../data/store';
import { dayIndex } from '../data/model';
import { randomMotivation } from '../data/motivation';
import { WelcomeSphere } from './WelcomeSphere';
import { WelcomeStorm, webglOk } from './WelcomeStorm';

/**
 * Întâmpinarea de la intrarea în aplicație: sfera vie (ui/WelcomeSphere.tsx), aceeași cu bula de Acasă, pe fundal
 * cosmic opac; la „Continuă” materia ei construiește bula de Acasă. Rămâne până la „Continuă” (sau „Sari peste”).
 */
const SHOWN_KEY = 'airon-welcome-at';
/**
 * Întâmpinarea nu se repetă la o reîncărcare (ex. cea automată după o actualizare) sau la o revenire scurtă.
 * Ținută în sessionStorage: o deschidere nouă a aplicației (pornire la rece) o arată mereu; reîncărcarea din aceeași
 * sesiune, în mai puțin de 30 de minute, nu. Se notează doar când s-a închis (atingere sau timpul de citire): o reîncărcare în mijlocul ei o arată din nou.
 */
export const WELCOME_GAP_MS = 30 * 60 * 1000;
export function welcomeDue(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(SHOWN_KEY) ?? 0);
    return !at || now - at > WELCOME_GAP_MS;
  } catch {
    return true;
  }
}
export function markWelcome(now = Date.now()) {
  try {
    sessionStorage.setItem(SHOWN_KEY, String(now));
  } catch {
    /* fără stocare: poate reapărea la reîncărcare */
  }
}

export function Memento({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [msg] = useState(randomMotivation);
  const d = dayIndex(me);
  // Sute de mii de particule cer WebGL; fără el (sau cu „mișcare redusă”) rămâne sfera desenată 2D.
  const [storm] = useState(() => webglOk() && !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const close = () => {
    markWelcome();
    onClose();
  };
  const kicker = d ? `Ziua ${d.day} din ${d.total}` : (me.user.raceName ?? 'AIRON');
  if (storm) return <WelcomeStorm kicker={kicker} text={msg} onClose={close} />;
  return (
    <WelcomeSphere
      kicker={d ? `Ziua ${d.day} din ${d.total}` : (me.user.raceName ?? 'AIRON')}
      text={msg}
      onClose={() => {
        markWelcome();
        onClose();
      }}
    />
  );
}
