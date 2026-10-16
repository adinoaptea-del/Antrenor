import { useEffect, useState } from 'react';
import { bar, dayIndex, greeting, totalDays } from '../data/demo';

// Mementoul de la deschidere: un fapt din datele tale, pe tot ecranul. Atingi → dispare în fade și intri în aplicație.
export function Memento({ onClose }: { onClose: () => void }) {
  const [out, setOut] = useState(false);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const close = () => {
    if (out) return;
    setOut(true);
    setTimeout(onClose, reduced ? 0 : 450);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const pct = bar.total == null ? null : Math.round(bar.total);
  return (
    <button className={`memento ${out ? 'out' : ''}`} onClick={close} aria-label="Intră în aplicație">
      <div className="inner">
        <div className="day">
          Ziua {dayIndex} din {totalDays}
        </div>
        <div className="txt">{greeting().replace(/^Ziua \d+ din \d+\.\s*/, '')}</div>
        {pct != null && (
          <div className="bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="tap">atinge ca să intri</div>
      </div>
    </button>
  );
}
