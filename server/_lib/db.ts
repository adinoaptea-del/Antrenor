// Acces la Postgres prin PostgREST (Supabase), cu cheia service role: trece peste RLS, deci fiecare interogare
// filtrează explicit pe user_id. Fără dependențe: doar fetch.
import { ENV, supabaseKeyHeaders } from './env.js';

type Row = Record<string, unknown>;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { ...supabaseKeyHeaders(ENV.supabaseService()), 'content-type': 'application/json', ...extra };
}

/**
 * Coloane adăugate de migrarea 0005 (schema 13), pe care codul le scrie înainte ca administratorul să ruleze
 * actualizarea bazei: pe o schemă veche, scrierea se repetă o dată fără ele, în loc să cadă tot planul.
 */
export const OPTIONAL_COLUMNS: Record<string, readonly string[]> = { workouts_planned: ['flags'], packets: ['context_hash'], plans: ['evaluation_weeks'] };

/** Coloana opțională pe care PostgREST n-o găsește (PGRST204 / „column … does not exist”), sau null. */
export function missingOptionalColumn(table: string, errText: string): string | null {
  for (const c of OPTIONAL_COLUMNS[table] ?? []) {
    if (new RegExp(`'${c}' column|column "?${c}"? (of relation "?${table}"? )?does not exist|\\.${c} does not exist`).test(errText)) return c;
  }
  return null;
}

export function stripColumn(body: unknown, col: string): unknown {
  const strip = (r: unknown) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const { [col]: _gone, ...rest } = r as Row;
    return rest;
  };
  return Array.isArray(body) ? body.map(strip) : strip(body);
}

async function call<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, retried: string[] = []): Promise<T> {
  const res = await fetch(`${ENV.supabaseUrl()}/rest/v1/${path}`, { method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    const col = body !== undefined && res.status === 400 ? missingOptionalColumn(path.split('?')[0]!, text) : null;
    if (col && !retried.includes(col)) return call<T>(method, path, stripColumn(body, col), extra, [...retried, col]);
    throw new Error(`db ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** `select('activities', { user_id: 'eq.x', date: 'gte.2026-01-01' }, { order: 'date.desc', limit: 50 })` */
export type Filters = Record<string, string | string[]>;

function params(filters: Filters, base: Record<string, string> = {}): URLSearchParams {
  const q = new URLSearchParams(base);
  for (const [k, v] of Object.entries(filters)) for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  return q;
}

/** Două filtre pe aceeași coloană: `{ date: ['gte.2026-01-01', 'lte.2026-02-01'] }`. */
export async function select<T = Row>(table: string, filters: Filters, opts: { select?: string; order?: string; limit?: number } = {}): Promise<T[]> {
  const q = params(filters, { select: opts.select ?? '*' });
  if (opts.order) q.set('order', opts.order);
  if (opts.limit) q.set('limit', String(opts.limit));
  return call<T[]>('GET', `${table}?${q.toString()}`);
}

export async function one<T = Row>(table: string, filters: Filters, opts: { select?: string; order?: string } = {}): Promise<T | null> {
  const rows = await select<T>(table, filters, { ...opts, limit: 1 });
  return rows[0] ?? null;
}

export async function insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]> {
  return call<T[]>('POST', table, Array.isArray(rows) ? rows : [rows], { prefer: 'return=representation' });
}

export async function upsert<T = Row>(table: string, rows: Row | Row[], onConflict: string): Promise<T[]> {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return [];
  return call<T[]>('POST', `${table}?on_conflict=${encodeURIComponent(onConflict)}`, list, { prefer: 'resolution=merge-duplicates,return=representation' });
}

/** Inserează doar rândurile noi; cele care există deja (cheie unică) sunt ignorate. Întoarce doar rândurile inserate. */
export async function insertIgnore<T = Row>(table: string, rows: Row | Row[], onConflict: string): Promise<T[]> {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return [];
  return call<T[]>('POST', `${table}?on_conflict=${encodeURIComponent(onConflict)}`, list, { prefer: 'resolution=ignore-duplicates,return=representation' });
}

/** Funcție SQL (tranzacție pe server): POST /rpc/<name>. */
export async function rpc<T = unknown>(name: string, args: Row): Promise<T> {
  return call<T>('POST', `rpc/${name}`, args);
}

export async function update(table: string, filters: Filters, patch: Row): Promise<void> {
  const q = params(filters);
  await call('PATCH', `${table}?${q.toString()}`, patch, { prefer: 'return=minimal' });
}

export async function remove(table: string, filters: Filters): Promise<void> {
  const q = params(filters);
  await call('DELETE', `${table}?${q.toString()}`, undefined, { prefer: 'return=minimal' });
}
