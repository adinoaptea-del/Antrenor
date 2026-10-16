import { useState } from 'react';
import { Avatar, Card, CircleBtn, Icons, Label, LiveTitle, fmtDayMonth } from './common';
import { useData, useMe } from '../data/store';

const KIND_LABEL = { dimineata: 'dimineața', dupa_antrenament: 'după antrenament', saptamanal: 'săptămânal', memento: 'memento', avertisment: 'avertisment', uman: 'antrenorul uman' } as const;

export function Coach({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string) => void }) {
  const me = useMe();
  const { runAgents, demo } = useData();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const online = false;

  const run = async (event: 'dimineata' | 'dupa_antrenament') => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await runAgents(event));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
          <Avatar name={me.user.name || 'S'} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <div className="stack">
        <Card>
          <div className="row between">
            <div>
              <div className="title">Head coach</div>
              <div className={`status ${online ? 'on' : ''}`}>
                <i /> {online ? 'online acum' : 'scrie dimineața la 05:30 și seara după antrenament'}
              </div>
            </div>
            <span className="icon-circle" style={{ width: 44, height: 44 }}>
              {Icons.chat}
            </span>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy || demo || !me.intakeComplete} onClick={() => void run('dimineata')}>
              {busy ? 'Rulează…' : 'Rulează acum'}
            </button>
            <button className="btn dark" disabled={busy || demo || !me.intakeComplete} onClick={() => void run('dupa_antrenament')}>
              După antrenament
            </button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            {me.intakeComplete ? 'Rularea manuală e pentru pilot: pachetul se construiește din datele de acum, specialiștii răspund, verificarea respinge cifrele fără sursă, head coach-ul scrie.' : 'Completează chestionarul de intrare ca să existe un plan de comentat.'}
          </div>
          {note && (
            <div className="small" style={{ marginTop: 8 }}>
              {note}
            </div>
          )}
        </Card>

        {me.messages.length === 0 && (
          <Card tight>
            <div className="small muted">Niciun mesaj încă. Primul vine după prima dimineață cu date de la brățară.</div>
          </Card>
        )}
        {me.messages.map((m) => (
          <Card key={m.id}>
            <Label lime icon={Icons.sparkle}>
              {KIND_LABEL[m.kind]} · {fmtDayMonth(m.createdAt.slice(0, 10))} {m.createdAt.slice(11, 16)}
              {m.decision ? ` · ${{ verde: 'verde', galben: 'galben', rosu: 'roșu', stop: 'stop' }[m.decision]}` : ''}
            </Label>
            <div className="msg">
              {m.body.split('\n').map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </Card>
        ))}

        <Card tight>
          <Label>Cum lucrează</Label>
          <div className="small muted">
            Șapte specialiști (fiziolog, înot, bicicletă, alergare, nutriție, fizio, minte) citesc același pachet de date. Fiecare cifră pe care o scriu e verificată de cod față de pachet; ce nu are sursă e respins și notat în jurnal. Head coach-ul decide și e singurul care îți scrie.
          </div>
        </Card>
      </div>
    </>
  );
}
