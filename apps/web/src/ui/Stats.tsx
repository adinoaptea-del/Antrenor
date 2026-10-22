import { isFitnessGoal } from '@core/calendar/phases.js';
import { addDays } from '@core/util/dates.js';
import { AreaChart, Icons, Ring, Spark, fmtDayMonth } from './common';
import { useData, useMe } from '../data/store';
import { SPORT_LABEL, fmtMinutes, sessionsInWeek, weeklyExecution, weeklyHours, weeklyKm, dayOf } from '../data/model';
import { RecoveryCard } from './Recovery';
import { Sources } from './Today';
import { levelFromScore, sleepScore } from '@core/collector/readiness.js';
import { fmtTime } from './sync';
import { useState } from 'react';

const LEVEL_LABEL: Record<string, string> = { verde: 'recuperare bună', galben: 'recuperare medie', portocaliu: 'recuperare slabă', rosu: 'recuperare foarte slabă' };

/**
 * Evoluție → Starea de azi: ce au măsurat brățările azi (cu sursa și ora), apoi recuperarea și statisticile pe
 * săptămâni încheiate. Fără date: o stare neutră și o acțiune utilă, nu un scor inventat.
 */
export function Stats({ onOpen }: { onOpen: (screen: string) => void }) {
  const me = useMe();
  const { sync } = useData();
  const [busy, setBusy] = useState(false);
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
  // Starea zilei = media dintre calculul aplicației și media brățărilor (decizia proprietarului, 22.10.2026).
  const blended = parts?.aplicatie != null && parts?.bratari != null;
  const SRC: Record<string, string> = { whoop: 'WHOOP', oura: 'Oura', garmin: 'Garmin', apple: 'Apple', android: 'Samsung', strava: 'Strava' };
  const chips = [
    { k: 'app', label: 'Calculul aplicației', score: parts?.aplicatie ?? null, show: blended },
    ...(parts?.bratariLista ?? []).map((d) => ({ k: `dev-${d.source}`, label: `${SRC[d.source] ?? d.source}`, score: d.score, show: blended })),
    { k: 'rec', label: 'Recuperare brățări', score: parts?.recuperare ?? recovery, show: !blended && recovery != null },
    { k: 'somn', label: `Somn ${w?.sleepMin != null ? fmtMinutes(w.sleepMin) : ''}`, score: sleepSc, show: w?.sleepMin != null },
    { k: 'hrv', label: `HRV ${w?.hrv != null ? String(w.hrv).replace('.', ',') : ''} ms`, score: parts?.hrv ?? null, show: w?.hrv != null },
    { k: 'rhr', label: `Puls de repaus ${w?.rhr ?? ''}`, score: parts?.puls ?? null, show: w?.rhr != null },
    { k: 'resp', label: 'Respirație', score: parts?.respiratie ?? null, show: parts?.respiratie != null },
    // Temperatura pielii (Oura): afișată ca valoare, fără scor inventat; nu e temperatura corpului.
    { k: 'temp', label: `Temperatura pielii ${w?.tempDevC != null ? `${w.tempDevC > 0 ? '+' : ''}${w.tempDevC.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} °C față de media ta` : ''}`, score: null, show: w?.tempDevC != null },
  ].filter((c) => c.show);
  const n = parts ? [parts.recuperare, parts.somn, parts.hrv, parts.puls, parts.respiratie].filter((x) => x != null).length : 0;
  const ringValue = me.state?.score ?? recovery;
  const ringLevel = levelFromScore(ringValue ?? null);
  const day = dayOf(me);
  const planStarted = !!me.planStart && me.planStart <= me.today;
  const lastSync = me.lastSync ?? me.profile.appleLastSync ?? null;
  const weekRange = (start: string) => `${fmtDayMonth(start)}–${fmtDayMonth(addDays(start, 6))}`;
  const run = async () => {
    setBusy(true);
    try {
      await sync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {ringValue == null ? (
        <section className="card state-empty">
          <div className="ring-empty" aria-hidden="true">—</div>
          <h2 className="h-lg">Încă nu avem datele de azi.</h2>
          <p className="small muted">{me.sources?.length ? 'Somnul și recuperarea de azi nu au ajuns în aplicație. Decizia zilei nu se face din presupuneri.' : 'Nicio brățară conectată: starea zilei se face doar din ce completezi tu.'}</p>
          {me.sources?.length ? (
            <button className="btn cta" disabled={busy} onClick={() => void run()}>
              {busy ? 'Citesc…' : 'Verifică sincronizarea'}
            </button>
          ) : (
            <button className="btn cta" onClick={() => onOpen('profil')}>
              Conectează o brățară
            </button>
          )}
          <div className="kv">
            <span>Ultima citire</span>
            <b>{lastSync ? fmtTime(lastSync) : '—'}</b>
            <span>Planul de azi</span>
            <b>{day ? day.title.toLowerCase() : 'fără decizie'}</b>
          </div>
          <Sources />
        </section>
      ) : (
        <section className={`card ring-card lvl-${ringLevel ?? 'none'}`}>
          <Ring value={ringValue} size={168} stroke={10} level={ringLevel}>
            <span className="lb">Starea de azi</span>
            <span className="num" style={{ fontSize: 56 }}>
              {ringValue}
            </span>
            <span className={`st lvl-txt-${ringLevel ?? ''}`}>{ringLevel == null ? 'fără date' : LEVEL_LABEL[ringLevel]}</span>
          </Ring>
          <div className="rec-line">
            {chips.map((c) => (
              <span key={c.k} className="rec-chip">
                {c.label} {c.score != null && <b className={`lvl-txt-${levelFromScore(c.score)}`}>{c.score}</b>}
              </span>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            {blended
              ? `Media dintre calculul aplicației (${parts!.aplicatie}: HRV, puls, respirație și somn față de media ta din ultimele 60 de zile) și brățări (${parts!.bratari}${(parts!.bratariLista ?? []).length > 1 ? ', media lor' : ''}): fiecare are raționamentul ei. `
              : n > 1 ? `Media celor ${n} scoruri de mai sus; inima și respirația sunt comparate cu media ta din ultimele 60 de zile. ` : ''}
            Măsurătoarea de azi, nu decizia: decizia zilei e pe Acasă{day ? ` (${day.title.toLowerCase()})` : ''}.
          </p>
          <Sources />
        </section>
      )}

      <RecoveryCard />

      <div className="eyebrow" style={{ marginTop: 4 }}>Statistici · săptămâni încheiate</div>
      <div className="grid-2">
        <section className="card tight stat">
          <div className="st-l">{Icons.clock} Ore</div>
          <div className="st-v">
            {lastWeek ? lastWeek.hours.toLocaleString('ro-RO') : '–'}
            {lastWeek && <small>h</small>}
          </div>
          <div className="sub">{lastWeek ? weekRange(lastWeek.start) : 'fără săptămână încheiată'}</div>
          {hours.length > 2 && <Spark values={hours.map((h) => h.hours)} />}
        </section>
        <section className="card tight stat">
          <div className="st-l">{Icons.pulse} Ședințe</div>
          <div className="st-v">
            {sessions && sessions.planned > 0 ? sessions.done : '–'}
            {sessions && sessions.planned > 0 && <small>din {sessions.planned}</small>}
          </div>
          <div className="sub">{!lastWeek ? 'fără săptămână încheiată' : sessions && sessions.planned > 0 ? weekRange(lastWeek.start) : me.planStart && addDays(lastWeek.start, 6) < me.planStart ? `săptămână dinaintea planului (începe pe ${fmtDayMonth(me.planStart)})` : planStarted ? 'nicio ședință evaluabilă' : `planul începe pe ${me.planStart ? fmtDayMonth(me.planStart) : '—'}`}</div>
          {sessions && sessions.planned > 0 && <Spark values={sessions.perDay} kind="bars" />}
        </section>
      </div>

      <section className="card">
        <div className="chart-h">
          <h3 className="h-md">Ore pe săptămână</h3>
          <span className="small muted">{hours.length ? `${weekRange(hours[0]!.start)} … ${weekRange(hours[hours.length - 1]!.start)}` : ''}</span>
        </div>
        {hours.length ? (
          <>
            <AreaChart values={hours.map((h) => h.hours)} labels={hours.map((h) => h.label)} max={maxH} ticks={[0, Math.round(maxH / 2), maxH]} tag={(v) => v.toLocaleString('ro-RO')} />
            <p className="tiny muted">Fiecare punct = o săptămână de luni până duminică, din activitățile înregistrate. Săptămâna curentă nu apare până nu se încheie.</p>
          </>
        ) : (
          <p className="small muted">Apare după prima săptămână încheiată cu date.</p>
        )}
      </section>

      <section className="card">
        <div className="chart-h">
          <h3 className="h-md">Execuția planului</h3>
          <span className="small muted">% ședințe conforme sau parțiale</span>
        </div>
        {exec.length ? (
          <>
            <AreaChart values={exec.map((e) => e.pct)} labels={exec.map((e) => e.label)} max={100} ticks={[0, 50, 100]} height={130} tag={(v) => `${Math.round(v)}`} />
            <p className="tiny muted">Doar săptămânile cu ședințe planificate și încheiate; zilele viitoare și pauzele nu intră.</p>
          </>
        ) : (
          <p className="small muted">{planStarted ? 'Apare după prima săptămână de plan încheiată.' : `Planul începe pe ${me.planStart ? fmtDayMonth(me.planStart) : '—'}; istoricul importat rămâne la ore, nu la execuție.`}</p>
        )}
      </section>

      {!isFitnessGoal(me.user.goal) && (
      <section className="card">
        <div className="chart-h">
          <h3 className="h-md">Eficiența la același puls</h3>
          <span className="small muted">ședințe ușoare, plate</span>
        </div>
        {me.efficiency && me.efficiency.length ? (
          <div className="stack" style={{ gap: 8 }}>
            {me.efficiency.map((e) => (
              <div key={e.sport} className="row between">
                <span>
                  {SPORT_LABEL[e.sport]} <small className="muted">· {e.sedinte.recent} ședințe recente față de {e.sedinte.inainte} înainte</small>
                </span>
                <span className="num md">
                  {e.schimbare_pct > 0 ? '+' : ''}
                  {e.schimbare_pct.toLocaleString('ro-RO')}%
                </span>
              </div>
            ))}
            <p className="tiny muted">Tendință în eșantionul comparabil (ultimele 3 săptămâni față de cele 6 dinainte), în {me.efficiency[0]!.unitate}. Nu e diagnostic: traseul, senzorul, căldura sau somnul schimbă cifra. Decizia zilei nu se ia doar din ea.</p>
          </div>
        ) : (
          <p className="small muted">Date insuficiente: apare după cel puțin 3 ședințe ușoare în ultimele 3 săptămâni și 3 în cele 6 dinainte, cu puls (la bicicletă și cu putere).</p>
        )}
      </section>
      )}

      {runKm.length > 2 && (
        <section className="card tight">
          <div className="chart-h" style={{ marginBottom: 4 }}>
            <h3 className="h-md">Alergare, km pe săptămână</h3>
            <span className="num sm">{runKm[runKm.length - 1]!.toLocaleString('ro-RO')}</span>
          </div>
          <Spark values={runKm} kind="bars" height={44} />
          <p className="tiny muted">{hours.length ? `${weekRange(hours[0]!.start)} … ${weekRange(hours[hours.length - 1]!.start)}` : ''}</p>
        </section>
      )}

    </div>
  );
}
