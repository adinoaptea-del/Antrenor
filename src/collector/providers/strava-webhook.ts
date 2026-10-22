// Webhook-ul Strava (auditul consolidat 22.10.2026, C1): validarea evenimentului și ce înseamnă răspunsul API-ului
// la verificare. Strava nu semnează criptografic POST-urile (documentează doar verificarea GET a abonamentului), deci
// un eveniment primit nu dovedește nimic: o ștergere se aplică doar după ce API-ul Strava confirmă că activitatea nu
// mai există (404), iar o retragere a accesului doar după ce tokenul e refuzat (401). 401/403/429/5xx la o activitate
// nu înseamnă „ștearsă”.

export interface StravaEvent {
  object_type: 'activity' | 'athlete';
  object_id: string;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: string;
  subscription_id: string;
  event_time: number;
  updates: Record<string, string> | null;
}

const isId = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^\d{1,20}$/.test(v));

/** Evenimentul, dacă are forma documentată de Strava; altfel motivul. */
export function parseStravaEvent(body: unknown): { ok: true; ev: StravaEvent } | { ok: false; why: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, why: 'corp lipsă' };
  const b = body as Record<string, unknown>;
  if (b.object_type !== 'activity' && b.object_type !== 'athlete') return { ok: false, why: 'object_type necunoscut' };
  if (b.aspect_type !== 'create' && b.aspect_type !== 'update' && b.aspect_type !== 'delete') return { ok: false, why: 'aspect_type necunoscut' };
  if (!isId(b.object_id) || !isId(b.owner_id) || !isId(b.subscription_id)) return { ok: false, why: 'id-uri invalide' };
  if (typeof b.event_time !== 'number' || !Number.isFinite(b.event_time) || b.event_time <= 0) return { ok: false, why: 'event_time invalid' };
  let updates: Record<string, string> | null = null;
  if (b.updates != null) {
    if (typeof b.updates !== 'object' || Array.isArray(b.updates)) return { ok: false, why: 'updates invalid' };
    updates = Object.fromEntries(Object.entries(b.updates as Record<string, unknown>).slice(0, 20).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 200)]));
  }
  return {
    ok: true,
    ev: { object_type: b.object_type, aspect_type: b.aspect_type, object_id: String(b.object_id), owner_id: String(b.owner_id), subscription_id: String(b.subscription_id), event_time: Math.floor(b.event_time), updates },
  };
}

/** Abonamentul: dacă STRAVA_SUBSCRIPTION_ID e setat, evenimentul trebuie să vină de pe el. Nesetat = nu se poate verifica. */
export function subscriptionMatches(ev: StravaEvent, expected: string | undefined): boolean {
  return !expected || ev.subscription_id === expected.trim();
}

/** Retragerea accesului din Strava (Settings → My Apps → Revoke): athlete + update + authorized=false. */
export function isDeauthorization(ev: StravaEvent): boolean {
  return ev.object_type === 'athlete' && ev.aspect_type === 'update' && ev.updates?.authorized === 'false';
}

export type DeleteCheck = 'stearsa' | 'exista' | 'acces_refuzat' | 'reincearca';

/**
 * GET /activities/{id} cu tokenul sportivului, după un eveniment „delete”:
 * 404 → ștearsă (sau ascunsă de noi: tokenul are activity:read_all, deci o activitate privată tot se vede);
 * 200 → există (evenimentul nu se aplică); 401/403 → tokenul nu mai e valid: NU ștergem nimic, se semnalează;
 * 429/5xx/rețea → se reîncearcă mai târziu.
 */
export function classifyDeleteCheck(status: number | null): DeleteCheck {
  if (status === 404) return 'stearsa';
  if (status != null && status >= 200 && status < 300) return 'exista';
  if (status === 401 || status === 403) return 'acces_refuzat';
  return 'reincearca';
}

/** La retragerea accesului: doar un 401 de la API dovedește că tokenul chiar nu mai merge. */
export function deauthConfirmed(status: number | null): boolean | null {
  if (status === 401) return true;
  if (status != null && status >= 200 && status < 300) return false;
  return null; // neclar (429/5xx/rețea): se reîncearcă
}
