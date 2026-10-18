import { weekday } from '@core/util/dates.js';
import { AreaChart, Avatar, Card, CircleBtn, Ecg, Icons, Ring, Spark, Stat, fmtDate } from './common';
import { SyncButton } from './SyncButton';
import { useMe } from '../data/store';
import { DAY_NAMES, SPORT_LABEL, fmtMinutes, sessionsInWeek, weeklyExecution, weeklyHours, weeklyKm, dayOf } from '../data/model';
import { DayDecisionView } from './Day';
import { GOAL_NAME, overallReady } from '@core/bar/sport-readiness.js';
import type { Goal } from '@core/calendar/phases.js';
import { cleanRefs } from '../data/model';
import { levelFromScore, sleepScore } from '@core/collector/readiness.js';

const LEVEL_LABEL: Record<string, string> = { verde: 'recuperare bună', galben: 'recuperare medie', portocaliu: 'recuperare slabă', rosu: 'recuperare foarte slabă' };


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
  const parts = me.state?.parts;
  const sleepSc = parts?.somn ?? (w?.sleepMin != null ? Math.round(sleepScore(w.sleepMin)) : null);
  const chips = [
    { k: 'rec', label: 'Recuperare brățări', score: parts?.recuperare ?? recovery, show: recovery != null },
    { k: 'somn', label: `Somn ${w?.sleepMin != null ? fmtMinutes(w.sleepMin) : ''}`, score: sleepSc, show: w?.sleepMin != null },
    { k: 'hrv', label: `HRV ${w?.hrv != null ? String(w.hrv).replace('.', ',') : ''} ms`, score: parts?.hrv ?? null, show: w?.hrv != null },
    { k: 'rhr', label: `Puls repaus ${w?.rhr ?? ''}`, score: parts?.puls ?? null, show: w?.rhr != null },
    { k: 'resp', label: 'Respirație', score: parts?.respiratie ?? null, show: parts?.respiratie != null },
  ].filter((c) => c.show);
  const n = parts ? Object.values(parts).filter((x) => x != null).length : 0;
  const ringValue = me.state?.score ?? recovery;
  // Inelul = măsurătoarea (scorul de recuperare), colorată după scor; decizia zilei e una singură, în cardul de dedesubt.
  const ringLevel = levelFromScore(ringValue ?? null);
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

      <div className={`ring-wrap lvl-${ringLevel ?? 'none'}`}>
        <Ring value={ringValue} size={168} stroke={10} level={ringLevel}>
          <span className="lb">Starea ta azi</span>
          <span className="num" style={{ fontSize: 56 }}>
            {ringValue ?? '–'}
          </span>
          <span className={`st lvl-txt-${ringLevel ?? ''}`}>{ringLevel == null ? 'fără date' : LEVEL_LABEL[ringLevel]}</span>
          <Ecg />
        </Ring>
        {w ? (
          <div className="rec-line">
            {chips.map((c) => (
              <span key={c.k} className="rec-chip">
                {c.label} {c.score != null && <b className={`lvl-txt-${levelFromScore(c.score)}`}>{c.score}</b>}
              </span>
            ))}
          </div>
        ) : (
          <div className="tiny muted" style={{ marginTop: 8, textAlign: 'center' }}>Nicio brățară nu a trimis date pentru azi.</div>
        )}
        {ringValue != null && n > 1 && (
          <div className="tiny muted" style={{ marginTop: 10, textAlign: 'center' }}>
            Media celor {n} scoruri de mai sus. Inima și respirația sunt comparate cu media ta din ultimele 60 de zile.
          </div>
        )}
        {dayOf(me) && <DayDecisionView day={dayOf(me)!} />}
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

        {/* Aceeași bară ca pe Acasă (o singură formulă); vechiul calcul nu mai apare. */}
        {me.sportReady && me.sportReady.length > 0 && (
          <Card>
            <div className="chart-h">
              <div className="title">Progres față de repere · {me.user.goal && me.user.goal in GOAL_NAME ? GOAL_NAME[me.user.goal as Goal] : 'cursă'}</div>
              <span className="num md">{overallReady(me.sportReady)}%</span>
            </div>
            <div className="bar-legend">
              {me.sportReady.map((r) => (
                <span key={r.sport}>
                  <b>{r.value == null ? 'fără date' : `${r.value}%`}</b>
                  {SPORT_LABEL[r.sport]}
                </span>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>Indice după regulile noastre de antrenor, nu probabilitate de a termina. Detaliile pe fiecare probă: Acasă → detalii.</div>
          </Card>
        )}

        <Card>
          <div className="chart-h">
            <div className="title">Eficiența la același puls</div>
            <span className="small muted">ședințe ușoare, plate</span>
          </div>
          {me.efficiency && me.efficiency.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {me.efficiency.map((e) => (
                <div key={e.sport} className="row between">
                  <span>{SPORT_LABEL[e.sport]}</span>
                  <span className={`num md ${e.schimbare_pct >= 1 ? 'lvl-txt-verde' : e.schimbare_pct <= -3 ? 'lvl-txt-portocaliu' : ''}`}>
                    {e.schimbare_pct > 0 ? '+' : ''}
                    {e.schimbare_pct.toLocaleString('ro-RO')}%
                  </span>
                </div>
              ))}
              <div className="tiny muted">Ultimele 3 săptămâni față de cele 6 dinainte: cât de repede mergi (sau câți wați scoți) la aceeași bătaie de inimă. Crește = progres real. Scade = oboseală, căldură sau boală; nu forța.</div>
            </div>
          ) : (
            <div className="small muted">Apare după cel puțin 3 ședințe ușoare în ultimele 3 săptămâni și 3 în cele 6 dinainte, cu puls (la bicicletă și cu putere).</div>
          )}
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
