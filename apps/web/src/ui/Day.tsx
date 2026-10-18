import type { DayDecision } from '@core/calendar/day.js';
import { Icons } from './common';
import { cleanRefs } from '../data/model';

const ICON = { verde: Icons.check, galben: Icons.alert, rosu: Icons.stop, stop: Icons.stop } as const;

/**
 * Decizia zilei, la fel pe fiecare ecran: eticheta (Zi verde / galbenă / roșie / Stop), ce faci azi și de ce.
 * Textul vine dintr-un singur loc (DAY_TEXT), deci nu se poate contrazice de la un ecran la altul.
 */
export function DayDecisionView({ day, compact = false }: { day: DayDecision; compact?: boolean }) {
  return (
    <div className={`day-dec d-${day.level}`}>
      <div className="dd-top">
        <span className="dd-badge">
          {ICON[day.level]}
          {day.title}
        </span>
        <b className="dd-action">{day.action}</b>
      </div>
      {!compact && day.reason && <div className="dd-why">De ce: {cleanRefs(day.reason)}</div>}
    </div>
  );
}
