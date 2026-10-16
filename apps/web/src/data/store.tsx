// Starea aplicației: sesiunea, obiectul `Me` de la server, reîncărcarea după formulare și sincronizare.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Me } from '@core/api-types.js';
import { CONFIG, captureSessionFromUrl, configured, getSession, server, signOut } from './api';
import { buildDemoMe } from './demo';
import { forms as localForms } from '../forms/store';

export type Status = 'boot' | 'unconfigured' | 'anon' | 'loading' | 'ready' | 'error';

export interface Data {
  status: Status;
  me: Me | null;
  error: string | null;
  demo: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Trimite un formular la server (sau îl ține local în demo) și reîncarcă. */
  submitForm: (kind: 'intrare' | 'dimineata' | 'seara' | 'saptamanal', body: unknown) => Promise<{ ok: boolean; info?: string }>;
  sync: () => Promise<string | null>;
  connect: (provider: 'whoop' | 'strava' | 'oura') => Promise<void>;
  runAgents: (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal') => Promise<string>;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const demo = CONFIG.demo;
  const [status, setStatus] = useState<Status>('boot');
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demo) {
      setMe(withLocalForms(buildDemoMe()));
      setStatus('ready');
      return;
    }
    if (!configured()) {
      setStatus('unconfigured');
      return;
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
  }, [demo]);

  useEffect(() => {
    captureSessionFromUrl();
    void load();
  }, [load]);

  const submitForm = useCallback<Data['submitForm']>(
    async (kind, body) => {
      if (demo) {
        applyLocally(kind, body);
        setMe(withLocalForms(buildDemoMe()));
        return { ok: true };
      }
      const r = await server.form(kind, body);
      await load();
      const plan = r.plan as { ok?: boolean; reason?: string; budgetHours?: number; weeks?: number } | undefined;
      if (kind === 'intrare' && plan) return { ok: !!plan.ok, info: plan.ok ? `Plan pe ${plan.weeks} săptămâni, ${plan.budgetHours} h/săpt.` : plan.reason };
      return { ok: true };
    },
    [demo, load],
  );

  const sync = useCallback(async () => {
    if (demo) {
      await new Promise((r) => setTimeout(r, 800));
      const now = new Date().toISOString();
      setMe((m) => (m ? { ...m, lastSync: now } : m));
      return now;
    }
    const r = await server.sync();
    await load();
    return r.lastSync;
  }, [demo, load]);

  const connect = useCallback(
    async (provider: 'whoop' | 'strava' | 'oura') => {
      if (demo) return;
      const { url } = await server.oauthStart(provider);
      location.href = url;
    },
    [demo],
  );

  const runAgents = useCallback(
    async (event: 'dimineata' | 'dupa_antrenament' | 'saptamanal') => {
      if (demo) return 'În demo agenții nu rulează.';
      const r = await server.runAgents(event);
      await load();
      return r.skipped ?? `Decizia: ${r.decision}. ${r.changes?.length ? `${r.changes.length} schimbări în calendar.` : ''}`;
    },
    [demo, load],
  );

  const logout = useCallback(async () => {
    await signOut();
    setMe(null);
    setStatus('anon');
  }, []);

  const value = useMemo<Data>(() => ({ status, me, error, demo, refresh: load, logout, submitForm, sync, connect, runAgents }), [status, me, error, demo, load, logout, submitForm, sync, connect, runAgents]);
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

// ---------- demo: formularele rămân în telefon ----------

function applyLocally(kind: string, body: unknown): void {
  const b = body as Record<string, unknown>;
  if (kind === 'intrare') localForms.saveIntake(body as never);
  if (kind === 'dimineata') localForms.saveMorning(body as never);
  if (kind === 'seara') {
    localForms.saveEvening(body as never);
    if (b.tip_neplanificat && typeof b.activityId === 'string') localForms.saveUnplanned(b.activityId, b.tip_neplanificat as never);
  }
  if (kind === 'saptamanal') localForms.saveWeekly(body as never);
}

function withLocalForms(me: Me): Me {
  const s = localForms.read();
  return {
    ...me,
    intakeComplete: s.intake ? !!s.intake.consimtamant : me.intakeComplete,
    forms: { intake: s.intake ?? null, morning: s.morning[me.today] ?? null, evening: s.evening, weeklyDone: Object.keys(s.weekly).length > 0 },
    activities: me.activities.map((a) => (a.unplanned && s.unplanned[a.id] ? { ...a, tipNeplanificat: s.unplanned[a.id]! } : a)),
  };
}
