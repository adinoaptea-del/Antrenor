import { useState } from 'react';
import { Avatar, Card, CircleBtn, Dot, Icons, Label, LiveTitle, fmtMinutes } from './common';
import { ATHLETE, COLOR_LABEL, SPORT_LABEL, TODAY, TYPE_LABEL, colorOf, scores, workoutsOn } from '../data/demo';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const DOW = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function Calendar({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string) => void }) {
  const [year, setYear] = useState(Number(TODAY.slice(0, 4)));
  const [month, setMonth] = useState(Number(TODAY.slice(5, 7)) - 1); // 0-based
  const [selected, setSelected] = useState(TODAY);

  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // luni = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const dayWorkouts = workoutsOn(selected);

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Calendar</LiveTitle>
        </div>
        <div className="top-r">
          <Avatar name={ATHLETE.name} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <Card>
        <div className="cal-head">
          <CircleBtn icon={Icons.chevronLeft} label="Luna anterioară" onClick={prev} />
          <div className="month">
            {MONTHS[month]} {year}
          </div>
          <CircleBtn icon={Icons.chevronRight} label="Luna următoare" onClick={next} />
        </div>
        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {cells.map((iso, i) =>
            iso == null ? (
              <div key={`e${i}`} />
            ) : (
              <button
                key={iso}
                className={`cal-day ${iso === TODAY ? 'today' : ''} ${iso === selected ? 'sel' : ''}`}
                onClick={() => setSelected(iso)}
                aria-pressed={iso === selected}
                aria-label={iso}
              >
                <span className="d">{Number(iso.slice(8))}</span>
                <span className="dots">
                  {workoutsOn(iso)
                    .slice(0, 3)
                    .map((w) => (
                      <Dot key={w.id} color={colorOf(w)} />
                    ))}
                </span>
              </button>
            ),
          )}
        </div>
        <div className="legend">
          {(['verde', 'galben', 'portocaliu', 'rosu', 'gri'] as const).map((c) => (
            <span key={c}>
              <Dot color={c} /> {COLOR_LABEL[c]}
            </span>
          ))}
          <span>
            <Dot color="asteptare" /> urmează
          </span>
        </div>
      </Card>

      <div className="stack" style={{ marginTop: 12 }}>
        <Card>
          <Label>{selected === TODAY ? 'Azi' : selected.split('-').reverse().join('.')}</Label>
          {dayWorkouts.length === 0 ? (
            <div className="muted small">Zi fără antrenament.</div>
          ) : (
            <div className="list">
              {dayWorkouts.map((w) => {
                const color = colorOf(w);
                const score = scores.get(w.id);
                return (
                  <div key={w.id} className="item">
                    <Dot color={color} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">
                        {SPORT_LABEL[w.sport]}
                        {w.type === 'forta' ? '' : ` · ${TYPE_LABEL[w.type]}`}
                        {w.key ? ' · cheie' : ''}
                      </div>
                      <div className="s">
                        {[w.targetZones.length ? `Z${w.targetZones.join('–')}` : '', w.structure ?? '', w.note ?? ''].filter(Boolean).join(' · ')}
                      </div>
                      <div className="s" style={{ marginTop: 4, color: 'var(--fg)' }}>
                        {COLOR_LABEL[color]}
                      </div>
                      {score && score.reasons.length > 0 && (
                        <ul className="reasons">
                          {score.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="m">{fmtMinutes(w.plannedMinutes)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <div className="tiny muted" style={{ textAlign: 'center' }}>
          Culorile vin din execuție; calendarul se rescrie după ele.
        </div>
      </div>
    </>
  );
}
