import { hooperSum } from '@core/collector/readiness.js';
import { useState } from 'react';
import type { PlannedWorkout } from '@core/types.js';
import { CircleBtn, DAY_NAMES, Icons, LiveTitle, fmtDayMonth, fmtMinutes } from '../ui/common';
import { weekday } from '@core/util/dates.js';
import { Chips, Q, Scale, TextBox, Toggle } from './controls';
import { useData, useMe } from '../data/store';
import { emptyEvening, emptyMorning, type EveningForm, type MorningForm, type WeeklyForm } from './types';
import { SPORT_LABEL, TYPE_LABEL } from '../data/model';

// Dimineața: 4 note Hooper (1 = foarte bine, 7 = foarte rău) + 4 semnale. Ținta: 20 de secunde.
export function Morning({ date, onBack, onDone }: { date: string; onBack: () => void; onDone: () => void }) {
  const me = useMe();
  const { submitForm } = useData();
  const saved = me.forms.morning as MorningForm | null;
  const [m, setM] = useState<MorningForm>(saved && saved.date === date ? saved : emptyMorning(date));
  const [busy, setBusy] = useState(false);
  const setH = (k: keyof MorningForm['hooper'], v: number) => setM({ ...m, hooper: { ...m.hooper, [k]: v } });
  const setS = (k: keyof MorningForm['semnale'], v: boolean) => setM({ ...m, semnale: { ...m.semnale, [k]: v } });
  // Contează și răspunsurile parțiale: suma = media celor răspunse × 4 (aceleași praguri).
  const { suma, raspunse } = hooperSum(m.hooper);
  const anyAnswer = raspunse > 0 || Object.values(m.semnale).some((v) => v === true);

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Dimineața</LiveTitle>
        </div>
        <div className="top-r">
          <span className="small muted">{fmtDayMonth(date)}</span>
        </div>
      </header>

      <div className="wizard">
        <p className="hint" style={{ marginTop: 0 }}>
          Patru note, 1 = foarte bine, 7 = foarte rău. Răspunde la ce poți: contează și dacă sari peste una. Se țin minte și se compară cu zilele tale trecute.
        </p>
        <Q title="Somnul de azi-noapte">
          <Scale value={m.hooper.somn} min={1} max={7} onChange={(v) => setH('somn', v)} lowLabel="odihnit" highLabel="distrus" />
        </Q>
        <Q title="Oboseală">
          <Scale value={m.hooper.oboseala} min={1} max={7} onChange={(v) => setH('oboseala', v)} lowLabel="proaspăt" highLabel="epuizat" />
        </Q>
        <Q title="Stres">
          <Scale value={m.hooper.stres} min={1} max={7} onChange={(v) => setH('stres', v)} lowLabel="liniștit" highLabel="copleșit" />
        </Q>
        <Q title="Dureri musculare">
          <Scale value={m.hooper.dureri} min={1} max={7} onChange={(v) => setH('dureri', v)} lowLabel="nimic" highLabel="peste tot" />
        </Q>
        <Q title="Semnale" hint="Rămân pe „nu” dacă nu e cazul. Un „da” la febră sau simptom cardiac oprește antrenamentul și te trimite la om.">
          <div className="grid-2">
            <Toggle label="Boală (răceală, gât)" value={m.semnale.boala} onChange={(v) => setS('boala', v)} />
            <Toggle label="Febră" value={m.semnale.febra} onChange={(v) => setS('febra', v)} danger />
            <Toggle label="Deplasare / drum" value={m.semnale.deplasare} onChange={(v) => setS('deplasare', v)} />
            <Toggle label="Simptom cardiac" value={m.semnale.simptom_cardiac} onChange={(v) => setS('simptom_cardiac', v)} danger />
          </div>
        </Q>
      </div>

      <div className="wizard-nav">
        <div className="small muted">{suma == null ? 'Cum te simți: –' : `Cum te simți: ${suma}/28${raspunse < 4 ? ` (din ${raspunse} răspunsuri)` : ''} · ${suma >= 24 ? 'roșu' : suma >= 22 ? 'portocaliu' : suma >= 20 ? 'galben' : 'în regulă'}`}</div>
        <button
          className="btn"
          disabled={!anyAnswer || busy}
          onClick={() => {
            setBusy(true);
            submitForm('dimineata', m)
              .then(() => onDone())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Trimit…' : 'Gata'} {Icons.check}
        </button>
      </div>
    </>
  );
}

const PAIN_LOC = ['gambă', 'tibie', 'tendon ahilean', 'genunchi', 'șold', 'spate', 'umăr', 'altundeva'];

// Seara / după antrenament: 7 câmpuri, toate de atins; comentariul e opțional.
export function Evening({ workout, activityId, unplanned, onBack, onDone }: { workout: PlannedWorkout | null; activityId: string; unplanned?: { date: string; sport: string; minutes: number; distanceKm?: number | null } | null; onBack: () => void; onDone: () => void }) {
  const date = workout?.date ?? unplanned?.date ?? new Date().toISOString().slice(0, 10);
  const me = useMe();
  const { submitForm } = useData();
  const saved = me.forms.evening[activityId];
  const [e, setE] = useState<EveningForm>(saved ?? emptyEvening(date, activityId));
  const [busy, setBusy] = useState(false);
  const complete = e.rpe != null && e.fata_de_asteptari != null && e.durere.scor != null && (!unplanned || e.tip_neplanificat != null);
  const title = workout ? `${SPORT_LABEL[workout.sport]}${workout.type === 'forta' ? '' : ` ${TYPE_LABEL[workout.type]}`} · ${fmtMinutes(workout.plannedMinutes)}` : unplanned ? `${unplanned.sport} · ${fmtMinutes(unplanned.minutes)}${unplanned.distanceKm ? ` · ${unplanned.distanceKm.toLocaleString('ro-RO')} km` : ''}` : 'Antrenament';

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Cum a fost</LiveTitle>
        </div>
        <div className="top-r">
          <span className="small muted">{DAY_NAMES[weekday(date)]}</span>
        </div>
      </header>

      <div className="wizard">
        <div className="pill" style={{ marginBottom: 4 }}>
          {Icons.target} {title}
        </div>
        {unplanned && (
          <Q title="A fost în afara planului. Ce a fost?" hint="Se cuantifică și se ține cont de ea în planul următor, nu se adaugă peste.">
            <Chips value={e.tip_neplanificat ?? null} options={[{ id: 'cursa', label: 'Cursă' }, { id: 'antrenament', label: 'Antrenament liber' }, { id: 'altceva', label: 'Altceva', sub: 'plimbare, joacă' }]} onChange={(tip_neplanificat) => setE({ ...e, tip_neplanificat })} />
          </Q>
        )}
        <Q title="Cât de greu a fost?" hint="RPE: 0 = nimic, 10 = maximul vieții.">
          <Scale value={e.rpe} min={0} max={10} onChange={(rpe) => setE({ ...e, rpe })} lowLabel="nimic" highLabel="maxim" />
        </Q>
        <Q title="Față de cum te așteptai">
          <Chips value={e.fata_de_asteptari} options={[{ id: 'mai_usor', label: 'Mai ușor' }, { id: 'la_fel', label: 'Cum mă așteptam' }, { id: 'mai_greu', label: 'Mai greu' }]} onChange={(fata_de_asteptari) => setE({ ...e, fata_de_asteptari })} />
        </Q>
        <Q title="A durut ceva?" hint="0 = nimic. De la 3 în sus, alergarea devine fără impact 5 zile; de la 5, fizioterapeut în aceeași zi.">
          <Scale value={e.durere.scor} min={0} max={10} onChange={(scor) => setE({ ...e, durere: { scor, loc: scor === 0 ? null : e.durere.loc } })} lowLabel="nimic" highLabel="nu pot călca" />
          {(e.durere.scor ?? 0) > 0 && (
            <div style={{ marginTop: 10 }}>
              <Chips value={e.durere.loc} options={PAIN_LOC.map((l) => ({ id: l, label: l }))} onChange={(loc) => setE({ ...e, durere: { ...e.durere, loc } })} />
            </div>
          )}
        </Q>
        <Q title="Ce a încurcat?">
          <Chips value={e.ce_a_incurcat} options={[{ id: 'nimic', label: 'Nimic' }, { id: 'somn', label: 'Somnul' }, { id: 'mancare', label: 'Mâncarea' }, { id: 'stres', label: 'Stresul' }, { id: 'vreme', label: 'Vremea' }, { id: 'timp', label: 'Timpul' }]} onChange={(ce_a_incurcat) => setE({ ...e, ce_a_incurcat })} />
        </Q>
        <Q title="Ai mâncat și băut cum era planul?">
          <Chips value={e.fueling_conform} options={[{ id: 'da', label: 'Da' }, { id: 'partial', label: 'Parțial' }, { id: 'nu', label: 'Nu' }]} onChange={(fueling_conform) => setE({ ...e, fueling_conform })} />
        </Q>
        <Q title="Un gând, dacă e" hint="Opțional. Îl citesc antrenorul sportului și, dacă e cazul, Minte.">
          <TextBox value={e.comentariu ?? ''} onChange={(comentariu) => setE({ ...e, comentariu: comentariu || null })} placeholder="ex. ultimii 10 min grei; am uitat gelul" />
        </Q>
      </div>

      <div className="wizard-nav">
        <div className="small muted">{complete ? 'Intră în pachet diseară' : 'RPE, așteptări și durere sunt necesare'}</div>
        <button
          className="btn"
          disabled={!complete || busy}
          onClick={() => {
            setBusy(true);
            submitForm('seara', e)
              .then(() => onDone())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Trimit…' : 'Trimite'} {Icons.check}
        </button>
      </div>
    </>
  );
}

// Duminica: trei întrebări pentru review-ul săptămânal.
export function Weekly({ weekStart, onBack, onDone }: { weekStart: string; onBack: () => void; onDone: () => void }) {
  const { submitForm } = useData();
  const [w, setW] = useState<WeeklyForm>({ weekStart, energie: null, aMers: '', aOprit: null });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Săptămâna</LiveTitle>
        </div>
        <div className="top-r">
          <span className="small muted">din {fmtDayMonth(weekStart)}</span>
        </div>
      </header>
      <div className="wizard">
        <Q title="Energia pe toată săptămâna">
          <Scale value={w.energie} min={1} max={5} onChange={(v) => setW({ ...w, energie: v as WeeklyForm['energie'] })} lowLabel="pe jantă" highLabel="plin" />
        </Q>
        <Q title="Ce te-a oprit, dacă ceva?">
          <Chips value={w.aOprit} options={[{ id: 'nimic', label: 'Nimic' }, { id: 'timp', label: 'Timpul' }, { id: 'oboseala', label: 'Oboseala' }, { id: 'durere', label: 'O durere' }, { id: 'motivatie', label: 'Cheful' }, { id: 'vreme', label: 'Vremea' }]} onChange={(aOprit) => setW({ ...w, aOprit })} />
        </Q>
        <Q title="Ce a mers?">
          <TextBox value={w.aMers} onChange={(aMers) => setW({ ...w, aMers })} placeholder="un rând" />
        </Q>
      </div>
      <div className="wizard-nav">
        <div />
        <button
          className="btn"
          disabled={w.energie == null || w.aOprit == null || busy}
          onClick={() => {
            setBusy(true);
            submitForm('saptamanal', w)
              .then(() => onDone())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Trimit…' : 'Gata'} {Icons.check}
        </button>
      </div>
    </>
  );
}
