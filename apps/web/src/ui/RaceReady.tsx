import { useState } from 'react';
import type { Sport } from '@core/types.js';
import type { Me } from '@core/api-types.js';
import { Icons, fmtDayMonth } from './common';
import { useMe } from '../data/store';
import { fmtTime } from '@core/goals/run-target.js';

const fmtPaceKm = (secKm: number) => `${Math.floor(secKm / 60)}:${String(Math.round(secKm % 60)).padStart(2, '0')}/km`;

const fmtH = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
const SPORT_OF: Record<string, Sport> = { Înot: 'inot', Bicicletă: 'bicicleta', Alergare: 'alergare', Ritm: 'alergare' };

type RR = NonNullable<Me['raceReady']>;

/** Titlul evaluării: incompletă când o probă n-are date (fără procent global), altfel veriga slabă. */
function headline(r: RR, goalName: string): { title: string; sub: string } {
  if (r.ready == null) {
    const miss = r.coverage.missing.filter((m) => m !== 'Cumul');
    return {
      title: 'Evaluare incompletă',
      sub: `${r.coverage.withData} din ${r.coverage.total} probe au date${miss.length ? ` · lipsește ${miss.join(', ').toLowerCase()}` : ''}. Nu afișăm un procent global.`,
    };
  }
  return { title: `Gata de ${goalName}: ${r.ready}%`, sub: `Cea mai slabă verigă: ${(r.weakest ?? '').toLowerCase()}. ${r.target ? 'Indice față de reperele probei și de ținta ta de timp, nu o promisiune.' : 'Indice față de reperele probei, nu probabilitate de a termina.'}` };
}

function Legs({ r }: { r: RR }) {
  const legs = r.links.filter((l) => l.name !== 'Cumul');
  return (
    <div className="legs" style={{ gridTemplateColumns: `repeat(${legs.length}, minmax(0, 1fr))` }}>
      {legs.map((l) => (
        <div key={l.name} className={`leg ${l.pct == null ? 'none' : ''}`}>
          <div className="leg-v">
            {l.pct == null ? '—' : l.pct}
            {l.pct != null && <small>%</small>}
          </div>
          <div className="leg-n">{l.name}</div>
          <div className="leg-s">{l.pct == null ? 'fără date' : (l.measured ?? '')}</div>
          <div className={`leg-bar ${l.pct == null ? 'dashed' : ''}`}>{l.pct != null && <i style={{ width: `${Math.max(2, l.pct)}%` }} />}</div>
        </div>
      ))}
    </div>
  );
}

/** Pe Acasă: „Repere pentru cursă”, compact. Detaliile sunt în Evoluție → Obiectiv. */
export function RacePanel({ goalName, onOpen }: { goalName: string; onOpen: (s: string) => void }) {
  const me = useMe();
  const r = me.raceReady;
  if (!r) return null;
  const h = headline(r, goalName);
  return (
    <section className="card race-panel">
      <div className="rp-head">
        <h2>Repere pentru cursă</h2>
        <button className="link-btn" onClick={() => onOpen('obiectiv')}>
          Vezi reperele {Icons.chevronRight}
        </button>
      </div>
      <p className="muted small">{r.ready == null ? `Evaluare incompletă · ${r.coverage.withData} din ${r.coverage.total} probe au date` : h.title}</p>
      <Legs r={r} />
    </section>
  );
}

