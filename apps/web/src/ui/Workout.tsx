import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import { sessionName } from '@core/strength/ppl.js';
import { changeSummary } from '@core/calendar/actions.js';
import { Actions, YellowDay } from './WorkoutActions';
import { addDays, weekday } from '@core/util/dates.js';
import { Dot, Icons, fmtDayMonth } from './common';
import { useWorkoutSheet } from './WorkoutSheet';
import { useMe } from '../data/store';
import { COLOR_LABEL, DAY_NAMES, SPORT_LABEL, activityFor, colorOf, dayOf, firstSentences, fmtMinutes, isUpcoming, localDayOf, purposeOf, reasonsOf } from '../data/model';

const PLAIN: Record<PlannedWorkout['type'], string> = { z2: 'ușor', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă', brick: 'bicicletă + alergare', forta: 'forță', odihna: 'odihnă' };
const SPORT_ICON = { inot: Icons.waves, bicicleta: Icons.bike, alergare: Icons.run, forta: Icons.dumbbell, mers: Icons.walk } as const;

/**
 * O ședință, la fel peste tot (Acasă și Calendar): ce faci, cât, ce intensitate și de ce; ce s-a schimbat și de ce
 * („Actualizat”); după ce ai făcut-o, cum a ieșit. Acțiunile (Mută, Fă-o ușoară, Am mai puțin timp) doar pe ce urmează.
 */
export function WorkoutCard({ w, hero = false, onOpen }: { w: PlannedWorkout; hero?: boolean; onOpen?: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const { open: openSheet, sheet } = useWorkoutSheet();
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
  const yellow = !!day && day.level === 'galben' && !day.ask && upcoming;
  const off = cancelled || paused;

  return (
    <div className={`wk ${hero ? 'hero' : ''} ${off ? 'off' : ''}`}>
      <button className="wk-head wk-tap" onClick={() => openSheet(w)} aria-label="Ce faci la ședința asta">
        <span className="wk-ic">{SPORT_ICON[w.sport]}</span>
        <div className="wk-t">
          <div className="wk-name">
            {SPORT_LABEL[w.sport]} {w.type === 'forta' ? (sessionName(w.structure) ? <span>·{'\u00a0'}{sessionName(w.structure)}</span> : null) : <span>·{'\u00a0'}{PLAIN[w.type]}</span>}
          </div>
          <div className="wk-sub">{[w.type === 'forta' ? (w.structure ?? '').split(' · ')[1] ?? '' : zones, w.key && !cancelled ? 'cheie' : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="wk-min">
          {off ? <s>{fmtMinutes(w.original?.plannedMinutes ?? w.plannedMinutes)}</s> : fmtMinutes(w.plannedMinutes)}
        </div>
      </button>

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
          {onOpen && (
            <div className="wk-btns" style={{ marginTop: 6 }}>
              {(() => {
                const fid = act?.id ?? `plan-${w.id}`;
                const ev = me.forms.evening[fid];
                const complete = !!ev && ev.rpe != null;
                return (
                  <button className={`pill ${complete ? '' : 'on'}`} onClick={() => onOpen('seara', { activityId: fid })}>
                    {complete ? `Feedback dat${ev?.date ? ` · ${fmtDayMonth(ev.date)}` : ''} · editează` : 'Cum a fost? Dă feedback'}
                  </button>
                );
              })()}
            </div>
          )}
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

      {!off && !done && !upcoming && color === 'asteptare' && (
        <div className="wk-note">
          {Icons.refresh} Așteaptă sincronizarea: fereastra se închide la finalul zilei de {DAY_NAMES[weekday(addDays(w.date, 1))]}. Lipsa datelor nu înseamnă că n-ai făcut-o.
        </div>
      )}

      {yellow && <YellowDay w={w} />}

      {!off && !done && (
        <button className="pill on wk-how" onClick={() => openSheet(w)}>
          Ce faci {w.date === me.today ? 'azi' : 'la ședința asta'} {Icons.arrowRight}
        </button>
      )}
      {sheet}

      {upcoming && !paused && <Actions w={w} />}
    </div>
  );
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
