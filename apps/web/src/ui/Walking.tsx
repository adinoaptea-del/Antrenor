import { useEffect, useState } from 'react';
import type { WalkingView } from '@core/walking/view.js';
import { shownMin, shownRemainingMin } from '@core/walking/minutes.js';
import { BRISK_EXPLAIN, type WalkSpec } from '@core/walking/plan.js';
import { addDays } from '@core/util/dates.js';
import { Card, Icons, Label, fmtDayMonth } from './common';
import { BackHeader } from './Shell';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';
import { DAY_NAMES } from '../data/model';

/**
 * Mersul pe jos: bula săptămânii (Acasă) și pagina ei. Toate cifrele vin calculate de pe server (src/walking): aici doar
 * se afișează, rotunjite la minut (realizat în jos, rămas în sus). Nimic nu se simulează: cronometrul arată doar timpul
 * real al înregistrării pornite pe acest telefon.
 */

const SOURCE: Record<string, string> = { strava: 'Strava', garmin: 'Garmin', apple: 'Apple Health', android: 'Samsung Health', samsung: 'Samsung Health', whoop: 'WHOOP', aplicatie: 'Cronometru AIRON', manual: 'Adăugată de tine' };
const BRISK_LABEL = { da: 'Da, merg alert', nu: 'Nu încă', nu_stiu: 'Nu știu' } as const;

const fmtMin = (m: number) => `${m.toLocaleString('ro-RO')} min`;

/** Ce scrie în bulă și ce citește cititorul de ecran. */
export function walkOrb(v: WalkingView): { body: JSX.Element; label: string; progress: number; met: boolean } {
  const w = v.week;
  const done = shownMin(w.doneSec);
  const left = shownRemainingMin(w.remainingSec);
  const progress = w.targetMin > 0 ? Math.min(1, w.doneSec / (w.targetMin * 60)) : 1;
  const stop = v.today.stop;
  const body = w.met ? (
    <>
      <span className="orb-k">Mers pe jos</span>
      <span className="orb-big">Obiectivul săptămânii îndeplinit</span>
      <span className="orb-sub walk-of">
        {done.toLocaleString('ro-RO')} din {w.targetMin} min
      </span>
    </>
  ) : (
    <>
      <span className="orb-k">Mers pe jos</span>
      <span className="walk-num">
        {left.toLocaleString('ro-RO')}
        <small> min</small>
      </span>
      <span className="walk-left">de mers rămase</span>
      <span className="orb-sub walk-of">
        {done.toLocaleString('ro-RO')} din {w.targetMin} min realizate săptămâna aceasta
      </span>
      {stop && <span className="orb-sub">Azi fără mers prescris</span>}
    </>
  );
  const label = w.met
    ? `Mers pe jos: obiectivul săptămânii îndeplinit, ${done} din ${w.targetMin} minute. Deschide detaliile.`
    : `Mers pe jos: ${left} minute rămase, ${done} din ${w.targetMin} minute realizate săptămâna aceasta.${stop ? ' Azi fără mers prescris.' : ''} Deschide detaliile.`;
  return { body, label, progress, met: w.met };
}

/** Animația „obiectiv îndeplinit” o singură dată pe săptămână, pe acest telefon. */
export function useMetOnce(weekStart: string, met: boolean): boolean {
  const [fire, setFire] = useState(false);
  useEffect(() => {
    if (!met) return;
    const k = `airon-mers-met-${weekStart}`;
    let seen = false;
    try {
      seen = localStorage.getItem(k) === '1';
      localStorage.setItem(k, '1');
    } catch {
      seen = false;
    }
    if (!seen) setFire(true);
  }, [weekStart, met]);
  return fire;
}

function timeOf(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('ro-RO', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return null;
  }
}

function dayLabel(d: string, today: string): string {
  if (d === today) return 'azi';
  if (d === addDays(today, -1)) return 'ieri';
  const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
  return `${DAY_NAMES[wd]}, ${fmtDayMonth(d)}`;
}

