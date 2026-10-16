import { useEffect, useState } from 'react';
import type { Sport } from '@core/types.js';
import { diffDays, weekday } from '@core/util/dates.js';
import { Avatar, Card, CircleBtn, Dot, Icons, Label, LiveTitle, Stat } from './common';
import { useMe } from '../data/store';
import { DOSE_TEXT, PPL, PPL_RULES, dayFromStructure, dosed, doseFor, rotation, type PSet, type PplDay, type Dose } from '@core/strength/ppl.js';
import type { Me } from '@core/api-types.js';
import type { PlannedWorkout } from '@core/types.js';
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
        {sport === 'forta' && <StrengthCard />}
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
                const struct = sport === 'inot' ? swimStructure(w.type, w.structure ?? null, swimBest, swimMode) : sport === 'forta' ? (strengthFor(me, w)?.day.name ?? '') : (w.structure ?? (w.targetZones.length ? `Z${w.targetZones.join('–')}` : ''));
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

/**
 * Ziua din programul Push / Pull / Legs pentru o ședință de forță: din plan („Push 1 · …”);
 * la planurile făcute înainte de program, din ordinea ședințelor de forță în calendar.
 */
function strengthFor(me: Me, w: PlannedWorkout): { day: PplDay; dose: Dose } | null {
  const dose = doseFor(me.phase ?? 'baza1');
  const fromPlan = dayFromStructure(w.structure);
  if (fromPlan) return { day: dosed(fromPlan, dose), dose };
  const all = me.plan.filter((x) => x.type === 'forta' && x.status !== 'sters').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const idx = all.findIndex((x) => x.id === w.id);
  if (idx < 0) return null;
  const rot = rotation(2);
  const day = PPL.find((d) => d.id === rot[idx % rot.length])!;
  return { day: dosed(day, dose), dose };
}

const SET_LABEL: Record<PSet['kind'], string> = { heavy: 'greu', lowered: 'redus', restpause: 'rest-pause', fix: '', max: '' };

/** Ședința de forță: următoarea din calendar, cu exercițiile programului și doza fazei. */
function StrengthCard() {
  const me = useMe();
  const [showRules, setShowRules] = useState(false);
  const upcoming = me.plan.filter((x) => x.type === 'forta' && x.status !== 'sters' && x.date >= me.today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const [idx, setIdx] = useState(0);
  const w = upcoming[idx] ?? null;
  const info = w ? strengthFor(me, w) : null;
  if (!w || !info) {
    return (
      <Card tight>
        <Label>Programul de forță</Label>
        <div className="small muted">Ședințele de forță apar aici după ce ai planul (chestionarul de intrare).</div>
      </Card>
    );
  }
  const dayLabel = w.date === me.today ? 'azi' : `${DAY_NAMES[weekday(w.date)]} ${Number(w.date.slice(8, 10))}`;
  return (
    <Card tight>
      <Label>Programul de forță · Push / Pull / Legs</Label>
      <div className="det-pills" role="tablist" aria-label="Ședința de forță">
        {upcoming.slice(0, 6).map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === idx} className={`det-pill ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)}>
            <b>{x.date === me.today ? 'azi' : `${DAY_NAMES[weekday(x.date)]} ${Number(x.date.slice(8, 10))}`}</b>
            <small>{strengthFor(me, x)?.day.name ?? ''}</small>
          </button>
        ))}
      </div>
      <div className="str-head">
        <span className="num md">{info.day.name}</span>
        <span className="small muted">{dayLabel} · {w.plannedMinutes} min</span>
      </div>
      <div className="tiny muted" style={{ marginBottom: 10 }}>Doza fazei: {DOSE_TEXT[info.dose]}.</div>
      <div className="str-list">
        {info.day.exercises.map((e, i) => (
          <div key={i} className="str-row">
            <div className="str-ex">
              <b>{e.name}</b>
              <span>{e.group}{e.note ? ` · ${e.note}` : ''}</span>
            </div>
            <div className="str-sets">
              {e.sets.map((st, k) => (
                <span key={k} className={`str-set k-${st.kind}`}>
                  {st.reps}
                  {SET_LABEL[st.kind] && <small>{SET_LABEL[st.kind]}</small>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="pill" style={{ marginTop: 12 }} onClick={() => setShowRules(!showRules)} aria-expanded={showRules}>
        {showRules ? 'Ascunde indicațiile' : 'Indicații: intensitate, pauze, progresie'}
      </button>
      {showRules && (
        <div className="str-rules">
          {PPL_RULES.map((r) => (
            <div key={r.t}>
              <b>{r.t}.</b> {r.d}
            </div>
          ))}
          <div className="tiny muted">Dacă ai mai puțin timp decât e planificat, fă exercițiile în ordine și oprește-te unde se termină timpul; nu le grăbi pauzele.</div>
        </div>
      )}
    </Card>
  );
}
