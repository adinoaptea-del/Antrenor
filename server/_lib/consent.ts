// Consimțământul pentru date de sănătate: o singură verificare, folosită de sincronizare (cron, manual, webhook),
// importul Apple și agenți. Retras = nimic nu se mai importă și nimic nu ajunge la AI.
import { one } from './db.js';

export function consentActive(c: { health_data?: boolean | null; withdrawn_at?: string | null } | null | undefined): boolean {
  return !!c?.health_data && !c.withdrawn_at;
}

export async function hasConsent(userId: string): Promise<boolean> {
  const c = await one<{ health_data: boolean; withdrawn_at: string | null }>('consents', { user_id: `eq.${userId}` }).catch(() => null);
  return consentActive(c);
}
