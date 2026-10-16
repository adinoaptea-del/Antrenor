import { useEffect, useState } from 'react';
import type { Sport } from '@core/types.js';
import { diffDays, weekday } from '@core/util/dates.js';
import { Avatar, Card, CircleBtn, Dot, Icons, Label, LiveTitle, MiniMap, PoolMap, Stat } from './common';
import { useMe } from '../data/store';
import { DAY_NAMES, SPORT_LABEL, TYPE_LABEL, barComponent, colorOf, fmtMinutes, longest, thisWeekDates, workoutsOn } from '../data/model';

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

const SWIM_TIP = 'Expiră complet sub apă înainte să întorci capul. Un singur lucru, până apare în date.';

export function Train({ onOpen, sport, onSport }: { onOpen: (screen: string) => void; sport: Sport; onSport: (s: Sport) => void }) {
  const me = useMe();
  const [swimMode, setSwimMode] = useState<'bazin' | 'ape'>(readSwimMode);
  useEffect(() => {
    try {
      localStorage.setItem(SWIM_KEY, swimMode);
    } catch {
      /* fără storage, starea rămâne în pagină */
    }
  }, [swimMode]);

  const weekWorkouts = thisWeekDates(me)
    .flatMap((d) => workoutsOn(me, d))
    .filter((w) => w.sport === sport);
  const next = weekWorkouts.find((w) => diffDays(me.today, w.date) >= 0 && colorOf(me, w) === 'asteptare');
  const dayName = (iso: string) => (iso === me.today ? 'azi' : DAY_NAMES[weekday(iso)]!);
  const best = longest(me, sport);
  const bestLabel = best?.distanceKm == null ? '–' : sport === 'inot' ? String(Math.round(best.distanceKm * 1000)) : best.distanceKm.toLocaleString('ro-RO');
  const target = { inot: 'din 1.900', bicicleta: 'din 90', alergare: 'din 18', forta: '' }[sport];

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
          <Avatar name={me.user.name || 'S'} onClick={() => onOpen('profil')} />
        </div>
      </header>

      <div className="seg" role="tablist" aria-label="Sport" style={{ marginBottom: 12 }}>
        {SPORTS.map((s) => (
          <button key={s.id} role="tab" aria-selected={sport === s.id} className={sport === s.id ? 'on' : ''} onClick={() => onSport(s.id)}>
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
              <button className={`pill tr ${swimMode === 'ape' ? 'on' : ''}`} onClick={() => setSwimMode(swimMode === 'ape' ? 'bazin' : 'ape')} aria-pressed={swimMode === 'ape'}>
                {swimMode === 'ape' ? Icons.gps : Icons.waves}
                {swimMode === 'ape' ? 'Ape deschise' : 'Bazin'}
              </button>
            </div>
            <div className="tiny muted" style={{ marginTop: -4 }}>
              {swimMode === 'ape' ? 'Ședințe continue, orientare la 6 brațe, ieșiri doar cu antrenorul. Vremea verifică apa și vântul.' : 'Ședințe cu seturi, pauze și tehnică. Apasă pe „Bazin” când intri în ape deschise.'}
            </div>
            <div className="grid-3">
              <Stat icon={Icons.timer} label="CSS" value={me.zones?.swim ? me.zones.swim.replace('CSS ', '') : '–'}>
                <div className="sub">{me.zones?.swim ? 's/100 m' : 'se testează la 400 m continuu'}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={bestLabel} unit="m">
                <div className="sub">{target}</div>
              </Stat>
              <Stat icon={Icons.pulse} label="În bară" value={barComponent(me, 'inot')}>
                <div className="sub">componenta înot</div>
              </Stat>
            </div>
            <Card tight>
              <Label>Indiciul tehnic curent</Label>
              <div className="small">{SWIM_TIP}</div>
            </Card>
          </>
        )}

        {sport === 'bicicleta' && (
          <>
            <OutdoorMap />
            <div className="grid-3">
              <Stat icon={Icons.pulse} label="FTP" value={me.zones?.bike?.startsWith('FTP') ? me.zones.bike.replace('FTP ', '').replace(' W', '') : '–'} unit={me.zones?.bike?.startsWith('FTP') ? 'W' : undefined}>
                <div className="sub">{me.zones?.bike ?? 'fără test: zone pe FC când există'}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={bestLabel} unit="km">
                <div className="sub">{target}</div>
              </Stat>
              <Stat icon={Icons.bike} label="În bară" value={barComponent(me, 'bicicleta')}>
                <div className="sub">componenta bicicletă</div>
              </Stat>
            </div>
          </>
        )}

        {sport === 'alergare' && (
          <>
            <OutdoorMap />
            <div className="grid-3">
              <Stat icon={Icons.heart} label="Z2" value={me.zones?.run ? me.zones.run.replace('Z2 ', '').replace(' bpm', '') : '–'} unit={me.zones?.run ? 'bpm' : undefined}>
                <div className="sub">{me.zones?.source === 'provizoriu' ? 'provizoriu, până la test' : me.zones?.run ? me.zones.source ?? '' : 'fără test de teren sau CPET'}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={bestLabel} unit="km">
                <div className="sub">{target}</div>
              </Stat>
              <Stat icon={Icons.run} label="În bară" value={barComponent(me, 'alergare')}>
                <div className="sub">componenta alergare</div>
              </Stat>
            </div>
          </>
        )}

        {sport === 'forta' && (
          <Card tight>
            <Label>Prevenție, de la fizio</Label>
            <div className="small">Cele două exerciții de prevenție apar aici după prima evaluare a fizioterapeutului (duminica).</div>
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
            <div className="muted small">{me.plan.length ? `Nimic planificat la ${SPORT_LABEL[sport].toLowerCase()} săptămâna asta.` : 'Planul apare după chestionarul de intrare.'}</div>
          ) : (
            <div className="list">
              {weekWorkouts.map((w) => {
                const struct = sport === 'inot' ? (swimMode === 'ape' ? 'continuu, orientare la 6 brațe, doar cu antrenorul' : '200 m încălzire · 400–600 m tehnică · set scurt · 100 m revenire') : (w.structure ?? (w.targetZones.length ? `Z${w.targetZones.join('–')}` : ''));
                return (
                  <div key={w.id} className="item">
                    <Dot color={colorOf(me, w)} />
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

        <button className="btn" disabled title="Trimiterea pe ceas vine după conectarea Garmin prin AthleteData sau intervals.icu">
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
      <span className="pill tr">
        {Icons.gps}
        afară
      </span>
    </div>
  );
}
