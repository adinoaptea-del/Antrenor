import { Avatar, Card, CircleBtn, Dot, Icons, Label, MiniMap, Ring, Runner, fmtMinutes } from './common';
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
  todayState,
  warnings,
  weather,
  workoutsOn,
} from '../data/demo';

const DOW = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

export function Home({ onOpen }: { onOpen: (screen: string) => void }) {
  const today = workoutsOn(TODAY);
  const main = today[0];
  const week = thisWeekDates();
  const have = dataAvailability.have.length;
  const total = have + dataAvailability.missing.length;
  const verdictLabel = readiness.verdict === 'verde' ? 'Verde' : readiness.verdict === 'galben' ? 'Galben' : 'Roșu';

  return (
    <>
      <div className="hero">
        <Runner />
        <header className="top" style={{ gridTemplateColumns: '1fr auto' }}>
          <div className="greet">
            <div className="hello">Bună dimineața</div>
            <div className="name">
              {ATHLETE.name} <small aria-hidden="true">👋</small>
            </div>
            <div className="tag">{greeting()}</div>
          </div>
          <div className="top-r">
            <CircleBtn icon={Icons.calendar} label="Calendar" onClick={() => onOpen('calendar')} />
            <Avatar name={ATHLETE.name} onClick={() => onOpen('profil')} />
          </div>
        </header>

        <Card className="status glass" tight>
          <Label lime icon={Icons.sparkle}>
            Stare
          </Label>
          <div className="status-grid">
            <Ring value={bar.blocked ? null : bar.total} size={78} stroke={7}>
              <span className="num" style={{ fontSize: 22 }}>
                {bar.blocked || bar.total == null ? '–' : `${Math.round(bar.total)}%`}
              </span>
              <span className="st" style={{ fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                ● 70.3
              </span>
            </Ring>
            <div className="kvs">
              <div className="kv2">
                {Icons.moon}
                <div>
                  <div className="k">Somn</div>
                  <div className="v">{todayState.sleep}</div>
                </div>
              </div>
              <div className="kv2">
                {Icons.pulse}
                <div>
                  <div className="k">Azi</div>
                  <div className={`v ${readiness.verdict}`}>{verdictLabel}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="stack">
        <Card tight>
          <Label>Antrenamentul de azi</Label>
          {main ? (
            <div className="goal">
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="icon-circle">{Icons.trophy}</span>
                  <div>
                    <span className="num">{main.plannedMinutes}</span>
                    <span className="unit">min</span>
                  </div>
                </div>
                <div className="what">
                  {SPORT_LABEL[main.sport]}
                  {main.type === 'forta' ? '' : ` · ${TYPE_LABEL[main.type]}`}
                  {main.key ? ' · cheie' : ''}
                  <br />
                  {main.targetZones.length ? `Z${main.targetZones.join('–')}` : ''}
                  {main.sport === 'alergare' && main.targetZones.includes(2) ? ' · 128–147 bpm' : ''}
                  {main.structure ? ` · ${main.structure}` : ''}
                </div>
                {today.length > 1 && (
                  <div className="what">Apoi: {today.slice(1).map((w) => `${SPORT_LABEL[w.sport].toLowerCase()} ${fmtMinutes(w.plannedMinutes)}`).join(', ')}</div>
                )}
              </div>
              <MiniMap />
            </div>
          ) : (
            <div className="muted">Zi de odihnă. Nimic de trimis pe ceas.</div>
          )}
        </Card>

        <div className="grid-3">
          <div className="stat up">
            <div className="stat-h">
              <span className="ic">{Icons.timer}</span>
              <span className="lb">Cursă</span>
            </div>
            <div className="stat-v">
              <span className="num">{daysToRace}</span>
              <span className="u">zile</span>
            </div>
          </div>
          <div className="stat up">
            <div className="stat-h">
              <span className="ic">{Icons.thermo}</span>
              <span className="lb">Vreme</span>
            </div>
            <div className="stat-v">
              <span className="num">{weather.tempC}</span>
              <span className="u">°C</span>
            </div>
          </div>
          <div className="stat up">
            <div className="stat-h">
              <span className="ic">{Icons.wind}</span>
              <span className="lb">Condiții</span>
            </div>
            <div>
              <div className="num lime" style={{ fontSize: 26 }}>
                {weather.verdict}
              </div>
              <div className="sub">{weather.verdictSub}</div>
            </div>
          </div>
        </div>

        <button className="btn" onClick={() => onOpen('antrenament')} disabled={!main}>
          Trimite pe ceas {Icons.arrowRight}
        </button>

        <Card tight>
          <Label>Săptămâna asta</Label>
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
              <Label>Date disponibile</Label>
              <div>
                <span className="num md">{have}</span>
                <span className="unit">din {total}</span>
              </div>
            </div>
            <button className="btn dark sm" onClick={() => onOpen('profil')}>
              Completează
            </button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Lipsesc: {dataAvailability.missing.join(', ')}. Până atunci zonele sunt provizorii și bara se calculează doar din ce există.
          </div>
        </Card>

        <Card tight>
          <Label>Legendă</Label>
          <div className="legend" style={{ marginTop: 0 }}>
            {(['verde', 'galben', 'portocaliu', 'rosu', 'gri', 'albastru'] as const).map((c) => (
              <span key={c}>
                <Dot color={c} /> {COLOR_LABEL[c]}
              </span>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {RACE.name} · {RACE.date.split('-').reverse().join('.')}
          </div>
        </Card>
      </div>
    </>
  );
}

