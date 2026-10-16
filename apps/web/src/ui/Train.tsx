import { useEffect, useState } from 'react';
import type { Sport } from '@core/types.js';
import { diffDays, weekday } from '@core/util/dates.js';
import { Avatar, Card, CircleBtn, Dot, Icons, Label, LiveTitle, Stat } from './common';
import { useMe } from '../data/store';
import { SessionDetails } from './SessionDetails';
import { DAY_NAMES, SPORT_LABEL, TYPE_LABEL, colorOf, fmtMinutes, longest, thisWeekDates, workoutsOn } from '../data/model';

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
  const swimBest = me.sportReady?.find((r) => r.sport === 'inot')?.best ?? null;
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
        {sport !== 'forta' && <ReadyCard sport={sport} />}
        <TotalsCard sport={sport} />
        <SessionDetails key={sport} sport={sport} />
        {sport === 'inot' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className={`pill ${swimMode === 'ape' ? 'on' : ''}`} onClick={() => setSwimMode(swimMode === 'ape' ? 'bazin' : 'ape')} aria-pressed={swimMode === 'ape'}>
                {swimMode === 'ape' ? Icons.gps : Icons.waves}
                {swimMode === 'ape' ? 'Ape deschise' : 'Bazin'}
              </button>
            </div>
            <div className="tiny muted" style={{ marginTop: -4 }}>
              {swimMode === 'ape' ? 'Ședințe continue, orientare la 6 brațe, ieșiri doar cu antrenorul. Vremea verifică apa și vântul.' : 'Ședințe cu seturi, pauze și tehnică. Apasă pe „Bazin” când intri în ape deschise.'}
            </div>
            <div className="grid-2">
              <Stat icon={Icons.timer} label="CSS" value={me.zones?.swim ? me.zones.swim.replace('CSS ', '') : '–'}>
                <div className="sub">{me.zones?.swim ? 's/100 m' : 'se testează la 400 m continuu'}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={bestLabel} unit="m">
                <div className="sub">{target}</div>
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
            <div className="grid-2">
              <Stat icon={Icons.pulse} label="FTP" value={me.zones?.bike?.startsWith('FTP') ? me.zones.bike.replace('FTP ', '').replace(' W', '') : '–'} unit={me.zones?.bike?.startsWith('FTP') ? 'W' : undefined}>
                <div className="sub">{me.zones?.bike ?? 'fără test: zone pe FC când există'}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={bestLabel} unit="km">
                <div className="sub">{target}</div>
              </Stat>
            </div>
          </>
        )}

        {sport === 'alergare' && (
          <>
            <div className="grid-2">
              <Stat icon={Icons.heart} label="Z2" value={me.zones?.run ? me.zones.run.replace('Z2 ', '').replace(' bpm', '') : '–'} unit={me.zones?.run ? 'bpm' : undefined}>
                <div className="sub">{me.zones?.source === 'provizoriu' ? 'provizoriu, până la test' : me.zones?.run ? me.zones.source ?? '' : 'fără test de teren sau CPET'}</div>
              </Stat>
              <Stat icon={Icons.route} label="Record" value={bestLabel} unit="km">
                <div className="sub">{target}</div>
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
                const struct = sport === 'inot' ? swimStructure(w.type, w.structure ?? null, swimBest, swimMode) : (w.structure ?? (w.targetZones.length ? `Z${w.targetZones.join('–')}` : ''));
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

      </div>
    </>
  );
}

