import { Card, CircleBtn, Icons, Label, LiveTitle, fmtDayMonth } from './common';
import { ATHLETE, RACE, TODAY, budgetHours, dataAvailability, lastDoneWorkout } from '../data/demo';
import { forms, useForms } from '../forms/store';
import { eveningComplete, intakeComplete, morningComplete } from '../forms/types';
import { SyncButton } from './SyncButton';
import { SOURCES } from './sync';

const DEVICES: { name: string; state: 'conectat' | 'neconectat'; note: string }[] = [
  { name: 'Garmin', state: 'conectat', note: 'activități, somn, HRV' },
  { name: 'Whoop', state: 'conectat', note: 'recuperare, somn' },
  { name: 'Oura', state: 'neconectat', note: 'somn, temperatură' },
  { name: 'Apple Watch', state: 'neconectat', note: 'prin Strava' },
];

export function Profile({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string, opts?: { activityId?: string }) => void }) {
  const f = useForms();
  const lastDone = lastDoneWorkout();
  const lastDoneId = lastDone ? `demo-${lastDone.id}` : null;
  const weeks = Object.keys(f.weekly).length;
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
            {ATHLETE.name.slice(0, 1)}
          </span>
        </div>
      </header>

      <div className="stack">
        <Card tight>
          <div className="row" style={{ gap: 12 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }} aria-hidden="true">
              {ATHLETE.name.slice(0, 1)}
            </span>
            <div>
              <div className="num md">{ATHLETE.name}</div>
              <div className="small muted">
                {RACE.name} · {RACE.date.split('-').reverse().join('.')}
              </div>
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
            <button className={`pill ${intakeComplete(f.intake) ? '' : 'on'}`} onClick={() => onOpen('intake')}>
              {intakeComplete(f.intake) ? 'Editează' : 'Completează'}
            </button>
            <div>
              <div style={{ fontWeight: 700 }}>Dimineața</div>
              <div className="tiny muted">4 note + semnale · {fmtDayMonth(TODAY)}</div>
            </div>
            <button className={`pill ${morningComplete(f.morning[TODAY]) ? '' : 'on'}`} onClick={() => onOpen('dimineata')}>
              {morningComplete(f.morning[TODAY]) ? 'Modifică' : 'Completează'}
            </button>
            {lastDone && lastDoneId && (
              <>
                <div>
                  <div style={{ fontWeight: 700 }}>După antrenament</div>
                  <div className="tiny muted">RPE, așteptări, durere · ultima ședință</div>
                </div>
                <button className={`pill ${eveningComplete(f.evening[lastDoneId]) ? '' : 'on'}`} onClick={() => onOpen('seara', { activityId: lastDoneId })}>
                  {eveningComplete(f.evening[lastDoneId]) ? 'Modifică' : 'Completează'}
                </button>
              </>
            )}
            <div>
              <div style={{ fontWeight: 700 }}>Săptămânal</div>
              <div className="tiny muted">duminica, 3 întrebări · {weeks} completate</div>
            </div>
            <button className="pill" onClick={() => onOpen('saptamanal')}>
              Deschide
            </button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Niciunul nu e obligatoriu. Fără cel de dimineață, decizia zilei e cel mult galbenă; fără cel de seară, antrenorii nu au RPE și durere.
          </div>
        </Card>

        <Card>
          <div className="row between" style={{ marginBottom: 8 }}>
            <Label icon={Icons.watch}>Brățări</Label>
            <SyncButton compact />
          </div>
          <div className="tiny muted" style={{ marginBottom: 10 }}>
            Se citesc: {SOURCES.join(', ')}. La apăsare, la deschidere, la revenire și la 15 minute cât e deschisă; serverul citește oricum la 15 minute.
          </div>
          <div className="kv">
            {DEVICES.map((d) => (
              <div key={d.name} style={{ display: 'contents' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.name}</div>
                  <div className="tiny muted">{d.note}</div>
                </div>
                {d.state === 'conectat' ? (
                  <span className="ok">{Icons.check} conectat</span>
                ) : (
                  <button className="pill on">Conectează</button>
                )}
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            „Conectează” deschide pagina producătorului; fără chei de copiat.
          </div>
        </Card>

        <Card>
          <Label>Date disponibile</Label>
          <div className="kv">
            {dataAvailability.have.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <span className="ok">{Icons.check}</span>
              </div>
            ))}
            {dataAvailability.missing.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <div className="no">lipsește</div>
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Nimic nu e obligatoriu. Cu cât sunt mai multe, cu atât zonele și bara sunt mai exacte; ce lipsește rămâne „fără date”, nu se estimează.
          </div>
        </Card>

        <Card tight>
          <Label>Program</Label>
          <div>
            <span className="num md">{budgetHours.toLocaleString('ro-RO')}</span>
            <span className="unit">ore pe săptămână disponibile</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Din blocurile libere de minimum 45 de minute, × 0,8.
          </div>
        </Card>

        <Card tight>
          <Label>Consimțământ</Label>
          <div className="small">18+ · date de sănătate · nu e serviciu medical · ștergerea contului dintr-un buton</div>
          <button className="pill" style={{ marginTop: 10 }} onClick={() => forms.reset()}>
            Șterge răspunsurile din acest telefon
          </button>
        </Card>
      </div>
    </>
  );
}
