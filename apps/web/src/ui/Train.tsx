import { useEffect, useState } from 'react';
import type { Sport } from '@core/types.js';
import { Card, Dot, fmtMinutes } from './common';
import { SPORT_LABEL, TODAY, TYPE_LABEL, activities, bar, colorOf, swimTip, thisWeekDates, workoutsOn, zones } from '../data/demo';

const SPORTS: Sport[] = ['inot', 'bicicleta', 'alergare', 'forta'];
const SWIM_KEY = 'antrenor.inot.mediu';

function readSwimMode(): 'bazin' | 'ape' {
  try {
    return localStorage.getItem(SWIM_KEY) === 'ape' ? 'ape' : 'bazin';
  } catch {
    return 'bazin';
  }
}

export function Train() {
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

  return (
    <>
      <h2 className="screen-title">
        Antrenament
        <small>Săptămâna din {Number(thisWeekDates()[0]!.slice(8))} {['', 'ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'][Number(thisWeekDates()[0]!.slice(5, 7))]}</small>
      </h2>
      <div className="seg" role="tablist" aria-label="Sport" style={{ marginBottom: 12 }}>
        {SPORTS.map((s) => (
          <button key={s} role="tab" aria-selected={sport === s} className={sport === s ? 'on' : ''} onClick={() => setSport(s)}>
            {SPORT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="stack">
        {sport === 'inot' && (
          <>
            <Card>
              <button className={`switch ${swimMode === 'ape' ? 'on' : ''}`} onClick={() => setSwimMode(swimMode === 'ape' ? 'bazin' : 'ape')} aria-pressed={swimMode === 'ape'}>
                <span className="knob" aria-hidden="true" />
                <span>
                  <span className="title">{swimMode === 'ape' ? 'Ape deschise' : 'Bazin'}</span>
                  <span className="small muted" style={{ display: 'block' }}>
                    {swimMode === 'ape'
                      ? 'Ședințe continue, orientare, ieșiri cu antrenorul. Vremea verifică apa și vântul.'
                      : 'Ședințe cu seturi, pauze și tehnică. Comută când intri în ape deschise.'}
                  </span>
                </span>
              </button>
            </Card>

            <div className="grid-2">
              <Card tight>
                <div className="label">CSS</div>
                <div className="num md">{zones.swim.css == null ? '–' : `${zones.swim.css}s`}</div>
                <div className="small muted">se testează când înoți 400 m continuu</div>
              </Card>
              <Card tight>
                <div className="label">Cel mai lung înot</div>
                <div>
                  <span className="num md">{longestKm('inot')}</span>
                  <span className="unit">m din 1.900</span>
                </div>
                <div className="small muted">componenta barei: {barValue('inot')}</div>
              </Card>
            </div>

            <Card tight>
              <div className="label">Indiciul tehnic curent</div>
              <div>{swimTip}</div>
            </Card>
          </>
        )}

        {sport === 'bicicleta' && (
          <div className="grid-2">
            <Card tight>
              <div className="label">FTP</div>
              <div className="num md">{zones.bike.ftp ?? '–'}</div>
              <div className="small muted">fără senzor de putere: zone pe FC de bicicletă</div>
            </Card>
            <Card tight>
              <div className="label">Cea mai lungă tură</div>
              <div>
                <span className="num md">{longestKm('bicicleta')}</span>
                <span className="unit">km din 90</span>
              </div>
              <div className="small muted">componenta barei: {barValue('bicicleta')}</div>
            </Card>
          </div>
        )}

        {sport === 'alergare' && (
          <div className="grid-2">
            <Card tight>
              <div className="label">Z2 · prag</div>
              <div className="num md">{zones.run.z2}</div>
              <div className="small muted">
                {zones.run.threshold} · {zones.run.label}
              </div>
            </Card>
            <Card tight>
              <div className="label">Cea mai lungă alergare</div>
              <div>
                <span className="num md">{longestKm('alergare')}</span>
                <span className="unit">km din 18</span>
              </div>
              <div className="small muted">componenta barei: {barValue('alergare')}</div>
            </Card>
          </div>
        )}

        {sport === 'forta' && (
          <Card tight>
            <div className="label">Prevenție, de la fizio</div>
            <div>Ridicări pe vârfuri pe un picior, 3 × 15. Pod pe un picior, 3 × 12.</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Două exerciții, la fiecare ședință de forță, până le schimbă fizio-ul duminica.
            </div>
          </Card>
        )}

        <Card>
          <div className="label">Ședințele săptămânii</div>
          {weekWorkouts.length === 0 ? (
            <div className="muted">Nimic planificat la {SPORT_LABEL[sport].toLowerCase()} săptămâna asta.</div>
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
      </div>
    </>
  );
}

function dayName(iso: string): string {
  const names = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const n = names[(d + 6) % 7]!;
  return iso === TODAY ? `azi` : n;
}

function longestKm(sport: Sport): string {
  const best = activities.filter((a) => a.sport === sport).sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0];
  if (!best || best.distanceKm == null) return '–';
  return sport === 'inot' ? String(Math.round(best.distanceKm * 1000)) : String(best.distanceKm);
}

function barValue(name: 'inot' | 'bicicleta' | 'alergare'): string {
  const c = bar.components.find((x) => x.name === name);
  return c?.value == null ? 'fără date' : `${Math.round(c.value)}%`;
}
