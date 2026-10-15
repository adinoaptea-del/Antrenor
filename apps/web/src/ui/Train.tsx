import { useEffect, useState } from 'react';
import type { Sport } from '@core/types.js';
import { Avatar, Card, CircleBtn, Dot, Icons, Label, LiveTitle, MiniMap, PoolMap, Stat, fmtMinutes } from './common';
import { ATHLETE, SPORT_LABEL, TODAY, TYPE_LABEL, activities, bar, colorOf, swimTip, thisWeekDates, weather, workoutsOn, zones } from '../data/demo';
import { diffDays } from '@core/util/dates.js';

const SPORTS: { id: Sport; icon: keyof typeof Icons }[] = [
  { id: 'inot', icon: 'waves' },
  { id: 'bicicleta', icon: 'bike' },
  { id: 'alergare', icon: 'run' },
  { id: 'forta', icon: 'dumbbell' },
];
const SWIM_KEY = 'antrenor.inot.mediu';

function readSwimMode(): 'bazin' | 'ape' {
  try {
    return localStorage.getItem(SWIM_KEY) === 'ape' ? 'ape' : 'bazin';
  } catch {
    return 'bazin';
  }
}

export function Train({ onOpen }: { onOpen: (screen: string) => void }) {
  const [sport, setSport] = useState<Sport>('inot');
  const [swimMode, setSwimMode] = useState<'bazin' | 'ape'>(readSwimMode);

  useEffect(() => {
    try {
      localStorage.setItem(SWIM_KEY, swimMode);
    } catch {
      /* fără storage, starea rămâne în pagină */
    }
  }, [swimMode]);

  const weekWorkouts = thisWeekDates()
    .flatMap((d) => workoutsOn(d))
    .filter((w) => w.sport === sport);
  const next = weekWorkouts.find((w) => diffDays(TODAY, w.date) >= 0 && colorOf(w) === 'asteptare');

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.calendar} label="Calendar" onClick={() => onOpen('calendar')} />
        </div>
        <div className="top-c">
          <LiveTitle>{SPORT_LABEL[sport]}</LiveTitle>
        </div>
        <div className="top-r">
          <Avatar name={ATHLETE.name} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <div className="seg" role="tablist" aria-label="Sport" style={{ marginBottom: 12 }}>
        {SPORTS.map((s) => (
          <button key={s.id} role="tab" aria-selected={sport === s.id} className={sport === s.id ? 'on' : ''} onClick={() => setSport(s.id)}>
            {Icons[s.icon]}
            <span>{SPORT_LABEL[s.id]}</span>
          </button>
        ))}
      </div>

      <div className="stack">
        {sport === 'inot' && (
          <>
            <div className="map-wrap">
              <PoolMap open={swimMode === 'ape'} />
              <span className="pill tl">
                {Icons.thermo}
                <b>{weather.tempC} °C</b>
                <small>vânt {weather.windKmh} km/h</small>
              </span>
              <button className={`pill tr ${swimMode === 'ape' ? 'on' : ''}`} onClick={() => setSwimMode(swimMode === 'ape' ? 'bazin' : 'ape')} aria-pressed={swimMode === 'ape'}>
                {swimMode === 'ape' ? Icons.gps : Icons.waves}
                {swimMode === 'ape' ? 'Ape deschise' : 'Bazin'}
              </button>
            </div>
            <div className="tiny muted" style={{ marginTop: -4 }}>
              {swimMode === 'ape'
                ? 'Ședințe continue, orientare la 6 brațe, ieșiri doar cu antrenorul. Vremea verifică apa și vântul.'
                : 'Ședințe cu seturi, pauze și tehnică. Apasă pe „Bazin” când intri în ape deschise.'}
            </div>

            <div className="grid-3">
              <Stat icon={Icons.timer} label="CSS" value={zones.swim.css == null ? '–' : `${zones.swim.css}s`}>
                <div className="sub">se testează la 400 m continuu</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={longest('inot')} unit="m">
                <div className="sub">din 1.900</div>
              </Stat>
              <Stat icon={Icons.pulse} label="În bară" value={barValue('inot')}>
                <div className="sub">componenta înot</div>
              </Stat>
            </div>

            <Card tight>
              <Label>Indiciul tehnic curent</Label>
              <div className="small">{swimTip}</div>
            </Card>
          </>
        )}

        {sport === 'bicicleta' && (
          <>
            <OutdoorMap />
            <div className="grid-3">
              <Stat icon={Icons.pulse} label="FTP" value={zones.bike.ftp ?? '–'}>
                <div className="sub">fără senzor: zone pe FC</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={longest('bicicleta')} unit="km">
                <div className="sub">din 90</div>
              </Stat>
              <Stat icon={Icons.bike} label="În bară" value={barValue('bicicleta')}>
                <div className="sub">componenta bicicletă</div>
              </Stat>
            </div>
          </>
        )}

        {sport === 'alergare' && (
          <>
            <OutdoorMap />
            <div className="grid-3">
              <Stat icon={Icons.heart} label="Z2" value={zones.run.z2.split('–')[0]} unit={`–${zones.run.z2.split('–')[1]}`}>
                <div className="sub">{zones.run.label}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={longest('alergare')} unit="km">
                <div className="sub">din 18</div>
              </Stat>
              <Stat icon={Icons.run} label="În bară" value={barValue('alergare')}>
                <div className="sub">componenta alergare</div>
              </Stat>
            </div>
            <Card tight>
              <Label>Prag</Label>
              <div className="small">{zones.run.threshold} · provizoriu, din cursele din 2026</div>
            </Card>
          </>
        )}

        {sport === 'forta' && (
          <Card tight>
            <Label>Prevenție, de la fizio</Label>
            <div className="small">Ridicări pe vârfuri pe un picior, 3 × 15. Pod pe un picior, 3 × 12.</div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              Două exerciții, la fiecare ședință de forță, până le schimbă fizio-ul duminica.
            </div>
          </Card>
        )}

        {next && (
          <div className="display">
            <div className="num">{fmtMinutes(next.plannedMinutes)}</div>
            <div className="lb">
              următoarea ședință · {dayName(next.date)}
              {next.type === 'forta' ? '' : ` · ${TYPE_LABEL[next.type]}`}
              {next.key ? ' · cheie' : ''}
            </div>
          </div>
        )}

        <Card>
          <Label>Ședințele săptămânii</Label>
          {weekWorkouts.length === 0 ? (
            <div className="muted small">Nimic planificat la {SPORT_LABEL[sport].toLowerCase()} săptămâna asta.</div>
          ) : (
            <div className="list">
              {weekWorkouts.map((w) => {
                const color = colorOf(w);
                const struct =
                  sport === 'inot'
                    ? swimMode === 'ape'
                      ? 'continuu, orientare la 6 brațe, doar cu antrenorul'
                      : '200 m încălzire · 400–600 m tehnică · set scurt · 100 m revenire'
                    : w.structure ?? (w.targetZones.length ? `Z${w.targetZones.join('–')}` : '');
                return (
                  <div key={w.id} className="item">
                    <Dot color={color} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t">
                        {dayName(w.date)}
                        {w.type === 'forta' ? '' : ` · ${TYPE_LABEL[w.type]}`}
                        {w.key ? ' · cheie' : ''}
                      </div>
                      <div className="s">{struct}</div>
                    </div>
                    <div className="m">{fmtMinutes(w.plannedMinutes)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <button className="btn" disabled={!next}>
          Trimite pe ceas {Icons.arrowRight}
        </button>
      </div>
    </>
  );
}

function OutdoorMap() {
  return (
    <div className="map-wrap">
      <MiniMap height={130} />
      <span className="pill tl">
        {Icons.sun}
        <b>{weather.tempC} °C</b>
        <small>umiditate {weather.humidity}%</small>
      </span>
      <span className="pill tr">
        {Icons.gps}
        afară
      </span>
    </div>
  );
}

function dayName(iso: string): string {
  const names = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const n = names[(d + 6) % 7]!;
  return iso === TODAY ? `azi` : n;
}

function longest(sport: Sport): string {
  const best = activities.filter((a) => a.sport === sport).sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0];
  if (!best || best.distanceKm == null) return '–';
  return sport === 'inot' ? String(Math.round(best.distanceKm * 1000)) : best.distanceKm.toLocaleString('ro-RO');
}

function barValue(name: 'inot' | 'bicicleta' | 'alergare'): string {
  const c = bar.components.find((x) => x.name === name);
  return c?.value == null ? '–' : `${Math.round(c.value)}%`;
}
