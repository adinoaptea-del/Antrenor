import { useState } from 'react';
import { Card, CircleBtn, Icons, Label, LiveTitle, fmtDayMonth } from './common';
import { SyncButton } from './SyncButton';
import { fmtTime } from './sync';
import { useData, useMe } from '../data/store';
import { lastDoneWorkout } from '../data/model';
import { eveningComplete, morningComplete, type MorningForm } from '../forms/types';
import { BaselineList } from '../forms/Baseline';

const DEVICES: { provider: 'whoop' | 'strava' | 'oura'; name: string; note: string }[] = [
  { provider: 'whoop', name: 'Whoop', note: 'somn, HRV, puls, recuperare, antrenamente' },
  { provider: 'strava', name: 'Garmin / ceas, prin Strava', note: 'activitățile de pe ceas (Garmin nu mai primește aplicații noi)' },
  { provider: 'oura', name: 'Oura', note: 'somn, HRV, readiness' },
];

export function Profile({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const { connect, logout, local } = useData();
  const [err, setErr] = useState<string | null>(null);
  const lastDone = lastDoneWorkout(me);
  const lastDoneId = lastDone ? (me.activities.find((a) => a.sport === lastDone.sport && a.date >= lastDone.date && !a.unplanned)?.id ?? `plan-${lastDone.id}`) : null;
  const morning = me.forms.morning as MorningForm | null;
  const connected = (p: string) => me.devices.find((d) => d.provider === p);

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Profil</LiveTitle>
        </div>
        <div className="top-r">
          <span className="avatar" aria-hidden="true">
            {(me.user.name || 'S').slice(0, 1)}
          </span>
        </div>
      </header>

      <div className="stack">
        <Card tight>
          <div className="row" style={{ gap: 12 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }} aria-hidden="true">
              {(me.user.name || 'S').slice(0, 1)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="num md">{me.user.name || me.user.email}</div>
              <div className="small muted">{me.user.raceName ? `${me.user.raceName}${me.user.raceDate ? ` · ${me.user.raceDate.split('-').reverse().join('.')}` : ''}` : me.user.email}</div>
            </div>
          </div>
        </Card>

        <Card>
          <Label icon={Icons.edit}>Chestionare</Label>
          <div className="kv">
            <div>
              <div style={{ fontWeight: 700 }}>De intrare</div>
              <div className="tiny muted">nivel, echipament, program, sănătate</div>
            </div>
            <button className={`pill ${me.intakeComplete ? '' : 'on'}`} onClick={() => onOpen('intake')}>
              {me.intakeComplete ? 'Editează' : 'Completează'}
            </button>
            <div>
              <div style={{ fontWeight: 700 }}>Dimineața</div>
              <div className="tiny muted">4 note + semnale · {fmtDayMonth(me.today)}</div>
            </div>
            <button className={`pill ${morningComplete(morning ?? undefined) ? '' : 'on'}`} onClick={() => onOpen('dimineata')}>
              {morningComplete(morning ?? undefined) ? 'Modifică' : 'Completează'}
            </button>
            {lastDone && lastDoneId && (
              <>
                <div>
                  <div style={{ fontWeight: 700 }}>După antrenament</div>
                  <div className="tiny muted">RPE, așteptări, durere · ultima ședință</div>
                </div>
                <button className={`pill ${eveningComplete(me.forms.evening[lastDoneId]) ? '' : 'on'}`} onClick={() => onOpen('seara', { activityId: lastDoneId })}>
                  {eveningComplete(me.forms.evening[lastDoneId]) ? 'Modifică' : 'Completează'}
                </button>
              </>
            )}
            <div>
              <div style={{ fontWeight: 700 }}>Săptămânal</div>
              <div className="tiny muted">duminica, 3 întrebări</div>
            </div>
            <button className="pill" onClick={() => onOpen('saptamanal')}>
              {me.forms.weeklyDone ? 'Modifică' : 'Deschide'}
            </button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Niciunul nu e obligatoriu. Fără cel de dimineață, decizia zilei e cel mult galbenă; fără cel de seară, antrenorii nu au RPE și durere.
          </div>
        </Card>

        <Card>
          <Label icon={Icons.pulse}>Date de bază</Label>
          <BaselineList onOpen={(s) => onOpen(s)} />
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Încărcarea PDF-ului de la laborator (cu extragerea valorilor) vine după ce există serverul; până atunci introduci cele cinci valori de mână.
          </div>
        </Card>

        <Card>
          <div className="row between" style={{ marginBottom: 8 }}>
            <Label icon={Icons.watch}>Brățări</Label>
            <SyncButton compact />
          </div>
          <div className="kv">
            {DEVICES.map((d) => {
              const c = connected(d.provider);
              return (
                <div key={d.provider} style={{ display: 'contents' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div className="tiny muted">{c ? `conectat · ultima citire ${c.lastSync ? fmtTime(c.lastSync) : '–'}${c.lastOk === false ? ` · eroare: ${c.detail ?? ''}` : ''}` : d.note}</div>
                  </div>
                  {c ? (
                    <span className="ok">{Icons.check} conectat</span>
                  ) : (
                    <button
                      className="pill on"
                      onClick={() => {
                        setErr(null);
                        connect(d.provider).catch((e: Error) => setErr(e.message));
                      }}
                    >
                      Conectează
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {err && (
            <div className="small" style={{ marginTop: 8, color: 'var(--c-rosu)' }}>
              {err}
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 10 }}>
            „Conectează” te duce la pagina producătorului; te loghezi acolo, apeși „Allow” și te întorci aici cu ultimele 5 săptămâni citite. Citirea continuă singură: la deschidere, la revenire, la 15 minute, plus când brățara anunță o noapte sau o ședință nouă.
          </div>
        </Card>

        <Card>
          <Label>Date disponibile</Label>
          <div className="kv">
            {me.dataAvailability.have.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <span className="ok">{Icons.check}</span>
              </div>
            ))}
            {me.dataAvailability.missing.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <div className="no">lipsește</div>
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Ce lipsește rămâne „fără date”, nu se estimează.
          </div>
        </Card>

        <Card tight>
          <Label>Program</Label>
          <div>
            <span className="num md">{me.budgetHours == null ? '–' : me.budgetHours.toLocaleString('ro-RO')}</span>
            <span className="unit">ore pe săptămână pentru plan</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Din ferestrele libere de minimum 45 de minute, × 0,8. Se schimbă din chestionar.
          </div>
        </Card>

        <Card tight>
          <Label>Cont și consimțământ</Label>
          <div className="small">18+ · date de sănătate · nu e serviciu medical · ștergerea contului la cerere</div>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <button className="pill" onClick={() => void logout()}>
              {local ? 'Șterge tot din acest telefon' : 'Ieși din cont'}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
