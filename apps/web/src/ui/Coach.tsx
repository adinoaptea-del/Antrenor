import { Avatar, Card, CircleBtn, Icons, Label, LiveTitle } from './common';
import { ATHLETE, coachMessages } from '../data/demo';

export function Coach({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string) => void }) {
  const online = false;
  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Antrenor</LiveTitle>
        </div>
        <div className="top-r">
          <Avatar name={ATHLETE.name} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <div className="stack">
        <Card>
          <div className="row between">
            <div>
              <div className="title">Antrenorul tău</div>
              <div className={`status ${online ? 'on' : ''}`}>
                <i /> {online ? 'online acum' : 'offline · răspunde de obicei seara'}
              </div>
            </div>
            <span className="icon-circle" style={{ width: 44, height: 44 }}>
              {Icons.chat}
            </span>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <button className="btn" disabled={!online}>
              {Icons.live} Intră live
            </button>
            <button className="btn dark">{Icons.calendar} Programează</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            „Intră live” se aprinde când antrenorul e online; „Programează” îți arată sloturile lui.
          </div>
        </Card>

        {coachMessages.map((m) => (
          <Card key={m.when}>
            <Label lime icon={Icons.sparkle}>
              Head coach · {m.when}
            </Label>
            <div className="msg">
              {m.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          </Card>
        ))}

        <Card tight>
          <Label>Cum lucrează</Label>
          <div className="small muted">
            Șapte specialiști (fiziolog, înot, bicicletă, alergare, nutriție, fizio, minte) citesc același pachet de date; head coach-ul verifică fiecare cifră și e singurul care îți scrie. Nimic estimat, nimic inventat.
          </div>
        </Card>
      </div>
    </>
  );
}
