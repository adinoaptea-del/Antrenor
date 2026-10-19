import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import type { Prescription, Rx } from '@core/strength/ppl.js';
import { minRir, nextSuggestion, parseRepsInput, repRange, type StrengthLogEntry } from '@core/strength/log.js';
import { addDays } from '@core/util/dates.js';
import type { Me } from '@core/api-types.js';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';

/** Sub fiecare exercițiu: ce ai făcut data trecută și ce încerci azi (din jurnal, fără kilograme inventate). */
export function StrengthHint({ r, maintain }: { r: Rx; maintain?: boolean }) {
  const me = useMe();
  const s = nextSuggestion(r.ex.id, r.reps, r.rir, me.strengthLog ?? [], { pain: recentPain(me), maintain });
  return (
    <span className="str-hint">
      {s.last && <>Data trecută: {s.last}. </>}
      {s.today}
    </span>
  );
}

/** Durere ≥ 3/10 raportată în ultimele 7 zile (formularul de seară): progresia se oprește. */
export function recentPain(me: Me): boolean {
  const from = addDays(me.today, -7);
  return Object.values(me.forms.evening ?? {}).some((e) => !!e && e.date >= from && (e.durere?.scor ?? 0) >= 3);
}

const lastKg = (log: StrengthLogEntry[], ex: string) => {
  const e = [...log].filter((x) => x.exercise === ex).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  const kg = e ? Math.max(...e.sets.map((s) => s.kg ?? -1)) : -1;
  return kg >= 0 ? kg : null;
};

/**
 * Notarea după ședință: „Am făcut cum scrie” preia valorile propuse (repetările de jos ale intervalului și greutatea
 * de data trecută, dacă există — altfel fără kilograme); „Ajustez” cere valorile reale pe fiecare exercițiu.
 */
export function StrengthLogForm({ w, rx }: { w: PlannedWorkout; rx: Prescription }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const log = me.strengthLog ?? [];
  const saved = log.filter((x) => x.date === w.date && rx.items.some((r) => r.ex.id === x.exercise));
  const [mode, setMode] = useState<'idle' | 'edit'>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const items = rx.items.filter((r) => repRange(r.reps));
  const [vals, setVals] = useState<Record<string, { kg: string; reps: string; rir: string }>>(() =>
    Object.fromEntries(
      items.map((r) => {
        const prev = saved.find((x) => x.exercise === r.ex.id);
        const kg = prev ? Math.max(...prev.sets.map((s) => s.kg ?? -1)) : lastKg(log, r.ex.id) ?? -1;
        return [r.ex.id, { kg: kg >= 0 ? String(kg) : '', reps: prev ? prev.sets.map((x) => x.reps ?? '').join('/') : String(repRange(r.reps)![0]), rir: String(prev?.rir ?? minRir(r.rir)) }];
      }),
    ),
  );
  if (!items.length) return null;

  const send = async (source: 'confirmat' | 'ajustat') => {
    setBusy(true);
    setErr(null);
    try {
      const body = items.map((r) => {
        const v = vals[r.ex.id]!;
        const kg = source === 'confirmat' ? lastKg(log, r.ex.id) : v.kg.trim() === '' ? null : Number(v.kg.replace(',', '.'));
        const reps = source === 'confirmat' ? Array(r.sets).fill(repRange(r.reps)![0]) : parseRepsInput(v.reps, r.sets);
        return { exercise: r.ex.id, sets: reps.map((n) => ({ kg: kg != null && Number.isFinite(kg) ? kg : null, reps: n })), rir: source === 'confirmat' ? minRir(r.rir) : Number(v.rir), source };
      });
      await submitForm('forta-jurnal', { date: w.date, items: body });
      setMode('idle');
    } catch (e) {
      setErr(isNetworkError(e) && !local ? 'fără internet: încearcă din nou când ai semnal' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="str-log">
      <div className="sheet-k">Ce ai făcut</div>
      {saved.length > 0 && mode === 'idle' && <p className="muted tiny">Notat: {saved.length} exerciții{saved.some((x) => x.source === 'ajustat') ? ' (cu valorile tale)' : ' (cum scria)'}. Data viitoare pornești de aici.</p>}
      {mode === 'idle' ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="pill on" disabled={busy} onClick={() => void send('confirmat')}>
            Am făcut cum scrie
          </button>
          <button className="pill" disabled={busy} onClick={() => setMode('edit')}>
            {saved.length ? 'Editează' : 'Ajustez: scriu kg și repetări'}
          </button>
        </div>
      ) : (
        <div className="str-log-edit">
          {items.map((r) => {
            const v = vals[r.ex.id]!;
            const set = (k: 'kg' | 'reps' | 'rir', x: string) => setVals({ ...vals, [r.ex.id]: { ...v, [k]: x } });
            return (
              <div key={r.ex.id} className="str-log-row">
                <b>{r.ex.name}</b>
                <label>
                  kg <input inputMode="decimal" value={v.kg} placeholder="—" onChange={(e) => set('kg', e.target.value)} aria-label={`${r.ex.name}: kilograme`} />
                </label>
                <label>
                  rep. <input inputMode="text" value={v.reps} placeholder="12/11/10" onChange={(e) => set('reps', e.target.value)} aria-label={`${r.ex.name}: repetări pe fiecare serie, despărțite prin /`} />
                </label>
                <label>
                  rezervă <input inputMode="numeric" value={v.rir} onChange={(e) => set('rir', e.target.value)} aria-label={`${r.ex.name}: repetări în rezervă`} />
                </label>
              </div>
            );
          })}
          <p className="muted tiny">Repetările pe fiecare serie, despărțite prin „/” (ex. 12/11/10); la exercițiile pe o parte, pe fiecare parte. Kilogramele le lași goale dacă nu știi (aparat fără cifre, greutatea corpului): nu ghicim noi în locul tău. Rezerva e pentru ultima serie, nu efortul întregii ședințe.</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="pill on" disabled={busy} onClick={() => void send('ajustat')}>
              Salvează
            </button>
            <button className="pill" disabled={busy} onClick={() => setMode('idle')}>
              Renunț
            </button>
          </div>
        </div>
      )}
      {err && <p className="err tiny">{err}</p>}
    </div>
  );
}
