import { Card } from './common';
import { ATHLETE, RACE, budgetHours, dataAvailability } from '../data/demo';

const DEVICES: { name: string; state: 'conectat' | 'neconectat' }[] = [
  { name: 'Garmin', state: 'conectat' },
  { name: 'Whoop', state: 'conectat' },
  { name: 'Oura', state: 'neconectat' },
  { name: 'Apple Watch (prin Strava)', state: 'neconectat' },
];

export function Profile() {
  return (
    <>
      <h2 className="screen-title">
        Profil
        <small>
          {ATHLETE.name} · {RACE.name}
        </small>
      </h2>
      <div className="stack">
        <Card>
          <div className="label">Brățări</div>
          <div className="kv">
            {DEVICES.map((d) => (
              <div key={d.name} style={{ display: 'contents' }}>
                <div>{d.name}</div>
                <div className={d.state === 'conectat' ? 'ok' : 'no'}>{d.state === 'conectat' ? 'conectat' : 'Conectează'}</div>
              </div>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            „Conectează” deschide pagina producătorului; fără chei de copiat.
          </div>
        </Card>

        <Card>
          <div className="label">Date disponibile</div>
          <div className="kv">
            {dataAvailability.have.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <div className="ok">da</div>
              </div>
            ))}
            {dataAvailability.missing.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <div className="no">lipsește</div>
              </div>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            Nimic nu e obligatoriu. Cu cât sunt mai multe, cu atât zonele și bara sunt mai exacte; ce lipsește rămâne „fără date”, nu se estimează.
          </div>
        </Card>

        <Card tight>
          <div className="label">Program</div>
          <div>
            <span className="num md">{budgetHours}</span>
            <span className="unit">ore pe săptămână disponibile</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Din blocurile libere de minimum 45 de minute, × 0,8.
          </div>
        </Card>

        <Card tight>
          <div className="label">Consimțământ</div>
          <div className="small">18+ · date de sănătate · nu e serviciu medical · ștergerea contului dintr-un buton</div>
        </Card>
      </div>
    </>
  );
}
