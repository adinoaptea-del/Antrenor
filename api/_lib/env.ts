// Variabilele de mediu ale serverului (Vercel → Settings → Environment Variables). Lipsa uneia oprește cererea cu un mesaj clar.
export function env(name: string, optional = false): string {
  const v = process.env[name];
  if (!v && !optional) throw new Error(`lipsește variabila de mediu ${name}`);
  return v ?? '';
}

export const ENV = {
  supabaseUrl: () => env('SUPABASE_URL'),
  supabaseService: () => env('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseAnon: () => env('SUPABASE_ANON_KEY'),
  appUrl: () => env('APP_URL'), // https://antrenor.vercel.app
  stateSecret: () => env('OAUTH_STATE_SECRET'),
  cronSecret: () => env('CRON_SECRET'),
  modelKey: () => env('ANTHROPIC_API_KEY'),
  modelSpecialist: () => env('MODEL_SPECIALIST', true) || 'claude-sonnet-5-5',
  modelHead: () => env('MODEL_HEAD', true) || 'claude-sonnet-5-5',
};
