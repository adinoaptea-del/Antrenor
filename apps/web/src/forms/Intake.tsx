import { useState } from 'react';
import { weeklyBudget } from '@core/calendar/budget.js';
import { CircleBtn, Icons, LiveTitle } from '../ui/common';
import { Chips, Progress, Q, ScheduleGrid, Stepper, TextBox, Toggle } from './controls';
import { useData, useMe } from '../data/store';
import { EMPTY_INTAKE, runResultOk, type IntakeAnswers } from './types';
import { isRunGoal, RUN_DISTANCE_KM } from '@core/calendar/phases.js';
import { fmtDuration, fmtPaceSec, paceFromResult, parsePace, type RunResult } from '@core/util/run.js';

// Chestionarul de intrare: un grup de întrebări pe ecran, totul de atins, 3–4 minute. Răspunsurile dau planul.
const TRI_STEPS = ['Obiectiv', 'Înot', 'Bicicletă', 'Alergare', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
const RUN_STEPS = ['Obiectiv', 'Ținta', 'Nivelul acum', 'Echipament', 'Program', 'Sănătate', 'Ce te ține', 'Gata'] as const;
type Step = (typeof TRI_STEPS)[number] | (typeof RUN_STEPS)[number];

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
        placeholder={mod === 'timp' ? 'ex. 1:55:00 (ore:min:sec)' : 'ex. 5:30 (min:sec pe km)'}
        value={value?.valoare ?? ''}
        onChange={(e) => onChange({ mod, valoare: e.target.value })}
      />
      {pace != null && <p className="hint">{mod === 'timp' ? `adică ${fmtPaceSec(pace)} min/km` : `adică ${fmtDuration(pace * distanceKm)} timp final`}</p>}
    </>
  );
}

