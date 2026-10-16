import { AreaChart, Avatar, Card, CircleBtn, DAY_NAMES, Ecg, Icons, Ring, Spark, Stat, fmtDate } from './common';
import { ATHLETE, TODAY, bar, insight, lastRun, readiness, sessionsInWeek, todayState, weeklyExecution, weeklyHours, weeklyKm } from '../data/demo';
import { weekday } from '@core/util/dates.js';
import { SyncButton } from './SyncButton';

const COMPONENT_LABEL: Record<string, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', consistenta: 'Consistență', forma: 'Formă' };

export function Stats({ onOpen }: { onOpen: (screen: string) => void }) {
  // Săptămâna curentă abia a început: graficele arată săptămânile încheiate.
  const hours = weeklyHours.filter((h) => !h.current);
  const lastWeek = hours[hours.length - 1]!;
  const sessions = sessionsInWeek(lastWeek.start);
  const maxH = Math.max(6, Math.ceil(Math.max(...hours.map((h) => Math.max(h.hours, h.plannedHours))) + 1));
  const ticks = [0, Math.round(maxH / 2), maxH];
  const runKm = weeklyKm('alergare');
  const exec = weeklyExecution.filter((e) => e.pct != null);

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.calendar} label="Calendar" onClick={() => onOpen('calendar')} />
          <div>
            <div className="ttl">Recuperare</div>
            <div className="sub">
              {fmtDate(TODAY)}, {DAY_NAMES[weekday(TODAY)]}
            </div>
          </div>
        </div>
        <div className="top-c" />
        <div className="top-r">
          <SyncButton compact />
          <Avatar name={ATHLETE.name} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <div className="ring-wrap">
        <Ring value={todayState.recovery} size={156} stroke={10}>
          <span className="lb">Recuperare azi</span>
          <span className="num" style={{ fontSize: 56 }}>
            {todayState.recovery}
          </span>
          <span className={`st ${readiness.verdict}`}>{todayState.recoveryLabel}</span>
          <Ecg />
        </Ring>
        <div className="tiny muted" style={{ marginTop: 6, textAlign: 'center' }}>
          Whoop · HRV {todayState.hrv} ms · puls de repaus {todayState.rhr}
        </div>
      </div>

      <div className="stack">
        <div className="lab" style={{ marginBottom: -4 }}>Statistici</div>
        <div className="grid-3">
          <Stat icon={Icons.clock} label="Ore" value={lastWeek.hours.toLocaleString('ro-RO')} unit="h">
            <div className="sub">săpt. trecută</div>
            <Spark values={hours.map((h) => h.hours)} />
          </Stat>
          <Stat icon={Icons.heart} label="FC medie" value={lastRun.avgHr} unit="bpm">
            <div className="sub">ultima alergare</div>
            <Spark values={lastRun.hrTrend} />
          </Stat>
          <Stat icon={Icons.pulse} label="Ședințe" value={sessions.done} unit={`din ${sessions.planned}`}>
            <div className="sub">săpt. trecută</div>
            <Spark values={sessions.perDay} kind="bars" />
          </Stat>
        </div>

        <Card>
          <div className="chart-h">
            <div className="title">Ore pe săptămână</div>
            <span className="pill">
              {hours.length} săpt. {Icons.chevronDown}
            </span>
          </div>
          <AreaChart values={hours.map((h) => h.hours)} labels={hours.map((h) => h.label)} max={maxH} ticks={ticks} tag={(v) => v.toLocaleString('ro-RO')} />
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Executate, din Garmin. Planul săptămânii curente: {weeklyHours[weeklyHours.length - 1]!.plannedHours.toLocaleString('ro-RO')} h.
          </div>
        </Card>

        <Card>
          <div className="chart-h">
            <div className="title">Execuție</div>
            <span className="small muted">% ședințe verzi sau galbene</span>
          </div>
          <AreaChart values={exec.map((e) => e.pct)} labels={exec.map((e) => e.label)} max={100} ticks={[0, 50, 100]} height={130} tag={(v) => `${Math.round(v)}`} />
        </Card>

        <Card>
          <div className="chart-h">
            <div className="title">Pregătit pentru 70.3</div>
            <span className="num md">{bar.blocked ? 'blocată' : bar.total == null ? 'fără date' : `${Math.round(bar.total)}%`}</span>
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
          <div className="tiny muted" style={{ marginTop: 10 }}>
            {bar.blocked ? `Blocată: ${bar.blocked}` : bar.basis}. Contează doar ultimele 6 săptămâni; bara scade dacă te oprești.
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

        <Card tight>
          <div className="chart-h" style={{ marginBottom: 4 }}>
            <div className="title">Alergare, km pe săptămână</div>
            <span className="num sm">{runKm[runKm.length - 1]!.toLocaleString('ro-RO')}</span>
          </div>
          <Spark values={runKm} kind="bars" height={44} />
        </Card>

        <Card tight>
          <div className="insight">
            <span className="ic">{Icons.sun}</span>
            <div>
              <div className="t">{insight.title}</div>
              <div className="x">{insight.text}</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
