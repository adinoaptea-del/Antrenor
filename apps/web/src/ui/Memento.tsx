import { useEffect, useState } from 'react';
import { useMe } from '../data/store';
import { dayIndex, greeting } from '../data/model';
import { randomMotivation } from '../data/motivation';

// Mesajul de la deschidere: un mesaj motivațional la întâmplare (plus, mic, un fapt real din datele tale), pe tot ecranul. Atingi → dispare în fade și intri în aplicație.
export function Memento({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [out, setOut] = useState(false);
  const [msg] = useState(randomMotivation);
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
  const d = dayIndex(me);
  // Faptul din date doar când e unul real (nu mesajul de rezervă).
  const raw = greeting(me).replace(/^Ziua \d+ din \d+\.\s*/, '');
  const fact = raw && !/pregătirea continuă|^Ziua \d{4}-/.test(raw) ? raw : null;
  const pct = me.bar?.total == null ? null : Math.round(me.bar.total);
  return (
    <button className={`memento ${out ? 'out' : ''}`} onClick={close} aria-label="Intră în aplicație">
      <div className="inner">
        <div className="day">{d ? `Ziua ${d.day} din ${d.total}` : me.user.raceName ?? 'AIRON'}</div>
        <div className="txt">{msg}</div>
        {fact && <div className="fact">{fact}</div>}
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
