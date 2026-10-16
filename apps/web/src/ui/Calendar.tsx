import { useState } from 'react';
import { Avatar, Card, CircleBtn, Dot, Icons, Label, LiveTitle } from './common';
import { useMe } from '../data/store';
import { phaseWeeks } from '@core/calendar/phases.js';
import { weekStart } from '@core/util/dates.js';
import { COLOR_LABEL, SPORT_LABEL, TYPE_LABEL, activitiesOn, colorOf, fmtMinutes, reasonsOf, sessionSteps, workoutsOn } from '../data/model';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const DOW = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const pad = (n: number) => String(n).padStart(2, '0');

export function Calendar({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const [year, setYear] = useState(Number(me.today.slice(0, 4)));
  const [month, setMonth] = useState(Number(me.today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState(me.today);

  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));
  const dayWorkouts = workoutsOn(me, selected);
  const unplannedHere = activitiesOn(me, selected).filter((a) => a.unplanned);

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
          <Avatar name={me.user.name || 'S'} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <PlanOverview
        onPick={(iso) => {
          setYear(Number(iso.slice(0, 4)));
          setMonth(Number(iso.slice(5, 7)) - 1);
          setSelected(iso);
        }}
      />

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
              <button key={iso} className={`cal-day ${iso === me.today ? 'today' : ''} ${iso === selected ? 'sel' : ''}`} onClick={() => setSelected(iso)} aria-pressed={iso === selected} aria-label={iso}>
                <span className="d">{Number(iso.slice(8))}</span>
                <span className="dots">
                  {workoutsOn(me, iso)
                    .slice(0, 3)
                    .map((w) => (
                      <Dot key={w.id} color={colorOf(me, w)} />
                    ))}
                  {activitiesOn(me, iso)
                    .filter((a) => a.unplanned)
                    .map((a) => (
                      <Dot key={a.id} color="albastru" />
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
          <span>
            <Dot color="albastru" /> în afara planului
          </span>
        </div>
      </Card>

      <div className="stack" style={{ marginTop: 12 }}>
        <Card>
          <Label>{selected === me.today ? 'Azi' : selected.split('-').reverse().join('.')}</Label>
          {unplannedHere.map((u) => (
            <div key={u.id} className="item">
              <Dot color="albastru" />
              <div style={{ minWidth: 0 }}>
                <div className="t">{u.name ?? SPORT_LABEL[u.sport]} · în afara planului</div>
                <div className="s">
                  {u.avgHr ? `FC medie ${u.avgHr}${u.maxHr ? `, max ${u.maxHr}` : ''} · ` : ''}intră în încărcare, nu în scor
                  {!u.tipNeplanificat && (
                    <>
                      {' · '}
                      <button className="pill" style={{ height: 24, padding: '0 8px' }} onClick={() => onOpen('seara', { activityId: u.id })}>
                        ce a fost?
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="m">{fmtMinutes(u.minutes)}</div>
            </div>
          ))}
          {dayWorkouts.length === 0 && unplannedHere.length === 0 ? (
            <div className="muted small">{me.plan.length ? 'Zi fără antrenament.' : 'Planul apare după chestionarul de intrare.'}</div>
          ) : (
            <div className="list">
              {dayWorkouts.map((w) => {
                const color = colorOf(me, w);
                const reasons = reasonsOf(me, w);
                return (
                  <div key={w.id} className="item">
                    <Dot color={color} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">
                        {SPORT_LABEL[w.sport]}
                        {w.type === 'forta' ? '' : ` · ${TYPE_LABEL[w.type]}`}
                        {w.key ? ' · cheie' : ''}
                      </div>
                      <div className="s">{[w.targetZones.length ? `Z${w.targetZones.join('–')}` : '', w.structure ?? '', w.note ?? ''].filter(Boolean).join(' · ')}</div>
                      <ol className="steps">
                        {sessionSteps(me, w).map((st) => (
                          <li key={st.label}>
                            <b>{st.label}</b> {st.text}
                          </li>
                        ))}
                      </ol>
                      <div className="s" style={{ marginTop: 4, color: 'var(--fg)' }}>
                        {COLOR_LABEL[color]}
                      </div>
                      {reasons.length > 0 && (
                        <ul className="reasons">
                          {reasons.map((r) => (
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

const PHASE_LABEL: Record<string, string> = { evaluare: 'Evaluare', baza1: 'Bază 1', baza2: 'Bază 2', build: 'Build', peak: 'Peak', taper: 'Taper' };
const PHASE_WHAT: Record<string, string> = {
  evaluare: 'teste de teren, doar ușor',
  baza1: 'volum aerob, tempo scurt',
  baza2: 'volum mai mare, tempo lung, sweet spot',
  build: 'prag, brick-uri, ieșiri lungi',
  peak: 'ritm de cursă, intervale Z5',
  taper: 'volum jos, prospețime',
};

/** Tot planul până la cursă: fazele, săptămânile și orele pe săptămână (se vede creșterea și descărcările). */
function PlanOverview({ onPick }: { onPick: (iso: string) => void }) {
  const me = useMe();
  if (!me.planStart || !me.user.raceDate || me.plan.length === 0) return null;
  let weeks: ReturnType<typeof phaseWeeks>;
  try {
    const age = me.profile.birthYear ? Number(me.today.slice(0, 4)) - me.profile.birthYear : null;
    weeks = phaseWeeks(me.planStart, me.user.raceDate, age != null && age >= 40 ? 3 : 4);
  } catch {
    return null;
  }
  const hours = new Map<string, { min: number; hard: number }>();
  for (const w of me.plan) {
    if (w.status === 'sters' || w.status === 'anulat_sistem') continue;
    const k = weekStart(w.date);
    const h = hours.get(k) ?? { min: 0, hard: 0 };
    h.min += w.plannedMinutes;
    if (w.type === 'calitate') h.hard += 1;
    hours.set(k, h);
  }
  const max = Math.max(1, ...[...hours.values()].map((h) => h.min));
  const thisWeek = weekStart(me.today);
  const phases = [...new Set(weeks.map((w) => w.phase))];
  return (
    <Card>
      <Label>Planul până la cursă</Label>
      <div className="tiny muted" style={{ marginBottom: 10 }}>
        {weeks.length} săptămâni, de la {me.planStart.split('-').reverse().join('.')} la cursă. Fiecare bară e o săptămână: înălțimea = ore planificate; barele scurte sunt descărcările.
      </div>
      <div className="po-bars" role="img" aria-label="Orele planificate pe săptămână până la cursă">
        {weeks.map((w) => {
          const h = hours.get(w.weekStart);
          return (
            <button
              key={w.weekStart}
              className={`po-bar ph-${w.phase} ${w.weekStart === thisWeek ? 'now' : ''} ${w.weekStart < thisWeek ? 'past' : ''}`}
              style={{ height: `${Math.max(6, ((h?.min ?? 0) / max) * 100)}%` }}
              title={`${w.weekStart}: ${fmtMinutes(h?.min ?? 0)}`}
              onClick={() => onPick(w.weekStart)}
            />
          );
        })}
      </div>
      <div className="po-phases">
        {phases.map((ph) => {
          const ws = weeks.filter((w) => w.phase === ph);
          const mins = ws.map((w) => hours.get(w.weekStart)?.min ?? 0).filter((m) => m > 0);
          const avg = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
          return (
            <button key={ph} className="po-row" onClick={() => onPick(ws[0]!.weekStart)}>
              <span className={`po-dot ph-${ph}`} />
              <span className="po-n">
                <b>{PHASE_LABEL[ph]}</b> · {ws.length} săpt. · de la {ws[0]!.weekStart.split('-').reverse().slice(0, 2).join('.')}
                <small>{PHASE_WHAT[ph]}</small>
              </span>
              <span className="po-h">~{fmtMinutes(Math.round(avg))}/săpt.</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
