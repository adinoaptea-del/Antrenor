// Variabilele de mediu ale serverului. Integrarea Supabase din Vercel Marketplace le completează singură pe cele de bază;
// singura pe care o lipește omul e ANTHROPIC_API_KEY. Restul au fie nume alternative, fie se derivă din cheia secretă.
import { createHmac } from 'node:crypto';

export function env(name: string, optional = false): string {
  const v = process.env[name];
  if (!v && !optional) throw new Error(`lipsește variabila de mediu ${name}`);
  return v ?? '';
}

/** Prima variabilă setată dintr-o listă de nume (integrarea Vercel ↔ Supabase a folosit mai multe convenții în timp). */
function first(names: string[], optional = false): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v.trim();
  }
  // Integrarea Vercel ↔ Supabase poate pune un prefix (ex. STORAGE_SUPABASE_URL): căutăm și după sufix.
  for (const n of names) {
    const k = Object.keys(process.env).find((key) => key.endsWith(`_${n}`) && process.env[key]);
    if (k) return process.env[k]!.trim();
  }
  if (optional) return '';
  throw new Error(`lipsește variabila de mediu ${names[0]}`);
}

const SERVICE = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const PUBLIC_KEY = ['SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'];
const URL_NAMES = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'];
const PG = ['POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL'];

/** Secret derivat din cheia service: stabil între deploy-uri, fără să-l mai genereze cineva de mână. */
function derived(label: string): string {
  return createHmac('sha256', first(SERVICE)).update(`antrenor:${label}`).digest('base64url');
}

function appUrl(): string {
  const explicit = first(['APP_URL'], true);
  if (explicit) return explicit.replace(/\/$/, '');
  const prod = first(['VERCEL_PROJECT_PRODUCTION_URL'], true); // setat de Vercel: domeniul de producție, fără https://
  if (prod) return `https://${prod}`;
  const url = first(['VERCEL_URL'], true);
  if (url) return `https://${url}`;
  throw new Error('lipsește APP_URL');
}

export const ENV = {
  supabaseUrl: () => first(URL_NAMES).replace(/\/$/, ''),
  supabaseService: () => first(SERVICE),
  supabaseAnon: () => first(PUBLIC_KEY),
  postgresUrl: () => first(PG, true),
  appUrl,
  stateSecret: () => first(['OAUTH_STATE_SECRET'], true) || derived('oauth-state'),
  cronSecret: () => first(['CRON_SECRET'], true) || derived('cron'),
  modelKey: () => env('ANTHROPIC_API_KEY'),
  modelSpecialist: () => env('MODEL_SPECIALIST', true) || 'claude-sonnet-5-5',
  modelHead: () => env('MODEL_HEAD', true) || 'claude-sonnet-5-5',
  /** Câte conturi se pot crea din aplicație (WHOOP dă acces de dezvoltator pentru 10 membri). */
  maxUsers: () => Number(env('MAX_USERS', true) || 10),
};

/** Cheile noi Supabase (sb_secret_…, sb_publishable_…) nu sunt JWT: merg doar în header-ul `apikey`. */
export function supabaseKeyHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}
