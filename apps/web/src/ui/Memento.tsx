import { useState } from 'react';
import { useMe } from '../data/store';
import { dayIndex, dayOf } from '../data/model';
import { welcomeMessage } from '../data/motivation';
import { welcomeKind } from '@core/welcome-messages.js';
import { WelcomeFire } from './WelcomeFire';
import { localDay, welcomeOnLaunch, welcomeOnResume, type LaunchFacts } from '@core/welcome.js';

/**
 * Întâmpinarea de la intrarea în aplicație: intro-ul AIRON, apoi „Fire → Furtună → Home” (ui/WelcomeFire.tsx), pe fundal
 * cosmic opac; la „Continuă” firele se rup în praf, iar praful reconstruiește bula de Acasă. Rămâne până la „Continuă” (sau „Sari peste”).
 */
/**
 * Politica de afișare (regula proprietarului, 21.10.2026; logica în src/welcome.ts): întâmpinarea apare la prima
 * deschidere din zi și când aplicația a fost închisă și redeschisă — nu când sportivul doar iese din ea (alt app,
 * ecran blocat) și revine, chiar dacă sistemul a oprit pagina în fundal și o reface. Faptele vin de aici:
 * ziua ultimei întâmpinări (localStorage, rămâne între porniri), semnul de sesiune (sessionStorage: trăiește cât
 * pagina e „aceeași”, inclusiv la refacerea ei după fundal; o aplicație închisă și redeschisă pornește fără el),
 * document.wasDiscarded și tipul navigării.
 */
const DAY_KEY = 'airon-welcome-day';
const SESSION_KEY = 'airon-session';
/** Pus la prima randare, înainte de orice decizie: orice refacere a aceleiași pagini îl găsește. */
export function launchFacts(): LaunchFacts {
  let sameSession = false;
  try {
    sameSession = sessionStorage.getItem(SESSION_KEY) === '1';
    if (!sameSession) sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* fără sessionStorage: fiecare pornire e o deschidere */
  }
  let lastWelcomeDay: string | null = null;
  try {
    lastWelcomeDay = localStorage.getItem(DAY_KEY);
  } catch {
    /* fără localStorage: fiecare pornire e o zi nouă */
  }
  let navType: string | null = null;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    navType = nav?.type ?? null;
  } catch {
    /* */
  }
  const discarded = typeof document !== 'undefined' && (document as { wasDiscarded?: boolean }).wasDiscarded === true;
  return { today: localDay(), lastWelcomeDay, sameSession, discarded, navType };
}
/** La pornirea paginii: se arată întâmpinarea? */
export function welcomeDue(): boolean {
  return welcomeOnLaunch(launchFacts()) != null;
}
/** La revenirea din fundal: doar dacă a început o zi nouă. */
export function welcomeDueOnResume(): boolean {
  let last: string | null = null;
  try {
    last = localStorage.getItem(DAY_KEY);
  } catch {
    /* */
  }
  return welcomeOnResume(localDay(), last) != null;
}
/** Se notează când s-a închis (atingere sau „Sari peste”): o întrerupere în mijlocul ei o arată din nou. */
export function markWelcome(now = new Date()) {
  try {
    localStorage.setItem(DAY_KEY, localDay(now));
  } catch {
    /* fără stocare: poate reapărea la pornire */
  }
}

export function Memento({ onClose }: { onClose: () => void }) {
  const me = useMe();
  // Mesajul după ziua de azi: odihnă = relaxare; antrenament = motivație (cererea proprietarului, 23.10.2026).
  const [msg] = useState(() => welcomeMessage(welcomeKind({ sessions: me.plan.filter((w) => w.date === me.today), day: dayOf(me) })));
  const d = dayIndex(me);
  const close = () => {
    markWelcome();
    onClose();
  };
  // Intro-ul AIRON (wordmark → fire → sferă) doar aici: la deschidere și la revenirea după pauza de 30 de minute, nu la felicitări.
  return <WelcomeFire intro kicker={d ? `Ziua ${d.day} din ${d.total}` : (me.user.raceName ?? 'AIRON')} text={msg} onClose={close} />;
}
