import type { Sport } from '@core/types.js';
import { weekday } from '@core/util/dates.js';
import { Icons } from './common';
import { WorkoutCard } from './Workout';
import { useState } from 'react';
import { useData, useMe } from '../data/store';
import { emptyMorning, type MorningForm } from '../forms/types';
import { DAY_NAMES, SPORT_LABEL, ago, colorOf, dayOf, firstSentences, fmtMinutes, todayMessage, workoutsOn } from '../data/model';
import { DayDecisionView } from './Day';

/**
 * Cardul „Azi”: primul lucru de pe Acasă. Ce faci azi (ședința, cât, intensitatea, de ce), decizia antrenorului în
 * două-trei propoziții și starea datelor (de când n-a mai venit nimic de la fiecare sursă).
 */
export function Today({ onOpen }: { onOpen: (screen: string, opts?: { sport?: Sport; activityId?: string }) => void }) {
  const me = useMe();
  if (!me.plan.length) return null;
  const list = workoutsOn(me, me.today).filter((w) => w.type !== 'odihna');
  const day = dayOf(me);
  const { msg, stale } = todayMessage(me);
  const next = list.length
    ? null
    : me.plan
        .filter((w) => (w.status === 'planificat' || w.status === 'mutat') && w.date > me.today && colorOf(me, w) === 'asteptare' && w.type !== 'odihna')
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    <section className="today-card" aria-label="Azi">
      <div className="today-k">
        <span>Azi · {DAY_NAMES[weekday(me.today)]}</span>
      </div>
      {day && <DayDecisionView day={day} />}
      {day?.ask && <AptQuestion />}

      {list.length === 0 ? (
        <div className="today-rest">
          {!day?.rest && <b>Odihnă în plan.</b>}
          {next && (
            <span>
              Urmează: {SPORT_LABEL[next.sport].toLowerCase()} {DAY_NAMES[weekday(next.date)]}, {fmtMinutes(next.plannedMinutes)}.
            </span>
          )}
        </div>
      ) : (
        <div className="today-list">
          {list.map((w, i) => (
            <WorkoutCard key={w.id} w={w} hero={i === 0} onOpen={onOpen} />
          ))}
        </div>
      )}

      <button className="today-coach" onClick={() => onOpen('antrenor')}>
        {Icons.chat}
        <span>
          {day?.ask ? 'Răspunde mai sus și antrenorul îți scrie pe răspunsul tău.' : msg ? firstSentences(msg.body, 3) : stale ? 'Mesajul de azi era scris pe date mai vechi. Cere unul nou.' : 'Antrenorul îți scrie la 05:30 și după fiecare antrenament.'}
          <b> {msg ? 'Vezi explicația' : 'Deschide'}</b>
        </span>
      </button>

      <Sources />
    </section>
  );
}

/**
 * Fără date de la brățări: sportivul spune dacă e apt. Răspunsul intră în chestionarul de dimineață, decizia zilei se
 * reface din el, iar antrenorul scrie mesajul pe răspuns.
 */
export function AptQuestion() {
  const me = useMe();
  const { submitForm, runAgents, local } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answer = async (apt: 'da' | 'partial' | 'nu') => {
    setBusy(true);
    setErr(null);
    try {
      const base = (me.forms.morning as MorningForm | null) ?? emptyMorning(me.today);
      await submitForm('dimineata', { ...base, date: me.today, apt });
      if (!local) void runAgents('dimineata').catch(() => undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="apt">
      <button className="btn sm" disabled={busy} onClick={() => void answer('da')}>
        Da, sunt odihnit
      </button>
      <button className="btn sm dark" disabled={busy} onClick={() => void answer('partial')}>
        Parțial
      </button>
      <button className="btn sm dark" disabled={busy} onClick={() => void answer('nu')}>
        Nu azi
      </button>
      {err && <div className="wk-note">{err}</div>}
    </div>
  );
}

/** Starea fiecărei surse: când a fost citită și dacă datele întârzie. Lipsa datelor trebuie să se vadă. */
function Sources() {
  const me = useMe();
  const list = me.sources ?? [];
  if (!list.length) return <div className="sources none">Nicio brățară conectată: planul merge doar pe ce completezi tu. Conectează una din Profil.</div>;
  return (
    <div className="sources">
      {list.map((s) => {
        const late = s.lastData == null || daysBetween(s.lastData, me.today) >= 2;
        const warn = !!s.error || late || !!s.noRecoveryToday;
        return (
          <span key={s.id} className={warn ? 'late' : ''} title={s.error ?? undefined}>
            {warn ? Icons.alert : null}
            <b>{s.name}</b> {s.error ? 'eroare la citire' : s.lastData == null ? 'fără date' : late ? `date de acum ${daysBetween(s.lastData, me.today)} zile` : s.noRecoveryToday ? `citit ${ago(s.lastSync, me.today)}, dar fără somn/recuperare azi` : `citit ${ago(s.lastSync, me.today)}`}
          </span>
        );
      })}
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
