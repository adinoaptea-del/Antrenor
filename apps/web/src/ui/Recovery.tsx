import { useState } from 'react';
import { MANUAL_TYPES } from '@core/recovery/recovery.js';
import { Card, Icons, Label, fmtDayMonth } from './common';
import { useData, useMe } from '../data/store';
import { fmtMinutes } from '../data/model';
import { isNetworkError } from '../data/api';

const SRC: Record<string, string> = { whoop: 'WHOOP', strava: 'Strava', apple: 'Apple Health', manual: 'adăugat de tine' };

/**
 * Recuperarea: somnul ultimelor nopți, sesiunile (saună, baie rece, meditație…) de pe brățări sau adăugate de tine,
 * și cum a răspuns corpul tău dimineața de după (HRV, puls de repaus), față de media ta.
 */
export function RecoveryCard() {
  const me = useMe();
  const { submitForm, local } = useData();
  const r = me.recovery;
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<string>('saună');
  const [min, setMin] = useState(15);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!r) return null;
  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await submitForm('recuperare', { tip, minute: min, date: me.today });
      setOpen(false);
      setMsg(`Adăugat: ${tip}, ${min} min.`);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async (id: string) => {
    setBusy(true);
    try {
      await submitForm('recuperare', { sterge: id });
    } finally {
      setBusy(false);
    }
  };
  const sign = (x: number) => `${x > 0 ? '+' : ''}${x.toLocaleString('ro-RO', { maximumFractionDigits: 1 })}`;

  return (
    <Card>
      <Label icon={Icons.moon}>Recuperare</Label>

      {r.sleep.length > 0 && (
        <div className="rec-sleep" aria-label="Somnul ultimelor nopți">
          {r.sleep.map((s) => (
            <span key={s.date} className={`rs ${s.minutes != null && s.minutes < 360 ? 'low' : ''}`}>
              <b>{s.minutes != null ? fmtMinutes(s.minutes) : '–'}</b>
              <small>{fmtDayMonth(s.date)}</small>
            </span>
          ))}
        </div>
      )}

      <div className="small muted" style={{ margin: '10px 0 6px' }}>
        Ultimele 7 zile: <b style={{ color: 'var(--fg)' }}>{fmtMinutes(r.minutes7)}</b> de recuperare activă (saună, baie rece, meditație, plimbare…).
      </div>

      {r.sessions.length === 0 ? (
        <div className="small muted">Nicio sesiune în ultimele 14 zile. Apar singure din WHOOP, Strava sau Apple Health, sau le adaugi mai jos.</div>
      ) : (
        <div className="list">
          {r.sessions.map((s) => (
            <div key={s.id} className="rec-row">
              <span>
                <b>{s.name}</b> · {fmtMinutes(s.minutes)}
                <small>
                  {fmtDayMonth(s.date)} · {SRC[s.source] ?? s.source}
                  {s.avgHr ? ` · puls mediu ${s.avgHr}` : ''}
                </small>
              </span>
              <span className="rec-next">
                {s.nextHrvPct != null ? (
                  <>
                    <b className={s.nextHrvPct >= 0 ? 'up' : 'down'}>HRV {sign(s.nextHrvPct)}%</b>
                    <small>dimineața de după{s.nextRhrDelta != null ? `, puls ${sign(s.nextRhrDelta)}` : ''}</small>
                  </>
                ) : (
                  <small>dimineața de după: fără date</small>
                )}
                {s.source === 'manual' && !local && (
                  <button className="linkish" disabled={busy} onClick={() => void del(s.id)}>
                    șterge
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {r.effects.length > 0 && (
        <div className="rec-eff">
          <div className="pref-k">Cum răspunde corpul tău (ultimele 90 de zile)</div>
          {r.effects.map((e) => (
            <div key={e.name} className="small">
              <b>{e.name}</b>: dimineața de după, HRV {sign(e.hrvPct)}% față de media ta pe 7 zile (în zilele fără recuperare: {sign(e.hrvPctNone)}%), puls {sign(e.rhrDelta)} ({sign(e.rhrDeltaNone)}). {e.n} dimineți.
            </div>
          ))}
          <div className="tiny muted">Asociere, nu cauză: în zilele cu recuperare poate ai și dormit sau mâncat altfel.</div>
        </div>
      )}

      {!local &&
        (!open ? (
          <button className="pill" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
            Adaugă recuperare
          </button>
        ) : (
          <div className="pref-form" style={{ marginTop: 10 }}>
            <div className="wk-btns">
              {MANUAL_TYPES.map((t) => (
                <button key={t} className={`pill ${tip === t ? 'on' : ''}`} onClick={() => setTip(t)} aria-pressed={tip === t}>
                  {t}
                </button>
              ))}
            </div>
            <div className="pref-k">Minute</div>
            <div className="wk-btns">
              {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                <button key={m} className={`pill ${min === m ? 'on' : ''}`} onClick={() => setMin(m)} aria-pressed={min === m}>
                  {m}
                </button>
              ))}
            </div>
            <div className="wk-btns">
              <button className="btn sm" disabled={busy} onClick={() => void add()}>
                Salvează
              </button>
              <button className="pill" onClick={() => setOpen(false)}>
                Renunț
              </button>
            </div>
          </div>
        ))}
      {msg && <div className="wk-note" style={{ marginTop: 8 }}>{msg}</div>}
    </Card>
  );
}
