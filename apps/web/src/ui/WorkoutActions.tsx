import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import { moveOptions } from '@core/calendar/actions.js';
import { weekday } from '@core/util/dates.js';
import { Icons } from './common';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';
import { DAY_NAMES, fmtMinutes } from '../data/model';

/**
 * Zi galbenă: aceeași idee ca sus („azi mai ușor”). Dacă antrenorul a pregătit varianta ușoară, ea e ședința de azi;
 * dacă ședința e deja ușoară, nu e nimic de schimbat; altfel butonul „Fă-o ușoară”.
 */
export function YellowDay({ w }: { w: PlannedWorkout }) {
  const { submitForm, local } = useData();
  const [busy, setBusy] = useState(false);
  const intense = w.type === 'calitate' || w.type === 'brick' || w.type === 'lung' || w.targetZones.some((z) => z >= 3);
  const s = w.suggestion;
  if (s && s.accepted === true) return <div className="wk-yellow">Zi galbenă: faci varianta ușoară, deja pusă în plan.</div>;
  if (s && s.accepted == null)
    return (
      <div className="wk-yellow">
        <div>
          Zi galbenă, deci azi: <b>{s.structure}</b> ({fmtMinutes(s.minutes)}) în loc de ce scrie mai sus.
        </div>
        {!local && (
          <button
            className="btn sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await submitForm('sugestie', { workoutId: w.id, accept: true });
              } finally {
                setBusy(false);
              }
            }}
          >
            Pune varianta ușoară în plan
          </button>
        )}
      </div>
    );
  if (!intense) return <div className="wk-yellow">Zi galbenă: ședința e deja ușoară. O faci așa, fără să forțezi.</div>;
  return <div className="wk-yellow">Zi galbenă: apasă „Fă-o ușoară” și ședința rămâne, fără intensitate.</div>;
}

export function Actions({ w }: { w: PlannedWorkout }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const [mode, setMode] = useState<null | 'muta' | 'timp'>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const intense = w.type === 'calitate' || w.type === 'brick' || w.type === 'lung' || w.targetZones.some((z) => z >= 3);
  const today = w.date === me.today;
  const shorter = today && w.sport !== 'forta' ? [20, 30, 45, 60, 75].filter((m) => m <= w.plannedMinutes - 10) : [];
  const run = async (kind: 'actiune' | 'timp', body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await submitForm(kind, body);
      setMsg(ok);
      setMode(null);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (local) return null;
  const opts = mode === 'muta' ? moveOptions(me.plan, w.id, me.today) : [];
  return (
    <div className="wk-act">
      {mode === null && (
        <div className="wk-btns">
          <button className="pill" disabled={busy} onClick={() => setMode('muta')}>
            {Icons.move} Mută
          </button>
          {intense && (
            <button className="pill" disabled={busy} onClick={() => void run('actiune', { workoutId: w.id, op: 'usor' }, 'Gata: ședința e ușoară. Progresia așteaptă.')}>
              Fă-o ușoară
            </button>
          )}
          {shorter.length > 0 && (
            <button className="pill" disabled={busy} onClick={() => setMode('timp')}>
              {Icons.timer} Am mai puțin timp
            </button>
          )}
        </div>
      )}
      {mode === 'muta' && (
        <div className="wk-pick">
          <div className="wk-pick-k">Pe ce zi din săptămâna asta?</div>
          {opts.length === 0 && <div className="wk-note">Nu se mai poate muta în săptămâna asta.</div>}
          {opts.map((o) => (
            <button key={o.date} className={`wk-day ${o.ok ? '' : 'no'}`} disabled={!o.ok || busy} onClick={() => void run('actiune', { workoutId: w.id, op: 'muta', date: o.date }, `Mutată pe ${DAY_NAMES[weekday(o.date)]}.`)}>
              <b>{o.date === me.today ? 'azi' : DAY_NAMES[weekday(o.date)]}</b>
              <span>{o.ok ? 'se poate' : o.reason}</span>
            </button>
          ))}
          <button className="pill" onClick={() => setMode(null)}>Renunț</button>
        </div>
      )}
      {mode === 'timp' && (
        <div className="wk-pick">
          <div className="wk-pick-k">Cât timp ai? În plan: {fmtMinutes(w.plannedMinutes)}</div>
          <div className="wk-btns">
            {shorter.map((m) => (
              <button key={m} className="pill on" disabled={busy} onClick={() => void run('timp', { workoutId: w.id, minutes: m }, `Gata: ${m} min, cu partea importantă păstrată. Ce rămâne nu se adaugă în alte zile.`)}>
                {m} min
              </button>
            ))}
            <button className="pill" onClick={() => setMode(null)}>Renunț</button>
          </div>
        </div>
      )}
      {msg && <div className="wk-note" role="status">{msg}</div>}
    </div>
  );
}
