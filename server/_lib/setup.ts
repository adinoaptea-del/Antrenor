// Pregătirea bazei de date dintr-un singur apel: tabelele (migrarea), drepturile pentru Data API și programările
// pg_cron (citirea brățărilor la 15 minute, dimineața, seara). Idempotent: se poate rula din nou după schimbarea domeniului.
import MIGRATION from '../../supabase/migrations/0001_init.sql';
import UPGRADE from '../../supabase/migrations/0002_upgrade.sql';
import STRENGTH_LOG_SETS from '../../supabase/migrations/0003_strength_log_sets.sql';
import { ENV } from './env.js';
import { connect, lit, type PgClient } from './pg.js';

export interface SetupStep {
  step: string;
  ok: boolean;
  detail?: string;
}

export const JOBS: { name: string; schedule: string; path: string }[] = [
  { name: 'antrenor-sync', schedule: '*/15 * * * *', path: '/api/cron/sync' },
  { name: 'antrenor-dimineata', schedule: '30 2 * * *', path: '/api/cron/morning' }, // 05:30 ora României (vara), 04:30 iarna
  { name: 'antrenor-seara', schedule: '0 18 * * *', path: '/api/cron/evening' },
];

const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
grant select on all tables in schema public to authenticated;
revoke select on public.oauth_tokens from authenticated, anon;
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
`;

/** Verificarea după pregătire: un sportiv logat (rolul authenticated) nu are drept de scriere pe nicio tabelă. */
const VERIFY_GRANTS = `select count(*)::int as n, coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '), '') as what
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`;

/** Starea curentă, fără să schimbe nimic. */
export async function setupStatus(): Promise<{ database: boolean; tables: boolean; detail?: string }> {
  const url = ENV.postgresUrl();
  if (!url) return { database: false, tables: false, detail: 'lipsește POSTGRES_URL (integrarea Supabase din Vercel)' };
  let c: PgClient | null = null;
  try {
    c = await connect(url);
    const r = await c.query("select to_regclass('public.users') is not null as ok");
    return { database: true, tables: r.rows[0]?.ok === 't' };
  } catch (e) {
    return { database: false, tables: false, detail: (e as Error).message };
  } finally {
    c?.end();
  }
}

export async function runSetup(appUrl: string, opts: { schedule?: boolean } = {}): Promise<SetupStep[]> {
  const url = ENV.postgresUrl();
  if (!url) throw new Error('lipsește POSTGRES_URL: adaugă integrarea Supabase în proiectul Vercel');
  const steps: SetupStep[] = [];
  const c = await connect(url);
  const step = async (name: string, sql: string, optional = false) => {
    try {
      const r = await c.query(sql);
      steps.push({ step: name, ok: true, detail: r.notices.filter(Boolean).slice(0, 2).join('; ') || undefined });
      return true;
    } catch (e) {
      steps.push({ step: name, ok: false, detail: (e as Error).message });
      if (!optional) throw e;
      return false;
    }
  };
  try {
    const exists = (await c.query("select to_regclass('public.users') is not null as ok")).rows[0]?.ok === 't';
    if (exists) steps.push({ step: 'tabele', ok: true, detail: 'existau deja' });
    else await step('tabele', `begin;\n${MIGRATION}\ncommit;`);
    await step('actualizări', UPGRADE);
    await step('jurnal de forță pe serii', STRENGTH_LOG_SETS);
    await step('drepturi', GRANTS, true);
    try {
      const r = await c.query(VERIFY_GRANTS);
      const n = Number(r.rows[0]?.n ?? 0);
      steps.push({ step: 'verificare drepturi', ok: n === 0, detail: n === 0 ? 'sportivii nu pot scrie direct în bază' : `drepturi de scriere rămase: ${r.rows[0]?.what}` });
    } catch (e) {
      steps.push({ step: 'verificare drepturi', ok: false, detail: (e as Error).message });
    }

    const cron = opts.schedule === false ? false : await step('pg_cron', 'create extension if not exists pg_cron with schema pg_catalog', true);
    const net = await step('pg_net', 'create extension if not exists pg_net with schema extensions', true);
    if (cron && net) {
      const auth = JSON.stringify({ authorization: `Bearer ${ENV.cronSecret()}` });
      for (const j of JOBS) {
        const cmd = `select net.http_get(url := ${lit(appUrl + j.path)}, headers := ${lit(auth)}::jsonb, timeout_milliseconds := 300000)`;
        await step(`programare ${j.name}`, `select cron.schedule(${lit(j.name)}, ${lit(j.schedule)}, ${lit(cmd)})`, true);
      }
    }
    await step('reîncărcare API', "notify pgrst, 'reload schema'", true);
    return steps;
  } finally {
    c.end();
  }
}
