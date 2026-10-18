import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import { changeSummary, moveOptions } from '@core/calendar/actions.js';
import { addDays, weekday } from '@core/util/dates.js';
import { Dot, Icons } from './common';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';
import { COLOR_LABEL, DAY_NAMES, SPORT_LABEL, activityFor, colorOf, dayOf, firstSentences, fmtMinutes, isUpcoming, localDayOf, purposeOf, reasonsOf, sessionSteps } from '../data/model';

const PLAIN: Record<PlannedWorkout['type'], string> = { z2: 'ușor', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă', brick: 'bicicletă + alergare', forta: 'forță', odihna: 'odihnă' };
const SPORT_ICON = { inot: Icons.waves, bicicleta: Icons.bike, alergare: Icons.run, forta: Icons.dumbbell } as const;

/**
 * O ședință, la fel peste tot (Acasă și Calendar): ce faci, cât, ce intensitate și de ce; ce s-a schimbat și de ce
 * („Actualizat”); după ce ai făcut-o, cum a ieșit. Acțiunile (Mută, Fă-o ușoară, Am mai puțin timp) doar pe ce urmează.
 */
export function WorkoutCard({ w, hero = false, onOpen }: { w: PlannedWorkout; hero?: boolean; onOpen?: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const [showSteps, setShowSteps] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const color = colorOf(me, w);
  const cancelled = w.status === 'anulat_sistem';
  const upcoming = isUpcoming(me, w);
  const act = activityFor(me, w);
  const done = !upcoming && !cancelled && color !== 'asteptare';
  const changes = changeSummary(w);
  const reasons = reasonsOf(me, w);
  const debrief = done ? me.messages.find((m) => m.kind === 'dupa_antrenament' && localDayOf(m.createdAt) >= w.date && localDayOf(m.createdAt) <= addDays(w.date, 1)) : undefined;
  const zones = w.targetZones.length ? `Z${w.targetZones.join('–')}` : '';
  // Decizia zilei se aplică și ședinței de azi: în zi roșie nu i se mai propune nimic, în zi galbenă varianta ușoară.
  const day = w.date === me.today && (upcoming || cancelled) ? dayOf(me) : null;
  const paused = !!day && (day.level === 'rosu' || day.level === 'stop');
  const yellow = !!day && day.level === 'galben' && upcoming;
  const off = cancelled || paused;

  return (
    <div className={`wk ${hero ? 'hero' : ''} ${off ? 'off' : ''}`}>
      <div className="wk-head">
        <span className="wk-ic">{SPORT_ICON[w.sport]}</span>
        <div className="wk-t">
          <div className="wk-name">
            {SPORT_LABEL[w.sport]} <span>· {PLAIN[w.type]}</span>
          </div>
          <div className="wk-sub">{[zones, w.key && !cancelled ? 'cheie' : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="wk-min">
          {off ? <s>{fmtMinutes(w.original?.plannedMinutes ?? w.plannedMinutes)}</s> : fmtMinutes(w.plannedMinutes)}
        </div>
      </div>

      {cancelled || paused ? (
        <div className="wk-off">
          {Icons.stop}
          <span>{paused ? `${day!.title}: azi nu faci ședința asta.` : cap(w.note ?? 'Anulată de sistem.')}</span>
        </div>
      ) : (
        <div className="wk-why">{purposeOf(w)}</div>
      )}

      {changes && !cancelled && (
        <div className="wk-upd">
          <button className="wk-chip" onClick={() => setShowChange(!showChange)} aria-expanded={showChange}>
            {Icons.refresh} Actualizat: {changes.join(' · ')}
          </button>
          {showChange && (
            <div className="wk-upd-d">
              <div>
                În plan era: <b>{SPORT_LABEL[w.original!.sport ?? w.sport]} {fmtMinutes(w.original!.plannedMinutes)}</b>
                {w.original!.targetZones.length ? `, Z${w.original!.targetZones.join('–')}` : ''}, {DAY_NAMES[weekday(w.original!.date)]}.
              </div>
              {w.note && <div>De ce: {w.note}.</div>}
            </div>
          )}
        </div>
      )}
      {!changes && w.note && !cancelled && <div className="wk-note">{w.note}</div>}

      {done && (
        <div className="wk-done">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Dot color={color} />
            <b>{COLOR_LABEL[color]}</b>
            {act && <span className="muted">· {fmtMinutes(act.minutes)}{act.distanceKm ? ` · ${act.distanceKm.toFixed(1)} km` : ''}{act.avgHr ? ` · FC ${act.avgHr}` : ''}</span>}
          </div>
          {reasons.length > 0 && <div className="wk-note">{reasons.slice(0, 2).join(' · ')}</div>}
          {debrief && (
            <div className="wk-msg">
              {firstSentences(debrief.body, 2)}{' '}
              {onOpen && (
                <button className="linkish" onClick={() => onOpen('antrenor')}>
                  Vezi analiza
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {yellow && <YellowDay w={w} />}

      {!off && !done && (
        <>
          <button className="linkish" onClick={() => setShowSteps(!showSteps)} aria-expanded={showSteps}>
            {showSteps ? 'Ascunde pașii' : 'Cum o faci'}
          </button>
          {showSteps && (
            <ol className="steps">
              {w.structure && w.type !== 'brick' && <li><b>Structura</b> {w.structure}</li>}
              {sessionSteps(me, w).map((st) => (
                <li key={st.label}>
                  <b>{st.label}</b> {st.text}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {upcoming && !paused && <Actions w={w} />}
    </div>
  );
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Zi galbenă: aceeași idee ca sus („azi mai ușor”). Dacă antrenorul a pregătit varianta ușoară, ea e ședința de azi;
 * dacă ședința e deja ușoară, nu e nimic de schimbat; altfel butonul „Fă-o ușoară”.
 */
function YellowDay({ w }: { w: PlannedWorkout }) {
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

function Actions({ w }: { w: PlannedWorkout }) {
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