export function WalkPage({ onBack }: { onBack?: () => void }) {
  const me = useMe();
  const v = me.walking ?? null;
  const tz = me.user.tz || 'Europe/Bucharest';
  const [panel, setPanel] = useState<'none' | 'add'>('none');
  const [msg, setMsg] = useState<string | null>(null);

  if (!v) {
    return (
      <>
        {onBack && <BackHeader title="Mers pe jos" onBack={onBack} />}
        <Card>
          <div className="small muted">Bula de mers apare după ce alegi „Mers pe jos” în chestionarul de intrare.</div>
        </Card>
      </>
    );
  }
  const w = v.week;
  const done = shownMin(w.doneSec);
  const left = shownRemainingMin(w.remainingSec);

  return (
    <>
      {onBack && <BackHeader title="Mers pe jos" onBack={onBack} />}
      <div className="stack walk">
        {!v.schemaReady && (
          <section className="card note-card" role="status">
            <b>Baza de date trebuie actualizată</b>
            <p className="small">Plimbările importate se văd, dar ora, mersul alert, cronometrul și ștergerea se salvează doar după actualizare (Admin → Actualizează baza de date).</p>
          </section>
        )}

        <Card>
          <div className="walk-sum" aria-live="polite">
            <div>
              <span className="walk-k">Realizat</span>
              <b>{fmtMin(done)}</b>
              <small>din {w.targetMin} min</small>
            </div>
            <div>
              <span className="walk-k">{w.met ? 'Peste țintă' : 'Rămas'}</span>
              <b>{w.met ? fmtMin(shownMin(w.overSec)) : fmtMin(left)}</b>
              <small>{w.met ? 'Obiectivul săptămânii îndeplinit' : 'până duminică'}</small>
            </div>
          </div>
          <div className="walk-bar" role="img" aria-label={`${done} din ${w.targetMin} minute`}>
            <span style={{ width: `${Math.min(100, (w.doneSec / Math.max(1, w.targetMin * 60)) * 100)}%` }} />
          </div>
          <ul className="walk-facts small">
            <li>
              Săptămâna {fmtDayMonth(w.weekStart)} – {fmtDayMonth(w.weekEnd)} (luni–duminică, ora ta).
            </li>
            <li>
              Mers alert confirmat: <b>{fmtMin(shownMin(w.briskSec))}</b> (se arată separat; nu se deduce din viteză sau pași).
            </li>
            <li>
              Măsurat: {fmtMin(shownMin(w.measuredSec))} · declarat de tine: {fmtMin(shownMin(w.declaredSec))}.
            </li>
            {w.pausesUnknown && <li>La unele plimbări sursa dă doar durata totală: pauzele nu pot fi separate, se numără tot.</li>}
            {w.approxSplit && <li>O plimbare peste miezul nopții are pauze împărțite aproximativ între zile.</li>}
            <li className="muted">Pașii zilnici nu se transformă în minute. Alergarea, bicicleta și celelalte sporturi nu intră aici.</li>
          </ul>
        </Card>

        <TodayCard v={v} onAdd={() => setPanel('add')} setMsg={setMsg} />
        {msg && (
          <p className="small walk-msg" role="status">
            {msg}
          </p>
        )}
        {panel === 'add' && <AddWalk onClose={() => setPanel('none')} setMsg={setMsg} />}

        <WalkList v={v} tz={tz} setMsg={setMsg} />
        <TargetCard v={v} setMsg={setMsg} />
        <HistoryCard v={v} />
      </div>
    </>
  );
}

function Parts({ spec }: { spec: WalkSpec }) {
  const total = spec.totalMin;
  const seg = [
    { k: 'warm', min: spec.warmup.min, label: 'încălzire' },
    { k: spec.kind === 'alert' ? 'brisk' : spec.kind === 'proba' ? 'probe' : 'easy', min: spec.main.min, label: spec.kind === 'alert' ? 'alert' : 'principal' },
    { k: 'cool', min: spec.cooldown.min, label: 'revenire' },
  ];
  return (
    <div className="walk-parts" aria-hidden="true">
      {seg.map((s) => (
        <span key={s.k} className={`wp-${s.k}`} style={{ flexGrow: s.min / total }}>
          <b>{s.min}</b> {s.label}
        </span>
      ))}
    </div>
  );
}

