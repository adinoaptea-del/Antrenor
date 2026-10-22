import { isMovedByAthlete } from '@core/calendar/flags.js';
import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import { SWAP_SPORTS, moveOptions, sportSwapBlock } from '@core/calendar/actions.js';
import type { Sport } from '@core/types.js';
import { weekday } from '@core/util/dates.js';
import { Icons } from './common';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';
import { DAY_NAMES, fmtMinutes } from '../data/model';

/**
 * Varianta ușoară propusă. Zi galbenă: „azi mai ușor”. După un efort în plus (regula proprietarului, 20.10.2026):
 * ședința rămâne în plan, iar varianta ușoară e doar o recomandare anti-suprasolicitare — alegi tu.
 */
export function YellowDay({ w, yellow = true }: { w: PlannedWorkout; yellow?: boolean }) {
  const { submitForm, local } = useData();
  const [busy, setBusy] = useState(false);
  const intense = w.type === 'calitate' || w.type === 'brick' || w.type === 'lung' || w.targetZones.some((z) => z >= 3);
  const s = w.suggestion;
  const choose = async (accept: boolean) => {
    setBusy(true);
    try {
      await submitForm('sugestie', { workoutId: w.id, accept });
    } finally {
      setBusy(false);
    }
  };
  if (s && s.accepted === true)
    return (
      <div className="wk-yellow">
        <div>{yellow ? 'Zi galbenă: faci varianta ușoară, deja pusă în plan.' : 'Faci varianta ușoară, aleasă de tine.'}</div>
        {!yellow && !local && (
          <button className="btn sm" disabled={busy} onClick={() => choose(false)}>
            Revin la ședința din plan
          </button>
        )}
      </div>
    );
  if (s && s.accepted == null)
    return (
      <div className="wk-yellow">
        <div>
          {yellow ? 'Zi galbenă, deci azi: ' : 'Ședința rămâne în plan. Recomandat, ca să eviți suprasolicitarea: '}
          <b>{s.structure}</b>{/^\d+ min/.test(s.structure) ? '' : ` (${fmtMinutes(s.minutes)})`}{yellow ? ' în loc de ce scrie mai sus.' : '.'}
          {!yellow && s.reason && <div className="tiny muted">{s.reason.replace(/; alegi tu$/, '')}</div>}
        </div>
        {!local && (
          <div className="wk-btns">
            <button className="btn sm" disabled={busy} onClick={() => choose(true)}>
              Pune varianta ușoară în plan
            </button>
            {!yellow && (
              <button className="btn sm" disabled={busy} onClick={() => choose(false)}>
                Rămân pe plan
              </button>
            )}
          </div>
        )}
      </div>
    );
  if (!yellow) return null;
  if (!intense) return <div className="wk-yellow">Zi galbenă: ședința e deja ușoară. O faci așa, fără să forțezi.</div>;
  return <div className="wk-yellow">Zi galbenă: apasă „Fă-o ușoară” și ședința rămâne, fără intensitate.</div>;
}

const SPORT_LABEL: Record<Sport, string> = { alergare: 'Alergare', bicicleta: 'Bicicletă', inot: 'Înot', forta: 'Forță', mers: 'Mers pe jos' };

export function Actions({ w }: { w: PlannedWorkout }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const [mode, setMode] = useState<null | 'muta' | 'timp' | 'sport'>(null);
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
  // Răzgândirea: ședința mutată de tine se poate pune înapoi în ziua din plan, cât timp ziua aceea n-a trecut.
  const movedByYou = !!w.original && isMovedByAthlete(w) && w.original.date >= me.today && w.original.date !== w.date;
  // A65: aceleași verificări ca serverul (programul liber și plecările).
  const program = (me.forms.intake as { program?: { day: number; startMin: number; endMin: number }[] } | null)?.program;
  const opts = mode === 'muta' ? moveOptions(me.plan, w.id, me.today, [], { freeBlocks: Array.isArray(program) ? program : undefined, away: me.prefs?.plecari ?? [] }) : [];
  return (
    <div className="wk-act">
      {mode === null && movedByYou && (
        <div className="wk-btns">
          <button className="pill on" disabled={busy} onClick={() => void run('actiune', { workoutId: w.id, op: 'inapoi' }, w.original!.date === me.today ? 'Gata: ședința e din nou azi.' : `Gata: ședința e din nou ${DAY_NAMES[weekday(w.original!.date)]}.`)}>
            {Icons.move} Pune-o înapoi {w.original!.date === me.today ? 'azi' : DAY_NAMES[weekday(w.original!.date)]}
          </button>
        </div>
      )}
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
          {!sportSwapBlock(w) && (
            <button className="pill" disabled={busy} onClick={() => setMode('sport')}>
              Alt sport
            </button>
          )}
        </div>
      )}
      {mode === 'sport' && (
        <div className="wk-pick">
          <div className="wk-pick-k">Ce faci în loc?</div>
          <div className="wk-note">Aceeași zi, ușor{w.sport === 'inot' ? '' : ', aceeași durată'}. Intensitatea sau ieșirea lungă nu se mută în alt sport. Te poți răzgândi oricând: revii la sportul din plan și ședința e exact cum era.</div>
          <div className="wk-btns">
            {SWAP_SPORTS.filter((sp) => sp !== w.sport).map((sp) => (
              <button key={sp} className="pill on" disabled={busy} onClick={() => void run('actiune', { workoutId: w.id, op: 'sport', sport: sp }, w.original?.sport === sp ? 'Gata: ședința e din nou cea din plan.' : `Gata: azi ${SPORT_LABEL[sp]}, ușor.`)}>
                {SPORT_LABEL[sp]}
              </button>
            ))}
            <button className="pill" onClick={() => setMode(null)}>Renunț</button>
          </div>
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
