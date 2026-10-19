import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PlannedWorkout } from '@core/types.js';
import type { Me } from '@core/api-types.js';
import { prescribe, sessionName, type Prescription } from '@core/strength/ppl.js';
import { strengthSpecFor } from '@core/strength/plan-specs.js';
import { weekday } from '@core/util/dates.js';
import { goalKind } from '@core/calendar/phases.js';
import { Dot, Icons, fmtDayMonth } from './common';
import { Actions, YellowDay } from './WorkoutActions';
import { StrengthHint, StrengthLogForm } from './StrengthLog';
import { useLocalBack } from './Shell';
import { useData, useMe } from '../data/store';
import { COLOR_LABEL, DAY_NAMES, SPORT_LABEL, activityFor, colorOf, dayOf, fmtMinutes, isUpcoming, purposeOf, reasonsOf, sessionSteps } from '../data/model';

const NOTE_STEPS = new Set(['Plafon', 'Puls', 'Important', 'Durata']);
const PLAIN: Record<PlannedWorkout['type'], string> = { z2: 'ușor', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă', brick: 'bicicletă + alergare', forta: 'forță', odihna: 'odihnă' };
const SPORT_ICON = { inot: Icons.waves, bicicleta: Icons.bike, alergare: Icons.run, forta: Icons.dumbbell } as const;

/** Prescripția de forță a unei ședințe: din textul din plan sau, la planurile vechi, recalculată cu aceeași regulă. */
export function strengthOf(me: Me, w: PlannedWorkout): Prescription | null {
  const age = me.profile.birthYear ? Number(me.today.slice(0, 4)) - me.profile.birthYear : null;
  const spec = strengthSpecFor(me.plan, w, me.planStart ?? null, me.user.raceDate ?? null, age != null && age >= 40 ? 3 : 4, me.user.goal);
  // Locul de antrenament din chestionar (planurile vechi nu îl au scris): acasă = doar exerciții cu gantere, bandă, corp.
  const acces = (me.forms.intake as { fitness?: { acces?: string } } | null)?.fitness?.acces;
  return spec ? prescribe({ ...spec, ...(spec.place ? {} : acces === 'acasa' ? { place: 'acasa' as const } : {}) }, w.plannedMinutes) : null;
}

const fmtRest = (sec: number) => (sec >= 120 ? `${Math.floor(sec / 60)}${sec % 60 ? `:${String(sec % 60).padStart(2, '0')}` : ''} min` : `${sec} s`);

type OpenFn = (screen: string, opts?: { activityId?: string }) => void;

/**
 * Fereastra ședinței: o deschizi cu useWorkoutSheet(); se închide cu ×, pe fundal sau cu „înapoi”.
 * Cu o listă (ședințele zilei), sus apare selectorul între ele, iar fereastra pornește pe ședința dată.
 */
export function useWorkoutSheet(onOpen?: OpenFn): { open: (w: PlannedWorkout, list?: PlannedWorkout[]) => void; sheet: JSX.Element | null; isOpen: boolean } {
  const [st, setSt] = useState<{ w: PlannedWorkout; list: PlannedWorkout[] } | null>(null);
  const close = useCallback(() => setSt(null), []);
  const open = useCallback((w: PlannedWorkout, list?: PlannedWorkout[]) => setSt({ w, list: list && list.some((x) => x.id === w.id) ? list : [w] }), []);
  return { open, isOpen: !!st, sheet: st ? <WorkoutSheet w={st.w} list={st.list} onClose={close} onOpen={onOpen} /> : null };
}

/**
 * Ce faci la ședința asta, într-o fereastră peste ecran (nu mai jos în pagină): de ce există, pașii cu minutele și
 * zonele, iar la forță exercițiile cu seriile, repetările, rezerva, pauza și indicația tehnică.
 */
export function WorkoutSheet({ w: first, list = [first], onClose, onOpen }: { w: PlannedWorkout; list?: PlannedWorkout[]; onClose: () => void; onOpen?: OpenFn }) {
  const me = useMe();
  const [id, setId] = useState(first.id);
  // Ședința se citește mereu din planul curent: dacă s-a schimbat între timp (Mută, Am mai puțin timp), se vede versiunea nouă.
  const w = me.plan.find((x) => x.id === id) ?? list.find((x) => x.id === id) ?? first;
  const tabs = list.map((x) => me.plan.find((p) => p.id === x.id) ?? x);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus?.();
  }, []);
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
  const showStructure = !rx && !!w.structure && w.type !== 'brick' && w.sport !== 'inot' && !steps.some((s) => s.text === w.structure);
  const upcoming = isUpcoming(me, w);
  const color = colorOf(me, w);
  const act = activityFor(me, w);
  const done = !upcoming && w.status !== 'anulat_sistem' && color !== 'asteptare';
  const reasons = reasonsOf(me, w);
  const yellow = !!day && day.level === 'galben' && !day.ask && upcoming;
  const fid = act?.id ?? `plan-${w.id}`;
  const ev = me.forms.evening[fid];

  return createPortal(
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label="Ședința" onClick={onClose}>
      <div className="sheet" ref={box} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden="true" />
        {tabs.length > 1 && (
          <div className="sheet-tabs" role="tablist" aria-label="Ședințele zilei">
            {tabs.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === w.id} className={x.id === w.id ? 'on' : ''} onClick={() => setId(x.id)}>
                {SPORT_LABEL[x.sport]}
                {!isUpcoming(me, x) && colorOf(me, x) !== 'asteptare' ? ' · făcut' : ''}
              </button>
            ))}
          </div>
        )}
        <div className="sheet-head">
          <span className="wk-ic">{SPORT_ICON[w.sport]}</span>
          <div className="sheet-t">
            <b>
              {SPORT_LABEL[w.sport]} · {w.type === 'forta' ? (rx?.session.name ?? sessionName(w.structure) ?? 'forță') : PLAIN[w.type]}
            </b>
            <span>
              {when} · {w.status === 'anulat_sistem' ? `anulată · 0 min active (era ${fmtMinutes(w.plannedMinutes)})` : fmtMinutes(w.plannedMinutes)}
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
          {done && (
            <div className="wk-done">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <Dot color={color} />
                <b>{COLOR_LABEL[color]}</b>
                {act && <span className="muted">· {fmtMinutes(act.minutes)}{act.distanceKm ? ` · ${act.distanceKm.toFixed(1)} km` : ''}{act.avgHr ? ` · FC ${act.avgHr}` : ''}</span>}
              </div>
              {reasons.length > 0 && <div className="wk-note">{reasons.slice(0, 2).join(' · ')}</div>}
              {onOpen && (
                <button className={`pill ${ev && ev.rpe != null ? '' : 'on'}`} style={{ marginTop: 6 }} onClick={() => { onClose(); onOpen('seara', { activityId: fid }); }}>
                  {ev && ev.rpe != null ? `Feedback dat${ev.date ? ` · ${fmtDayMonth(ev.date)}` : ''} · editează` : 'Cum a fost? Dă feedback'}
                </button>
              )}
            </div>
          )}
          {yellow && <YellowDay w={w} />}
          {!upcoming && w.status !== 'anulat_sistem' && w.date <= me.today && <Missed w={w} done={done && !!act} />}

          <OldPlan off={w.status === 'anulat_sistem'}>
          <div className="sheet-why">{fitness && w.type === 'forta' ? 'Forță pentru obiectivul tău: mușchi construit sau păstrat, mai multă forță în viața de zi cu zi. Greutățile le alegi tu: una cu care mai aveai câteva repetări la final.' : purposeOf(w)}</div>

          {rx ? (
            <>
              <div className="sheet-k">Ce faci</div>
              <ol className="sheet-steps">
                <li>
                  <b>Încălzire</b> 5–8 min de mișcare ușoară, apoi 1–2 serii ușoare la primul exercițiu (nu se numără).
                </li>
                <li>
                  <b>Exercițiile</b> în ordinea de mai jos. La fiecare serie te oprești când mai aveai încă {rx.items[0]?.rir ?? '2–3'} repetări bune în tine; nu mergi până nu mai poți.
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
                        {r.ex.purpose ?? r.ex.group} · pauză {fmtRest(r.rest)}
                        {r.ex.unilateral ? ' · pe fiecare parte' : ''}
                        {r.optional ? ' · opțional' : ''}
                        {r.completion ? ' · în plus' : ''}
                      </span>
                      {r.ex.setup && <span className="str-cue">Cum reglezi: {r.ex.setup}.</span>}
                      <span className="str-cue">Cum faci: {r.ex.cue}.</span>
                      {r.ex.mistakes && <span className="str-cue">Atenție: {r.ex.mistakes}.</span>}
                      <span className="str-cue">Altă variantă: {r.ex.alt}.</span>
                      <StrengthHint r={r} maintain={rx.spec.block === 'mentinere'} />
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
                  {rx.notes.filter((n) => !(/^fără istoric de greutăți/i.test(n) && (me.strengthLog ?? []).some((x) => rx.items.some((r) => r.ex.id === x.exercise)))).map((n) => (
                    <li key={n}>{n.charAt(0).toUpperCase() + n.slice(1)}.</li>
                  ))}
                </ul>
              )}
              <p className="muted tiny">Încă nu avem filmări cu execuția; o găsești descrisă la fiecare exercițiu.</p>
              {w.date <= me.today && w.status !== 'anulat_sistem' && !paused && <StrengthLogForm key={w.id} w={w} rx={rx} />}
            </>
          ) : (
            <>
              <div className="sheet-k">Ce faci</div>
              <ol className="sheet-steps">
                {showStructure && (
                  <li>
                    <b>Pe scurt</b> {w.structure!.replace(/\s*\(fără calitate în evaluare\)/, '')}
                  </li>
                )}
                {steps.filter((st) => !NOTE_STEPS.has(st.label)).map((st) => (
                  <li key={st.label}>
                    <b>{st.label}</b> {st.text}
                  </li>
                ))}
              </ol>
              {steps.filter((st) => NOTE_STEPS.has(st.label)).map((st) => (
                <div key={st.label} className="sheet-tip">
                  <b>{st.label === 'Plafon' ? 'Plafon' : st.label === 'Puls' ? 'Despre puls' : st.label}:</b> {st.text.replace(/^Plafon: /, '')}
                </div>
              ))}
            </>
          )}

          </OldPlan>

          {w.sport === 'inot' && upcoming && <SwimPlace />}
          {w.note && w.status !== 'anulat_sistem' && <div className="wk-note">{w.note}</div>}
          {upcoming && !paused && (
            <>
              <div className="sheet-k">Nu merge azi așa? Adaptează</div>
              <Actions w={w} />
            </>
          )}
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

