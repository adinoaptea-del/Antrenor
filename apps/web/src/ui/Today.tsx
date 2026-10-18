import type { Sport } from '@core/types.js';
import { weekday } from '@core/util/dates.js';
import { Icons } from './common';
import { WorkoutCard } from './Workout';
import { levelFromScore } from '@core/collector/readiness.js';
import { useState } from 'react';
import { useData, useMe } from '../data/store';
import { emptyMorning, type MorningForm } from '../forms/types';
import { DAY_NAMES, ago, cleanRefs, dayOf, fmtMinutes, workoutsOn } from '../data/model';

/**
 * Cardul „Astăzi”: decizia zilei (una singură, aceeași peste tot), ședințele de azi și UN singur buton principal.
 * Starea măsurată stă separat, într-o linie: „date insuficiente” nu devine galben sau roșu.
 */
export function Today({ onOpen, cta }: { onOpen: (screen: string, opts?: { sport?: Sport; activityId?: string }) => void; cta: { label: string; go: () => void } | null }) {
  const me = useMe();
  if (!me.plan.length) return null;
  const list = workoutsOn(me, me.today).filter((w) => w.type !== 'odihna');
  const day = dayOf(me);
  const lv = day ? (day.rest ? 'odihna' : day.ask ? 'necunoscut' : day.level) : 'necunoscut';
  return (
    <section className={`card today-card t-${lv}`} aria-label="Astăzi">
      <div className="tc-top">
        <span className="eyebrow">Astăzi · {DAY_NAMES[weekday(me.today)]}</span>
        <span className="tc-ic" aria-hidden="true">{day?.rest ? Icons.moon : day?.ask ? Icons.info : day?.level === 'verde' ? Icons.check : day?.level === 'galben' ? Icons.alert : Icons.stop}</span>
      </div>
      <h2 className="h-xl">{day ? `${day.title}.` : 'Planul de azi'}</h2>
      {day && <p className="tc-action">{day.action}</p>}
      {day?.reason && <p className="tc-why">De ce: {cleanRefs(day.reason)}</p>}
      {day?.ask && <AptQuestion />}
      {list.length > 0 && (
        <div className="today-list">
          {list.map((w, i) => (
            <WorkoutCard key={w.id} w={w} hero={i === 0} onOpen={onOpen} />
          ))}
        </div>
      )}
      {!day?.ask && cta && (
        <button className="btn cta" onClick={cta.go}>
          {cta.label} {Icons.arrowRight}
        </button>
      )}
      <StateLine />
    </section>
  );
}

/** Starea măsurată de azi, într-o linie, separat de decizie. */
export function StateLine() {
  const me = useMe();
  const w = me.wellnessToday;
  const score = me.state?.score ?? w?.recoveryScore ?? null;
  const lvl = levelFromScore(score);
  const txt = score != null ? `recuperare ${score}/100` : w?.sleepMin != null ? `doar somnul a sosit (${fmtMinutes(w.sleepMin)})` : 'date insuficiente';
  return (
    <div className="tc-state">
      <i className={`sdot ${lvl ? `lvl-bg-${lvl}` : ''}`} aria-hidden="true" />
      Starea de azi: {txt}
    </div>
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
export function Sources() {
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
