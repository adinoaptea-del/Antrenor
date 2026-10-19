import { useEffect, useState } from 'react';
import type { Sport } from '@core/types.js';
import { addDays, diffDays, weekday } from '@core/util/dates.js';
import { goalSports } from '@core/calendar/phases.js';
import { Card, Dot, Icons, Label, fmtDayMonth } from './common';
import { SubTabs } from './Shell';
import { useData, useMe } from '../data/store';
import { BLOCK_GOAL, BLOCK_LABEL, FITNESS_BLOCK_GOAL, STRENGTH_RULES, isFitnessSession, prescribe, type Prescription } from '@core/strength/ppl.js';
import { FITNESS_RULES, FITNESS_WEEK_ACTION, fitnessCardio, fitnessProfile, fitnessWeeks, type FitnessIntake } from '@core/strength/fitness.js';
import { FITNESS_WEEKS, goalKind } from '@core/calendar/phases.js';
import { strengthSpecFor } from '@core/strength/plan-specs.js';
import type { Me, SportTotal } from '@core/api-types.js';
import type { PlannedWorkout } from '@core/types.js';
import { SessionDetails } from './SessionDetails';
import { useWorkoutSheet } from './WorkoutSheet';
import { DAY_NAMES, SPORT_LABEL, TYPE_LABEL, colorOf, fmtMinutes, thisWeekDates, workoutsOn } from '../data/model';

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

/**
 * Plan → Sporturi: alegi sportul; apoi, în ordinea utilității: următoarea ședință, rezumatul probei, activitățile,
 * detaliile tehnice la cerere. Înotul are selectorul Bazin | Ape libere sus, explicit.
 */