function TodayCard({ v, onAdd, setMsg }: { v: WalkingView; onAdd: () => void; setMsg: (m: string | null) => void }) {
  const t = v.today;
  const spec = t.spec;
  const [short, setShort] = useState(false);
  return (
    <Card>
      <Label icon={Icons.walk}>Recomandarea de azi</Label>
      {t.stop ? (
        <p className="walk-stop">{t.note}</p>
      ) : spec ? (
        <>
          <div className="walk-today">
            <b>{short && spec.shorter ? spec.shorter.totalMin : spec.totalMin} min</b>
            <span>{spec.kind === 'alert' ? 'cu mers alert' : spec.kind === 'proba' ? 'ușor, cu o probă de mers alert' : 'mers ușor'}</span>
          </div>
          {short && spec.shorter ? <p className="small">{spec.shorter.text}</p> : <Parts spec={spec} />}
          <p className="small">{spec.purpose}</p>
          {t.note && <p className="small walk-note">{t.note}</p>}
          <details className="walk-how">
            <summary>Cum o faci</summary>
            <ol className="small">
              {spec.how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
            {(spec.kind === 'alert' || spec.kind === 'proba') && <p className="tiny muted">Mers alert: {BRISK_EXPLAIN} Nu există o viteză corectă pentru toată lumea.</p>}
          </details>
          {spec.shorter && (
            <button className="linkish" onClick={() => setShort(!short)} aria-pressed={short}>
              {short ? 'Varianta din plan' : `Ai mai puțin timp? Varianta scurtă: ${spec.shorter.totalMin} min`}
            </button>
          )}
        </>
      ) : (
        <p className="small">{t.note}</p>
      )}
      <Recorder disabled={t.stop} setMsg={setMsg} />
      <button className="btn dark walk-add" onClick={onAdd}>
        Adaugă o plimbare
      </button>
    </Card>
  );
}

/** Înregistrarea pornită pe acest telefon: start, pauze, stop. Supraviețuiește reîncărcării paginii. */
interface Rec {
  start: number;
  pausedMs: number;
  pauseAt: number | null;
  brisk: boolean;
}
const REC_KEY = 'airon-mers-rec';
const readRec = (): Rec | null => {
  try {
    const x = JSON.parse(localStorage.getItem(REC_KEY) ?? 'null') as Rec | null;
    return x && typeof x.start === 'number' ? x : null;
  } catch {
    return null;
  }
};
const writeRec = (r: Rec | null) => {
  try {
    if (r) localStorage.setItem(REC_KEY, JSON.stringify(r));
    else localStorage.removeItem(REC_KEY);
  } catch {
    /* fără stocare: înregistrarea ține cât e pagina deschisă */
  }
};

function Recorder({ disabled, setMsg }: { disabled: boolean; setMsg: (m: string | null) => void }) {
  const { submitForm, local } = useData();
  const [rec, setRec] = useState<Rec | null>(readRec);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [rec]);
  const set = (r: Rec | null) => {
    setRec(r);
    writeRec(r);
  };
  if (local) return null;
  if (!rec) {
    if (disabled) return null;
    return (
      <button className="btn walk-start" onClick={() => set({ start: Date.now(), pausedMs: 0, pauseAt: null, brisk: false })}>
        {Icons.walk} Începe mersul
      </button>
    );
  }
  const end = rec.pauseAt ?? now;
  const elapsed = Math.max(0, Math.round((now - rec.start) / 1000));
  const moving = Math.max(0, Math.round((end - rec.start - rec.pausedMs) / 1000));
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const stop = async () => {
    setBusy(true);
    setMsg(null);
    const stopAt = Date.now();
    const pausedMs = rec.pausedMs + (rec.pauseAt ? stopAt - rec.pauseAt : 0);
    const elapsedSec = Math.round((stopAt - rec.start) / 1000);
    const movingSec = Math.max(0, elapsedSec - Math.round(pausedMs / 1000));
    if (elapsedSec < 60) {
      setMsg('Sub un minut: nu se salvează.');
      set(null);
      setBusy(false);
      return;
    }
    try {
      await submitForm('mers', { op: 'adauga', sursa: 'aplicatie', startUtc: new Date(rec.start).toISOString(), elapsedSec, movingSec, alert: rec.brisk });
      set(null);
      setMsg(`Salvat: ${Math.floor(movingSec / 60)} min de mers${rec.brisk ? ' alert' : ''}. Bula s-a actualizat.`);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: înregistrarea rămâne aici; apasă din nou „Oprește și salvează” când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="walk-rec" role="group" aria-label="Înregistrarea mersului">
      <div className="walk-clock" aria-live="off">
        <b>{mm(moving)}</b>
        <small>{rec.pauseAt ? 'în pauză' : 'în mers'} · total {mm(elapsed)}</small>
      </div>
      <label className="walk-check">
        <input type="checkbox" checked={rec.brisk} onChange={(e) => set({ ...rec, brisk: e.target.checked })} /> Am mers alert
      </label>
      <div className="wk-btns">
        {rec.pauseAt ? (
          <button className="pill" onClick={() => set({ ...rec, pausedMs: rec.pausedMs + (Date.now() - rec.pauseAt!), pauseAt: null })}>
            Continuă
          </button>
        ) : (
          <button className="pill" onClick={() => set({ ...rec, pauseAt: Date.now() })}>
            Pauză
          </button>
        )}
        <button className="btn sm" disabled={busy} onClick={() => void stop()}>
          Oprește și salvează
        </button>
        <button className="pill" disabled={busy} onClick={() => set(null)}>
          Renunță
        </button>
      </div>
      <p className="tiny muted">Pauzele apăsate nu se numără. Bula se actualizează după salvare.</p>
    </div>
  );
}

function AddWalk({ onClose, setMsg }: { onClose: () => void; setMsg: (m: string | null) => void }) {
  const me = useMe();
  const { submitForm } = useData();
  const [date, setDate] = useState(me.today);
  const [ora, setOra] = useState('');
  const [min, setMin] = useState<number | null>(30);
  const [brisk, setBrisk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!min || min < 1 || min > 300) {
      setErr('Minutele: între 1 și 300.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await submitForm('mers', { op: 'adauga', sursa: 'manual', data: date, ora: ora || null, minute: min, alert: brisk });
      setMsg(`Adăugată: ${min} min${brisk ? ' de mers alert' : ''}, ${dayLabel(date, me.today)} (declarat).`);
      onClose();
    } catch (e) {
      setErr(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Label icon={Icons.edit}>Adaugă o plimbare</Label>
      <div className="pref-form">
        <label>
          Ziua
          <input className="date" type="date" value={date} max={me.today} min={addDays(me.today, -60)} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Ora de început (opțional; ajută la dubluri și la miezul nopții)
          <input className="date" type="time" value={ora} onChange={(e) => setOra(e.target.value)} />
        </label>
        <div className="pref-k" id="walk-min">
          Minute de mers
        </div>
        <div className="wk-btns" role="group" aria-labelledby="walk-min">
          {[10, 15, 20, 30, 45, 60].map((m) => (
            <button key={m} className={`pill ${min === m ? 'on' : ''}`} onClick={() => setMin(m)} aria-pressed={min === m}>
              {m}
            </button>
          ))}
          <input className="date walk-num-in" type="number" inputMode="numeric" min={1} max={300} aria-label="Alt număr de minute" value={min ?? ''} onChange={(e) => setMin(e.target.value ? Number(e.target.value) : null)} />
        </div>
        <label className="walk-check">
          <input type="checkbox" checked={brisk} onChange={(e) => setBrisk(e.target.checked)} /> Mers alert
        </label>
        <p className="tiny muted">{BRISK_EXPLAIN}</p>
        <p className="tiny muted">Se salvează ca „declarat”. Dacă aceeași plimbare vine și de pe ceas, se numără o singură dată.</p>
        {err && (
          <p className="small walk-err" role="alert">
            {err}
          </p>
        )}
        <div className="wk-btns">
          <button className="btn sm" disabled={busy} onClick={() => void save()}>
            Salvează
          </button>
          <button className="pill" onClick={onClose}>
            Renunț
          </button>
        </div>
      </div>
    </Card>
  );
}

function WalkList({ v, tz, setMsg }: { v: WalkingView; tz: string; setMsg: (m: string | null) => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMin, setEditMin] = useState<number | null>(null);
  const weekItems = v.items.filter((i) => i.date >= v.week.weekStart && i.date <= v.week.weekEnd);
  const older = v.items.filter((i) => i.date < v.week.weekStart);
  const [showOld, setShowOld] = useState(false);
  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await submitForm('mers', body);
      setMsg(ok);
      setOpen(null);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const row = (i: WalkingView['items'][number]) => {
    const t = timeOf(i.startUtc, tz);
    const imports = v.items.filter((x) => !x.manual && !x.excluded && x.date === i.date);
    const status = i.excluded ? 'scoasă din bulă' : i.duplicateOf ? 'aceeași plimbare ca alta din listă: numărată o dată' : i.reconciledWith ? 'legată de un import: se numără importul' : null;
    return (
      <li key={i.id} className={`walk-row ${i.excluded || i.duplicateOf ? 'off' : ''}`}>
        <button className="walk-row-h" onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id}>
          <span>
            <b>
              {dayLabel(i.date, me.today)}
              {t ? `, ${t}` : ''} · {i.movingMin ?? i.minutes} min
            </b>
            <small>
              {SOURCE[i.source] ?? i.source}
              {i.source === 'manual' ? ' · declarat' : ' · măsurat'}
              {i.brisk ? ' · mers alert' : ''}
              {!i.manual && i.movingMin == null ? ' · pauze neseparate' : ''}
              {i.movingMin != null && i.movingMin < i.minutes ? ` · din ${i.minutes} min cu pauze` : ''}
            </small>
            {status && <small className="walk-status">{status}</small>}
          </span>
          {Icons.chevronDown}
        </button>
        {open === i.id && !local && (
          <div className="walk-row-x">
            <label className="walk-check">
              <input type="checkbox" checked={i.brisk} disabled={busy || !v.schemaReady} onChange={(e) => void act({ op: 'editeaza', id: i.id, alert: e.target.checked }, e.target.checked ? 'Marcată ca mers alert.' : 'Nu mai e marcată ca mers alert.')} /> Mers alert (confirmat de tine)
            </label>
            {i.source === 'manual' && (
              <div className="wk-btns">
                <input className="date walk-num-in" type="number" inputMode="numeric" min={1} max={300} aria-label="Minute corectate" defaultValue={i.minutes} onChange={(e) => setEditMin(e.target.value ? Number(e.target.value) : null)} />
                <button className="pill" disabled={busy || !editMin} onClick={() => void act({ op: 'editeaza', id: i.id, minute: editMin }, `Corectată: ${editMin} min.`)}>
                  Corectează minutele
                </button>
              </div>
            )}
            {i.manual && imports.length > 0 && !i.reconciledWith && (
              <div className="wk-btns">
                {imports.map((x) => (
                  <button key={x.id} className="pill" disabled={busy || !v.schemaReady} onClick={() => void act({ op: 'leaga', id: i.id, cu: x.id }, 'Legată de import: se numără o singură dată.')}>
                    E aceeași cu {SOURCE[x.source] ?? x.source} {timeOf(x.startUtc, tz) ?? ''} ({x.movingMin ?? x.minutes} min)
                  </button>
                ))}
              </div>
            )}
            {i.reconciledWith && (
              <button className="linkish" disabled={busy} onClick={() => void act({ op: 'leaga', id: i.id, cu: null }, 'Dezlegată.')}>
                Nu e aceeași plimbare
              </button>
            )}
            <div className="wk-btns">
              {i.excluded ? (
                <button className="pill" disabled={busy} onClick={() => void act({ op: 'readu', id: i.id }, 'Readusă în bulă.')}>
                  Readu în bulă
                </button>
              ) : (
                <button className="pill" disabled={busy || (!i.manual && !v.schemaReady)} onClick={() => void act({ op: 'sterge', id: i.id }, i.manual ? 'Ștearsă. Bula s-a recalculat.' : 'Scoasă din bulă. Bula s-a recalculat.')}>
                  {i.manual ? 'Șterge' : 'Nu e mers: scoate din bulă'}
                </button>
              )}
            </div>
            {!i.manual && <p className="tiny muted">Durata măsurată de {SOURCE[i.source] ?? i.source} nu se rescrie de mână.</p>}
          </div>
        )}
      </li>
    );
  };
  return (
    <Card>
      <Label icon={Icons.route}>Plimbările săptămânii</Label>
      {weekItems.length === 0 ? (
        <p className="small muted">Nicio plimbare încă săptămâna asta. Apar singure de pe ceas (Strava, Apple Health, Samsung Health, WHOOP) sau le adaugi tu.</p>
      ) : (
        <ul className="walk-list">{weekItems.map(row)}</ul>
      )}
      {older.length > 0 && (
        <>
          <button className="linkish" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
            {showOld ? 'Ascunde plimbările mai vechi' : `Plimbările mai vechi (${older.length})`}
          </button>
          {showOld && <ul className="walk-list">{older.map(row)}</ul>}
        </>
      )}
    </Card>
  );
}

function TargetCard({ v, setMsg }: { v: WalkingView; setMsg: (m: string | null) => void }) {
  const { submitForm, local } = useData();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<number>(v.nextTargetMin);
  const [why, setWhy] = useState('');
  const [now, setNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cap, setCap] = useState(v.profile.capacityMin);
  const [brisk, setBrisk] = useState(v.profile.brisk);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await submitForm('mers-tinta', { tinta: to, motiv: why, acum: now });
      setMsg(`Ținta: ${to} min pe săptămână, ${now ? 'din săptămâna asta' : 'de luni'}. Schimbarea rămâne în istoric.${(r.data?.info as string | undefined) ? ` ${r.data!.info as string}` : ''}`);
      setOpen(false);
      setWhy('');
    } catch (e) {
      setErr(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const saveProfile = async () => {
    setBusy(true);
    setErr(null);
    try {
      await submitForm('mers-profil', { capacitate: cap, alert: brisk });
      setMsg('Salvat. Ședințele de luni încolo țin cont de asta.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Label icon={Icons.target}>Ținta săptămânii</Label>
      <p className="small">
        Săptămâna asta: <b>{v.week.targetMin} min</b>
        {v.nextTargetMin !== v.week.targetMin ? (
          <>
            {' '}
            · de luni: <b>{v.nextTargetMin} min</b>
          </>
        ) : null}
        . 200 de minute e reperul aplicației, nu o regulă pentru toată lumea: ținta se potrivește capacității tale.
      </p>
      <p className="tiny muted">Minutele neefectuate nu devin datorie: nu trec în săptămâna următoare și nu se adună într-o singură ședință.</p>
      {v.changes.length > 0 && (
        <ul className="walk-log small">
          {[...v.changes].reverse().map((c) => (
            <li key={c.at}>
              {fmtDayMonth(c.at.slice(0, 10))}: {c.from ?? '–'} → <b>{c.to} min</b>, din săptămâna {fmtDayMonth(c.effectiveWeek)}. Motiv: {c.reason}
            </li>
          ))}
        </ul>
      )}
      {!local &&
        (!open ? (
          <button className="pill" onClick={() => setOpen(true)}>
            Schimbă ținta
          </button>
        ) : (
          <div className="pref-form">
            <div className="pref-k" id="walk-target">
              Minute pe săptămână
            </div>
            <div className="wk-btns" role="group" aria-labelledby="walk-target">
              {[60, 90, 120, 150, 200, 250, 300].map((m) => (
                <button key={m} className={`pill ${to === m ? 'on' : ''}`} onClick={() => setTo(m)} aria-pressed={to === m}>
                  {m}
                </button>
              ))}
            </div>
            <label>
              Motivul (rămâne în istoric)
              <input className="date" type="text" value={why} maxLength={160} placeholder="ex. vreau să cresc treptat; am mai puțin timp luna asta" onChange={(e) => setWhy(e.target.value)} />
            </label>
            <label className="walk-check">
              <input type="checkbox" checked={now} onChange={(e) => setNow(e.target.checked)} /> Se aplică din săptămâna asta (altfel de luni)
            </label>
            {now && <p className="tiny muted">Bula săptămânii se recalculează cu ținta nouă; ședințele din calendar ale săptămânii rămân, cele de luni se împart după ținta nouă.</p>}
            {err && (
              <p className="small walk-err" role="alert">
                {err}
              </p>
            )}
            <div className="wk-btns">
              <button className="btn sm" disabled={busy || !why.trim()} onClick={() => void save()}>
                Salvează ținta
              </button>
              <button className="pill" onClick={() => setOpen(false)}>
                Renunț
              </button>
            </div>
          </div>
        ))}
      {!local && (
        <details className="walk-how">
          <summary>Cât poți merge acum și mersul alert</summary>
          <div className="pref-form">
            <div className="pref-k" id="walk-cap">
              Cât poți merge acum fără oprire, confortabil
            </div>
            <div className="wk-btns" role="group" aria-labelledby="walk-cap">
              {[10, 20, 30, 45, 60].map((m) => (
                <button key={m} className={`pill ${cap === m ? 'on' : ''}`} onClick={() => setCap(m)} aria-pressed={cap === m}>
                  {m === 60 ? '60+' : m} min
                </button>
              ))}
            </div>
            {v.demonstratedMin != null && <p className="tiny muted">Cea mai lungă plimbare din ultimele 14 zile: {v.demonstratedMin} min. Planul folosește valoarea mai mare dintre cele două, cel mult 60 de minute pe ședință.</p>}
            <div className="pref-k" id="walk-brisk">
              Mers alert: {BRISK_EXPLAIN.toLowerCase()}
            </div>
            <div className="wk-btns" role="group" aria-labelledby="walk-brisk">
              {(['da', 'nu_stiu', 'nu'] as const).map((b) => (
                <button key={b} className={`pill ${brisk === b ? 'on' : ''}`} onClick={() => setBrisk(b)} aria-pressed={brisk === b}>
                  {BRISK_LABEL[b]}
                </button>
              ))}
            </div>
            <button className="btn sm" disabled={busy} onClick={() => void saveProfile()}>
              Salvează
            </button>
          </div>
        </details>
      )}
    </Card>
  );
}

function HistoryCard({ v }: { v: WalkingView }) {
  // Doar de la prima plimbare încoace: săptămânile dinainte nu sunt „0 din țintă”, sunt fără date.
  const first = v.items.reduce<string | null>((m, i) => (!m || i.date < m ? i.date : m), null);
  const weeks = first ? v.history.filter((h) => addDays(h.weekStart, 6) >= first) : [];
  if (!weeks.length) return null;
  const max = Math.max(...weeks.map((h) => Math.max(h.targetMin * 60, h.doneSec)), 1);
  return (
    <Card>
      <Label icon={Icons.calendar}>Săptămânile trecute</Label>
      <ul className="walk-hist">
        {weeks.map((h) => (
          <li key={h.weekStart}>
            <span className="small">{fmtDayMonth(h.weekStart)}</span>
            <span className="walk-hbar" aria-hidden="true">
              <span style={{ width: `${(h.doneSec / max) * 100}%` }} className={h.met ? 'met' : ''} />
              <i style={{ left: `${((h.targetMin * 60) / max) * 100}%` }} />
            </span>
            <span className="small">
              {shownMin(h.doneSec)} din {h.targetMin}
              {h.briskSec > 0 ? ` · ${shownMin(h.briskSec)} alert` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="tiny muted">Fiecare săptămână își păstrează ținta de atunci. Un import întârziat intră în săptămâna în care ai mers.</p>
    </Card>
  );
}
