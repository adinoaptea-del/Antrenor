import { useState } from 'react';
import { weeklyBudget } from '@core/calendar/budget.js';
import { currentFromIntake, distanceFeasibility, fmtTime, planTarget } from '@core/goals/run-target.js';
import { AvailabilityDays } from '../ui/Availability';
import { CircleBtn, Icons, LiveTitle } from '../ui/common';
import { Chips, Progress, Q, ScheduleGrid, Stepper, TextBox, Toggle } from './controls';
import { useData, useMe } from '../data/store';
import { EMPTY_INTAKE, runResultOk, type IntakeAnswers } from './types';
import { FITNESS_WEEKS, goalKind, isRunGoal, RUN_DISTANCE_KM } from '@core/calendar/phases.js';
import type { FitnessIntake } from '@core/strength/fitness.js';
import { fmtDuration, fmtPaceSec, paceFromResult, parsePace, type RunResult } from '@core/util/run.js';

// Chestionarul de intrare: un grup de întrebări pe ecran, totul de atins, 3–4 minute. Răspunsurile dau planul.
const TRI_STEPS = ['Obiectiv', 'Înot', 'Bicicletă', 'Alergare', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
// Alergare: distanța → nivelul de acum („n-am alergat niciodată distanța asta” e un răspuns valid) → ținta, judecată pe loc.
const RUN_STEPS = ['Obiectiv', 'Nivelul acum', 'Ținta', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
const SWIM_STEPS = ['Obiectiv', 'Înot', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
const BIKE_STEPS = ['Obiectiv', 'Bicicletă', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
// Fitness (doar la femei): nivelul, zilele și minutele de sală, apoi ferestrele libere; fără cursă și fără date de test.
const FITNESS_STEPS = ['Obiectiv', 'Fitness', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
type Step = (typeof TRI_STEPS)[number] | (typeof RUN_STEPS)[number] | (typeof FITNESS_STEPS)[number];

/** Întâi sportul (sau triatlonul), apoi distanța: la un singur sport, aplicația arată doar sportul acela. */
type GoalFamily = 'alergare' | 'inot' | 'bicicleta' | 'triatlon' | 'fitness';
const FAMILY_OF = (g: string): GoalFamily => (goalKind(g) === 'run' ? 'alergare' : goalKind(g) === 'swim' ? 'inot' : goalKind(g) === 'bike' ? 'bicicleta' : goalKind(g) === 'fitness' ? 'fitness' : 'triatlon');
/** Sfârșitul programului de fitness: 26 de săptămâni de la lunea următoare (planul începe atunci). */
const fitnessEnd = (): string => {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + 7 + FITNESS_WEEKS * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const GOALS_BY_FAMILY: Record<GoalFamily, { id: IntakeAnswers['obiectiv']; label: string; sub?: string }[]> = {
  alergare: [
    { id: '5k', label: '5 km', sub: 'timp mai bun pe 5 km' },
    { id: '10k', label: '10 km', sub: 'timp mai bun pe 10 km' },
    { id: 'semimaraton', label: 'Semimaraton', sub: '21,1 km' },
    { id: 'maraton', label: 'Maraton', sub: '42,2 km' },
  ],
  inot: [
    { id: 'inot-1500', label: '1.500 m', sub: 'fără oprire' },
    { id: 'inot-1900', label: '1.900 m', sub: 'distanța de 70.3' },
    { id: 'inot-3800', label: '3.800 m', sub: 'distanța de Ironman' },
  ],
  bicicleta: [
    { id: 'bike-50', label: '50 km', sub: 'o tură' },
    { id: 'bike-100', label: '100 km', sub: 'o tură' },
    { id: 'bike-160', label: '160 km', sub: 'o tură' },
  ],
  fitness: [
    { id: 'fit-slabire', label: 'Scădere în greutate și tonifiere', sub: 'forță + mișcare zilnică' },
    { id: 'fit-tonifiere', label: 'Tonifiere', sub: 'forță, fesieri și picioare' },
    { id: 'fit-intretinere', label: 'Întreținere', sub: 'păstrezi ce ai' },
    { id: 'fit-masa', label: 'Creștere musculară', sub: 'mai multă masă musculară' },
  ],
  triatlon: [
    { id: 'sprint', label: 'Sprint', sub: '0,75 · 20 · 5' },
    { id: 'olimpic', label: 'Olimpic', sub: '1,5 · 40 · 10' },
    { id: '70.3', label: 'Ironman 70.3', sub: '1,9 km · 90 km · 21 km' },
    { id: 'full', label: 'Ironman', sub: '3,8 · 180 · 42 · în curând' },
  ],
};

/** Verdictul asupra țintei, calculat pe loc: ținta, nivelul de acum (sau un timp pe altă distanță) și săptămânile până la cursă. */
function TargetVerdict({ a }: { a: IntakeAnswers }) {
  if (!isRunGoal(a.obiectiv)) return null;
  const weeks = Math.max(0, (Date.parse(`${a.dataCursa}T12:00:00Z`) - Date.now()) / (7 * 86_400_000));
  const t = planTarget(a.obiectiv, a.alergare.tinta, currentFromIntake(a), weeks);
  const v = t.verdict;
  if (!v) return null;
  const TITLE = { realist: 'Țintă realistă', ambitios: 'Țintă ambițioasă', nerealist: 'Țintă nerealistă', necunoscut: 'Nu putem judeca ținta încă' } as const;
  return (
    <div className={`verdict v-${v.verdict}`} role="status">
      <b>{TITLE[v.verdict]}</b>
      {v.reasons.map((r, i) => (
        <p key={i}>{r}</p>
      ))}
      {v.verdict === 'nerealist' && <p>{t.planSec ? `Poți continua, dar planul se construiește pe ~${fmtTime(t.planSec)} (${fmtPaceSec(t.paceSecKm!)}/km), nu pe ținta asta; ținta rămâne notată și o rejudecăm la fiecare test.` : 'Poți continua, dar planul nu primește bucăți la ritmul ăsta; primul test din plan dă ritmurile.'}</p>}
    </div>
  );
}

/** Ramura de alergare: aleasă explicit; la chestionarele vechi, „timp” dacă există o țintă. */
const ramuraOf = (a: IntakeAnswers): 'finalizare' | 'timp' | null => a.alergare.ramura ?? (a.alergare.tinta ? 'timp' : null);

/** Întâi distanța, apoi timpul: avertisment când distanța aleasă cere o bază pe care sportivul n-o are încă. */
function DistanceCheck({ a }: { a: IntakeAnswers }) {
  if (!isRunGoal(a.obiectiv)) return null;
  const weeks = Math.max(0, (Date.parse(`${a.dataCursa}T12:00:00Z`) - Date.now()) / (7 * 86_400_000));
  const f = distanceFeasibility(a.obiectiv, a.alergare.ceaMaiLungaKm, weeks);
  if (f.ok) return null;
  return (
    <div className="verdict v-ambitios" role="status">
      <b>Distanța, înainte de timp</b>
      <p>{f.message}</p>
      <p>Poți continua; planul pornește de la nivelul tău și o rejudecăm la fiecare test.</p>
    </div>
  );
}

/**
 * Tastatura de cifre de pe iPhone nu are „:”. Scrii doar cifre și punem noi două puncte:
 * „830” → „8:30”, „2730” → „27:30”, „15500” → „1:55:00”.
 */
function autoColon(raw: string, hms: boolean): string {
  const d = raw.replace(/\D/g, '').slice(0, hms ? 6 : 4);
  if (d.length <= 2) return d;
  if (!hms || d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** Ritm sau timp final: două butoane + un câmp; arată și echivalentul calculat. */
function RunResultInput({ value, onChange, distanceKm }: { value: RunResult | null | undefined; onChange: (r: RunResult) => void; distanceKm: number }) {
  const mod = value?.mod ?? 'timp';
  const pace = paceFromResult(value, distanceKm);
  return (
    <>
      <Chips value={mod} options={[{ id: 'timp', label: 'Timp final' }, { id: 'ritm', label: 'Ritm pe km' }]} onChange={(m) => onChange({ mod: m, valoare: '' })} />
      <input
        className="date"
        style={{ marginTop: 8 }}
        inputMode="numeric"
        placeholder={mod === 'timp' ? (distanceKm <= 10 ? 'ex. 57:00 — scrii 5700' : 'ex. 1:55:00 — scrii 15500') : 'ex. 5:30 — scrii 530'}
        value={value?.valoare ?? ''}
        onChange={(e) => onChange({ mod, valoare: autoColon(e.target.value, mod === 'timp') })}
      />
      {pace != null && <p className="hint">{mod === 'timp' ? `adică ${fmtPaceSec(pace)} min/km` : `adică ${fmtDuration(pace * distanceKm)} timp final`}</p>}
    </>
  );
}

export function Intake({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const me = useMe();
  const { submitForm } = useData();
  const saved = me.forms.intake as IntakeAnswers | null;
  const [a, setA] = useState<IntakeAnswers>(() => {
    // Un chestionar salvat mai demult poate să nu aibă câmpurile noi: pornim mereu de la forma goală și punem peste ce există.
    const base: IntakeAnswers = {
      ...EMPTY_INTAKE,
      dataCursa: me.user.raceDate ?? EMPTY_INTAKE.dataCursa,
      ...(saved ?? {}),
      inot: { ...EMPTY_INTAKE.inot, ...(saved?.inot ?? {}) },
      bicicleta: { ...EMPTY_INTAKE.bicicleta, ...(saved?.bicicleta ?? {}) },
      alergare: { ...EMPTY_INTAKE.alergare, ...(saved?.alergare ?? {}) },
      echipament: { ...EMPTY_INTAKE.echipament, ...(saved?.echipament ?? {}) },
      program: Array.isArray(saved?.program) ? saved.program : [],
      sanatate: { ...EMPTY_INTAKE.sanatate, ...(saved?.sanatate ?? {}) },
      minte: { ...EMPTY_INTAKE.minte, ...(saved?.minte ?? {}) },
      fitness: { ...(saved?.fitness ?? {}) },
    };
    return { ...base, sex: base.sex ?? me.profile.sex, anNastere: base.anNastere ?? me.profile.birthYear, inaltime: base.inaltime ?? me.profile.heightCm };
  });
  const [step, setStep] = useState(0);
  const runGoal = isRunGoal(a.obiectiv);
  const kind = goalKind(a.obiectiv);
  const fit = kind === 'fitness';
  const STEPS: readonly Step[] = runGoal ? RUN_STEPS : kind === 'swim' ? SWIM_STEPS : kind === 'bike' ? BIKE_STEPS : fit ? FITNESS_STEPS : TRI_STEPS;
  const fx: FitnessIntake = a.fitness ?? {};
  const setFx = (patch: FitnessIntake) => set({ fitness: { ...fx, ...patch } });
  const dist = runGoal ? RUN_DISTANCE_KM[a.obiectiv] : 0;
  const raceWord = a.obiectiv === 'maraton' ? 'un maraton' : a.obiectiv === 'semimaraton' ? 'un semimaraton' : a.obiectiv === '10k' ? '10 km' : '5 km';
  const [family, setFamily] = useState<GoalFamily>(() => FAMILY_OF(a.obiectiv));
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const set = (patch: Partial<IntakeAnswers>) => setA((prev) => ({ ...prev, ...patch }));
  const ev = a.evaluare ?? {};
  const setEv = (patch: NonNullable<IntakeAnswers['evaluare']>) => set({ evaluare: { ...ev, ...patch } });
  const next = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await submitForm('intrare', a);
      if (r.ok) onDone();
      else setInfo(r.info ?? 'planul nu a putut fi generat');
    } catch (e) {
      setInfo(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const back = () => (step === 0 ? onBack() : setStep(step - 1));
  const bud = weeklyBudget(a.program, undefined, a.oreSport ?? null);
  const budget = bud.hours;

  const canContinue = (() => {
    switch (STEPS[step]) {
      case 'Obiectiv':
        return (!fit || a.sex === 'f') && a.nume.trim().length > 0 && !!a.dataCursa && !!a.sex && !!a.inaltime && a.inaltime >= 120 && a.inaltime <= 230 && !!a.anNastere && a.anNastere >= 1930 && a.anNastere <= new Date().getFullYear() - 18;
      case 'Înot':
        return a.inot.nivel != null && a.inot.apeDeschise != null && a.inot.bazin != null;
      case 'Bicicletă':
        return a.bicicleta.tip != null && (a.bicicleta.tip === 'nu_am' || (a.bicicleta.trainer != null && a.bicicleta.putere != null && a.bicicleta.ceaMaiLungaOre != null));
      case 'Alergare':
        return a.alergare.ceaMaiLungaKm != null && a.alergare.curseRecente != null;
      case 'Ținta':
        return ramuraOf(a) === 'finalizare' || (ramuraOf(a) === 'timp' && runResultOk(a.alergare.tinta));
      case 'Nivelul acum':
        return parsePace(a.alergare.ritmActual) != null && a.alergare.poateDistanta != null && (!a.alergare.poateDistanta || runResultOk(a.alergare.rezultatActual)) && a.alergare.ceaMaiLungaKm != null;
      case 'Echipament':
        return a.echipament.ceas != null;
      case 'Fitness':
        return !!fx.experienta && !!fx.zile && !!fx.minute && !!fx.acces && !!fx.miscare;
      case 'Program':
        return a.program.length > 0 && (fit || a.oreSport != null);
      case 'Sănătate':
        return fit || !!a.evaluare?.testEfort;
      case 'Gata':
        return a.consimtamant;
      default:
        return true;
    }
  })();

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={back} />
        </div>
        <div className="top-c">
          <LiveTitle>Chestionar</LiveTitle>
        </div>
        <div className="top-r">
          <span className="small muted">
            {step + 1}/{STEPS.length}
          </span>
        </div>
      </header>
      <Progress step={step} total={STEPS.length} />

      <div className="wizard">
        {STEPS[step] === 'Obiectiv' && (
          <>
            <Q title="Ești femeie sau bărbat?" hint="Contează pentru programele disponibile, intervalele analizelor (fier, hemoglobină), nutriție și recuperare.">
              <Chips
                value={a.sex ?? null}
                options={[{ id: 'f', label: 'Femeie' }, { id: 'm', label: 'Bărbat' }]}
                onChange={(sex) => {
                  set({ sex });
                  // Fitness e deocamdată doar pentru femei.
                  if (sex === 'm' && family === 'fitness') {
                    setFamily('alergare');
                    set({ sex, obiectiv: '5k' });
                  }
                }}
              />
            </Q>
            <Q title="Cum te cheamă?" hint="Așa îți spune head coach-ul.">
              <input className="date" type="text" autoComplete="given-name" placeholder="prenumele" value={a.nume} onChange={(e) => set({ nume: e.target.value })} />
            </Q>
            <Q title="Anul nașterii">
              <input className="date" type="number" inputMode="numeric" placeholder="ex. 1988" value={a.anNastere ?? ''} onChange={(e) => set({ anNastere: e.target.value ? Number(e.target.value) : null })} />
            </Q>
            <Q title="Înălțimea" hint="În centimetri. Cu greutatea, dă necesarul de energie și indicele de masă corporală.">
              <input className="date" type="number" inputMode="numeric" placeholder="ex. 180" value={a.inaltime ?? ''} onChange={(e) => set({ inaltime: e.target.value ? Number(e.target.value) : null })} />
            </Q>
            <Q title="Cum mănânci?" hint="Mesele recomandate pornesc de aici. O poți schimba oricând din „Mese recomandate”.">
              <Chips
                value={a.alimentatie ?? null}
                options={[
                  { id: 'omnivor' as const, label: 'De toate', sub: 'carne, pește, lactate, ouă' },
                  { id: 'vegetarian' as const, label: 'Vegetarian', sub: 'fără carne și pește; cu lactate și ouă' },
                  { id: 'vegan' as const, label: 'Vegan', sub: 'nimic de origine animală' },
                ]}
                onChange={(d) => set({ alimentatie: d })}
              />
            </Q>
            <Q title="Ce îți propui?" hint={a.sex === 'f' ? 'Fitness (sală, forță, corp) sau un sport. La fiecare, aplicația și antrenorul sunt doar pentru alegerea ta.' : 'Un singur sport sau triatlon. La un singur sport, aplicația și antrenorul sunt doar pentru sportul acela.'}>
              <Chips
                value={family}
                options={[
                  ...(a.sex === 'f' ? [{ id: 'fitness' as const, label: 'Fitness', sub: 'sală · forță · corp' }] : []),
                  { id: 'alergare', label: 'Alergare', sub: '5 km … maraton' },
                  { id: 'inot', label: 'Înot', sub: '1.500 … 3.800 m' },
                  { id: 'bicicleta', label: 'Bicicletă', sub: '50 … 160 km' },
                  { id: 'triatlon', label: 'Triatlon', sub: 'sprint · olimpic · 70.3' },
                ]}
                onChange={(f) => {
                  setFamily(f);
                  const first = GOALS_BY_FAMILY[f][0]!.id;
                  if (FAMILY_OF(a.obiectiv) !== f) set({ obiectiv: first, ...(f === 'fitness' ? { dataCursa: fitnessEnd() } : {}) });
                }}
              />
            </Q>
            <Q title={family === 'fitness' ? 'Ce obiectiv ai?' : family === 'triatlon' ? 'Ce cursă?' : 'Ce distanță?'} hint={family === 'fitness' ? '„Tonifiere” înseamnă mușchi construit sau păstrat, nu slăbire localizată. Scăderea în greutate nu e necesară pentru toată lumea.' : family === 'alergare' ? 'Distanța pe care vrei s-o alergi mai bine. Timpul-țintă îl spui la pasul următor.' : family === 'inot' ? 'Distanța pe care vrei s-o înoți fără oprire.' : family === 'bicicleta' ? 'Tura pe care vrei s-o termini.' : 'Obiectivul decide fazele, orele și ce înseamnă „gata”.'}>
              <Chips value={a.obiectiv} options={GOALS_BY_FAMILY[family]} onChange={(obiectiv) => set({ obiectiv, ...(family === 'fitness' ? { dataCursa: fitnessEnd() } : {}) })} />
            </Q>
            {family === 'fitness' ? (
              <p className="small muted">Programul are 26 de săptămâni (aproximativ șase luni), de luni până pe {a.dataCursa.split('-').reverse().join('.')}. Etapele se adaptează la cum răspunzi, nu la calendar.</p>
            ) : (
              <Q title={family === 'triatlon' || runGoal ? 'Data cursei' : 'Până când vrei să reușești?'} hint={runGoal ? 'Cât timp ai la dispoziție decide cât de realistă e ținta.' : undefined}>
                <input className="date" type="date" value={a.dataCursa} onChange={(e) => set({ dataCursa: e.target.value })} />
              </Q>
            )}
          </>
        )}

        {STEPS[step] === 'Fitness' && (
          <>
            <Q title="Unde ești acum?" hint="Din ultimele 4–8 săptămâni. Nu se cere niciun test de forță maximă.">
              <Chips value={fx.experienta ?? null} options={[{ id: 'incepatoare', label: 'Încep sau revin după o pauză', sub: 'pornim cu 2 zile, tot corpul' }, { id: 'stabila', label: 'Merg constant la sală', sub: 'știu exercițiile de bază' }]} onChange={(experienta) => setFx({ experienta })} />
            </Q>
            <Q title="Câte zile pe săptămână poți merge la sală, pe termen lung?" hint="3 zile e varianta principală pentru multe femei; 4 e opțională, nu un nivel superior. Dacă începi, primele săptămâni sunt oricum 2 zile.">
              <Chips value={fx.zile ? String(fx.zile) : null} options={[{ id: '2', label: '2 zile' }, { id: '3', label: '3 zile' }, { id: '4', label: '4 zile' }]} onChange={(z) => setFx({ zile: Number(z) as 2 | 3 | 4 })} />
            </Q>
            <Q title="Cât timp ai pentru o ședință?" hint="Cu încălzirea, pauzele și schimbatul între exerciții. Ședința se potrivește în timpul ăsta: când e scurt, cad întâi accesoriile.">
              <Chips value={fx.minute ? String(fx.minute) : null} options={[{ id: '35', label: '30–35 min' }, { id: '45', label: '45 min' }, { id: '60', label: '60 min' }]} onChange={(m) => setFx({ minute: Number(m) })} />
            </Q>
            <Q title="Unde te antrenezi?">
              <Chips value={fx.acces ?? null} options={[{ id: 'sala', label: 'La sală', sub: 'aparate și gantere' }, { id: 'acasa', label: 'Acasă', sub: 'gantere, bandă' }]} onChange={(acces) => setFx({ acces })} />
            </Q>
            <Q title="Cât te miști acum, în afară de sală?" hint="De aici pornesc plimbările și cardio-ul, treptat.">
              <Chips value={fx.miscare ?? null} options={[{ id: 'sedentara', label: 'Puțin', sub: 'stau mult jos' }, { id: 'plimbari', label: 'Plimbări regulate' }, { id: 'activa', label: 'Activă', sub: 'cardio, alte sporturi' }]} onChange={(miscare) => setFx({ miscare })} />
            </Q>
          </>
        )}

        {STEPS[step] === 'Ținta' && (
          <>
            <DistanceCheck a={a} />
            <Q title="Ce urmărești?" hint="Planul are două ramuri: rezistență (să termini distanța, fără grabă) sau timp (păstrezi baza și adaugi ședințe specifice distanței).">
              <Chips
                value={ramuraOf(a)}
                options={[
                  { id: 'finalizare', label: 'Să termin distanța', sub: 'rezistență, regularitate' },
                  { id: 'timp', label: 'Un timp mai bun', sub: 'cu timp-țintă' },
                ]}
                onChange={(ramura) => set({ alergare: { ...a.alergare, ramura, tinta: ramura === 'finalizare' ? null : a.alergare.tinta } })}
              />
            </Q>
            {ramuraOf(a) === 'timp' && (
              <>
                <Q title="Ce timp vrei?" hint={`În cât timp vrei să alergi ${raceWord}, sau cu ce ritm. Judecăm ținta pe loc, față de nivelul de acum și de timpul rămas. Ritmurile de antrenament pornesc de la ce poți acum, nu de la timpul dorit.`}>
                  <RunResultInput value={a.alergare.tinta} distanceKm={dist} onChange={(tinta) => set({ alergare: { ...a.alergare, tinta } })} />
                </Q>
                <TargetVerdict a={a} />
              </>
            )}
            {ramuraOf(a) === 'finalizare' && <p className="small muted">Fără timp-țintă: ieșiri ușoare, regularitate și durata care crește treptat{(a.alergare.ceaMaiLungaKm ?? 0) < 3 ? ', începând cu mers-alergare' : ''}. Poți trece oricând pe „timp” din Profil.</p>}
          </>
        )}

        {STEPS[step] === 'Nivelul acum' && (
          <>
            <Q title="Cu ce ritm alergi acum?" hint="Ritmul obișnuit la o alergare ușoară. Scrii doar cifrele: 615 = 6:15 pe km.">
              <input className="date" inputMode="numeric" placeholder="ex. 6:15" value={a.alergare.ritmActual ?? ''} onChange={(e) => set({ alergare: { ...a.alergare, ritmActual: autoColon(e.target.value, false) } })} />
            </Q>
            <Q title={`Ai alergat vreodată ${raceWord}?`}>
              <Chips value={a.alergare.poateDistanta == null ? null : a.alergare.poateDistanta ? 'da' : 'nu'} options={[{ id: 'da', label: 'Da, știu în cât timp' }, { id: 'nu', label: 'Nu, niciodată distanța asta' }]} onChange={(v) => set({ alergare: { ...a.alergare, poateDistanta: v === 'da', rezultatActual: v === 'da' ? a.alergare.rezultatActual ?? null : null } })} />
            </Q>
            {a.alergare.poateDistanta && (
              <Q title="În cât timp sau cu ce ritm, cel mai recent?" hint="Ca să știm de la ce nivel pleci.">
                <RunResultInput value={a.alergare.rezultatActual} distanceKm={dist} onChange={(rezultatActual) => set({ alergare: { ...a.alergare, rezultatActual } })} />
              </Q>
            )}
            {a.alergare.poateDistanta === false && (
              <Q title="Un timp recent pe 5 km sau 10 km (dacă ai)" hint="Opțional: doar cifrele (2730 = 27:30). Din el judecăm ținta; fără el, primul test din plan o calibrează.">
                <div className="grid-2">
                  <input className="date" inputMode="numeric" placeholder="5 km, ex. 27:30" value={ev.alergare5k ?? ''} onChange={(e) => setEv({ alergare5k: autoColon(e.target.value, true) || null })} />
                  <input className="date" inputMode="numeric" placeholder="10 km, ex. 58:00" value={ev.alergare10k ?? ''} onChange={(e) => setEv({ alergare10k: autoColon(e.target.value, true) || null })} />
                </div>
              </Q>
            )}
            <Q title="Cea mai lungă alergare din ultimele 3 luni">
              <Stepper value={a.alergare.ceaMaiLungaKm} min={0} max={42} step={1} unit="km" fallback={5} onChange={(ceaMaiLungaKm) => set({ alergare: { ...a.alergare, ceaMaiLungaKm } })} />
            </Q>
          </>
        )}

        {STEPS[step] === 'Înot' && (
          <>
            <Q title="Cât înoți acum, fără să te oprești?" hint="Răspunde sincer: de aici pornesc ședințele de tehnică.">
              <Chips
                value={a.inot.nivel}
                options={[
                  { id: 'nu_stiu', label: 'Nu știu să înot bine' },
                  { id: 'bazin_scurt', label: 'Câteva lungimi', sub: 'cu pauze' },
                  { id: 'continuu_400', label: '400 m continuu' },
                  { id: 'peste_1500', label: 'Peste 1.500 m' },
                ]}
                onChange={(nivel) => set({ inot: { ...a.inot, nivel } })}
              />
            </Q>
            <Q title="Ape deschise?">
              <Chips value={a.inot.apeDeschise} options={[{ id: 'nu', label: 'Niciodată' }, { id: 'putin', label: 'De câteva ori' }, { id: 'da', label: 'Regulat' }]} onChange={(apeDeschise) => set({ inot: { ...a.inot, apeDeschise } })} />
            </Q>
            <Q title="Timpul tău pe 400 m (dacă îl știi)" hint="Opțional: scrii doar cifrele (830 = 8:30). Dacă nu-l știi, lasă gol: planul pune un test CSS în primele săptămâni.">
              <input className="date" inputMode="numeric" placeholder="ex. 8:30" value={ev.inot400 ?? ''} onChange={(e) => setEv({ inot400: autoColon(e.target.value, false) || null })} />
            </Q>
            <Q title="Ai acces la un bazin?">
              <Chips value={a.inot.bazin == null ? null : a.inot.bazin ? 'da' : 'nu'} options={[{ id: 'da', label: 'Da' }, { id: 'nu', label: 'Nu încă' }]} onChange={(v) => set({ inot: { ...a.inot, bazin: v === 'da' } })} />
            </Q>
          </>
        )}

        {STEPS[step] === 'Bicicletă' && (
          <>
            <Q title="Ce bicicletă ai?">
              <Chips value={a.bicicleta.tip} options={[{ id: 'sosea', label: 'Șosea' }, { id: 'tt', label: 'Triatlon / TT' }, { id: 'mtb', label: 'MTB / altceva' }, { id: 'nu_am', label: 'Nu am încă' }]} onChange={(tip) => set({ bicicleta: { ...a.bicicleta, tip } })} />
            </Q>
            {a.bicicleta.tip && a.bicicleta.tip !== 'nu_am' && (
              <>
                <div className="grid-2">
                  <Toggle label="Trainer acasă" value={a.bicicleta.trainer} onChange={(trainer) => set({ bicicleta: { ...a.bicicleta, trainer } })} />
                  <Toggle label="Senzor de putere" value={a.bicicleta.putere} onChange={(putere) => set({ bicicleta: { ...a.bicicleta, putere } })} />
                </div>
                <Q title="Viteza medie pe o tură obișnuită (dacă o știi)" hint="Opțional, pe teren plat, în km/h.">
                  <input className="date" type="number" inputMode="decimal" placeholder="ex. 27" value={ev.bicicletaViteza ?? ''} onChange={(e) => setEv({ bicicletaViteza: e.target.value ? Number(e.target.value) : null })} />
                </Q>
                {a.bicicleta.putere && (
                  <Q title="FTP (dacă îl știi)" hint="Opțional, în wați. Fără el, planul pune un test de 20 min.">
                    <input className="date" type="number" inputMode="numeric" placeholder="ex. 220" value={ev.ftp ?? ''} onChange={(e) => setEv({ ftp: e.target.value ? Number(e.target.value) : null })} />
                  </Q>
                )}
                <Q title="Cea mai lungă tură din ultimele 3 luni">
                  <Stepper value={a.bicicleta.ceaMaiLungaOre} min={0} max={6} step={0.5} unit="ore" fallback={1} onChange={(ceaMaiLungaOre) => set({ bicicleta: { ...a.bicicleta, ceaMaiLungaOre } })} />
                </Q>
              </>
            )}
          </>
        )}

        {STEPS[step] === 'Alergare' && (
          <>
            <Q title="Cea mai lungă alergare din ultimele 3 luni">
              <Stepper value={a.alergare.ceaMaiLungaKm} min={0} max={42} step={1} unit="km" fallback={5} onChange={(ceaMaiLungaKm) => set({ alergare: { ...a.alergare, ceaMaiLungaKm } })} />
            </Q>
            <Q title="Cu ce ritm alergi ușor acum?" hint="Opțional: scrii doar cifrele (615 = 6:15 pe km).">
              <input className="date" inputMode="numeric" placeholder="ex. 6:15" value={ev.ritmUsor ?? ''} onChange={(e) => setEv({ ritmUsor: autoColon(e.target.value, false) || null })} />
            </Q>
            <Q title="Un timp recent pe 5 km sau 10 km (dacă ai)" hint="Opțional: doar cifrele (2730 = 27:30). Dacă nu ai, lasă gol: planul pune un test de 30 min.">
              <div className="grid-2">
                <input className="date" inputMode="numeric" placeholder="5 km, ex. 27:30" value={ev.alergare5k ?? ''} onChange={(e) => setEv({ alergare5k: autoColon(e.target.value, true) || null })} />
                <input className="date" inputMode="numeric" placeholder="10 km, ex. 58:00" value={ev.alergare10k ?? ''} onChange={(e) => setEv({ alergare10k: autoColon(e.target.value, true) || null })} />
              </div>
            </Q>
            <Q title="Curse în ultimul an?">
              <Chips value={a.alergare.curseRecente} options={[{ id: 'niciuna', label: 'Niciuna' }, { id: '5-10', label: '5 sau 10 km' }, { id: 'semimaraton', label: 'Semimaraton' }, { id: 'maraton', label: 'Maraton' }]} onChange={(curseRecente) => set({ alergare: { ...a.alergare, curseRecente } })} />
            </Q>
          </>
        )}

        {STEPS[step] === 'Echipament' && (
          <>
            <Q title="Ce porți la antrenament?" hint="Brățările se conectează la final, din Profil, cu un singur buton fiecare.">
              <Chips value={a.echipament.ceas} options={[{ id: 'garmin', label: 'Garmin' }, { id: 'apple', label: 'Apple Watch' }, { id: 'altul', label: 'Alt ceas' }, { id: 'nu', label: 'Niciun ceas' }]} onChange={(ceas) => set({ echipament: { ...a.echipament, ceas } })} />
            </Q>
            <div className="stack" style={{ gap: 8 }}>
              <Toggle label="Whoop" value={a.echipament.whoop} onChange={(whoop) => set({ echipament: { ...a.echipament, whoop } })} />
              <Toggle label="Oura" value={a.echipament.oura} onChange={(oura) => set({ echipament: { ...a.echipament, oura } })} />
              <Toggle label="Cântar (zilnic, dimineața)" value={a.echipament.cantar} onChange={(cantar) => set({ echipament: { ...a.echipament, cantar } })} />
            </div>
          </>
        )}

        {STEPS[step] === 'Program' && (
          <>
          <Q title="Când poți să te antrenezi?" hint={fit ? `Atinge ferestrele în care poți ajunge la sală (cel puțin ${fx.minute ?? 45} de minute). Zilele de sală le alegem cât mai depărtate între ele.` : 'Atinge ferestrele libere dintr-o săptămână obișnuită. Planul se construiește doar în ele, cu 20% rezervă.'}>
            <ScheduleGrid value={a.program} onChange={(program) => set({ program })} />
            <AvailabilityDays blocks={a.program} />
          </Q>
          {!fit && (
          <Q title="Câte ore pe săptămână ai, realist, pentru sport?" hint="Timpul liber nu e timp de antrenament: familie, somn, drum. Planul nu trece de cifra asta.">
            <Chips value={a.oreSport != null ? String(a.oreSport) : null} options={['4', '6', '8', '10', '12', '14', '16', '20'].map((h) => ({ id: h, label: `${h} h` }))} onChange={(h) => set({ oreSport: Number(h) })} />
            <div className="budget">
              <span className="num md">{budget.toLocaleString('ro-RO')}</span>
              <span className="unit">ore pe săptămână pentru plan</span>
            </div>
            <div className="tiny muted">
              Timp liber bifat: {bud.freeHours.toLocaleString('ro-RO')} h. Pentru plan: cel mult 5 h pe zi, × 0,8{a.oreSport ? `, plafonat la ${a.oreSport} h` : ''}.
            </div>
          </Q>
          )}
          {!fit && (
          <Q title="Câte ore pe săptămână te-ai antrenat, în medie, în ultimele 2 luni?" hint="Opțional. Contează doar dacă nu ai activități importate de pe ceas: planul pornește de aici, nu de la zero. Nu deblochează intervale grele.">
            <Chips value={a.oreRecente != null ? String(a.oreRecente) : null} options={['0', '2', '4', '6', '8', '10', '12', '15'].map((h) => ({ id: h, label: h === '0' ? 'deloc' : `${h} h` }))} onChange={(h) => set({ oreRecente: Number(h) })} />
          </Q>
          )}
          </>
        )}

        {STEPS[step] === 'Sănătate' && (
          <>
            {fit ? (
              <Q title="Ești însărcinată sau în primul an după naștere?" hint="Opțional, rămâne privat. Dacă da, nu pornim programul de slăbire: alegem varianta de întreținere, iar recomandările se fac cu medicul.">
                <Chips value={fx.sarcina ?? null} options={[{ id: 'nu', label: 'Nu' }, { id: 'da', label: 'Da' }, { id: 'nu_spun', label: 'Prefer să nu spun' }]} onChange={(sarcina) => setFx({ sarcina })} />
              </Q>
            ) : (
              <Q title="Ai făcut un test de efort?" hint="Cu un test, zonele sunt ale tale; fără test, folosim zone estimate din vârstă, marcate provizorii. Dacă ai raportul, îl urci după chestionar din Profil → Date de bază → Test de efort.">
                <Chips value={ev.testEfort ?? null} options={[{ id: 'cpet', label: 'CPET', sub: 'ergospirometrie' }, { id: 'lactat', label: 'Test de lactat' }, { id: 'teren', label: 'Test de teren' }, { id: 'nu', label: 'Nu' }]} onChange={(testEfort) => setEv({ testEfort })} />
              </Q>
            )}
            <Q title={fit ? 'Dureri, accidentări sau restricții de la medic' : 'Accidentări sau dureri în ultimul an'} hint="Pe scurt, în cuvintele tale. Rămâne la fizio.">
              <TextBox value={a.sanatate.accidentari} onChange={(accidentari) => set({ sanatate: { ...a.sanatate, accidentari } })} placeholder="ex. genunchi drept, primăvară; tendon ahilean stâng" />
            </Q>
          </>
        )}

        {STEPS[step] === 'Ce te ține' && (
          <>
            <Q title={fit ? 'De ce vrei asta acum?' : 'Ce te motivează la cursa asta?'} hint="Un rând. Îl citește doar agentul Minte, când e nevoie.">
              <TextBox value={a.minte.motiveaza} onChange={(motiveaza) => set({ minte: { ...a.minte, motiveaza } })} placeholder={fit ? 'ex. să mă simt puternică; să am energie toată ziua' : 'ex. să termin alături de prieteni; să-mi dovedesc că pot'} />
            </Q>
            <Q title="Ce te-a oprit în trecut?">
              <TextBox value={a.minte.aOprit} onChange={(aOprit) => set({ minte: { ...a.minte, aOprit } })} placeholder="ex. programul de la radio; m-am accidentat când am forțat" />
            </Q>
          </>
        )}

        {STEPS[step] === 'Gata' && (
          <>
            <Q title="Ce urmează">
              <ul className="plain">
                {fit ? (
                  <>
                    <li>
                      {fx.experienta === 'stabila' ? `Până la ${Math.min(3, fx.zile ?? 2)} zile de sală de la început` : 'Două zile de sală în primele 4 săptămâni (F1/F2, tot corpul)'}{(fx.zile ?? 2) > 2 ? `, apoi treptat până la ${fx.zile}` : ''}, câte ~{fx.minute ?? 45} min, în zilele cele mai depărtate din ferestrele tale.
                    </li>
                    <li>Fiecare ședință: exercițiile, seriile, repetările, pauza și cât să lași în rezervă. Greutățile le alegi tu; nu inventăm kilograme.</li>
                    <li>Mersul și cardio-ul cresc treptat, ca recomandare a săptămânii, nu ca obligație.</li>
                  </>
                ) : (
                  <li>
                    Primul calendar pe <b>{budget.toLocaleString('ro-RO')} h</b> pe săptămână, din ferestrele tale.
                  </li>
                )}
                {fit ? null : runGoal ? (
                  <li>
                    Doar alergare și forță. Ținta: {(() => {
                      const p = paceFromResult(a.alergare.tinta, dist);
                      return p ? `${fmtPaceSec(p)} min/km, ${fmtDuration(p * dist)}` : '–';
                    })()}
                    .
                  </li>
                ) : (
                  <li>Înot: {a.inot.nivel === 'nu_stiu' || a.inot.nivel === 'bazin_scurt' ? 'tehnică înainte de volum, fără ritmuri până la 400 m continuu' : 'CSS se testează la prima ședință'}.</li>
                )}
                <li>Brățările se conectează din Profil; până atunci bara rămâne „fără date”.</li>
              </ul>
            </Q>
            <Toggle label="Am peste 18 ani, înțeleg că nu e serviciu medical și sunt de acord cu folosirea datelor de sănătate pentru planul meu. Le pot șterge oricând." value={a.consimtamant} onChange={(consimtamant) => set({ consimtamant })} />
          </>
        )}
      </div>

      {info && (
        <div className="q" style={{ marginTop: 12 }}>
          <p className="hint" style={{ color: 'var(--c-rosu)' }}>{info}</p>
        </div>
      )}
      <div className="wizard-nav">
        <button className="btn dark" onClick={back}>
          {step === 0 ? 'Renunț' : 'Înapoi'}
        </button>
        <button className="btn" onClick={() => void next()} disabled={!canContinue || busy}>
          {busy ? 'Generez…' : step === STEPS.length - 1 ? 'Generează planul' : 'Continuă'} {Icons.arrowRight}
        </button>
      </div>
    </>
  );
}
