import type { Sport } from '@core/types.js';
import { Icons, fmtDayMonth } from './common';
import { useMe } from '../data/store';

const fmtH = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;

/**
 * Două cifre: „Pe drum” (ești unde trebuie în faza de acum) și „Gata de cursă” (cea mai slabă verigă). Detaliile:
 * verigile, ședințele-reper și timpul estimat cu marjă.
 */
export function RaceReadyBar({ onOpen, goalName, open, setOpen }: { onOpen: (s: string, o?: { sport?: Sport }) => void; goalName: string; open: boolean; setOpen: (v: boolean) => void }) {
  const me = useMe();
  const r = me.raceReady!;
  const on = r.onTrack;
  const sportOf: Record<string, Sport> = { Înot: 'inot', Bicicletă: 'bicicleta', Alergare: 'alergare' };
  return (
    <div className="progress rr">
      <div className="rr-row">
        <div className="ready-title">
          Pe drum: <b>{on ? `${on.pct}%` : '–'}</b>
        </div>
        <div className="track">
          <div className={`fill ${on?.pct ? '' : 'empty'}`} style={on?.pct ? { width: `${Math.max(3, on.pct)}%` } : undefined} />
        </div>
        <span className="tiny muted">{on ? `ultimele 4 săptămâni: ${on.volumePct}% din volumul planificat, ${on.keyDone} din ${on.keyPlanned} ședințe-cheie` : 'apare după primele săptămâni de plan'}</span>
      </div>
      <div className="rr-row">
        <div className="ready-title small-t">
          Gata de {goalName}: <b>{r.ready}%</b> <span className="muted">· veriga slabă: {r.weakest.toLowerCase()}</span>
        </div>
        <div className="track thin">
          <div className={`fill ${r.ready ? '' : 'empty'}`} style={r.ready ? { width: `${Math.max(3, r.ready)}%` } : undefined} />
        </div>
      </div>
      <div className="meta">
        <span className="tiny muted">{r.links.map((l) => `${l.name} ${l.pct}%`).join('  ·  ')}</span>
        <button className="pill" onClick={() => setOpen(!open)} style={{ height: 28 }} aria-expanded={open}>
          detalii {Icons.chevronRight}
        </button>
      </div>
      {open && (
        <div className="bar-info">
          {r.links.map((l) => (
            <button key={l.name} className="bi-row bi-btn" onClick={() => sportOf[l.name] && onOpen('antrenament', { sport: sportOf[l.name] })}>
              <span className="bi-k">{l.name}</span>
              <span className="bi-v">{l.pct}%</span>
              <span className="bi-d">{l.detail}</span>
            </button>
          ))}
          <div className="rr-k">Ședințe-reper (ultimele 8 săptămâni)</div>
          {r.benchmarks.map((b) => (
            <div key={b.id} className={`rr-bm ${b.done ? 'ok' : ''}`}>
              {b.done ? Icons.check : <span className="rr-dot" />}
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
          {r.estimate?.total != null && (
            <div className="rr-est">
              <div className="rr-k">Timp estimat</div>
              <div className="small">
                <b>
                  {fmtH(r.estimate.low!)} – {fmtH(r.estimate.high!)}
                </b>
                {r.estimate.cutoffs ? ` · limita totală ${fmtH(r.estimate.cutoffs.total)}` : ''}
              </div>
              <div className="tiny muted">
                {[r.estimate.swim != null ? `înot ${fmtH(r.estimate.swim)}` : '', r.estimate.bike != null ? `bicicletă ${fmtH(r.estimate.bike)}` : '', r.estimate.run != null ? `alergare ${fmtH(r.estimate.run)}` : ''].filter(Boolean).join(' · ')}. Ipoteze: {r.estimate.assumptions.join('; ')}. Marjă ±10%: apa deschisă, traseul și căldura schimbă tot. Limitele sunt cele uzuale; verifică regulamentul cursei tale.
              </div>
            </div>
          )}
          <div className="tiny muted">„Gata de cursă” e cea mai slabă verigă, nu o medie: o probă slabă te scoate din cursă oricât de bune ar fi celelalte. Departe de cursă, contează „pe drum”.</div>
        </div>
      )}
    </div>
  );
}
