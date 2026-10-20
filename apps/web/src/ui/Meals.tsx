import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackDetail } from '../data/usage';
import { BurstAtTap, useOpenOrigin } from './OpenFrom';
import { ALL_ALLERGENS, ALLERGEN_LABEL, type Allergen } from '@core/nutrition/foods.js';
import { NUTRITION_DISCLAIMER, alternatives, nutritionDay, type AltPreview, type Diet, type Meal } from '@core/nutrition/engine.js';
import { stateOf, type MealLogEntry } from '@core/nutrition/log.js';
import { nutritionInputFromMe, recentRecipes } from '@core/nutrition/from-me.js';
import { Card, Icons, Label } from './common';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';

const ALLERGENS: Allergen[] = ALL_ALLERGENS;
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const ron = (x: number) => `${x.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const STATE_WORD = { suggested: 'propusă', accepted: 'acceptată', replaced: 'schimbată de tine', consumed: 'mâncată' } as const;

/**
 * „Mese recomandate pentru azi”: ținta, mesele și alimentarea din efort sunt calculate în cod (src/nutrition), din
 * aceeași zi a planului pe care o vezi; nimic nu e inventat de AI. Fiecare masă: ce și cât, cum, de ce, alternativă.
 * După „Schimbă” toată ziua se revalidează (energie, proteine, alergeni, buget, mese) și diferența rămasă e la vedere.
 */
export function Meals({ onOpen }: { onOpen: (s: string) => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const input = useMemo(() => nutritionInputFromMe(me), [me]);
  const day = useMemo(() => nutritionDay(input), [input]);
  const prefs = input.prefs;
  const [open, setOpen] = useState<string | null>(null);
  const [swap, setSwap] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const recent = useMemo(() => (swap ? recentRecipes(me) : []), [me, swap]);
  const alts = useMemo(() => (swap ? alternatives(input, swap as Meal['slot'], recent) : []), [input, swap, recent]);
  const logToday = useMemo(() => prefs.log?.[me.today] ?? [], [prefs.log, me.today]);

  // Jurnalul (auditul v93, A84): ce s-a propus azi se scrie o dată (și se actualizează cât timp n-ai atins masa), ca
  // zilele trecute să rămână cum au fost, chiar dacă schimbi preferințele.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (local) return;
    const base = day.meals.filter((m) => m.label !== 'Gustare cu proteine' && !m.label.startsWith('Gustare în'));
    const need = base.filter((m) => {
      const e = logToday.find((x) => x.slot === m.slot);
      return !e || (stateOf(e) === 'suggested' && e.suggested !== m.recipe.id && !prefs.choices?.[me.today]?.[m.slot]);
    });
    const key = `${me.today}:${base.map((m) => m.recipe.id).join(',')}`;
    if (!need.length || sent.current === key) return;
    sent.current = key;
    void submitForm('nutritie', { jurnal: { date: me.today, meals: base.map((m) => ({ slot: m.slot, recipeId: m.recipe.id })) } }).catch(() => {
      sent.current = null;
    });
  }, [day, logToday, local, me.today, prefs.choices, submitForm]);

  const choose = async (m: Meal, recipeId: string | null) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const suggested = logToday.find((x) => x.slot === m.slot)?.suggested ?? (prefs.choices?.[me.today]?.[m.slot] ? null : m.recipe.id);
      await submitForm('nutritie', { alegere: { date: me.today, slot: m.slot, recipeId, suggested } });
      setSwap(null);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const eaten = async (m: Meal, da: boolean | null) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await submitForm('nutritie', { consumat: { date: me.today, slot: m.slot, da } });
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const e = day.energy;
  const c = day.check;
  const mac = day.macros;
  return (
    <div className="stack">
      <Card>
        <Label icon={Icons.bowl}>Mese recomandate · azi</Label>
        {e ? (
          <div className="meal-target">
            <b>
              {n0(e.low)}–{n0(e.high)} kcal
            </b>
            <span className="small muted">
              țintă estimată · proteine ~{n0(day.protein!.target)} g ({day.protein!.gPerKg.toLocaleString('ro-RO')} g/kg)
              {mac ? ` · carbohidrați ${n0(mac.carbs.g[0])}–${n0(mac.carbs.g[1])} g (${mac.carbs.gPerKg[0]}–${mac.carbs.gPerKg[1]} g/kg) · grăsimi ${n0(mac.fat.g[0])}–${n0(mac.fat.g[1])} g` : ''}
            </span>
          </div>
        ) : (
          <div className="warn-line">
            {day.missing.length ? <>Porții de referință, nu personalizate. Lipsește: {day.missing.join(', ')}. </> : null}
            {day.missing.some((m) => m.startsWith('greutatea')) && (
              <button className="linkish" onClick={() => onOpen('corp')}>
                Adaugă greutatea
              </button>
            )}
          </div>
        )}
        <p className={day.complete ? 'small' : 'small warn-line'} style={{ marginTop: 8 }}>
          {day.message}
        </p>
        <div className="small muted">
          {c.meals.main} {c.meals.main === 1 ? 'masă' : 'mese'}
          {c.meals.extra ? ` + ${c.meals.extra} în plus` : ''} · {n0(day.totals.kcal)} kcal
          {day.fuel.length ? ` + ${n0(day.totals.dayKcal - day.totals.kcal)} kcal în efort = ${n0(day.totals.dayKcal)} kcal` : ''} · {n0(day.totals.protein)} g proteine ·{' '}
          {day.totals.costComplete ? `~${ron(day.totals.costKnown)}` : 'cost incomplet (lipsesc prețuri)'}
        </div>
        {c.energy && !c.energy.inRange && (
          <div className="tiny warn-line" style={{ marginTop: 4 }}>
            Diferența rămasă față de țintă: {c.energy.gap > 0 ? `lipsesc ~${n0(c.energy.gap)} kcal` : `~${n0(-c.energy.gap)} kcal peste`}
            {c.protein && c.protein.gap > 0 ? ` · proteine: lipsesc ~${n0(c.protein.gap)} g` : ''}
          </div>
        )}
        {day.budgetNote && <div className={`tiny ${c.budget.status === 'peste' ? 'warn-line' : 'muted'}`} style={{ marginTop: 4 }}>{day.budgetNote}</div>}
      </Card>

      {(day.fuel.length > 0 || day.fuelNotes.length > 0) && (
        <Card tight>
          <Label icon={Icons.droplet}>În timpul efortului</Label>
          {day.fuel.map((f) => (
            <div key={f.sessionLabel} className="small" style={{ marginTop: 6 }}>
              <b>{f.sessionLabel}:</b> ~{f.plannedG} g carbohidrați în total ({f.carbsPerHour[0]}–{f.carbsPerHour[1]} g/oră); {f.note}. Intră o singură dată în totalul zilei.
            </div>
          ))}
          {day.fuelNotes.map((n) => (
            <div key={n} className="tiny muted" style={{ marginTop: 6 }}>
              {n.charAt(0).toUpperCase() + n.slice(1)}.
            </div>
          ))}
        </Card>
      )}

      {day.meals.map((m) => (
        <MealCard
          key={m.slot + m.recipe.id + m.label}
          m={m}
          open={open === m.label}
          onToggle={() => setOpen(open === m.label ? null : m.label)}
          swapping={swap === m.slot}
          onSwap={() => setSwap(swap === m.slot ? null : m.slot)}
          alts={swap === m.slot ? alts : []}
          chosen={!!prefs.choices?.[me.today]?.[m.slot]}
          log={m.label.startsWith('Gustare în') || m.label === 'Gustare cu proteine' ? null : (logToday.find((x) => x.slot === m.slot) ?? null)}
          onChoose={(id) => void choose(m, id)}
          onEaten={(da) => void eaten(m, da)}
          busy={busy || local}
        />
      ))}
      {msg && <div className="wk-note">{msg}</div>}

      {day.supplements.length > 0 && (
        <Card tight>
          <Label icon={Icons.bowl}>Suplimente (opțional)</Label>
          {day.supplements.map((s) => (
            <div key={s.kind} className="small" style={{ marginTop: 6 }}>
              {s.text.charAt(0).toUpperCase() + s.text.slice(1)}.
            </div>
          ))}
        </Card>
      )}

      {day.warnings.length > 0 && (
        <ul className="str-notes">
          {day.warnings.map((w) => (
            <li key={w}>{w.charAt(0).toUpperCase() + w.slice(1)}.</li>
          ))}
        </ul>
      )}

      <Card tight>
        <button className="exp-row" onClick={() => setEdit(!edit)} aria-expanded={edit}>
          <span>
            <b>Preferințe</b>
            <small>
              {prefs.diet}
              {prefs.exclude.length ? ` · fără ${prefs.exclude.join(', ')}` : ''} · {prefs.meals} {prefs.meals === 1 ? 'masă' : 'mese'}
              {prefs.mealTimes?.length ? ` (${prefs.mealTimes.map(hhmm).join(', ')})` : ''}
              {prefs.currentMeals ? ` (acum ${prefs.currentMeals})` : ''} · {prefs.snacksOk === false ? 'fără gustări' : 'gustări acceptate'} · {prefs.budget ? `${prefs.budget} RON/zi` : 'fără buget'}
              {prefs.allergiesConfirmed ? '' : ' · alergii neconfirmate'}
            </small>
          </span>
          {Icons.chevronDown}
        </button>
        {edit && <PrefsForm onDone={() => setEdit(false)} />}
      </Card>

      {e && (
        <details className="small muted meal-how">
          <summary>Cum am calculat</summary>
          <ul className="meal-items">
            {e.method.map((l) => (
              <li key={l}>{l.charAt(0).toUpperCase() + l.slice(1)}.</li>
            ))}
          </ul>
          {mac && <p>{mac.explain.charAt(0).toUpperCase() + mac.explain.slice(1)}.</p>}
          <p>Compoziția: CoFID 2021, USDA și eticheta producătorului; prețurile: Auchan online, 19.10.2026 (nu toate alimentele au preț). Vitaminele meselor nu sunt calculate.</p>
        </details>
      )}
      <p className="tiny muted">{NUTRITION_DISCLAIMER}</p>
    </div>
  );
}

function MealCard({ m, open, onToggle, swapping, onSwap, alts, chosen, log, onChoose, onEaten, busy }: { m: Meal; open: boolean; onToggle: () => void; swapping: boolean; onSwap: () => void; alts: AltPreview[]; chosen: boolean; log: MealLogEntry | null; onChoose: (id: string | null) => void; onEaten: (da: boolean | null) => void; busy: boolean }) {
  const st = log ? stateOf(log) : null;
  return (
    <Card tight>
      <button className="exp-row" onClick={onToggle} aria-expanded={open}>
        <span>
          <small>
            {m.label}
            {st && st !== 'suggested' ? ` · ${STATE_WORD[st]}` : ''}
          </small>
          <b>{m.recipe.name}</b>
          <small>
            {n0(m.kcal)} kcal · {n0(m.protein)} g proteine · {m.cost != null ? ron(m.cost) : 'preț incomplet'} · ~{m.recipe.minutes} min
          </small>
        </span>
        {Icons.chevronDown}
      </button>
      <div className="small" style={{ marginTop: 4 }}>{m.items.map((it) => `${it.qty} ${it.unit} ${it.name.split(',')[0]!.toLowerCase()}`).join(' · ')}</div>
      {m.why && <div className="tiny" style={{ marginTop: 4 }}>{m.why}</div>}
      {open && (
        <MealOpen>
          <div className="sheet-k">Ce și cât (cântărit cum scrie)</div>
          <ul className="meal-items">
            {m.items.map((it) => (
              <li key={it.food}>
                <b>
                  {it.qty} {it.unit}
                </b>{' '}
                {it.name.toLowerCase()}
              </li>
            ))}
          </ul>
          <div className="sheet-k">Cum</div>
          <p className="small">
            {m.recipe.steps}
            {m.recipe.note ? ` ${m.recipe.note}` : ''}
          </p>
          <div className="tiny muted">
            Alergeni: {m.allergens.length ? m.allergens.map((a) => ALLERGEN_LABEL[a]).join(', ') : 'niciunul din cei urmăriți'} (verifică etichetele){m.missingPrices.length ? ` · fără preț: ${m.missingPrices.join(', ')}` : ''}
            {m.repeat ? ' · se repetă mai des decât regula, din cauza preferințelor' : ''}
          </div>
        </MealOpen>
      )}
      <div className="wk-btns" style={{ marginTop: 8 }}>
        <button className="pill" onClick={onSwap} disabled={busy} aria-expanded={swapping}>
          Schimbă
        </button>
        {chosen && (
          <button className="pill" onClick={() => onChoose(null)} disabled={busy}>
            Înapoi la propunere
          </button>
        )}
        {log && (
          <button className={`pill ${log.consumed === true ? 'on' : ''}`} onClick={() => onEaten(log.consumed === true ? null : true)} disabled={busy} aria-pressed={log.consumed === true}>
            {log.consumed === true ? 'Mâncată' : 'Am mâncat'}
          </button>
        )}
      </div>
      {swapping && (
        <div className="meal-alts">
          {alts.length === 0 && <div className="small muted">Nu e altă variantă eligibilă (preferințe, alergii, fără repetare recentă).</div>}
          {alts.map((a) => (
            <button key={a.id} className="adapt-opt" onClick={() => onChoose(a.id)} disabled={busy}>
              <b>{a.name}</b>
              <span>
                {n0(a.kcal)} kcal · {n0(a.protein)} g proteine · {a.cost != null ? ron(a.cost) : 'preț incomplet'}
              </span>
              <span className="tiny muted">
                ziua: {n0(a.day.kcal)} kcal{a.day.gapKcal != null ? (a.day.gapKcal > 0 ? `, lipsesc ~${n0(a.day.gapKcal)}` : `, ~${n0(-a.day.gapKcal)} peste`) : ''} · {a.day.protein} g proteine
                {a.day.budget === 'peste' ? ' · peste buget' : a.day.budget === 'necunoscut' ? ' · buget neverificabil (prețuri lipsă)' : a.day.budget === 'ok' ? ' · în buget' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function PrefsForm({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const cur = nutritionInputFromMe(me).prefs;
  const [diet, setDiet] = useState<Diet>(cur.diet);
  const [exclude, setExclude] = useState<Allergen[]>(cur.exclude);
  const [other, setOther] = useState((cur.other ?? []).join(', '));
  const [confirmed, setConfirmed] = useState(cur.allergiesConfirmed);
  const [budget, setBudget] = useState(cur.budget != null ? String(cur.budget) : '');
  const [meals, setMeals] = useState<1 | 2 | 3 | 4>(cur.meals);
  const [times, setTimes] = useState<string[]>([0, 1].map((i) => (cur.mealTimes?.[i] != null ? hhmm(cur.mealTimes[i]!) : '')));
  const [currentMeals, setCurrentMeals] = useState<number | null>(cur.currentMeals ?? null);
  const [snacksOk, setSnacksOk] = useState(cur.snacksOk !== false);
  const [powder, setPowder] = useState(cur.proteinPowder === true);
  const [iron, setIron] = useState(cur.indications?.iron === true);
  const [vitD, setVitD] = useState(cur.indications?.vitaminD === true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const mt = times.slice(0, meals <= 2 ? meals : 0).map(toMin);
    if (mt.some((t, i) => t == null && times[i]!.trim() !== '')) {
      setErr('Ora mesei: scrie-o ca 13:00.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await submitForm('nutritie', { diet, exclude, other: other.split(',').map((x) => x.trim()).filter(Boolean), allergiesConfirmed: confirmed, budget: budget.trim() === '' ? null : Number(budget), meals, mealTimes: mt.filter((t): t is number => t != null), currentMeals, snacksOk, proteinPowder: powder, indications: { iron, vitaminD: vitD } });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const tog = (a: Allergen) => setExclude(exclude.includes(a) ? exclude.filter((x) => x !== a) : [...exclude, a]);
  return (
    <div className="meal-prefs">
      <div className="small">Cum mănânci</div>
      <div className="wk-btns">
        {(['omnivor', 'vegetarian', 'vegan'] as Diet[]).map((d) => (
          <button key={d} className={`pill ${diet === d ? 'on' : ''}`} onClick={() => setDiet(d)}>
            {d}
          </button>
        ))}
      </div>
      <div className="small" style={{ marginTop: 8 }}>
        Fără (alergii sau ce nu mănânci)
      </div>
      <div className="wk-btns">
        {ALLERGENS.map((a) => (
          <button key={a} className={`pill ${exclude.includes(a) ? 'on' : ''}`} onClick={() => tog(a)}>
            {ALLERGEN_LABEL[a]}
          </button>
        ))}
      </div>
      <input className="input" style={{ marginTop: 6 }} placeholder="Altceva (ex. kiwi, ardei), separat prin virgulă" value={other} onChange={(e) => setOther(e.target.value)} aria-label="alte alimente sau alergeni" />
      <p className="tiny muted" style={{ marginTop: 4 }}>Filtrul exclude rețetele cu ingredientele alese, inclusiv la „Schimbă”. Nu poate garanta lipsa urmelor (contaminare în fabrică): la o alergie severă verifică eticheta fiecărui produs.</p>
      <label className="small" style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Lista de alergii e completă (confirm)
      </label>
      <div className="small" style={{ marginTop: 8 }}>
        Câte mese mănânci acum, de obicei
      </div>
      <div className="wk-btns">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} className={`pill ${currentMeals === n ? 'on' : ''}`} onClick={() => setCurrentMeals(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="small" style={{ marginTop: 8 }}>
        Câte mese vrei să ai
      </div>
      <div className="wk-btns">
        {([1, 2, 3, 4] as const).map((n) => (
          <button key={n} className={`pill ${meals === n ? 'on' : ''}`} onClick={() => setMeals(n)}>
            {n === 1 ? '1' : n === 2 ? '2 principale' : n === 3 ? '3' : '4 (cu gustare)'}
          </button>
        ))}
      </div>
      {meals <= 2 && (
        <div className="small" style={{ marginTop: 8 }}>
          La ce oră mănânci, aproximativ{' '}
          {Array.from({ length: meals }, (_, i) => (
            <input key={i} inputMode="numeric" placeholder={meals === 1 ? '13:00' : i === 0 ? '12:00' : '19:00'} value={times[i]} onChange={(e) => setTimes(times.map((t, k) => (k === i ? e.target.value : t)))} style={{ width: 60, marginLeft: 6 }} aria-label={`ora mesei ${i + 1}`} />
          ))}
        </div>
      )}
      <label className="small" style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={snacksOk} onChange={(e) => setSnacksOk(e.target.checked)} /> Accept o gustare înainte sau după antrenament, dacă mesele nu ajung (debifat = nicio gustare în plus)
      </label>
      <div className="tiny muted" style={{ marginTop: 4 }}>Ce iei în timpul antrenamentului (geluri, băutură) e separat de mese.</div>
      <label className="small" style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={powder} onChange={(e) => setPowder(e.target.checked)} /> Accept proteină praf doar pentru diferența rămasă după mese
      </label>
      <div className="small" style={{ marginTop: 8 }}>Indicație de la medic (sau din analize)</div>
      <label className="small" style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
        <input type="checkbox" checked={iron} onChange={(e) => setIron(e.target.checked)} /> fier
      </label>
      <label className="small" style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
        <input type="checkbox" checked={vitD} onChange={(e) => setVitD(e.target.checked)} /> vitamina D
      </label>
      <label className="small" style={{ display: 'block', marginTop: 8 }}>
        Buget pe zi (RON, 20–150, opțional){' '}
        <input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: 70 }} aria-label="buget pe zi" />
      </label>
      {err && <div className="warn-line">{err}</div>}
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => void save()} disabled={busy || local}>
        {busy ? 'Salvez…' : 'Salvează'}
      </button>
    </div>
  );
}

/** Rețeta se extinde din cardul atins: același material, varianta scurtă (fără explozie la fiecare deschidere). */
function MealOpen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const tap = useOpenOrigin(ref);
  useEffect(() => trackDetail('reteta'), []);
  return (
    <div className="meal-body" ref={ref}>
      <BurstAtTap tap={tap} />
      {children}
    </div>
  );
}
