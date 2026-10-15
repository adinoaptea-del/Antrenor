import { Card } from './common';
import { coachMessages } from '../data/demo';

export function Coach() {
  const online = false;
  return (
    <>
      <h2 className="screen-title">
        Antrenor
        <small>Mesajele head coach-ului și omul din spatele lui.</small>
      </h2>
      <div className="stack">
        <Card>
          <div className="row between">
            <div>
              <div className="title">Antrenorul tău</div>
              <div className={`status ${online ? 'on' : ''}`}>
                <i /> {online ? 'online acum' : 'offline · răspunde de obicei seara'}
              </div>
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <button className="btn" disabled={!online}>
              Intră live
            </button>
            <button className="btn secondary">Programează</button>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            „Intră live” se aprinde când antrenorul e online; „Programează” îți arată sloturile lui.
          </div>
        </Card>

        {coachMessages.map((m) => (
          <Card key={m.when}>
            <div className="msg">
              <div className="when">Head coach · {m.when}</div>
              {m.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
