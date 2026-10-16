import type { ReactNode } from 'react';
import type { FreeBlock } from '@core/types.js';
import { Icons } from '../ui/common';

// Controale mari, de atins cu degetul, pentru formulare completate în 20 de secunde.

export function Q({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="q">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T | null; options: { id: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={`chip ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          <span>{o.label}</span>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/** Scară de atins: 0–10 (RPE, durere) sau 1–7 (Hooper). Capetele au etichete. */
export function Scale({ value, min, max, onChange, lowLabel, highLabel }: { value: number | null; min: number; max: number; onChange: (v: number) => void; lowLabel: string; highLabel: string }) {
  const n = max - min + 1;
  return (
    <div className="scale-wrap">
      <div className="scale" role="radiogroup" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {Array.from({ length: n }, (_, i) => min + i).map((v) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="scale-labels">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

export function Toggle({ label, value, onChange, danger = false }: { label: string; value: boolean | null; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <button className={`toggle ${value ? (danger ? 'danger' : 'on') : ''}`} onClick={() => onChange(!value)} aria-pressed={!!value}>
      <span>{label}</span>
      <span className="pill-mini">{value ? 'da' : 'nu'}</span>
    </button>
  );
}

export function Stepper({ value, min, max, step, unit, onChange, fallback }: { value: number | null; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; fallback: number }) {
  const v = value ?? fallback;
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toLocaleString('ro-RO'));
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, Math.round((v - step) * 100) / 100))} aria-label="mai puțin">
        −
      </button>
      <div className="val">
        <span className="num md">{value == null ? '–' : fmt(v)}</span>
        <span className="unit">{unit}</span>
      </div>
      <button onClick={() => onChange(Math.min(max, Math.round((v + step) * 100) / 100))} aria-label="mai mult">
        +
      </button>
    </div>
  );
}

const DAYS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const SLOTS: { id: string; label: string; startMin: number; endMin: number }[] = [
  { id: 'devreme', label: '6–8', startMin: 6 * 60, endMin: 8 * 60 },
  { id: 'dimineata', label: '8–12', startMin: 8 * 60, endMin: 12 * 60 },
  { id: 'pranz', label: '12–15', startMin: 12 * 60, endMin: 15 * 60 },
  { id: 'dupa', label: '15–19', startMin: 15 * 60, endMin: 19 * 60 },
  { id: 'seara', label: '19–22', startMin: 19 * 60, endMin: 22 * 60 },
];

/** Grila programului: atingi ferestrele în care poți să te antrenezi. Devin blocuri libere pentru generatorul de calendar. */
export function ScheduleGrid({ value, onChange }: { value: FreeBlock[]; onChange: (v: FreeBlock[]) => void }) {
  const has = (day: number, s: (typeof SLOTS)[number]) => value.some((b) => b.day === day && b.startMin === s.startMin && b.endMin === s.endMin);
  const toggle = (day: number, s: (typeof SLOTS)[number]) => {
    if (has(day, s)) onChange(value.filter((b) => !(b.day === day && b.startMin === s.startMin)));
    else onChange([...value, { day: day as FreeBlock['day'], startMin: s.startMin, endMin: s.endMin }]);
  };
  return (
    <div className="sched">
      <div className="sched-row head">
        <span />
        {DAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {SLOTS.map((s) => (
        <div key={s.id} className="sched-row">
          <span className="slot">{s.label}</span>
          {DAYS.map((_, day) => (
            <button key={day} className={has(day, s) ? 'on' : ''} onClick={() => toggle(day, s)} aria-pressed={has(day, s)} aria-label={`${DAYS[day]} ${s.label}`}>
              {has(day, s) ? Icons.check : ''}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TextBox({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return <textarea className="textbox" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />;
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress-dots" aria-label={`pasul ${step + 1} din ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < step ? 'done' : i === step ? 'cur' : ''} />
      ))}
    </div>
  );
}
