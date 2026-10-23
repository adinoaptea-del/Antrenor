// Mesajul de întâmpinare al zilei: lista și alegerea sunt în src/welcome-messages.ts (după tipul zilei); aici doar
// ținem minte, pe telefon, ultimul mesaj ales pentru fiecare tip de zi, ca să nu se repete de două ori la rând.
import { pickWelcome, type WelcomeKind } from '@core/welcome-messages.js';

export function welcomeMessage(kind: WelcomeKind): string {
  const key = `airon.motivatie.${kind}`;
  let last: number | null = null;
  try {
    const v = localStorage.getItem(key);
    last = v == null ? null : Number(v);
  } catch {
    /* fără stocare: doar la întâmplare */
  }
  const p = pickWelcome(kind, last);
  try {
    localStorage.setItem(key, String(p.index));
  } catch {
    /* ignorat */
  }
  return p.text;
}
