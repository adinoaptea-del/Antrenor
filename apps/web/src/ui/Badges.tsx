import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, type Badge, type BadgeCategory } from '@core/badges/badges.js';
import { Card, Icons, Label, fmtDayMonth } from './common';
import { BackHeader } from './Shell';
import { useData, useMe } from '../data/store';
import { SPORT_LABEL, fmtMinutes } from '../data/model';

// Insignele: nivelul pe culori (ca la Nike Run Club, dar pe orele din toate sporturile), insigne pe trepte (ca la
// Garmin), provocarea lunii personală (ca la Apple Fitness, dar pe sportul rămas în urmă) și zidul curselor.

const TIER = { 1: { name: 'bronz', color: '#c98a4b' }, 2: { name: 'argint', color: '#c7ccd6' }, 3: { name: 'aur', color: '#f5c542' } } as const;
const CAT_ICON: Record<BadgeCategory, JSX.Element> = {
  consecventa: Icons.calendar,
  corp: Icons.moon,
  echilibru: Icons.grid,
  repere: Icons.route,
  progres: Icons.pulse,
  drum: Icons.flag,
};
const ORDER: BadgeCategory[] = ['consecventa', 'echilibru', 'corp', 'repere', 'progres', 'drum'];

function Hex({ b, size = 64 }: { b: Badge; size?: number }) {
  const earned = !!b.earnedAt;
  const color = earned ? (b.tier ? TIER[b.tier].color : 'var(--accent-2)') : 'var(--line-2)';
  const pct = b.progress.target ? Math.min(1, b.progress.have / b.progress.target) : 0;
  return (
    <span className={`hex ${earned ? 'on' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill={earned ? `color-mix(in srgb, ${color} 22%, var(--surface))` : 'var(--surface-2)'} stroke={color} strokeWidth={earned ? 3 : 2} />
        {!earned && pct > 0 && <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill="none" stroke="var(--accent-2)" strokeWidth={3} pathLength={100} strokeDasharray={`${pct * 100} 100`} />}
      </svg>
      <span className="hex-ic" style={{ color: earned ? color : 'var(--muted-2)' }}>
        {/^inot-/.test(b.id) ? Icons.waves : /^bicicleta-|^brick/.test(b.id) ? Icons.bike : /^alergare-/.test(b.id) ? Icons.run : b.id === 'start' || b.id === 'finisher' ? Icons.trophy : CAT_ICON[b.category]}
      </span>
    </span>
  );
}

export function BadgesScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (s: string) => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const data = me.badges;
  const [open, setOpen] = useState<string | null>(null);
  // Intrarea aici = anunțurile au fost văzute.
  useEffect(() => {
    if (data?.fresh.length && !local) void submitForm('insigne-vazute', {}).catch(() => undefined);
  }, [data?.fresh.length, local, submitForm]);

  if (!data) {
    return (
      <>
        <Head onBack={onBack} onOpen={onOpen} />
        <Card>
          <div className="small muted">Insignele apar după ce pornește planul și se adună primele antrenamente.</div>
        </Card>
      </>
    );
  }
  const { level, badges, challenge, races } = data;
  const earned = badges.filter((b) => b.earnedAt).length;
  const toNext = level.next ? Math.min(1, level.hours / level.next.hours) : 1;
  const sel = badges.find((b) => b.id === open) ?? null;

  return (
    <>
      <Head onBack={onBack} onOpen={onOpen} />
      <div className="stack">
        <Card>
          <div className="lvl">
            <span className="lvl-ring" style={{ ['--lvl' as string]: level.color, ['--p' as string]: `${toNext * 360}deg` }}>
              <span>
                <b>{level.hours.toLocaleString('ro-RO')}</b>
                <small>ore</small>
              </span>
            </span>
            <div className="lvl-t">
              <div className="lvl-name">Nivelul: {level.name}</div>
              <div className="small muted">{level.next ? `Încă ${Math.max(0, Math.round((level.next.hours - level.hours) * 10) / 10).toLocaleString('ro-RO')} ore până la ${level.next.name}. Orele înregistrate de brățări, din toate sporturile, de la începutul planului${me.planStart ? ` (${fmtDayMonth(me.planStart)})` : ''}. Realizările nu sunt starea zilei.` : 'Ultimul nivel. Orele din toate sporturile, de la începutul planului.'}</div>
              <div className="small" style={{ marginTop: 6 }}>
                <b>{earned}</b> din {badges.length} insigne
              </div>
            </div>
          </div>
        </Card>

        {challenge && (
          <Card>
            <Label icon={Icons.target}>Provocarea lunii</Label>
            <div className="chal">
              <b>{challenge.title}</b>
              <div className="chal-bar">
                <i style={{ width: `${(challenge.have / Math.max(1, challenge.target)) * 100}%` }} />
              </div>
              <span className="small muted">
                {challenge.done ? 'Făcută. Bravo.' : `${challenge.have} din ${challenge.target}. E sportul rămas cel mai mult în urmă luna asta, așa că el contează acum.`}
              </span>
            </div>
          </Card>
        )}

        {ORDER.map((cat) => {
          const list = badges.filter((b) => b.category === cat);
          if (!list.length) return null;
          return (
            <Card key={cat}>
              <Label>{CATEGORY_LABEL[cat]}</Label>
              <div className="hex-grid">
                {list.map((b) => (
                  <button key={b.id} className={`hex-cell ${open === b.id ? 'sel' : ''}`} onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}>
                    <Hex b={b} />
                    <span className="hx-t">{b.title}</span>
                    <span className="hx-s">{b.earnedAt ? (b.tier ? TIER[b.tier].name : 'câștigată') : `${fmtNum(b.progress.have)}/${fmtNum(b.progress.target)}${b.progress.unit ? ` ${b.progress.unit}` : ''}`}</span>
                  </button>
                ))}
              </div>
              {sel && sel.category === cat && (
                <div className="hex-detail">
                  <b>
                    {sel.title}
                    {sel.tier ? ` · ${TIER[sel.tier].name}` : ''}
                  </b>
                  <span>{sel.how}.</span>
                  <span className="muted">{sel.earnedAt ? `Câștigată pe ${fmtDayMonth(sel.earnedAt)} ${sel.earnedAt.slice(0, 4)}.` : `Ai ${fmtNum(sel.progress.have)} din ${fmtNum(sel.progress.target)}${sel.progress.unit ? ` ${sel.progress.unit}` : ''}.`}</span>
                </div>
              )}
            </Card>
          );
        })}

        <Card>
          <Label icon={Icons.trophy}>Zidul curselor</Label>
          {races.length === 0 ? (
            <div className="small muted">Cursele apar aici când marchezi o activitate drept „cursă” în formularul de seară, și în ziua cursei tale.</div>
          ) : (
            <div className="list">
              {races.map((r) => (
                <div key={`${r.date}${r.sport}`} className="race-row">
                  <span className="race-medal">{Icons.trophy}</span>
                  <span>
                    <b>{r.name ?? SPORT_LABEL[r.sport]}</b>
                    <small>
                      {fmtDayMonth(r.date)} {r.date.slice(0, 4)} · {r.distanceKm ? `${r.distanceKm.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km · ` : ''}
                      {fmtMinutes(r.minutes)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="tiny muted" style={{ textAlign: 'center' }}>
          Toate insignele vin din ce au măsurat ceasul și planul. Niciuna nu răsplătește volumul cu orice preț.
        </div>
      </div>
    </>
  );
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('ro-RO', { maximumFractionDigits: 1 });
}

function Head({ onBack }: { onBack: () => void; onOpen: (s: string) => void }) {
  return <BackHeader title="Realizări" onBack={onBack} />;
}

/** Pe Acasă: o insignă nouă, o singură dată (până intri în Insigne). */
export function NewBadge({ onOpen }: { onOpen: (s: string) => void }) {
  const me = useMe();
  const fresh = me.badges?.fresh ?? [];
  const list = (me.badges?.badges ?? []).filter((b) => fresh.includes(b.id));
  if (!list.length) return null;
  const b = list[list.length - 1]!;
  return (
    <button className="new-badge" onClick={() => onOpen('insigne')}>
      <Hex b={b} size={48} />
      <span>
        <small>{list.length > 1 ? `${list.length} insigne noi` : 'Insignă nouă'}</small>
        <b>
          {b.title}
          {b.tier ? ` · ${TIER[b.tier].name}` : ''}
        </b>
      </span>
      {Icons.chevronRight}
    </button>
  );
}

/** În Evoluție → Obiectiv: nivelul și intrarea în Realizări. */
export function BadgesTeaser({ onOpen }: { onOpen: (s: string) => void }) {
  const me = useMe();
  const d = me.badges;
  if (!d)
    return (
      <button className="badge-teaser" onClick={() => onOpen('insigne')}>
        <span className="lvl-dot" />
        <span>
          <b>Realizări</b>
          <small>se calculează după prima sincronizare</small>
        </span>
        {Icons.chevronRight}
      </button>
    );
  const earned = d.badges.filter((b) => b.earnedAt).length;
  return (
    <button className="badge-teaser" onClick={() => onOpen('insigne')}>
      <span className="lvl-dot" style={{ background: d.level.color }} />
      <span>
        <b>Realizări · {d.level.name}</b>
        <small>
          {earned} din {d.badges.length} insigne · {d.level.hours.toLocaleString('ro-RO')} ore {me.planStart && me.planStart > me.today ? '(se numără de la startul planului)' : 'de la startul planului'}
        </small>
      </span>
      {Icons.chevronRight}
    </button>
  );
}