export function Intake({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const me = useMe();
  const { submitForm } = useData();
  const saved = me.forms.intake as IntakeAnswers | null;
  const [a, setA] = useState<IntakeAnswers>(saved ?? { ...EMPTY_INTAKE, dataCursa: me.user.raceDate ?? EMPTY_INTAKE.dataCursa });
  const [step, setStep] = useState(0);
  const runGoal = isRunGoal(a.obiectiv);
  const STEPS: readonly Step[] = runGoal ? RUN_STEPS : TRI_STEPS;
  const dist = runGoal ? RUN_DISTANCE_KM[a.obiectiv as 'semimaraton' | 'maraton'] : 0;
  const raceWord = a.obiectiv === 'maraton' ? 'un maraton' : 'un semimaraton';
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const set = (patch: Partial<IntakeAnswers>) => setA((prev) => ({ ...prev, ...patch }));
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
  const budget = weeklyBudget(a.program).hours;

  const canContinue = (() => {
    switch (STEPS[step]) {
      case 'Obiectiv':
        return a.nume.trim().length > 0 && !!a.dataCursa;
      case 'Înot':
        return a.inot.nivel != null && a.inot.apeDeschise != null && a.inot.bazin != null;
      case 'Bicicletă':
        return a.bicicleta.tip != null && (a.bicicleta.tip === 'nu_am' || (a.bicicleta.trainer != null && a.bicicleta.putere != null && a.bicicleta.ceaMaiLungaOre != null));
      case 'Alergare':
        return a.alergare.ceaMaiLungaKm != null && a.alergare.curseRecente != null;
      case 'Ținta':
        return runResultOk(a.alergare.tinta);
      case 'Nivelul acum':
        return parsePace(a.alergare.ritmActual) != null && a.alergare.poateDistanta != null && (!a.alergare.poateDistanta || runResultOk(a.alergare.rezultatActual)) && a.alergare.ceaMaiLungaKm != null;
      case 'Echipament':
        return a.echipament.ceas != null;
      case 'Program':
        return a.program.length > 0;
      case 'Sănătate':
        return a.sanatate.avizCardiolog != null;
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
            <Q title="Cum te cheamă?" hint="Așa îți spune head coach-ul.">
              <input className="date" type="text" autoComplete="given-name" placeholder="prenumele" value={a.nume} onChange={(e) => set({ nume: e.target.value })} />
            </Q>
            <Q title="Pentru ce te pregătești?" hint="Obiectivul decide fazele, orele și ce înseamnă „gata”.">
              <Chips
                value={a.obiectiv}
                options={[
                  { id: '70.3', label: 'Ironman 70.3', sub: '1,9 km · 90 km · 21 km' },
                  { id: 'olimpic', label: 'Olimpic', sub: '1,5 · 40 · 10' },
                  { id: 'sprint', label: 'Sprint', sub: '0,75 · 20 · 5' },
                  { id: 'full', label: 'Ironman', sub: '3,8 · 180 · 42' },
                  { id: 'semimaraton', label: 'Semimaraton', sub: 'doar alergare · 21,1 km' },
                  { id: 'maraton', label: 'Maraton', sub: 'doar alergare · 42,2 km' },
                ]}
                onChange={(obiectiv) => set({ obiectiv })}
              />
            </Q>
            <Q title="Data cursei">
              <input className="date" type="date" value={a.dataCursa} onChange={(e) => set({ dataCursa: e.target.value })} />
            </Q>
          </>
        )}

        {STEPS[step] === 'Ținta' && (
          <Q title="Ce vrei să reușești?" hint={`Cu ce ritm vrei să alergi ${raceWord}, sau în cât timp. Din asta ies ritmurile de la antrenamentele specifice.`}>
            <RunResultInput value={a.alergare.tinta} distanceKm={dist} onChange={(tinta) => set({ alergare: { ...a.alergare, tinta } })} />
          </Q>
        )}

        {STEPS[step] === 'Nivelul acum' && (
          <>
            <Q title="Cu ce ritm alergi acum?" hint="Ritmul obișnuit la o alergare ușoară, în minute pe km.">
              <input className="date" inputMode="numeric" placeholder="ex. 6:15" value={a.alergare.ritmActual ?? ''} onChange={(e) => set({ alergare: { ...a.alergare, ritmActual: e.target.value } })} />
            </Q>
            <Q title={`Poți alerga acum ${raceWord}?`}>
              <Chips value={a.alergare.poateDistanta == null ? null : a.alergare.poateDistanta ? 'da' : 'nu'} options={[{ id: 'da', label: 'Da' }, { id: 'nu', label: 'Nu încă' }]} onChange={(v) => set({ alergare: { ...a.alergare, poateDistanta: v === 'da', rezultatActual: v === 'da' ? a.alergare.rezultatActual ?? null : null } })} />
            </Q>
            {a.alergare.poateDistanta && (
              <Q title="În cât timp sau cu ce ritm?" hint="Ca să știm de la ce nivel pleci.">
                <RunResultInput value={a.alergare.rezultatActual} distanceKm={dist} onChange={(rezultatActual) => set({ alergare: { ...a.alergare, rezultatActual } })} />
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
          <Q title="Când poți să te antrenezi?" hint="Atinge ferestrele libere dintr-o săptămână obișnuită. Planul se construiește doar în ele, cu 20% rezervă.">
            <ScheduleGrid value={a.program} onChange={(program) => set({ program })} />
            <div className="budget">
              <span className="num md">{budget.toLocaleString('ro-RO')}</span>
              <span className="unit">ore pe săptămână pentru plan</span>
            </div>
          </Q>
        )}

        {STEPS[step] === 'Sănătate' && (
          <>
            <Q title="Aviz cardiologic pentru efort?" hint="Fără aviz, planul rămâne la Z1–Z2: fără intensitate, oricât de bine ai sta.">
              <Chips value={a.sanatate.avizCardiolog === 'programat' ? 'nu' : a.sanatate.avizCardiolog} options={[{ id: 'da', label: 'Am aviz' }, { id: 'nu', label: 'Nu am aviz' }]} onChange={(avizCardiolog) => set({ sanatate: { ...a.sanatate, avizCardiolog } })} />
            </Q>
            <Q title="Accidentări sau dureri în ultimul an" hint="Pe scurt, în cuvintele tale. Rămâne la fizio.">
              <TextBox value={a.sanatate.accidentari} onChange={(accidentari) => set({ sanatate: { ...a.sanatate, accidentari } })} placeholder="ex. genunchi drept, primăvară; tendon ahilean stâng" />
            </Q>
          </>
        )}

        {STEPS[step] === 'Ce te ține' && (
          <>
            <Q title="Ce te motivează la cursa asta?" hint="Un rând. Îl citește doar agentul Minte, când e nevoie.">
              <TextBox value={a.minte.motiveaza} onChange={(motiveaza) => set({ minte: { ...a.minte, motiveaza } })} placeholder="ex. să termin alături de prieteni; să-mi dovedesc că pot" />
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
                <li>
                  Primul calendar pe <b>{budget.toLocaleString('ro-RO')} h</b> pe săptămână, din ferestrele tale.
                </li>
                <li>Intensitate: {a.sanatate.avizCardiolog === 'da' ? 'după zonele testate' : 'doar Z1–Z2 până la avizul cardiologic'}.</li>
                {runGoal ? (
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