/** Cumulul pe sport de la începutul pregătirii: doar ce au înregistrat brățările, fără estimări. */
function TotalsCard({ sport }: { sport: Sport }) {
  const me = useMe();
  const t = me.totals?.bySport[sport];
  const since = me.totals?.since;
  const fmtSince = since ? `${Number(since.slice(8, 10))} ${['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'][Number(since.slice(5, 7)) - 1]}` : null;
  const km = t ? (sport === 'inot' ? `${Math.round(t.km * 1000).toLocaleString('ro-RO')}` : t.km.toLocaleString('ro-RO')) : '–';
  return (
    <Card tight>
      <Label>{fmtSince ? `Total de la ${fmtSince}` : 'Total'}</Label>
      {t && t.sedinte > 0 ? (
        <div className="grid-3">
          {sport !== 'forta' && (
            <div>
              <span className="num md">{km}</span>
              <span className="unit">{sport === 'inot' ? 'm' : 'km'}</span>
            </div>
          )}
          <div>
            <span className="num md">{t.ore.toLocaleString('ro-RO')}</span>
            <span className="unit">ore</span>
          </div>
          <div>
            <span className="num md">{t.sedinte}</span>
            <span className="unit">ședințe</span>
          </div>
        </div>
      ) : (
        <div className="small muted">{me.totals ? 'fără ședințe înregistrate încă; se adună din brățări' : 'fără date: planul începe după chestionar'}</div>
      )}
    </Card>
  );
}

/** Cât din proba ta de concurs ai demonstrat la sportul ăsta, cu piesele calculului la vedere. */
function ReadyCard({ sport }: { sport: Sport }) {
  const me = useMe();
  const r = me.sportReady?.find((x) => x.sport === sport);
  if (!r) return null;
  const lvl = r.value == null ? null : r.value >= 70 ? 'verde' : r.value >= 50 ? 'galben' : r.value >= 30 ? 'portocaliu' : 'rosu';
  return (
    <Card tight>
      <Label>Pregătit pentru proba de cursă</Label>
      <div className="ready-head">
        <span className={`num ready-num lvl-txt-${lvl ?? ''}`}>{r.value == null ? '–' : r.value}</span>
        {r.value != null && <span className="unit">%</span>}
        <span className="ready-leg">din {r.leg}</span>
      </div>
      <div className="ready-bar">
        <i className={`lvl-bg-${lvl ?? ''}`} style={{ width: `${r.value ?? 0}%` }} />
      </div>
      {r.value == null ? (
        <div className="small muted" style={{ marginTop: 10 }}>Apare după prima ședință cu distanță înregistrată de brățări în ultimele 6 săptămâni.</div>
      ) : (
        <div className="ready-parts">
          {r.parts.map((p) => (
            <div key={p.label} className="ready-part">
              <div className="rp-top">
                <span className="rp-l">{p.label} <small className="rp-w">{Math.round(p.weight * 100)}%{p.source === 'declarat' ? ' · declarat' : ''}</small></span>
                <span className="rp-v">
                  <b>{p.have}</b> din {p.target}
                </span>
              </div>
              <div className="rp-bar">
                <i style={{ width: `${p.pct}%` }} />
              </div>
            </div>
          ))}
          <div className="tiny muted">
            Rezistență 60% (poți acoperi distanța probei?), volum 25% (media pe săptămână față de 1,5 × distanța probei), specific 15% (condițiile cursei). Din ultimele 6 săptămâni, doar ce au măsurat brățările; „declarat” = din chestionar, până apare o măsurătoare. Nu e o predicție de timp.
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Structura ședinței de înot pornește de la ce ai demonstrat fără oprire, nu de la un set generic.
 * Sub 400 m continuu: seturi de lungimea pe care o ții acum, pauză până respiri liniștit, și ținta de a lega încă o lungime de bazin.
 */
function swimStructure(type: string, planned: string | null, bestM: number | null, mode: 'bazin' | 'ape'): string {
  if (mode === 'ape') return 'doar însoțit; continuu, orientare la 6 brațe';
  if (type !== 'tehnica' || bestM == null || bestM >= 400) return planned ?? '';
  const set = Math.max(25, Math.floor(bestM / 25) * 25);
  return `seturi de ${set} m fără oprire (cât ai demonstrat), pauză până respiri liniștit; încearcă să legi ${set + 25} m`;
}
