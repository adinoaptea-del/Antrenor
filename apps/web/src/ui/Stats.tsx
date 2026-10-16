import { weekday } from '@core/util/dates.js';
import { AreaChart, Avatar, Card, CircleBtn, Ecg, Icons, Ring, Spark, Stat, fmtDate } from './common';
import { SyncButton } from './SyncButton';
import { useMe } from '../data/store';
import { DAY_NAMES, fmtMinutes, sessionsInWeek, weeklyExecution, weeklyHours, weeklyKm } from '../data/model';
import { cleanRefs } from '../data/model';
import { levelFromScore, sleepScore } from '@core/collector/readiness.js';

const LEVEL_LABEL: Record<string, string> = { verde: 'verde', galben: 'galben', portocaliu: 'portocaliu', rosu: 'roșu' };

const COMPONENT_LABEL: Record<string, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', consistenta: 'Consistență', forma: 'Formă' };

export function Stats({ onOpen }: { onOpen: (screen: string) => void }) {
  const me = useMe();
  const hours = weeklyHours(me);
  const lastWeek = hours[hours.length - 1] ?? null;
  const sessions = lastWeek ? sessionsInWeek(me, lastWeek.start) : null;
  const maxH = Math.max(6, Math.ceil(Math.max(0, ...hours.map((h) => Math.max(h.hours, h.plannedHours))) + 1));
  const exec = weeklyExecution(me).filter((e) => e.pct != null);
  const runKm = weeklyKm(me, 'alergare');
  const w = me.wellnessToday;
  const recovery = w?.recoveryScore ?? null;
  const bar = me.bar;
  const lastRun = me.activities.filter((a) => a.sport === 'alergare' && a.avgHr != null).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
  const hrTrend = me.activities
    .filter((a) => a.sport === 'alergare' && a.avgHr != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-7)
    .map((a) => a.avgHr!);

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.calendar} label="Calendar" onClick={() => onOpen('calendar')} />
          <div>
            <div className="ttl">Recuperare</div>
            <div className="sub">
              {fmtDate(me.today)}, {DAY_NAMES[weekday(me.today)]}
            </div>
          </div>
        </div>
        <div className="top-c" />
        <div className="top-r">
          <SyncButton compact />
          <Avatar name={me.user.name || 'S'} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <div className="ring-wrap">
        <Ring value={recovery} size={156} stroke={10} level={levelFromScore(recovery)}>
          <span className="lb">Recuperare brățară</span>
          <span className="num" style={{ fontSize: 56 }}>
            {recovery ?? '–'}
          </span>
          <span className={`st lvl-txt-${levelFromScore(recovery) ?? ''}`}>{recovery == null ? 'fără date' : LEVEL_LABEL[levelFromScore(recovery)!]}</span>
          <Ecg />
        </Ring>
        {w?.sleepMin != null && (
          <div className="tiny" style={{ marginTop: 6, textAlign: 'center' }}>
            Somn {fmtMinutes(w.sleepMin)} ·{' '}
            <b className={`lvl-txt-${levelFromScore(Math.round(sleepScore(w.sleepMin)))}`}>
              {Math.round(sleepScore(w.sleepMin))}/100 {LEVEL_LABEL[levelFromScore(Math.round(sleepScore(w.sleepMin)))!]}
            </b>
          </div>
        )}
        <div className="tiny muted" style={{ marginTop: 6, textAlign: 'center' }}>
          {w ? `${w.source ?? 'brățară'}${w.hrv != null ? ` · HRV ${w.hrv} ms` : ''}${w.rhr != null ? ` · puls de repaus ${w.rhr}` : ''}${w.sleepMin != null ? ` · somn ${fmtMinutes(w.sleepMin)}` : ''}` : 'Nicio brățară nu a trimis date pentru azi.'}
        </div>
        {me.state && (
          <div className="tiny" style={{ marginTop: 8, textAlign: 'center' }}>
            Starea ta azi:{' '}
            <b className={`lvl-txt-${me.state.verdict}`}>
              {LEVEL_LABEL[me.state.verdict]}
              {me.state.score != null ? ` · ${me.state.score}/100` : ''}
            </b>{' '}
            <span className="muted">(inimă, respirație, recuperare, somn și cum te simți; e și culoarea marginilor)</span>
          </div>
        )}
        {me.readiness && (
          <div className={`day-verdict v-${me.readiness.verdict}`}>
            <b>Decizia zilei: {{ verde: 'verde', galben: 'galben', rosu: 'roșu', stop: 'stop' }[me.readiness.verdict]}</b>
            {me.readiness.reason && <span>{cleanRefs(me.readiness.reason)}</span>}
            <small>Cercul: recuperarea de pe brățară (peste 70 verde, 50–70 galben, 30–50 portocaliu, sub 30 roșu). Decizia zilei vine din toate datele: inimă, respirație, recuperare, somn, încărcare și cum te simți.</small>
          </div>
        )}
      </div>

      <div className="stack">
        <div className="lab" style={{ marginBottom: -4 }}>
          Statistici
        </div>
        <div className="grid-3">
          <Stat icon={Icons.clock} label="Ore" value={lastWeek ? lastWeek.hours.toLocaleString('ro-RO') : '–'} unit={lastWeek ? 'h' : undefined}>
            <div className="sub">săpt. trecută</div>
            {hours.length > 1 && <Spark values={hours.map((h) => h.hours)} />}
          </Stat>
          <Stat icon={Icons.heart} label="FC medie" value={lastRun?.avgHr ?? '–'} unit={lastRun ? 'bpm' : undefined}>
            <div className="sub">ultima alergare</div>
            {hrTrend.length > 1 && <Spark values={hrTrend} />}
          </Stat>
          <Stat icon={Icons.pulse} label="Ședințe" value={sessions ? sessions.done : '–'} unit={sessions ? `din ${sessions.planned}` : undefined}>
            <div className="sub">săpt. trecută</div>
            {sessions && <Spark values={sessions.perDay} kind="bars" />}
          </Stat>
        </div>

        <Card>
          <div className="chart-h">
            <div className="title">Ore pe săptămână</div>
            <span className="pill">
              {hours.length} săpt. {Icons.chevronDown}
            </span>
          </div>
          {hours.length ? <AreaChart values={hours.map((h) => h.hours)} labels={hours.map((h) => h.label)} max={maxH} ticks={[0, Math.round(maxH / 2), maxH]} tag={(v) => v.toLocaleString('ro-RO')} /> : <div className="small muted">Apare după prima săptămână încheiată cu date.</div>}
        </Card>

        <Card>
          <div className="chart-h">
            <div className="title">Execuție</div>
            <span className="small muted">% ședințe verzi sau galbene</span>
          </div>
          {exec.length ? <AreaChart values={exec.map((e) => e.pct)} labels={exec.map((e) => e.label)} max={100} ticks={[0, 50, 100]} height={130} tag={(v) => `${Math.round(v)}`} /> : <div className="small muted">Apare după prima săptămână de plan executată.</div>}
        </Card>

        <Card>
          <div className="chart-h">
            <div className="title">Pregătit pentru {me.user.goal ?? 'cursă'}</div>
            <span className="num md">{!bar ? 'fără date' : bar.blocked ? 'blocată' : bar.total == null ? 'fără date' : `${Math.round(bar.total)}%`}</span>
          </div>
          {bar && (
            <>
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
            </>
          )}
          {!bar && <div className="small muted">Bara se calculează la prima sincronizare cu activități.</div>}
        </Card>

        {runKm.length > 0 && (
          <Card tight>
            <div className="chart-h" style={{ marginBottom: 4 }}>
              <div className="title">Alergare, km pe săptămână</div>
              <span className="num sm">{runKm[runKm.length - 1]!.toLocaleString('ro-RO')}</span>
            </div>
            <Spark values={runKm} kind="bars" height={44} />
          </Card>
        )}
      </div>
    </>
  );
}