const MOTIVE = [
  ['timp', 'n-am avut timp'],
  ['oboseala', 'oboseală'],
  ['durere', 'durere'],
  ['boala', 'boală'],
  ['altul', 'alt motiv'],
] as const;

/**
 * Ședința care a trecut: „Nu am făcut-o” sau „Am făcut doar o parte”, cu motiv. E separată de „anulată” (decizia
 * sistemului) și de „fără date”; după trimitere, aplicația spune ce păstrează sau schimbă și de ce.
 */
function Missed({ w, done }: { w: PlannedWorkout; done: boolean }) {
  const me = useMe();
  const { submitForm } = useData();
  const saved = me.outcomes?.[w.id] ?? null;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'ratat' | 'partial'>(done ? 'partial' : 'ratat');
  const [minute, setMinute] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (motiv: string) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await submitForm('nefacut', { workoutId: w.id, status, motiv, ...(status === 'partial' ? { minute: Number(minute) } : {}) });
      setMsg(String(r.data?.mesaj ?? 'Am înregistrat.'));
      setOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const label = saved ? `${saved.status === 'ratat' ? 'Nefăcută' : `Făcută parțial${saved.minutes ? ` (${saved.minutes} min)` : ''}`}: ${MOTIVE.find((m) => m[0] === saved.motiv)?.[1] ?? saved.motiv}` : done ? null : 'Fără date: nu e nicio activitate legată și nimic declarat.';
  return (
    <div className="missed">
      {label && <div className="small muted">{label}</div>}
      {msg && <div className="wk-note" role="status">{msg}</div>}
      {!open ? (
        <button className="pill" style={{ marginTop: 6 }} onClick={() => setOpen(true)}>
          {saved ? 'Schimbă ce ai declarat' : done ? 'Am făcut doar o parte' : 'Nu am făcut-o / am făcut doar o parte'}
        </button>
      ) : (
        <div className="missed-form">
          {!done && (
            <div className="wk-btns">
              <button className={`pill ${status === 'ratat' ? 'on' : ''}`} onClick={() => setStatus('ratat')}>Nu am făcut-o</button>
              <button className={`pill ${status === 'partial' ? 'on' : ''}`} onClick={() => setStatus('partial')}>Am făcut doar o parte</button>
            </div>
          )}
          {status === 'partial' && (
            <label className="small" style={{ display: 'block', marginTop: 6 }}>
              Câte minute ai făcut? <input inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} style={{ width: 60 }} aria-label="minute făcute" />
            </label>
          )}
          <div className="small" style={{ marginTop: 6 }}>De ce?</div>
          <div className="wk-btns">
            {MOTIVE.map(([k, t]) => (
              <button key={k} className="pill" disabled={busy || (status === 'partial' && !(Number(minute) > 0))} onClick={() => void send(k)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ședința anulată: ce era planificat rămâne de citit, pliat și etichetat clar că nu se mai face (L-SIM-04). */
function OldPlan({ off, children }: { off: boolean; children: ReactNode }) {
  if (!off) return <>{children}</>;
  return (
    <details className="sheet-old">
      <summary>Ce era planificat (nu se mai face)</summary>
      {children}
    </details>
  );
}

/** Bazin sau ape libere: schimbă pașii ședințelor viitoare de înot (ape libere = alte condiții, fără test maximal). */
function SwimPlace() {
  const me = useMe();
  const { submitForm } = useData();
  const cur = me.prefs?.mediuInot ?? 'bazin';
  const [busy, setBusy] = useState(false);
  const set = async (m: 'bazin' | 'ape') => {
    if (m === cur || busy) return;
    setBusy(true);
    try {
      await submitForm('inot-mediu', { mediu: m });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row" style={{ gap: 8, marginTop: 10 }} role="group" aria-label="Unde înoți">
      <button className={`pill ${cur === 'bazin' ? 'on' : ''}`} aria-pressed={cur === 'bazin'} disabled={busy} onClick={() => void set('bazin')}>
        Bazin
      </button>
      <button className={`pill ${cur === 'ape' ? 'on' : ''}`} aria-pressed={cur === 'ape'} disabled={busy} onClick={() => void set('ape')}>
        Ape libere
      </button>
    </div>
  );
}