/** În Evoluție → Obiectiv: evaluarea completă, cu verigile, reperele și timpul estimat. */
export function RaceDetail({ goalName, onOpen }: { goalName: string; onOpen: (s: string, o?: { sport?: Sport }) => void }) {
  const me = useMe();
  const r = me.raceReady;
  const [how, setHow] = useState(false);
  if (!r) return null;
  const h = headline(r, goalName);
  const on = r.onTrack;
  return (
    <>
      <section className="card">
        <div className="eyebrow">{me.user.raceName ?? goalName}</div>
        <h2 className="h-xl">{h.title}</h2>
        <p className="muted small">{h.sub}</p>
        <Legs r={r} />
        <button className="link-btn" style={{ marginTop: 12 }} onClick={() => setHow(!how)} aria-expanded={how}>
          {how ? 'Ascunde calculul' : 'Cum se calculează?'}
        </button>
        {how && (
          <div className="how small muted">
            Fiecare probă are un indice față de reperele ei (distanța demonstrată în ultimele 8 săptămâni și, unde există, ritmul față de timpul-limită). Nu e procent din distanța cursei și nici probabilitate de a termina. „Gata de cursă” e cea mai slabă verigă, nu o medie. O probă fără date rămâne „fără date”: nu devine 0 și nu e scoasă din calcul.
          </div>
        )}
      </section>

      {r.target && (
        <section className={`card target-card v-${r.target.verdict.verdict}`}>
          <div className="eyebrow">Ținta ta</div>
          <div className="row between" style={{ alignItems: 'baseline', gap: 12 }}>
            <div className="big-num">{fmtTime(r.target.targetSec)}</div>
            <span className="chip-lime">{fmtPaceKm(r.target.verdict.paceSecKm)}</span>
          </div>
          <div className="facts">
            <div className="fact">
              <small>Cel mai bun efort recent</small>
              <b>{r.target.best ? r.target.best.label : 'niciunul pe ceas'}</b>
            </div>
            <div className="fact">
              <small>Timp estimat acum</small>
              <b>{r.target.predictedSec ? `${fmtTime(r.target.predictedLow!)} – ${fmtTime(r.target.predictedHigh!)}` : '—'}</b>
            </div>
          </div>
          <div className={`verdict v-${r.target.verdict.verdict}`} style={{ marginTop: 10 }}>
            <b>{{ realist: 'Țintă realistă', ambitios: 'Țintă ambițioasă', nerealist: 'Țintă nerealistă', necunoscut: 'Încă nu putem judeca ținta' }[r.target.verdict.verdict]}</b>
            {r.target.verdict.reasons.map((x, i) => (
              <p key={i}>{x}</p>
            ))}
            {r.target.adjusted && <p>{r.target.planSec ? `Planul se construiește pe ~${fmtTime(r.target.planSec)}, nu pe ținta asta; ținta rămâne notată și o rejudecăm la fiecare test.` : 'Planul nu primește bucăți la ritmul ăsta; testele din plan dau ritmurile.'}</p>}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>Estimarea vine din cel mai bun efort de pe ceas din ultimele 8 săptămâni, adus la distanța cursei cu formula lui Riegel (marjă −4% / +8%). Nu e o promisiune: traseul, vremea și ziua schimbă rezultatul.</p>
        </section>
      )}

      <section className="card">
        <h3 className="h-md">Verigile</h3>
        <div className="list-rows">
          {r.links.map((l) => (
            <button key={l.name} className="row-btn" onClick={() => SPORT_OF[l.name] && onOpen('antrenament', { sport: SPORT_OF[l.name] })} disabled={!SPORT_OF[l.name]}>
              <span className="rb-main">
                <b>{l.name}</b>
                <small>{l.pct == null ? 'fără date în ultimele 8 săptămâni' : l.detail}</small>
              </span>
              <span className="rb-v">{l.pct == null ? '—' : `${l.pct}%`}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="h-md">Pe drum</h3>
        {on ? (
          <>
            <div className="big-num">
              {on.pct}
              <small>%</small>
            </div>
            <p className="small muted">
              Ultimele 4 săptămâni: {on.volumePct}% din volumul planificat, {on.keyDone} din {on.keyPlanned} ședințe-cheie.
            </p>
          </>
        ) : (
          <p className="small muted">{me.planStart && me.planStart > me.today ? `Planul începe pe ${fmtDayMonth(me.planStart)}. „Pe drum” apare după primele săptămâni.` : 'Apare după primele săptămâni de plan.'}</p>
        )}
      </section>

      <section className="card">
        <h3 className="h-md">Ședințe-reper · ultimele 8 săptămâni</h3>
        <div className="bm-list">
          {r.benchmarks.map((b) => (
            <div key={b.id} className={`bm ${b.done ? 'ok' : ''}`}>
              <span className="bm-ic">{b.done ? Icons.check : <i />}</span>
              <span>
                <b>{b.title}</b>
                <small>
                  {b.how}
                  {b.best ? ` · cel mai bun: ${b.best}` : ''}
                  {b.done && b.date ? ` · ${fmtDayMonth(b.date)}` : ''}
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>

      {r.estimate?.total != null && (
        <section className="card">
          <h3 className="h-md">Timp estimat</h3>
          <div className="big-num sm">
            {fmtH(r.estimate.low!)} – {fmtH(r.estimate.high!)}
          </div>
          <p className="small muted">
            {[r.estimate.swim != null ? `înot ${fmtH(r.estimate.swim)}` : '', r.estimate.bike != null ? `bicicletă ${fmtH(r.estimate.bike)}` : '', r.estimate.run != null ? `alergare ${fmtH(r.estimate.run)}` : ''].filter(Boolean).join(' · ')}
            {r.estimate.cutoffs ? ` · limita totală ${fmtH(r.estimate.cutoffs.total)}` : ''}
          </p>
          <p className="tiny muted">Ipoteze: {r.estimate.assumptions.join('; ')}. Marjă ±10%: apa deschisă, traseul și căldura schimbă tot. Limitele sunt cele uzuale; verifică regulamentul cursei tale.</p>
        </section>
      )}
    </>
  );
}
