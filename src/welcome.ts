// Când apare întâmpinarea (intro-ul AIRON + mesajul): regula proprietarului, 21.10.2026 — „doar când aplicația se
// deschide prima dată în zi sau când e închisă după utilizare și redeschisă, nu și când iese pur și simplu din ea și
// navighează mai departe prin telefon”. Doar logica, fără DOM; telefonul îi dă faptele (apps/web/src/ui/Memento.tsx).

export type WelcomeReason = 'zi_noua' | 'deschidere';

export interface LaunchFacts {
  /** Ziua de azi pe telefon (AAAA-LL-ZZ, ora locală). */
  today: string;
  /** Ziua în care s-a văzut ultima întâmpinare (localStorage), sau null. */
  lastWelcomeDay: string | null;
  /**
   * Pagina continuă o sesiune existentă (semnul din sessionStorage e deja pus): o revenire în care sistemul a
   * repornit pagina, o reîncărcare, nu o deschidere nouă. La o aplicație închisă și redeschisă sesiunea e nouă.
   */
  sameSession: boolean;
  /** Browserul a aruncat pagina din memorie cât era în fundal și o reface acum (document.wasDiscarded). */
  discarded: boolean;
  /** Tipul navigării (PerformanceNavigationTiming.type): 'navigate' | 'reload' | 'back_forward' | 'prerender'. */
  navType: string | null;
}

/** Zi nouă pe telefon: prima deschidere din zi, indiferent cum ajunge pagina pe ecran. */
export const isNewDay = (today: string, lastWelcomeDay: string | null): boolean => lastWelcomeDay !== today;

/**
 * La pornirea paginii: 'zi_noua' dacă azi nu s-a văzut încă; 'deschidere' dacă e o lansare nouă (sesiune nouă, nu o
 * pagină refăcută după ce sistemul a oprit-o în fundal, nu o reîncărcare); altfel null — o revenire în aplicație, în
 * aceeași zi, după ce sportivul doar a ieșit din ea: fără întâmpinare.
 */
export function welcomeOnLaunch(f: LaunchFacts): WelcomeReason | null {
  if (isNewDay(f.today, f.lastWelcomeDay)) return 'zi_noua';
  if (!f.sameSession && !f.discarded && f.navType !== 'reload') return 'deschidere';
  return null;
}

/** La revenirea din fundal (aplicația n-a fost închisă): doar dacă între timp a început o zi nouă. */
export function welcomeOnResume(today: string, lastWelcomeDay: string | null): WelcomeReason | null {
  return isNewDay(today, lastWelcomeDay) ? 'zi_noua' : null;
}

/** Ziua locală AAAA-LL-ZZ a unui moment (fără fus explicit: cel al telefonului). */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
