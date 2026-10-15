import { Card, Dot, fmtDate, fmtMinutes } from './common';
import {
  ATHLETE,
  COLOR_LABEL,
  RACE,
  SPORT_LABEL,
  TODAY,
  TYPE_LABEL,
  bar,
  colorOf,
  dataAvailability,
  daysToRace,
  greeting,
  readiness,
  thisWeekDates,
  warnings,
  workoutsOn,
} from '../data/demo';

const DOW = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const COMPONENT_LABEL: Record<string, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', consistenta: 'Consistență', forma: 'Formă' };

export function Home({ onOpen }: { onOpen: (tab: string) => void }) {
  const today = workoutsOn(TODAY);
  const main = today[0];
  const week = thisWeekDates();
  const have = dataAvailability.have.length;
  const total = have + dataAvailability.missing.length;

  return (
    <>
      <header className="topbar">
        <div>
          <div className="hello">Bună dimineața</div>
          <div className="name">{ATHLETE.name}</div>
        </div>
        <div className="row">
          <div className="date">
            luni
            <br />
            {fmtDate(TODAY)}
          </div>
          <div className="avatar" aria-hidden="true">
            {ATHLETE.name.slice(0, 1)}
          </div>
        </div>
      </header>

      <p className="greeting">{greeting()}</p>

      <div className="stack">
        <Card className="bar-card">
          <div className="bar-head">
            <div>
              <div className="label">Pregătit pentru {RACE.name}</div>
              <div>
                {bar.blocked ? (
                  <span className="num lg">blocată</span>
                ) : bar.total == null ? (
                  <span className="num lg">fără date</span>
                ) : (
                  <>
                    <span className="num xl">{Math.round(bar.total)}</span>
                    <span className="unit">%</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num lg">{daysToRace}</div>
              <div className="small muted">zile până la cursă</div>
            </div>
          </div>
          <div className="bar-track" aria-hidden="true">
            {bar.components.map((c) => (
              <div key={c.name} className={`bar-seg ${c.value == null ? 'empty' : ''}`} style={{ flexGrow: c.weight * 100 }}>
                {c.value != null && <i style={{ width: `${c.value}%` }} />}
              </div>
            ))}
          </div>
          <div className="bar-legend">
            {bar.components.map((c) => (
              <span key={c.name}>
                <b>{c.value == null ? '–' : `${Math.round(c.value)}%`}</b>
                {COMPONENT_LABEL[c.name]}
              </span>
            ))}
          </div>
          <div className="bar-basis">
            {bar.blocked ? `Blocată: ${bar.blocked}` : bar.basis}. Bara scade dacă te oprești: contează doar ultimele 6 săptămâni.
          </div>
          <details className="formula">
            <summary>Cum e calculată</summary>
            <ul>
              {bar.components.map((c) => (
                <li key={c.name}>
                  <b style={{ color: 'var(--fg)' }}>{COMPONENT_LABEL[c.name]}</b> ({Math.round(c.weight * 100)}%): {c.detail}
                </li>
              ))}
            </ul>
          </details>
        </Card>

        <Card>
          <div className="row between">
            <div className="label">Azi</div>
            <div className="row">
              <Dot color={readiness.verdict} />
              <span className="small">
                {readiness.verdict === 'verde' ? 'verde' : readiness.verdict === 'galben' ? 'galben' : 'roșu'}: {readiness.reason}
              </span>
            </div>
          </div>
          {main ? (
            <>
              <div className="today-main">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <span className={`sport-chip ${main.key ? 'key' : ''}`}>
                      {SPORT_LABEL[main.sport]}
                      {main.type === 'forta' ? '' : ` · ${TYPE_LABEL[main.type]}`}
                      {main.key ? ' · cheie' : ''}
                    </span>
                  </div>
                  <div>
                    <span className="num lg">{fmtMinutes(main.plannedMinutes)}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {main.targetZones.length ? `Z${main.targetZones.join('–')}` : ''}
                    {main.sport === 'alergare' && main.targetZones.includes(2) ? ' · 128–147 bpm (provizoriu)' : ''}
                    {main.structure ? `${main.targetZones.length ? ' · ' : ''}${main.structure}` : ''}
                  </div>
                </div>
              </div>
              {today.length > 1 && (
                <div className="small muted" style={{ marginTop: 10 }}>
                  Apoi: {today.slice(1).map((w) => `${SPORT_LABEL[w.sport]} ${fmtMinutes(w.plannedMinutes)}`).join(', ')}
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <button className="btn" onClick={() => onOpen('calendar')}>
                  Trimite pe ceas
                </button>
              </div>
            </>
          ) : (
            <div className="muted">Zi de odihnă. Nimic de trimis pe ceas.</div>
          )}
        </Card>

        <Card tight>
          <div className="label">Săptămâna asta</div>
          <div className="week">
            {week.map((d, i) => {
              const ws = workoutsOn(d);
              return (
                <div key={d} className={`day ${d === TODAY ? 'today' : ''}`}>
                  <span>{DOW[i]}</span>
                  <span className="n">{Number(d.slice(8))}</span>
                  <span className="dots">{ws.length === 0 ? <Dot color="asteptare" /> : ws.map((w) => <Dot key={w.id} color={colorOf(w)} />)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {warnings.map((w) => (
          <Card key={w.title} className="warn" tight>
            <div className="title">{w.title}</div>
            <div className="small" style={{ marginTop: 4 }}>
              {w.text}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Corecția: {w.fix}
            </div>
          </Card>
        ))}

        <Card tight>
          <div className="row between">
            <div>
              <div className="label">Date disponibile</div>
              <div>
                <span className="num md">{have}</span>
                <span className="unit">din {total}</span>
              </div>
            </div>
            <button className="btn secondary" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }} onClick={() => onOpen('profil')}>
              Completează
            </button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Lipsesc: {dataAvailability.missing.join(', ')}. Până atunci zonele sunt provizorii și bara se calculează doar din ce există.
          </div>
        </Card>

        <Card tight>
          <div className="label">Legendă</div>
          <div className="legend" style={{ marginTop: 0 }}>
            {(['verde', 'galben', 'portocaliu', 'rosu', 'gri', 'albastru'] as const).map((c) => (
              <span key={c}>
                <Dot color={c} /> {COLOR_LABEL[c]}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
