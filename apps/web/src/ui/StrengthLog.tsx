import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import type { Prescription, Rx } from '@core/strength/ppl.js';
import { isMeasured, nextSuggestion, parseKgInput, parseRepsInput, repRange, repTargets, suggest, type StrengthLogEntry } from '@core/strength/log.js';
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

/** Greutățile pe serie de data trecută (piramida are greutăți diferite); null pe serie = necunoscut. */
const lastKgs = (log: StrengthLogEntry[], ex: string, n: number): (number | null)[] => {
  const e = [...log].filter((x) => x.exercise === ex).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  if (!e) return Array(n).fill(null);
  return Array.from({ length: n }, (_, i) => e.sets[Math.min(i, e.sets.length - 1)]?.kg ?? null);
};
const kgText = (kgs: (number | null)[]) => (kgs.every((k) => k == null) ? '' : new Set(kgs).size === 1 ? String(kgs[0] ?? '') : kgs.map((k) => (k == null ? '' : String(k))).join('/'));

/**
 * Notarea după ședință (auditul v93, A57/A58):
 *  - „Am făcut cum scrie” = declarat conform: repetările sunt ținta (nu o măsurătoare), rezerva rămâne nescrisă, iar
 *    greutatea pe serie e cea de data trecută doar când sugestia de azi era „aceleași greutăți” (altfel necunoscută);
 *  - „Ajustez” cere valorile reale, cu greutatea pe fiecare serie („20/22,5/25” la piramidă).
 * Fiecare exercițiu se notează pe ședință (workoutId) și pe poziția lui în prescripție.
 */
export function StrengthLogForm({ w, rx }: { w: PlannedWorkout; rx: Prescription }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const log = me.strengthLog ?? [];
  const saved = log.filter((x) => x.date === w.date && (x.workoutId == null || x.workoutId === '' || x.workoutId === w.id) && rx.items.some((r) => r.ex.id === x.exercise));
  const [mode, setMode] = useState<'idle' | 'edit'>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const items = rx.items.map((r, instance) => ({ r, instance })).filter(({ r }) => repRange(r.reps));
  const key = (instance: number) => String(instance);
  const [vals, setVals] = useState<Record<string, { kg: string; reps: string; rir: string }>>(() =>
    Object.fromEntries(
      items.map(({ r, instance }) => {
        const prev = saved.find((x) => x.exercise === r.ex.id && (x.instance ?? instance) === instance);
        const kgs = prev ? prev.sets.map((s) => s.kg) : lastKgs(log, r.ex.id, r.sets);
        // Rezerva nu se precompletează cu ținta: rămâne goală până o scrie sportivul.
        return [key(instance), { kg: kgText(kgs), reps: prev ? prev.sets.map((x) => x.reps ?? '').join('/') : repTargets(r.reps, r.sets).join('/'), rir: prev?.rir != null && isMeasured(prev) ? String(prev.rir) : '' }];
      }),
    ),
  );
  if (!items.length) return null;

  const send = async (source: 'declarat_conform' | 'ajustat') => {
    setBusy(true);
    setErr(null);
    try {
      const body = items.map(({ r, instance }) => {
        const v = vals[key(instance)]!;
        let kgs: (number | null)[];
        if (source === 'declarat_conform') {
          // „Cum scrie” = aceleași greutăți doar dacă asta cerea sugestia; la „crește” greutatea nouă nu e cunoscută.
          const s = suggest(r.ex.id, r.reps, r.rir, log, { pain: recentPain(me) });
          kgs = s.kind === 'creste' ? Array(r.sets).fill(null) : lastKgs(log, r.ex.id, r.sets);
        } else kgs = parseKgInput(v.kg, r.sets);
        const reps = source === 'declarat_conform' ? repTargets(r.reps, r.sets) : parseRepsInput(v.reps, r.sets);
        const rir = source === 'ajustat' && v.rir.trim() !== '' && Number.isFinite(Number(v.rir)) ? Number(v.rir) : null;
        return { exercise: r.ex.id, workoutId: w.id, instance, sets: reps.map((n, i) => ({ kg: kgs[i] ?? null, reps: n })), rir, source };
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
      {saved.length > 0 && mode === 'idle' && <p className="muted tiny">Notat: {saved.length} exerciții{saved.some(isMeasured) ? ' (cu valorile tale)' : ' (confirmat „cum scria”, fără valori măsurate)'}. Data viitoare pornești de aici.</p>}
      {mode === 'idle' ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="pill on" disabled={busy} onClick={() => void send('declarat_conform')}>
            Am făcut cum scrie
          </button>
          <button className="pill" disabled={busy} onClick={() => setMode('edit')}>
            {saved.length ? 'Editează' : 'Ajustez: scriu kg și repetări'}
          </button>
        </div>
      ) : (
        <div className="str-log-edit">
          {items.map(({ r, instance }) => {
            const v = vals[key(instance)]!;
            const set = (k: 'kg' | 'reps' | 'rir', x: string) => setVals({ ...vals, [key(instance)]: { ...v, [k]: x } });
            return (
              <div key={key(instance)} className="str-log-row">
                <b>{r.ex.name}</b>
                <label>
                  kg <input inputMode="text" value={v.kg} placeholder="—" onChange={(e) => set('kg', e.target.value)} aria-label={`${r.ex.name}: kilograme pe fiecare serie, despărțite prin /`} />
                </label>
                <label>
                  rep. <input inputMode="text" value={v.reps} placeholder="12/11/10" onChange={(e) => set('reps', e.target.value)} aria-label={`${r.ex.name}: repetări pe fiecare serie, despărțite prin /`} />
                </label>
                <label>
                  mai puteai <input inputMode="numeric" value={v.rir} placeholder="—" onChange={(e) => set('rir', e.target.value)} aria-label={`${r.ex.name}: câte repetări mai puteai face`} />
                </label>
              </div>
            );
          })}
          <p className="muted tiny">Repetările și kilogramele pe fiecare serie, despărțite prin „/” (ex. 12/11/10 și 20/22,5/25 la piramidă; o singură cifră = aceeași la toate seriile); la exercițiile pe o parte, pe fiecare parte. Kilogramele le lași goale dacă nu știi (aparat fără cifre, greutatea corpului): nu ghicim noi în locul tău. „Mai puteai” e pentru ultima serie; dacă nu știi, lasă gol.</p>
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
