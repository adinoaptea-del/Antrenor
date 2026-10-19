import { GOAL_NAME } from '@core/bar/sport-readiness.js';
import { FITNESS_WEEKS, goalKind, type Goal } from '@core/calendar/phases.js';
import { useMe } from '../data/store';
import { BackHeader } from './Shell';
import { Icons } from './common';
import { Tube } from './Tube';
import { fitnessWeekOf } from './FitnessProgress';
import { colorOf, dayOf } from '../data/model';

/**
 * Progresul tău: un tub mare pentru obiectiv, tuburi mici pe fiecare probă, tubul de azi (starea corpului) și cel mult
 * trei sfaturi din datele tale. Detaliile (reperele, dovezile, formula) sunt un pas mai departe, nu pe pagina asta.
 */
export function Progress({ onBack, onOpen }: { onBack: () => void; onOpen: (s: string) => void }) {
  const me = useMe();
  const fit = goalKind(me.user.goal) === 'fitness';
  const goalName = me.user.goal && me.user.goal in GOAL_NAME ? GOAL_NAME[me.user.goal as Goal] : 'obiectiv';
  const r = me.raceReady ?? null;

  // Obiectivul: la cursă, indicele față de repere (veriga cea mai slabă); la fitness, ședințele făcute din program.
  const fitWeek = fitnessWeekOf(me.planStart, me.today);
  const strength = fit ? me.plan.filter((w) => w.sport === 'forta' && w.date < me.today) : [];
  const strengthDone = strength.filter((w) => ['verde', 'galben', 'portocaliu'].includes(colorOf(me, w))).length;
  // Fitness: cât din program ai făcut efectiv (ședințe făcute din toate ședințele programului), nu cât timp a trecut.
  const programTotal = fit ? me.plan.filter((w) => w.sport === 'forta').length : 0;
  const goalPct = fit ? (programTotal ? Math.round((strengthDone / programTotal) * 100) : null) : (r?.ready ?? null);
  const legs = fit ? [] : (r?.links ?? []).filter((l) => l.name !== 'Cumul');
  const todayScore = me.state?.score ?? me.wellnessToday?.recoveryScore ?? null;
  const day = dayOf(me);

  // Sfaturi: din date, cel mult trei, cele mai utile primele.
  const tips: string[] = [];
  const ot = r?.onTrack;
  if (ot && ot.keyPlanned > 0 && ot.keyDone < ot.keyPlanned) tips.push(`Ședințele-cheie fac diferența: ai făcut ${ot.keyDone} din ${ot.keyPlanned} în ultimele 4 săptămâni. Respectă-le pe cele marcate „cheie”, chiar dacă scurtezi restul.`);
  else if (ot && ot.keyPlanned > 0) tips.push(`Toate ședințele-cheie făcute în ultimele 4 săptămâni (${ot.keyDone} din ${ot.keyPlanned}). Așa se construiește: săptămâni bune la rând, nu zile eroice.`);
  const weak = legs.filter((l) => l.pct != null).sort((a, b) => a.pct! - b.pct!)[0];
  if (weak && legs.length > 1) tips.push(`Veriga slabă acum: ${weak.name.toLowerCase()}${weak.measured ? ` (${weak.measured})` : ''}. Acolo câștigi cel mai mult; nu sări ședințele ei.`);
  const noData = legs.filter((l) => l.pct == null).map((l) => l.name.toLowerCase());
  if (noData.length) tips.push(`Fără date încă la ${noData.join(', ')}: prima ședință înregistrată de ceas pornește evaluarea.`);
  if (fit && strength.length) tips.push(`Ședințe de sală făcute: ${strengthDone} din ${strength.length}. Regularitatea bate intensitatea: mai bine 3 ședințe sigure pe săptămână decât 5 promise.`);
  if (day && (day.level === 'galben' || day.level === 'rosu')) tips.push(`Azi corpul cere mai puțin (${day.title.toLowerCase()}). Recuperarea face parte din antrenament: somn și mâncare bună azi înseamnă calitate mâine.`);
  if (tips.length < 2) tips.push('Somnul e primul antrenament: aceeași oră de culcare în fiecare seară ajută mai mult decât orice supliment.');

  return (
    <>
      <BackHeader title="Progresul tău" onBack={onBack} />
      <div className="prog">
        <section className="prog-main">
          <div className="prog-row">
            <b>{fit ? `Programul de ${FITNESS_WEEKS} de săptămâni` : `Pregătit pentru ${me.user.raceName ?? goalName}`}</b>
            <span>{goalPct == null ? 'îți evaluăm nivelul' : `${goalPct}%`}</span>
          </div>
          <Tube pct={goalPct} label={fit ? 'Programul de fitness' : `Pregătirea pentru ${goalName}`} />
          <p className="prog-note">
            {fit
              ? `${strengthDone} ședințe făcute din ${programTotal} ale programului${fitWeek ? ` · săptămâna ${fitWeek} din ${FITNESS_WEEKS}` : ' · începe luni'}. Plin = programul dus la capăt.`
              : goalPct == null
                ? `Tubul se umple pe măsură ce ceasul înregistrează ședințe la fiecare probă (${r ? `${r.coverage.withData} din ${r.coverage.total} au date` : 'încă fără date'}).`
                : 'Plin = ai demonstrat reperele probei. Contează veriga cea mai slabă; e un indice, nu o promisiune.'}
          </p>
        </section>

        {legs.length > 1 && (
          <section className="prog-legs">
            {legs.map((l) => (
              <div key={l.name} className="prog-leg">
                <div className="prog-row small">
                  <span>{l.name}</span>
                  <span>{l.pct == null ? 'fără date' : `${l.pct}%`}</span>
                </div>
                <Tube pct={l.pct} size="small" label={l.name} />
              </div>
            ))}
          </section>
        )}

        <section className="prog-leg">
          <div className="prog-row small">
            <span>Pregătit azi</span>
            <span>{todayScore == null ? 'fără date de la brățară' : `${todayScore}/100`}</span>
          </div>
          <Tube pct={todayScore} size="small" label="Pregătit azi" />
          {day && <p className="prog-note">{day.title}.</p>}
        </section>

        <section className="prog-tips" aria-label="Sfaturi">
          {tips.slice(0, 3).map((t) => (
            <p key={t}>{t}</p>
          ))}
        </section>

        <button className="linkish prog-more" onClick={() => onOpen('obiectiv')}>
          Reperele și dovezile {Icons.chevronRight}
        </button>
      </div>
    </>
  );
}
