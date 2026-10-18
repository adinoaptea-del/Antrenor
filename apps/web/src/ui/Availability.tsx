import { perDayMinutes } from '@core/calendar/budget.js';
import type { FreeBlock } from '@core/types.js';

const DAYS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

/** Disponibilitatea pe zile (ore numărate pentru sport, cel mult 5 h pe zi). */
export function AvailabilityDays({ blocks }: { blocks: FreeBlock[] }) {
  const per = perDayMinutes(blocks);
  if (!per.some((m) => m > 0)) return null;
  return (
    <div className="avail-days" aria-label="Ore disponibile pe zile">
      {per.map((m, d) => (
        <span key={d} className={m ? '' : 'off'}>
          <small>{DAYS[d]}</small>
          <b>{m ? (m / 60).toLocaleString('ro-RO', { maximumFractionDigits: 1 }) : '–'}</b>
        </span>
      ))}
    </div>
  );
}
