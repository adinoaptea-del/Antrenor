// Starea aplicației: sesiunea, obiectul `Me` de la server, reîncărcarea după formulare și sincronizare.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Me } from '@core/api-types.js';
import { CONFIG, SERVER, captureSessionFromUrl, getSession, loadServerConfig, runSetup, server, signOut } from './api';
import { localServer } from './local';

export type Status = 'boot' | 'unconfigured' | 'setup' | 'anon' | 'loading' | 'ready' | 'error';
export type FormKind = 'intrare' | 'dimineata' | 'seara' | 'saptamanal' | 'analize' | 'teste' | 'corp' | 'profil' | 'apple' | 'analize-citire' | 'aviz' | 'admin-chei';

export interface Data {
  status: Status;
  me: Me | null;
  error: string | null;
  /** Previzualizare fără server: contul trăiește în telefon; brățările și agenții cer serverul. */
  local: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Trimite un formular la server (sau îl ține local în demo) și reîncarcă. */
  submitForm: (kind: FormKind, body: unknown) => Promise<{ ok: boolean; info?: string; data?: Record<string, unknown> }>;
  sync: () => Promise<string | null>;
  connect: (provider: 'whoop' | 'strava' | 'oura') => Promise<void>;
  runAgents: (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal') => Promise<string>;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const local = CONFIG.local;
  const backend = local ? localServer : server;
  const [status, setStatus] = useState<Status>('boot');
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (local) {
      setMe(await localServer.me());
      setStatus('ready');
      return;
    }
    if (!SERVER?.ready) {
      try {
        const c = await loadServerConfig();
        if (!c.configured) {
          setError(c.reason ?? null);
          setStatus('unconfigured');
          return;
        }
        if (!c.ready) {
          setStatus('setup');
          return;
        }
        if (c.upgrade) await runSetup().catch(() => undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('unconfigured');
        return;
      }
    }
    const s = await getSession();
    if (!s) {
      setStatus('anon');
      setMe(null);
      return;
    }
    setStatus((st) => (st === 'ready' ? st : 'loading'));
    try {
      setMe(await server.me());
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [local]);

  useEffect(() => {
    captureSessionFromUrl();
    void load();
  }, [load]);

  const submitForm = useCallback<Data['submitForm']>(
    async (kind, body) => {
      const r = await backend.form(kind, body);
      await load();
      const plan = r.plan as { ok?: boolean; reason?: string; budgetHours?: number; weeks?: number } | undefined;
      if (kind === 'intrare' && plan) return { ok: !!plan.ok, info: plan.ok ? `Plan pe ${plan.weeks} săptămâni, ${plan.budgetHours} h/săpt.` : plan.reason };
      return { ok: true, data: r as unknown as Record<string, unknown> };
    },
    [backend, load],
  );

  const sync = useCallback(async () => {
    const r = await backend.sync();
    await load();
    return r.lastSync;
  }, [backend, load]);

  const connect = useCallback(
    async (provider: 'whoop' | 'strava' | 'oura') => {
      const { url } = await backend.oauthStart(provider);
      location.href = url;
    },
    [backend],
  );

  const runAgents = useCallback(
    async (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal') => {
      const r = (await backend.runAgents(event)) as { skipped?: string; decision?: string; changes?: string[] };
      await load();
      return r.skipped ?? `Decizia: ${r.decision}. ${r.changes?.length ? `${r.changes.length} schimbări în calendar.` : ''}`;
    },
    [backend, load],
  );

  const logout = useCallback(async () => {
    if (local) {
      localServer.reset();
      await load();
      return;
    }
    await signOut();
    setMe(null);
    setStatus('anon');
  }, [local, load]);

  const value = useMemo<Data>(() => ({ status, me, error, local, refresh: load, logout, submitForm, sync, connect, runAgents }), [status, me, error, local, load, logout, submitForm, sync, connect, runAgents]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData în afara DataProvider');
  return v;
}

export function useMe(): Me {
  const { me } = useData();
  if (!me) throw new Error('useMe fără date încărcate');
  return me;
}
