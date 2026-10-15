import { Card, CircleBtn, Icons, Label, LiveTitle } from './common';
import { ATHLETE, RACE, budgetHours, dataAvailability } from '../data/demo';

const DEVICES: { name: string; state: 'conectat' | 'neconectat'; note: string }[] = [
  { name: 'Garmin', state: 'conectat', note: 'activități, somn, HRV' },
  { name: 'Whoop', state: 'conectat', note: 'recuperare, somn' },
  { name: 'Oura', state: 'neconectat', note: 'somn, temperatură' },
  { name: 'Apple Watch', state: 'neconectat', note: 'prin Strava' },
];

export function Profile({ onBack }: { onBack: () => void }) {
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
          <Label icon={Icons.watch}>Brățări</Label>
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
        </Card>
      </div>
    </>
  );
}
