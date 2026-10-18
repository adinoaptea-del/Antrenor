// Starea aplicației: sesiunea, obiectul `Me` de la server, reîncărcarea după formulare și sincronizare.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me } from '@core/api-types.js';
import { CONFIG, SERVER, captureSessionFromUrl, getSession, isNetworkError, loadServerConfig, readMeCache, runSetup, saveMeCache, server, setBootStage, signOut } from './api';
import { localServer } from './local';

export type Status = 'boot' | 'unconfigured' | 'setup' | 'anon' | 'loading' | 'ready' | 'error';
export type FormKind = 'intrare' | 'dimineata' | 'seara' | 'saptamanal' | 'analize' | 'teste' | 'corp' | 'profil' | 'apple' | 'analize-citire' | 'teste-citire' | 'sugestie' | 'aviz' | 'admin-chei' | 'activitate' | 'deconectare' | 'timp' | 'actiune' | 'plecat' | 'fixe';

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
  /** Fără semnal: datele afișate sunt cele salvate la ora asta (ISO). null = date live. */
  offline: string | null;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const local = CONFIG.local;
  const backend = local ? localServer : server;
  const [status, setStatus] = useState<Status>('boot');
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  // Generația sesiunii: un răspuns /me pornit înainte de ieșire (sau de schimbarea contului) nu mai are voie să
  // reinstaleze datele vechi.
  const gen = useRef(0);
  const syncing = useRef<Promise<string | null> | null>(null);

  const load = useCallback(async () => {
    const my = gen.current;
    // Fără semnal: ultimele date salvate, doar de citit, în loc de ecran de eroare sau de logare.
    const fallback = (e: unknown): boolean => {
      const c = isNetworkError(e) ? readMeCache() : null;
      if (!c || my !== gen.current) return false;
      setMe(c.me);
      setOffline(c.at);
      setStatus('ready');
      return true;
    };
    if (local) {
      setMe(await localServer.me());
      setStatus('ready');
      return;
    }
    if (!SERVER?.ready) {
      try {
        setBootStage('verific serverul');
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
        // Actualizarea bazei rulează în fundal; nu ține aplicația pe loc.
        if (c.upgrade) void runSetup().catch(() => undefined);
      } catch (e) {
        if (fallback(e)) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('unconfigured');
        return;
      }
    }
    setBootStage('verific contul');
    let s;
    try {
      s = await getSession();
    } catch (e) {
      // Sesiunea există, dar nu s-a putut reînnoi acum (rețea): nu scoatem pe nimeni din cont.
      if (fallback(e)) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
      return;
    }
    if (!s) {
      setStatus('anon');
      setMe(null);
      return;
    }
    setStatus((st) => (st === 'ready' ? st : 'loading'));
    try {
      setBootStage('citesc datele contului');
      const fresh = await server.me();
      if (my !== gen.current) return;
      setMe(fresh);
      setOffline(null);
      saveMeCache(fresh);
      setStatus('ready');
      setError(null);
    } catch (e) {
      if (my !== gen.current) return;
      if (fallback(e)) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [local]);

  useEffect(() => {
    captureSessionFromUrl();
    void load();
  }, [load]);

  // Semnalul a revenit: reîncărcăm datele live.
  useEffect(() => {
    if (!offline) return;
    const on = () => void load();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [offline, load]);

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

  // O singură sincronizare odată (buton, revenire în aplicație, interval): cererile simultane o așteaptă pe aceeași.
  const sync = useCallback(async () => {
    if (syncing.current) return syncing.current;
    const p = (async () => {
      const r = await backend.sync();
      await load();
      return r.lastSync;
    })();
    syncing.current = p;
    try {
      return await p;
    } finally {
      syncing.current = null;
    }
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
      const started = Date.now();
      try {
        const r = (await backend.runAgents(event)) as { skipped?: string; decision?: string; changes?: string[] };
        await load();
        return r.skipped ?? 'Gata.';
      } catch (e) {
        // Conexiunea s-a rupt (telefon blocat, rețea), dar serverul își termină treaba: așteptăm mesajul nou până la 4 minute.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/load failed|failed to fetch|network|nu a răspuns/i.test(msg)) throw e;
        for (let i = 0; i < 24; i++) {
          await new Promise((r) => setTimeout(r, 10_000));
          const fresh = await backend.me().catch(() => null);
          // Mesajul cerut, nu oricare: același tip (sau avertismentul de siguranță) scris după apăsare.
          if (fresh && fresh.messages.some((m) => Date.parse(m.createdAt) >= started - 5_000 && (m.kind === event || m.kind === 'avertisment'))) {
            setMe(fresh);
            return 'Gata.';
          }
        }
        throw new Error('Antrenorul n-a terminat în 4 minute. Încearcă din nou peste puțin.');
      }
    },
    [backend, load],
  );

  const logout = useCallback(async () => {
    if (local) {
      localServer.reset();
      await load();
      return;
    }
    gen.current += 1;
    await signOut();
    setMe(null);
    setStatus('anon');
    // Ciornele și preferințele locale ale contului care iese nu rămân pentru următorul.
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('airon-') && k !== 'airon-invite') localStorage.removeItem(k);
    } catch {
      /* fără stocare locală */
    }
  }, [local, load]);

  const value = useMemo<Data>(() => ({ status, me, error, local, refresh: load, logout, submitForm, sync, connect, runAgents, offline }), [status, me, error, local, load, logout, submitForm, sync, connect, runAgents, offline]);
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