export function Train({ onOpen, sport: sportProp, onSport }: { onOpen: (screen: string) => void; sport: Sport; onSport: (s: Sport) => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  // Un singur sport în obiectiv: doar sportul acela (și forța); celelalte nu există pentru sportivul ăsta.
  const allowed = goalSports(me.user.goal);
  const sport: Sport = allowed.includes(sportProp) ? sportProp : (allowed[0] ?? 'alergare');
  const sportTabs = SPORTS.filter((s) => allowed.includes(s.id));
  const [swimMode, setSwimMode] = useState<'bazin' | 'ape'>(() => me.prefs?.mediuInot ?? readSwimMode());
  const [swimNote, setSwimNote] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(SWIM_KEY, swimMode);
    } catch {
      /* fără storage, starea rămâne în pagină */
    }
  }, [swimMode]);
  const changeSwim = async (m: 'bazin' | 'ape') => {
    if (m === swimMode) return;
    setSwimMode(m);
    setSwimNote(null);
    if (local) return;
    try {
      await submitForm('inot-mediu', { mediu: m });
      setSwimNote(m === 'ape' ? 'Salvat: ședințele viitoare de înot se afișează pentru ape libere (continuu, orientare, însoțit). Istoricul nu se schimbă.' : 'Salvat: ședințele viitoare de înot se afișează pentru bazin (seturi, pauze, tehnică).');
    } catch (e) {
      setSwimNote(e instanceof Error ? e.message : String(e));
    }
  };

  const weekWorkouts = thisWeekDates(me)
    .flatMap((d) => workoutsOn(me, d))
    .filter((w) => w.sport === sport);
  const next = me.plan
    .filter((w) => w.sport === sport && (w.status === 'planificat' || w.status === 'mutat') && diffDays(me.today, w.date) >= 0 && colorOf(me, w) === 'asteptare')
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const dayName = (iso: string) => (iso === me.today ? 'azi' : iso === addDays(me.today, 1) ? 'mâine' : `${DAY_NAMES[weekday(iso)]!}, ${Number(iso.slice(8, 10))}`);
  const swimBest = me.sportReady?.find((r) => r.sport === 'inot')?.best ?? null;
  const hasActs = me.activities.some((a) => a.sport === sport);
  const { open: openSheet, sheet } = useWorkoutSheet();

  return (
    <>
      {sportTabs.length > 1 && (
      <div className="seg sport-seg" role="tablist" aria-label="Sport" style={{ marginBottom: 12 }}>
        {sportTabs.map((s) => (
          <button key={s.id} role="tab" aria-selected={sport === s.id} className={sport === s.id ? 'on' : ''} onClick={() => onSport(s.id)}>
            {Icons[s.icon]}
            <span>{SPORT_LABEL[s.id]}</span>
          </button>
        ))}
      </div>
      )}

      {sheet}
      <div className="stack">
        {goalKind(me.user.goal) === 'fitness' && <FitnessWeekCard />}
        {sport === 'inot' && (
          <>
            <SubTabs label="Unde înoți" value={swimMode} onChange={(v) => void changeSwim(v)} items={[{ id: 'bazin', label: 'Bazin' }, { id: 'ape', label: 'Ape libere' }]} />
            <p className="tiny muted" style={{ marginTop: -6 }}>
              {swimNote ?? (swimMode === 'ape' ? 'Ape libere: ședințe continue, orientare la 6 brațe, ieșiri doar însoțit. Vremea verifică apa și vântul.' : 'Bazin (implicit): ședințe cu seturi, pauze și tehnică. Schimbi aici când treci în ape libere; alegerea se salvează.')}
            </p>
          </>
        )}

        {next ? (
          <button className="row-card" onClick={() => openSheet(next)}>
            <span>
              <small className="eyebrow">Urmează · {dayName(next.date)}</small>
              <b>
                {next.type === 'forta' ? `${strengthFor(me, next)?.session.name ?? SPORT_LABEL[sport]}` : SPORT_LABEL[sport]} · {fmtMinutes(next.plannedMinutes)}
                {next.type === 'forta' ? '' : ` · ${TYPE_LABEL[next.type]}`}
                {next.key ? ' · cheie' : ''}
              </b>
              {sport !== 'forta' && <small>{sport === 'inot' ? swimStructure(next.type, next.structure ?? null, swimBest, swimMode) : (next.structure ?? (next.type === 'z2' ? 'ușor, conversațional' : next.type === 'lung' ? 'ușor, lung' : next.targetZones.length ? `Z${next.targetZones.join('–')}` : ''))}</small>}
            </span>
            {Icons.chevronRight}
          </button>
        ) : (
          <section className="card tight">
            <p className="small muted">{me.plan.length ? `Nimic planificat la ${SPORT_LABEL[sport].toLowerCase()} în perioada următoare.` : 'Planul apare după chestionarul de intrare.'}</p>
          </section>
        )}

        {sport !== 'forta' && <ReadyCard sport={sport} />}
        {sport === 'forta' && <StrengthCard />}

        {!hasActs && sport !== 'forta' ? (
          <section className="card">
            <h3 className="h-md">Fără date la {SPORT_LABEL[sport].toLowerCase()}</h3>
            <p className="small muted">Nicio activitate înregistrată de brățări la sportul ăsta. Când apare prima, aici vezi activitățile, reperele și detaliile tehnice.</p>
            <div className="wk-btns" style={{ marginTop: 10 }}>
              <button className="pill" onClick={() => onOpen('profil')}>
                Conectează o brățară
              </button>
            </div>
          </section>
        ) : (
          <>
            <TotalsCard sport={sport} />
            <SessionDetails key={sport} sport={sport} />
          </>
        )}

        <section className="card tight">
          <button className="exp-row" onClick={() => setShowTech(!showTech)} aria-expanded={showTech}>
            <span>
              <b>Detalii tehnice</b>
              <small>{sport === 'inot' ? 'CSS, indiciul tehnic' : sport === 'bicicleta' ? 'FTP, zonele' : sport === 'alergare' ? 'zonele de puls' : 'ședințele săptămânii'}</small>
            </span>
            {showTech ? Icons.chevronDown : Icons.chevronRight}
          </button>
          {showTech && (
            <div className="exp-body">
              {sport === 'inot' && (
                <>
                  <div className="kv">
                    <span>CSS (ritm critic de înot)</span>
                    <b>{me.zones?.swim ? `${me.zones.swim.replace('CSS ', '')}` : 'netestat'}</b>
                  </div>
                  <p className="tiny muted">CSS = ritmul pe 100 m pe care îl poți ține mult; se măsoară dintr-un test de 400 m și unul de 200 m, nu din antrenamente. Zonele de înot pornesc de la el.</p>
                  <p className="small" style={{ marginTop: 8 }}>
                    <b>Indiciul tehnic:</b> {SWIM_TIP}
                  </p>
                </>
              )}
              {sport === 'bicicleta' && (
                <>
                  <div className="kv">
                    <span>FTP (puterea pe o oră)</span>
                    <b>{me.zones?.bike?.startsWith('FTP') ? me.zones.bike.replace('FTP ', '') : 'netestat'}</b>
                  </div>
                  <p className="tiny muted">{me.zones?.bike ?? 'Fără test: zonele merg pe puls când există.'}</p>
                </>
              )}
              {sport === 'alergare' && (
                <>
                  <div className="kv">
                    <span>Z2 (ușor, poți vorbi)</span>
                    <b>{me.zones?.run ? me.zones.run.replace('Z2 ', '') : 'netestat'}</b>
                  </div>
                  <p className="tiny muted">{me.zones?.source === 'provizoriu' ? 'Zone provizorii, până la un test de teren sau CPET.' : me.zones?.run ? `Sursa: ${me.zones.source ?? 'test'}.` : 'Fără test de teren sau CPET: zonele rămân pe senzația de efort.'}</p>
                </>
              )}
              <div className="pref-k" style={{ marginTop: 10 }}>Ședințele săptămânii</div>
              {weekWorkouts.length === 0 ? (
                <p className="small muted">{me.plan.length ? `Nimic planificat la ${SPORT_LABEL[sport].toLowerCase()} săptămâna asta.` : 'Planul apare după chestionarul de intrare.'}</p>
              ) : (
                <div className="list">
                  {weekWorkouts.map((w) => {
                    const struct = sport === 'inot' ? swimStructure(w.type, w.structure ?? null, swimBest, swimMode) : sport === 'forta' ? (() => { const p = strengthFor(me, w); return p ? `${p.session.name} · ${BLOCK_LABEL[p.spec.block].toLowerCase()}` : ''; })() : (w.structure ?? (w.targetZones.length ? `Z${w.targetZones.join('–')}` : ''));
                    return (
                      <div key={w.id} className="item" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => openSheet(w)} onKeyDown={(e) => e.key === 'Enter' && openSheet(w)}>
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
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Cumulul pe sport: de la începutul planului (sau „planul începe pe…”), și separat istoricul dinainte. Doar ce au înregistrat brățările. */
function TotalsCard({ sport }: { sport: Sport }) {
  const me = useMe();
  const t = me.totals?.bySport[sport];
  const since = me.totals?.since ?? null;
  const before = me.totals?.before?.[sport];
  const started = !!since && since <= me.today;
  const fmtKm = (x: SportTotal) => (sport === 'inot' ? `${Math.round(x.km * 1000).toLocaleString('ro-RO')} m` : `${x.km.toLocaleString('ro-RO')} km`);
  const Nums = ({ x }: { x: SportTotal }) => (
    <div className="grid-3">
      {sport !== 'forta' && (
        <div>
          <span className="num md">{sport === 'inot' ? Math.round(x.km * 1000).toLocaleString('ro-RO') : x.km.toLocaleString('ro-RO')}</span>
          <span className="unit">{sport === 'inot' ? 'm' : 'km'}</span>
        </div>
      )}
      <div>
        <span className="num md">{x.ore.toLocaleString('ro-RO')}</span>
        <span className="unit">ore</span>
      </div>
      <div>
        <span className="num md">{x.sedinte}</span>
        <span className="unit">ședințe</span>
      </div>
    </div>
  );
  if (!me.totals || !since) {
    return (
      <Card tight>
        <Label>Total</Label>
        <div className="small muted">Fără plan încă: totalurile pornesc după chestionar.</div>
      </Card>
    );
  }
  return (
    <Card tight>
      <Label>{started ? `De la începutul planului · ${fmtDayMonth(since)}` : `Planul începe pe ${fmtDayMonth(since)}`}</Label>
      {started ? (
        t && t.sedinte > 0 ? <Nums x={t} /> : <div className="small muted">Nicio ședință înregistrată încă de la start; se adună din brățări.</div>
      ) : (
        <div className="small muted">Până atunci nu există ședințe de plan evaluabile. Istoricul tău rămâne separat, mai jos.</div>
      )}
      {before && before.sedinte > 0 && (
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Istoric importat înainte de plan ({me.totals.beforeFrom ? `${fmtDayMonth(me.totals.beforeFrom)} – ${fmtDayMonth(since)}` : 'ultimele 6 săptămâni'}): {sport !== 'forta' ? `${fmtKm(before)}, ` : ''}
          {before.ore.toLocaleString('ro-RO')} ore, {before.sedinte} ședințe.
        </div>
      )}
    </Card>
  );
}

/** Indicele probei față de reperele ei (rezistență, volum, specific), cu distanța măsurată separat. Nu e procent din distanța cursei. */
function ReadyCard({ sport }: { sport: Sport }) {
  const me = useMe();
  const [how, setHow] = useState(false);
  const r = me.sportReady?.find((x) => x.sport === sport);
  if (!r) return null;
  const endurance = r.parts[0];
  return (
    <Card tight>
      <Label>Indice față de reperele probei</Label>
      <div className="ready-head">
        <span className="num ready-num">{r.value == null ? '—' : r.value}</span>
        {r.value != null && <span className="unit">%</span>}
        <span className="ready-leg">proba: {r.leg}</span>
      </div>
      <div className="ready-bar">
        <i style={{ width: `${r.value ?? 0}%` }} />
      </div>
      {r.value == null ? (
        <div className="small muted" style={{ marginTop: 10 }}>Fără date: apare după prima ședință cu distanță înregistrată de brățări în ultimele 6 săptămâni.</div>
      ) : (
        <>
          {endurance && (
            <div className="small" style={{ marginTop: 10 }}>
              Măsurat: <b>{endurance.have}</b> ({endurance.label.toLowerCase()}
              {endurance.source === 'declarat' ? ', declarat în chestionar' : ''}) · reper: {endurance.target}
            </div>
          )}
          <button className="link-btn" style={{ marginTop: 8 }} onClick={() => setHow(!how)} aria-expanded={how}>
            {how ? 'Ascunde calculul' : 'Cum se calculează?'}
          </button>
          {how && (
            <div className="ready-parts">
              {r.parts.map((p) => (
                <div key={p.label} className="ready-part">
                  <div className="rp-top">
                    <span className="rp-l">
                      {p.label} <small className="rp-w">{Math.round(p.weight * 100)}%{p.source === 'declarat' ? ' · declarat' : p.source === 'lipsa' ? ' · fără date' : ''}</small>
                    </span>
                    <span className="rp-v">
                      <b>{p.have}</b> · reper {p.target}
                    </span>
                  </div>
                  <div className="rp-bar">
                    <i style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
              <div className="tiny muted">
                Rezistență 60% (distanța demonstrată față de reperul probei), volum 25% (media pe săptămână față de 1,5 × distanța probei), specific 15% (condițiile cursei). Ultimele 6 săptămâni, doar ce au măsurat brățările; „declarat” = din chestionar, până apare o măsurătoare. E un indice după regulile noastre, nu procent din distanță și nu probabilitate de a termina.
              </div>
            </div>
          )}
        </>
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

/** Prescripția de forță a unei ședințe: din textul din plan sau, la planurile vechi, recalculată cu aceeași regulă. */
function strengthFor(me: Me, w: PlannedWorkout): Prescription | null {
  const age = me.profile.birthYear ? Number(me.today.slice(0, 4)) - me.profile.birthYear : null;
  const spec = strengthSpecFor(me.plan, w, me.planStart ?? null, me.user.raceDate ?? null, age != null && age >= 40 ? 3 : 4, me.user.goal);
  // Locul de antrenament din chestionar (planurile vechi nu îl au scris): acasă = doar exerciții cu gantere, bandă, corp.
  const acces = (me.forms.intake as { fitness?: { acces?: string } } | null)?.fitness?.acces;
  // Pornirea pe bandă/bicicletă: după obiectiv și fără să dubleze alergarea sau bicicleta din aceeași zi (regula 25).
  const sameDay = me.plan.filter((x) => x.date === w.date && x.id !== w.id && (x.status === 'planificat' || x.status === 'mutat')).map((x) => x.sport);
  return spec ? prescribe({ ...spec, ...(spec.place ? {} : acces === 'acasa' ? { place: 'acasa' as const } : {}) }, w.plannedMinutes, { goal: me.user.goal, sameDay }) : null;
}

const fmtRest = (sec: number) => (sec >= 120 ? `${Math.floor(sec / 60)}${sec % 60 ? `:${String(sec % 60).padStart(2, '0')}` : ''} min` : `${sec} s`);

/** Ședința de forță: următoarea din calendar, cu exercițiile programului, doza blocului și ce a încăput în timp. */
function StrengthCard() {
  const me = useMe();
  const [showRules, setShowRules] = useState(false);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const upcoming = me.plan.filter((x) => x.type === 'forta' && x.status !== 'sters' && x.status !== 'anulat_sistem' && x.date >= me.today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const [idx, setIdx] = useState(0);
  const w = upcoming[idx] ?? null;
  const rx = w ? strengthFor(me, w) : null;
  if (!w || !rx) {
    return (
      <Card tight>
        <Label>Programul de forță</Label>
        <div className="small muted">Ședințele de forță apar aici după ce ai planul (chestionarul de intrare).</div>
      </Card>
    );
  }
  const dayLabel = w.date === me.today ? 'azi' : `${DAY_NAMES[weekday(w.date)]} ${Number(w.date.slice(8, 10))}`;
  const sp = rx.spec;
  const fit = isFitnessSession(sp.session);
  return (
    <Card tight>
      <Label>{fit ? `Programul de fitness · ${sp.variant != null ? 'Push / Pull / Picioare' : /^f[a-d]$/.test(rx.session.id) ? 'A–D, picioare și partea de sus în zile separate' : 'picioare și partea de sus în zile separate'}` : `Programul de forță · ${sp.session.startsWith('full') ? 'picioare / partea de sus, alternativ' : sp.variant != null ? 'Push / Pull / Picioare' : 'Push / Pull / Legs A/B'}`}</Label>
      <div className="det-pills" role="tablist" aria-label="Ședința de forță">
        {upcoming.slice(0, 6).map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === idx} className={`det-pill ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)}>
            <b>{x.date === me.today ? 'azi' : `${DAY_NAMES[weekday(x.date)]} ${Number(x.date.slice(8, 10))}`}</b>
            <small>{strengthFor(me, x)?.session.name ?? ''}</small>
          </button>
        ))}
      </div>
      <div className="str-head">
        <span className="num md">{rx.session.name}{sp.variant != null ? <small className="muted"> · varianta {sp.variant + 1}</small> : null}</span>
        <span className="small muted">
          {dayLabel} · {w.plannedMinutes} min
        </span>
      </div>
      <div className="str-block">
        <b>
          {BLOCK_LABEL[sp.block]} · săpt. {sp.week} din {sp.len}
        </b>
        <span>{(fit ? FITNESS_BLOCK_GOAL[sp.block] : null) ?? BLOCK_GOAL[sp.block]}</span>
        <span>
          {rx.session.focus}. Te oprești din serie când mai aveai {rx.items[0]?.rir ?? '2–3'} repetări bune.
        </span>
      </div>
      <div className="str-warm small">
        <b>Încălzire · {rx.warmup.min} min.</b> {rx.warmup.text}.
      </div>
      <div className="str-list">
        {rx.items.map((r, i) => (
          <button key={r.ex.id + (r.completion ? '-c' : '')} className="str-row" onClick={() => setOpenEx(openEx === r.ex.id ? null : r.ex.id)} aria-expanded={openEx === r.ex.id}>
            <div className="str-ex">
              {r.ss && rx.items[i - 1]?.ss !== r.ss && <span className="str-ss">Superserie {r.ss}: unul după altul, fără pauză între ele</span>}
              <b>{r.ss ? `${r.ss}${rx.items.filter((x, j) => x.ss === r.ss && j <= i).length}. ` : `${i + 1}. `}{r.ex.name}</b>
              <span className="str-scheme">{r.sets} serii × {r.reps}</span>
              <span>
                {r.completion ? 'completare · ' : ''}
                {r.ex.group} · {r.ss && rx.items[i + 1]?.ss === r.ss ? 'fără pauză, treci la următorul' : `pauză ${fmtRest(r.rest)}`}
                {r.optional ? ' · opțional' : ''}
              </span>
              {openEx === r.ex.id && (
                <span className="str-cue">
                  Cum faci: {r.ex.cue}. Altă variantă: {r.ex.alt}.{r.note && r.note !== 'opțional' ? ` ${r.note.replace(/^./, (c) => c.toUpperCase())}.` : ''}
                </span>
              )}
            </div>
            <div className="str-sets">
              <span className="str-set">{r.sets} serii</span>
            </div>
          </button>
        ))}
      </div>
      {rx.finisher && (
        <div className="str-warm small">
          <b>La final · {rx.finisher.min} min.</b> {rx.finisher.text}.
        </div>
      )}
      {rx.notes.length > 0 && (
        <ul className="str-notes">
          {rx.notes.map((n) => (
            <li key={n}>{n.replace(/^./, (c) => c.toUpperCase())}.</li>
          ))}
        </ul>
      )}
      <button className="pill" style={{ marginTop: 12 }} onClick={() => setShowRules(!showRules)} aria-expanded={showRules}>
        {showRules ? 'Ascunde regulile' : 'Reguli: cât de greu, pauze, cum crești'}
      </button>
      {showRules && (
        <div className="str-rules">
          {(fit ? FITNESS_RULES : STRENGTH_RULES).map((r) => (
            <div key={r.t}>
              <b>{r.t}.</b> {r.d}
            </div>
          ))}
          <div className="tiny muted">Ședința are cel puțin 45 de minute și încape în timpul din calendar: când e puțin timp, sari întâi peste abdomen și exercițiile mici — niciodată sub 3 serii și nu peste pauze.</div>
        </div>
      )}
    </Card>
  );
}

/** Fitness: săptămâna din programul de 26, ce face săptămâna și mișcarea recomandată (în afara sălii). */
function FitnessWeekCard() {
  const me = useMe();
  const start = me.planStart ?? null;
  const f = ((me.forms.intake as { fitness?: FitnessIntake } | null)?.fitness ?? {}) as FitnessIntake;
  if (!start) return null;
  const week = Math.floor(diffDays(start, me.today) / 7) + 1;
  if (week < 1) {
    return (
      <Card tight>
        <Label>Programul de fitness · {FITNESS_WEEKS} săptămâni</Label>
        <div className="small">Începe {DAY_NAMES[weekday(start)]} {Number(start.slice(8, 10))}. Prima săptămână: {FITNESS_WEEK_ACTION[1]!.charAt(0).toLowerCase() + FITNESS_WEEK_ACTION[1]!.slice(1)}</div>
      </Card>
    );
  }
  const wk = Math.min(FITNESS_WEEKS, week);
  const fw = fitnessWeeks(fitnessProfile(me.user.goal ?? 'fit-tonifiere', f))[wk - 1];
  return (
    <Card tight>
      <Label>
        Săptămâna {wk} din {FITNESS_WEEKS}
        {fw ? ` · ${BLOCK_LABEL[fw.block]}` : ''}
      </Label>
      <div className="small">{FITNESS_WEEK_ACTION[wk]}</div>
      {me.fitnessFreq && me.fitnessFreq.now < me.fitnessFreq.wanted && (
        <>
          <div className="pref-k" style={{ marginTop: 10 }}>
            Zile pe săptămână: {me.fitnessFreq.now} din {me.fitnessFreq.wanted}
          </div>
          <div className="small">
            Acum: {me.fitnessFreq.why ?? 'frecvența de început'}. Ziua în plus se adaugă după 3 săptămâni la rând cu cel puțin 80% din ședințe făcute, feedback după fiecare și fără durere, dacă ai zi liberă în program. Se verifică duminica; până atunci programul rămâne cum e.
          </div>
        </>
      )}
      <div className="pref-k" style={{ marginTop: 10 }}>{f.acces === 'acasa' ? 'Mișcare în afara antrenamentului' : 'Mișcare în afara sălii'}</div>
      <div className="small">{fitnessCardio(wk, f.miscare ?? null)}</div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Nu e ședință punctată în calendar: o adaugi în ritmul tău, crescând un singur lucru odată.</div>
    </Card>
  );
}
