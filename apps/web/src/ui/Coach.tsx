import { useState } from 'react';
import { Avatar, Card, CircleBtn, Icons, Label, LiveTitle, fmtDayMonth } from './common';
import { useData, useMe } from '../data/store';
import { SPORT_LABEL, TYPE_LABEL, cleanRefs, dayOf, fmtMinutes, todayMessage, workoutsOn } from '../data/model';
import { DayDecisionView } from './Day';
import { AptQuestion } from './Today';

// Antrenorul, redus la ce contează: ce faci azi, ce ți-a scris azi, și un singur buton.
// Mesajele vechi stau strânse, la cerere.

const PLAIN: Record<string, string> = { z2: 'ușor, să poți vorbi', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă, ușor', brick: 'bicicletă apoi alergare', forta: 'forță', odihna: 'odihnă' };
const KIND_LABEL = { dimineata: 'Dimineața', dupa_antrenament: 'După antrenament', saptamanal: 'Săptămâna', memento: 'Memento', avertisment: 'Atenție', uman: 'Antrenorul' } as const;

export function Coach({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string) => void }) {
  const me = useMe();
  const { runAgents, local } = useData();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);

  const today = me.today;
  const plan = workoutsOn(me, today);
  const doneToday = me.activities.some((a) => a.date === today);
  const day = dayOf(me);
  const msgs = me.messages;
  // Un mesaj scris pe altă decizie decât cea de acum (date noi, reguli noi) e depășit: nu-l mai arătăm ca mesajul zilei.
  const { msg: latest, stale } = todayMessage(me);
  const older = msgs.filter((m) => m !== latest).slice(0, 10);

  const evening = new Date().getHours() >= 18 || new Date().getHours() < 5;
  const ask = async () => {
    setBusy(true);
    setNote(null);
    try {
      // După o ședință înregistrată azi: analiza ei; altfel: mesajul de dimineață.
      setNote(await runAgents(doneToday ? 'dupa_antrenament' : 'dimineata'));
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
          <Label>Azi</Label>
          {day && <DayDecisionView day={day} compact />}
          {day?.ask && <AptQuestion />}
          {plan.length === 0 ? (
            <div className="small muted" style={{ marginTop: 6 }}>{me.plan.length ? 'Odihnă în plan.' : 'Planul apare după chestionarul de intrare.'}</div>
          ) : (
            <div className="coach-plan">
              {plan.map((w) => (
                <div key={w.id} className={`cp-row ${w.status === 'anulat_sistem' || (day && (day.level === 'rosu' || day.level === 'stop')) ? 'off' : ''}`}>
                  <span className="cp-s">{SPORT_LABEL[w.sport]}</span>
                  <span className="cp-t">{PLAIN[w.type] ?? TYPE_LABEL[w.type]}{w.structure ? ` · ${cleanRefs(w.structure)}` : ''}</span>
                  <span className="cp-m">{fmtMinutes(w.plannedMinutes)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <Label icon={Icons.sparkle}>{latest ? `${kindLabel(latest.kind, latest.createdAt)} · ${localTime(latest.createdAt)}` : 'Mesajul de azi'}</Label>
          {latest ? (
            <div className="coach-msg">
              {cleanRefs(latest.body)
                .split('\n')
                .filter((l) => l.trim())
                .map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
            </div>
          ) : (
            <div className="small muted">{stale ? 'Mesajul de azi a fost scris pe date mai vechi. Apasă butonul pentru unul nou.' : 'Încă nu ți-a scris azi. Îți scrie singur la 05:30 și după fiecare antrenament sincronizat.'}</div>
          )}
          <button className="btn" style={{ marginTop: 14 }} disabled={busy || local || !me.intakeComplete} onClick={() => void ask()}>
            {busy ? 'Se gândește… (până la un minut)' : doneToday ? 'Cum a fost antrenamentul de azi?' : evening ? 'Ce am mâine?' : 'Ce fac azi?'}
          </button>
          {note && note !== 'Gata.' && <div className="tiny muted" style={{ marginTop: 8 }}>{note}</div>}
        </Card>

        {older.length > 0 && (
          <button className="pill" style={{ alignSelf: 'center' }} onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
            {showOld ? 'Ascunde mesajele vechi' : `Mesaje anterioare (${older.length})`}
          </button>
        )}
        {showOld &&
          older.map((m) => (
            <Card key={m.id} tight>
              <Label>
                {kindLabel(m.kind, m.createdAt)} · {localStamp(m.createdAt)}
              </Label>
              <div className="coach-msg old">
                {cleanRefs(m.body)
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
              </div>
            </Card>
          ))}
      </div>
    </>
  );
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** Ora mesajului în fusul telefonului (serverul o salvează în UTC). */
function localStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return `${fmtDayMonth(localDay(iso))} ${localTime(iso)}`;
}

/** Eticheta după ora la care a fost scris mesajul, nu după tipul tehnic: un mesaj de „dimineață” cerut la 22:00 e de seară. */
function kindLabel(kind: keyof typeof KIND_LABEL, iso: string): string {
  if (kind !== 'dimineata') return KIND_LABEL[kind];
  const h = new Date(iso).getHours();
  return h < 11 ? 'Dimineața' : h < 18 ? 'Azi' : 'Seara';
}
