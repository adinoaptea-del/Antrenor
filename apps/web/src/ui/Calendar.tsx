import { useState } from 'react';
import { Card, CircleBtn, Dot, Icons, Label } from './common';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';
import { FITNESS_PHASE_LABEL, isFitnessGoal, phaseWeeks } from '@core/calendar/phases.js';
import { AWAY_LABEL, type AwayKind } from '@core/calendar/actions.js';
import { addDays, weekStart, weekday } from '@core/util/dates.js';
import { COLOR_LABEL, DAY_NAMES, SPORT_LABEL, activitiesOn, colorOf, fmtMinutes, workoutsOn } from '../data/model';
import { WorkoutCard } from './Workout';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const DOW = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const pad = (n: number) => String(n).padStart(2, '0');

export function Calendar({ onOpen }: { onBack: () => void; onOpen: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const [view, setView] = useState<'saptamana' | 'luna'>('saptamana');
  const [year, setYear] = useState(Number(me.today.slice(0, 4)));
  const [month, setMonth] = useState(Number(me.today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState(me.today);
  const [ws, setWs] = useState(weekStart(me.today));

  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));
  const pick = (iso: string) => {
    setSelected(iso);
    setWs(weekStart(iso));
    setYear(Number(iso.slice(0, 4)));
    setMonth(Number(iso.slice(5, 7)) - 1);
  };
  const dayWorkouts = workoutsOn(me, selected).filter((w) => w.type !== 'odihna');
  const unplannedHere = activitiesOn(me, selected).filter((a) => a.unplanned);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekW = me.plan.filter((w) => w.date >= ws && w.date <= addDays(ws, 6) && (w.status === 'planificat' || w.status === 'mutat') && w.type !== 'odihna');
  const weekMin = weekW.reduce((n, w) => n + w.plannedMinutes, 0);
  const weekHard = weekW.filter((w) => w.type === 'calitate' || w.type === 'brick').length;
  const weekUn = days.flatMap((d) => activitiesOn(me, d).filter((a) => a.unplanned));
  const beforePlan = !!me.planStart && addDays(ws, 6) < me.planStart;
  const weekSummary = beforePlan
    ? `înainte de plan · ${weekUn.length} ${weekUn.length === 1 ? 'activitate înregistrată' : 'activități înregistrate'}`
    : `${weekW.length} ședințe · ${fmtMinutes(weekMin)} · ${weekHard} ${weekHard === 1 ? 'grea' : 'grele'}${weekUn.length ? ` · +${weekUn.length} în afara planului` : ''}`;
  const away = (me.prefs?.plecari ?? []).find((a) => selected >= a.dela && selected <= a.panala);

  return (
    <>
      <div className="seg cal-view" role="tablist">
        <button role="tab" aria-selected={view === 'saptamana'} className={view === 'saptamana' ? 'on' : ''} onClick={() => setView('saptamana')}>
          Săptămâna
        </button>
        <button role="tab" aria-selected={view === 'luna'} className={view === 'luna' ? 'on' : ''} onClick={() => setView('luna')}>
          Luna
        </button>
      </div>

      {view === 'saptamana' ? (
        <Card>
          <div className="cal-head">
            <CircleBtn icon={Icons.chevronLeft} label="Săptămâna anterioară" onClick={() => pick(addDays(ws, -7))} />
            <div className="wk-range">
              <b>{rangeLabel(ws)}</b>
              <small>{weekSummary}</small>
            </div>
            <CircleBtn icon={Icons.chevronRight} label="Săptămâna următoare" onClick={() => pick(addDays(ws, 7))} />
          </div>
          <div className="week-rows">
            {days.map((d) => {
              const ws2 = workoutsOn(me, d).filter((w) => w.type !== 'odihna');
              const un = activitiesOn(me, d).filter((a) => a.unplanned);
              const isAway = (me.prefs?.plecari ?? []).some((a) => d >= a.dela && d <= a.panala);
              const isRace = d === me.user.raceDate;
              return (
                <button key={d} className={`week-row ${d === me.today ? 'today' : ''} ${d === selected ? 'sel' : ''}`} onClick={() => setSelected(d)} aria-pressed={d === selected}>
                  <span className="wr-d">
                    <b>{DOW[weekday(d)]}</b>
                    <small>{Number(d.slice(8))}</small>
                  </span>
                  <span className="wr-s">
                    {isRace && (
                      <span className="wr-chip c-cursa">
                        {Icons.flag} {me.user.raceName ?? 'cursa'}
                      </span>
                    )}
                    {!isRace && ws2.length === 0 && un.length === 0 && <i className="wr-rest">odihnă</i>}
                    {ws2.map((w) => (
                      <span key={w.id} className={`wr-chip c-${colorOf(me, w)} ${w.status === 'anulat_sistem' ? 'off' : ''} ${w.type === 'calitate' || w.type === 'brick' ? 'hard' : ''}`}>
                        {SPORT_ICON[w.sport]}
                        {fmtMinutes(w.plannedMinutes)}
                        {w.original && w.status !== 'anulat_sistem' ? <em title="actualizat">•</em> : null}
                      </span>
                    ))}
                    {un.map((a) => (
                      <span key={a.id} className="wr-chip c-albastru">
                        {SPORT_ICON[a.sport]}
                        {fmtMinutes(a.minutes)}
                      </span>
                    ))}
                  </span>
                  {isAway && <span className="wr-away">{Icons.plane}</span>}
                </button>
              );
            })}
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>Contur lime = ședință grea · punct albastru = actualizată · albastru = înregistrată de brățară, în afara planului · culoarea = cum a ieșit (după sincronizare).</div>
        </Card>
      ) : (
        <Card>
          <div className="cal-head">
            <CircleBtn icon={Icons.chevronLeft} label="Luna anterioară" onClick={prev} />
            <div className="month">
              {MONTHS[month]} {year}
            </div>
            <CircleBtn icon={Icons.chevronRight} label="Luna următoare" onClick={next} />
          </div>
          <div className="cal-grid">
            {DOW.map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {cells.map((iso, i) =>
              iso == null ? (
                <div key={`e${i}`} />
              ) : (
                <button key={iso} className={`cal-day ${iso === me.today ? 'today' : ''} ${iso === selected ? 'sel' : ''}`} onClick={() => pick(iso)} aria-pressed={iso === selected} aria-label={iso}>
                  <span className="d">{Number(iso.slice(8))}</span>
                  <span className="dots">
                    {workoutsOn(me, iso)
                      .slice(0, 3)
                      .map((w) => (
                        <Dot key={w.id} color={colorOf(me, w)} />
                      ))}
                    {activitiesOn(me, iso)
                      .filter((a) => a.unplanned)
                      .map((a) => (
                        <Dot key={a.id} color="albastru" />
                      ))}
                  </span>
                  {workoutsOn(me, iso).length === 0 && activitiesOn(me, iso).length > 0 && <span className="cal-min">{activitiesOn(me, iso).reduce((n, a) => n + a.minutes, 0)}′</span>}
                </button>
              ),
            )}
          </div>
          <div className="legend">
            {(['verde', 'galben', 'portocaliu', 'rosu', 'gri'] as const).map((c) => (
              <span key={c}>
                <Dot color={c} /> {COLOR_LABEL[c]}
              </span>
            ))}
            <span>
              <Dot color="asteptare" /> urmează
            </span>
            <span>
              <Dot color="albastru" /> în afara planului
            </span>
          </div>
        </Card>
      )}

      <div className="stack" style={{ marginTop: 12 }}>
        <div className="day-k">{selected === me.today ? 'Azi' : `${DAY_NAMES[weekday(selected)]}, ${Number(selected.slice(8))} ${MONTHS[Number(selected.slice(5, 7)) - 1]}`}</div>
        {away && <div className="wk-note">{Icons.plane} Plecat ({AWAY_LABEL[away.ce]}), {fmtShort(away.dela)}–{fmtShort(away.panala)}.</div>}
        {unplannedHere.map((u) => (
          <Card key={u.id} tight>
            <div className="item">
              <Dot color="albastru" />
              <div style={{ minWidth: 0 }}>
                <div className="t">{u.name ?? SPORT_LABEL[u.sport]} · în afara planului</div>
                <div className="s">
                  {u.avgHr ? `FC medie ${u.avgHr}${u.maxHr ? `, max ${u.maxHr}` : ''} · ` : ''}intră în încărcare, nu în scor
                  {!u.tipNeplanificat && (
                    <>
                      {' · '}
                      <button className="pill" style={{ height: 24, padding: '0 8px' }} onClick={() => onOpen('seara', { activityId: u.id })}>
                        ce a fost?
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="m">{fmtMinutes(u.minutes)}</div>
            </div>
          </Card>
        ))}
        {dayWorkouts.length === 0 && unplannedHere.length === 0 ? (
          <Card tight>
            <div className="muted small">{me.plan.length ? 'Zi fără antrenament.' : 'Planul apare după chestionarul de intrare.'}</div>
          </Card>
        ) : (
          dayWorkouts.map((w) => <WorkoutCard key={w.id} w={w} onOpen={onOpen} />)
        )}

        <AwayCard />
        <FixedCard />
        <PlanOverview onPick={(iso) => { pick(iso); setView('saptamana'); }} />
      </div>
    </>
  );
}

const SPORT_ICON = { inot: Icons.waves, bicicleta: Icons.bike, alergare: Icons.run, forta: Icons.dumbbell } as const;
const MONTH_SHORT_RO = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'];
function fmtShort(iso: string): string {
  return `${Number(iso.slice(8))} ${MONTH_SHORT_RO[Number(iso.slice(5, 7)) - 1]}`;
}
function rangeLabel(ws: string): string {
  const end = addDays(ws, 6);
  return ws.slice(5, 7) === end.slice(5, 7) ? `${Number(ws.slice(8))}–${fmtShort(end)}` : `${fmtShort(ws)} – ${fmtShort(end)}`;
}

/** Plecat: interval + ce ai la dispoziție. Planul se schimbă doar în zilele acelea; la anulare revine. */
function AwayCard() {
  const me = useMe();
  const { submitForm, local } = useData();
  const [open, setOpen] = useState(false);
  const [dela, setDela] = useState(me.today);
  const [panala, setPanala] = useState(addDays(me.today, 3));
  const [ce, setCe] = useState<AwayKind>('fara_bazin');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const list = (me.prefs?.plecari ?? []).filter((a) => a.panala >= me.today);
  const send = async (body: Record<string, unknown>, ok: (d: Record<string, unknown> | undefined) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await submitForm('plecat', body);
      setMsg(ok(r.data));
      setOpen(false);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Label icon={Icons.plane}>Plecat</Label>
      <div className="small muted" style={{ marginBottom: 8 }}>Pleci câteva zile? Spune ce ai la dispoziție și planul se potrivește doar pentru zilele acelea.</div>
      {list.map((a) => (
        <div key={`${a.dela}${a.ce}`} className="pref-row">
          <span>
            <b>{fmtShort(a.dela)}–{fmtShort(a.panala)}</b> · {AWAY_LABEL[a.ce]}
          </span>
          <button className="pill" disabled={busy || local} onClick={() => void send({ anuleaza: (me.prefs?.plecari ?? []).indexOf(a) }, (d) => `Anulat. ${Number(d?.inapoi ?? 0)} ședințe au revenit la plan.`)}>
            Anulează
          </button>
        </div>
      ))}
      {!open ? (
        <button className="pill" disabled={local} onClick={() => setOpen(true)}>
          Anunță o plecare
        </button>
      ) : (
        <div className="pref-form">
          <label>
            De pe
            <input className="date" type="date" value={dela} min={me.today} onChange={(e) => setDela(e.target.value)} />
          </label>
          <label>
            Până pe (inclusiv)
            <input className="date" type="date" value={panala} min={dela} onChange={(e) => setPanala(e.target.value)} />
          </label>
          <div className="pref-k">Ce ai acolo?</div>
          <div className="wk-btns">
            {(Object.keys(AWAY_LABEL) as AwayKind[]).map((k) => (
              <button key={k} className={`pill ${ce === k ? 'on' : ''}`} onClick={() => setCe(k)} aria-pressed={ce === k}>
                {AWAY_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="wk-note">{AWAY_HELP[ce]}</div>
          <div className="wk-btns">
            <button className="btn sm" disabled={busy} onClick={() => void send({ dela, panala, ce }, (d) => `Gata: ${Number(d?.schimbate ?? 0)} ședințe potrivite pentru plecare.`)}>
              Salvează plecarea
            </button>
            <button className="pill" onClick={() => setOpen(false)}>
              Renunț
            </button>
          </div>
        </div>
      )}
      {msg && <div className="wk-note" role="status" style={{ marginTop: 8 }}>{msg}</div>}
    </Card>
  );
}

const AWAY_HELP: Record<AwayKind, string> = {
  fara_bazin: 'Înotul devine alergare ușoară (dacă ziua n-are deja alergare), altfel se anulează.',
  fara_bicicleta: 'Bicicleta și brick-ul devin alergare ușoară (cel mult una pe zi), altfel se anulează.',
  doar_alergare: 'Rămân alergarea și forța; înotul și bicicleta devin cel mult o alergare ușoară pe zi.',
  nimic: 'Toate ședințele din zilele acelea se anulează. Nu se recuperează după.',
};

const FIX_TIP = { lung: 'ieșirea lungă', calitate: 'intensitate', usor: 'ușor' } as const;
const FIX_SPORT = { alergare: 'Alergare', bicicleta: 'Bicicletă', inot: 'Înot' } as const;

/** Întâlniri fixe (alergarea cu grupul): ședința potrivită se pune în ziua aceea; planul se reface de luni. */
function FixedCard() {
  const me = useMe();
  const { submitForm, local } = useData();
  const saved = me.prefs?.fixe ?? [];
  const [open, setOpen] = useState(false);
  const [zi, setZi] = useState(5);
  const [sport, setSport] = useState<'alergare' | 'bicicleta' | 'inot'>('alergare');
  const [tip, setTip] = useState<'lung' | 'calitate' | 'usor'>('lung');
  const [eticheta, setEticheta] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (fixe: typeof saved) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await submitForm('fixe', { fixe });
      const out = (r.data?.inAfaraProgramului as number[] | undefined) ?? [];
      setMsg(out.length ? `Salvat, dar ${out.map((d) => DAY_NAMES[d]).join(', ')} nu e în programul tău de antrenament: adaug-o în Profil → Chestionare → De intrare (programul), altfel planul nu poate pune ședința acolo.` : 'Salvat. Planul s-a refăcut de lunea viitoare cu întâlnirea fixă.');
      setOpen(false);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou când revine.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Label icon={Icons.users}>Întâlniri fixe</Label>
      <div className="small muted" style={{ marginBottom: 8 }}>Alergi cu un grup în aceeași zi în fiecare săptămână? Planul pune acolo ședința potrivită, iar alergarea cu grupul se leagă singură de ea.</div>
      {saved.map((f, i) => (
        <div key={i} className="pref-row">
          <span>
            <b>{DAY_NAMES[f.zi]}</b> · {FIX_SPORT[f.sport]}, {FIX_TIP[f.tip]}
            {f.eticheta ? ` · ${f.eticheta}` : ''}
          </span>
          <button className="pill" disabled={busy || local} onClick={() => void save(saved.filter((_, j) => j !== i))}>
            Scoate
          </button>
        </div>
      ))}
      {!open ? (
        saved.length < 3 && (
          <button className="pill" disabled={local} onClick={() => setOpen(true)}>
            Adaugă o întâlnire fixă
          </button>
        )
      ) : (
        <div className="pref-form">
          <div className="pref-k">Ziua</div>
          <div className="wk-btns">
            {DAY_NAMES.map((d, i) => (
              <button key={d} className={`pill ${zi === i ? 'on' : ''}`} onClick={() => setZi(i)} aria-pressed={zi === i}>
                {d}
              </button>
            ))}
          </div>
          <div className="pref-k">Sportul</div>
          <div className="wk-btns">
            {(Object.keys(FIX_SPORT) as (keyof typeof FIX_SPORT)[]).map((s) => (
              <button key={s} className={`pill ${sport === s ? 'on' : ''}`} onClick={() => setSport(s)} aria-pressed={sport === s}>
                {FIX_SPORT[s]}
              </button>
            ))}
          </div>
          <div className="pref-k">Ce faceți de obicei</div>
          <div className="wk-btns">
            {(Object.keys(FIX_TIP) as (keyof typeof FIX_TIP)[]).map((t) => (
              <button key={t} className={`pill ${tip === t ? 'on' : ''}`} onClick={() => setTip(t)} aria-pressed={tip === t}>
                {FIX_TIP[t]}
              </button>
            ))}
          </div>
          <label>
            Nume (opțional)
            <input className="date" type="text" maxLength={40} value={eticheta} placeholder="ex. grupul din Herăstrău" onChange={(e) => setEticheta(e.target.value)} />
          </label>
          <div className="wk-btns">
            <button className="btn sm" disabled={busy} onClick={() => void save([...saved, { zi, sport, tip, ...(eticheta.trim() ? { eticheta: eticheta.trim() } : {}) }])}>
              {busy ? 'Refac planul…' : 'Salvează și refă planul'}
            </button>
            <button className="pill" onClick={() => setOpen(false)}>
              Renunț
            </button>
          </div>
        </div>
      )}
      {msg && <div className="wk-note" role="status" style={{ marginTop: 8 }}>{msg}</div>}
    </Card>
  );
}

const PHASE_LABEL: Record<string, string> = { evaluare: 'Evaluare', baza1: 'Bază 1', baza2: 'Bază 2', build: 'Build', peak: 'Peak', taper: 'Taper' };
const PHASE_WHAT: Record<string, string> = {
  evaluare: 'teste de teren, doar ușor',
  baza1: 'volum aerob, tempo scurt',
  baza2: 'volum mai mare, tempo lung, sweet spot',
  build: 'prag, brick-uri, ieșiri lungi',
  peak: 'ritm de cursă, intervale Z5',
  taper: 'volum jos, prospețime',
};
const FITNESS_WHAT: Record<string, string> = {
  evaluare: 'înveți aparatele și execuția, 1–2 serii',
  baza1: 'frecvența se consolidează, repetări sau sarcină',
  baza2: 'accent pe fesieri și picioare; revizuire la final',
  build: 'păstrezi performanța, adaugi doar la nevoie',
  peak: 'reevaluezi obiectivul, spre menținere',
  taper: 'obiceiuri stabile, volum sustenabil',
};

/** Tot planul până la cursă: fazele, săptămânile și orele pe săptămână (se vede creșterea și descărcările). */
function PlanOverview({ onPick }: { onPick: (iso: string) => void }) {
  const me = useMe();
  if (!me.planStart || !me.user.raceDate || me.plan.length === 0) return null;
  let weeks: ReturnType<typeof phaseWeeks>;
  try {
    const age = me.profile.birthYear ? Number(me.today.slice(0, 4)) - me.profile.birthYear : null;
    weeks = phaseWeeks(me.planStart, me.user.raceDate, age != null && age >= 40 ? 3 : 4, me.user.goal);
  } catch {
    return null;
  }
  const hours = new Map<string, { min: number; hard: number }>();
  for (const w of me.plan) {
    if (w.status === 'sters' || w.status === 'anulat_sistem') continue;
    const k = weekStart(w.date);
    const h = hours.get(k) ?? { min: 0, hard: 0 };
    h.min += w.plannedMinutes;
    if (w.type === 'calitate') h.hard += 1;
    hours.set(k, h);
  }
  const max = Math.max(1, ...[...hours.values()].map((h) => h.min));
  const fit = isFitnessGoal(me.user.goal);
  const LBL = fit ? FITNESS_PHASE_LABEL : PHASE_LABEL;
  const WHAT = fit ? FITNESS_WHAT : PHASE_WHAT;
  const thisWeek = weekStart(me.today);
  const phases = [...new Set(weeks.map((w) => w.phase))];
  return (
    <Card>
      <Label>{fit ? `Programul de ${weeks.length} de săptămâni` : 'Planul până la cursă'}</Label>
      <div className="tiny muted" style={{ marginBottom: 10 }}>
        {weeks.length} săptămâni, de la {me.planStart.split('-').reverse().join('.')} la cursă. Fiecare bară e o săptămână: înălțimea = ore planificate; barele scurte sunt descărcările.
      </div>
      <div className="po-bars" role="img" aria-label="Orele planificate pe săptămână până la cursă">
        {weeks.map((w) => {
          const h = hours.get(w.weekStart);
          return (
            <button
              key={w.weekStart}
              className={`po-bar ph-${w.phase} ${w.weekStart === thisWeek ? 'now' : ''} ${w.weekStart < thisWeek ? 'past' : ''}`}
              style={{ height: `${Math.max(6, ((h?.min ?? 0) / max) * 100)}%` }}
              title={`${w.weekStart}: ${fmtMinutes(h?.min ?? 0)}`}
              onClick={() => onPick(w.weekStart)}
            />
          );
        })}
      </div>
      <div className="po-phases">
        {phases.map((ph) => {
          const ws = weeks.filter((w) => w.phase === ph);
          const mins = ws.map((w) => hours.get(w.weekStart)?.min ?? 0).filter((m) => m > 0);
          const avg = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
          return (
            <button key={ph} className="po-row" onClick={() => onPick(ws[0]!.weekStart)}>
              <span className={`po-dot ph-${ph}`} />
              <span className="po-n">
                <b>{LBL[ph]}</b> · {ws.length} săpt. · de la {ws[0]!.weekStart.split('-').reverse().slice(0, 2).join('.')}
                <small>{WHAT[ph]}</small>
              </span>
              <span className="po-h">~{fmtMinutes(Math.round(avg))}/săpt.</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
