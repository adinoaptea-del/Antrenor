import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlannedWorkout } from '@core/types.js';
import type { Me } from '@core/api-types.js';
import { prescribe, sessionName, type Prescription } from '@core/strength/ppl.js';
import { strengthSpecFor } from '@core/strength/plan-specs.js';
import { weekday } from '@core/util/dates.js';
import { goalKind } from '@core/calendar/phases.js';
import { Icons } from './common';
import { useLocalBack } from './Shell';
import { useMe } from '../data/store';
import { DAY_NAMES, SPORT_LABEL, dayOf, fmtMinutes, purposeOf, sessionSteps } from '../data/model';

const PLAIN: Record<PlannedWorkout['type'], string> = { z2: 'ușor', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă', brick: 'bicicletă + alergare', forta: 'forță', odihna: 'odihnă' };
const SPORT_ICON = { inot: Icons.waves, bicicleta: Icons.bike, alergare: Icons.run, forta: Icons.dumbbell } as const;

/** Prescripția de forță a unei ședințe: din textul din plan sau, la planurile vechi, recalculată cu aceeași regulă. */
export function strengthOf(me: Me, w: PlannedWorkout): Prescription | null {
  const age = me.profile.birthYear ? Number(me.today.slice(0, 4)) - me.profile.birthYear : null;
  const spec = strengthSpecFor(me.plan, w, me.planStart ?? null, me.user.raceDate ?? null, age != null && age >= 40 ? 3 : 4, me.user.goal);
  return spec ? prescribe(spec, w.plannedMinutes) : null;
}

const fmtRest = (sec: number) => (sec >= 120 ? `${Math.floor(sec / 60)}${sec % 60 ? `:${String(sec % 60).padStart(2, '0')}` : ''} min` : `${sec} s`);

/** Fereastra ședinței: o deschizi cu useWorkoutSheet(); se închide cu ×, pe fundal sau cu „înapoi”. */
export function useWorkoutSheet(): { open: (w: PlannedWorkout) => void; sheet: JSX.Element | null } {
  const [w, setW] = useState<PlannedWorkout | null>(null);
  const close = useCallback(() => setW(null), []);
  return { open: setW, sheet: w ? <WorkoutSheet w={w} onClose={close} /> : null };
}

/**
 * Ce faci la ședința asta, într-o fereastră peste ecran (nu mai jos în pagină): de ce există, pașii cu minutele și
 * zonele, iar la forță exercițiile cu seriile, repetările, rezerva, pauza și indicația tehnică.
 */
export function WorkoutSheet({ w, onClose }: { w: PlannedWorkout; onClose: () => void }) {
  const me = useMe();
  useLocalBack(true, onClose);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const rx = w.type === 'forta' ? strengthOf(me, w) : null;
  const fitness = goalKind(me.user.goal) === 'fitness';
  const day = w.date === me.today ? dayOf(me) : null;
  const paused = !!day && (day.level === 'rosu' || day.level === 'stop');
  const when = w.date === me.today ? 'azi' : `${DAY_NAMES[weekday(w.date)]}, ${Number(w.date.slice(8, 10))}`;
  const zones = w.targetZones.length ? `Z${w.targetZones.join('–')}` : '';
  const steps = rx ? [] : sessionSteps(me, w);
  const showStructure = !rx && !!w.structure && w.type !== 'brick' && !steps.some((s) => s.text === w.structure);

  return createPortal(
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label="Ședința" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <span className="wk-ic">{SPORT_ICON[w.sport]}</span>
          <div className="sheet-t">
            <b>
              {SPORT_LABEL[w.sport]} · {w.type === 'forta' ? (rx?.session.name ?? sessionName(w.structure) ?? 'forță') : PLAIN[w.type]}
            </b>
            <span>
              {when} · {fmtMinutes(rx ? Math.min(w.plannedMinutes, rx.minutes) : w.plannedMinutes)}
              {zones ? ` · ${zones}` : ''}
              {w.key ? ' · cheie' : ''}
            </span>
          </div>
          <button className="sheet-x" onClick={onClose} aria-label="Închide">
            ×
          </button>
        </div>

        <div className="sheet-body">
          {paused && <div className="wk-off">{Icons.stop} <span>{day!.title}: azi nu faci ședința asta.</span></div>}
          {w.status === 'anulat_sistem' && <div className="wk-off">{Icons.stop} <span>{w.note ?? 'Anulată de sistem.'}</span></div>}
          {w.suggestion && w.suggestion.accepted !== false && w.date === me.today && (
            <div className="wk-yellow">
              Zi galbenă: varianta ușoară e <b>{w.suggestion.structure}</b> ({fmtMinutes(w.suggestion.minutes)}).
            </div>
          )}

          <div className="sheet-why">{fitness && w.type === 'forta' ? 'Forță pentru obiectivul tău: mușchi construit sau păstrat, mai multă forță în viața de zi cu zi. Greutățile le alegi tu, după rezerva cerută.' : purposeOf(w)}</div>

          {rx ? (
            <>
              <div className="sheet-k">Ce faci</div>
              <ol className="sheet-steps">
                <li>
                  <b>Încălzire</b> 5–8 min mișcare ușoară, apoi 1–2 serii ușoare la primul exercițiu (nu sunt serii de lucru).
                </li>
                <li>
                  <b>Exercițiile</b> în ordinea de mai jos, cu {rx.items[0]?.rir ?? '2–3'} repetări în rezervă: te oprești când mai poți face încă atâtea, corect.
                </li>
                <li>
                  <b>La final</b> 3–5 min de revenire ușoară, opțional.
                </li>
              </ol>
              <div className="str-list" style={{ marginTop: 10 }}>
                {rx.items.map((r) => (
                  <div key={r.ex.id + (r.completion ? '-c' : '')} className="str-row">
                    <div className="str-ex">
                      <b>{r.ex.name}</b>
                      <span>
                        {r.ex.group} · pauză {fmtRest(r.rest)}
                        {r.completion ? ' · completare' : ''}
                      </span>
                      <span className="str-cue">
                        {r.ex.cue}. Alternativă: {r.ex.alt}.
                      </span>
                    </div>
                    <div className="str-sets">
                      <span className="str-set">
                        {r.sets} × {r.reps}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {rx.notes.length > 0 && (
                <ul className="str-notes">
                  {rx.notes.map((n) => (
                    <li key={n}>{n.charAt(0).toUpperCase() + n.slice(1)}.</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="sheet-k">Ce faci</div>
              <ol className="sheet-steps">
                {showStructure && (
                  <li>
                    <b>Pe scurt</b> {w.structure}
                  </li>
                )}
                {steps.map((st) => (
                  <li key={st.label}>
                    <b>{st.label}</b> {st.text}
                  </li>
                ))}
              </ol>
              {w.type !== 'odihna' && (
                <div className="sheet-tip">
                  {w.targetZones.every((z) => z <= 2)
                    ? 'Dacă nu mai poți vorbi în propoziții, încetinește: ritmul nu contează azi, efortul da.'
                    : 'Intervalele le faci la efortul cerut, nu mai tare. Dacă ultima repetare nu iese curat, o oprești.'}
                </div>
              )}
            </>
          )}

          {w.note && w.status !== 'anulat_sistem' && <div className="wk-note">{w.note}</div>}
          <div className="sheet-safe">Durere în piept, amețeală sau lipsă de aer neobișnuită: te oprești. Durere nouă care crește: oprești exercițiul și spui în feedbackul de seară.</div>
        </div>

        <button className="btn sheet-ok" onClick={onClose}>
          Am înțeles
        </button>
      </div>
    </div>,
    document.body,
  );
}
