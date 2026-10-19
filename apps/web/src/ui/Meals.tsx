import { useMemo, useState } from 'react';
import type { Allergen } from '@core/nutrition/foods.js';
import { NUTRITION_DISCLAIMER, alternatives, type Diet, type Meal } from '@core/nutrition/engine.js';
import { nutritionForMe, nutritionInputFromMe, recentRecipes } from '@core/nutrition/from-me.js';
import { Card, Icons, Label } from './common';
import { useData, useMe } from '../data/store';
import { isNetworkError } from '../data/api';

const ALLERGENS: Allergen[] = ['lapte', 'ou', 'gluten', 'peste', 'crustacee', 'nuci', 'arahide', 'soia', 'susan'];
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const ron = (x: number) => `${x.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;

/**
 * „Mese recomandate pentru azi”: ținta, mesele și alimentarea din efort sunt calculate în cod (src/nutrition), din
 * aceeași zi a planului pe care o vezi; nimic nu e inventat de AI. Fiecare masă: ce și cât, cum, de ce, alternativă.
 */
export function Meals({ onOpen }: { onOpen: (s: string) => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const day = useMemo(() => nutritionForMe(me), [me]);
  const prefs = nutritionInputFromMe(me).prefs;
  const [open, setOpen] = useState<string | null>(null);
  const [swap, setSwap] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const recent = useMemo(() => (swap ? recentRecipes(me) : []), [me, swap]);

  const choose = async (slot: string, recipeId: string | null) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await submitForm('nutritie', { alegere: { date: me.today, slot, recipeId } });
      setSwap(null);
    } catch (e) {
      setMsg(isNetworkError(e) ? 'Fără semnal: încearcă din nou.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const e = day.energy;
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
            </span>
          </div>
        ) : (
          <div className="warn-line">
            Porții de referință, nu personalizate. Lipsește: {day.missing.join(', ')}.{' '}
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
          {day.meals.length} mese · {n0(day.totals.kcal)} kcal
          {day.fuel.length ? ` + ${n0(day.totals.dayKcal - day.totals.kcal)} kcal în efort = ${n0(day.totals.dayKcal)} kcal` : ''} · {n0(day.totals.protein)} g proteine ·{' '}
          {day.totals.costComplete ? `~${ron(day.totals.costKnown)}` : 'cost incomplet (lipsesc prețuri)'}
        </div>
        {day.budgetNote && <div className="tiny muted" style={{ marginTop: 4 }}>{day.budgetNote}</div>}
      </Card>

      {day.fuel.length > 0 && (
        <Card tight>
          <Label icon={Icons.droplet}>În timpul efortului</Label>
          {day.fuel.map((f) => (
            <div key={f.sessionLabel} className="small" style={{ marginTop: 6 }}>
              <b>{f.sessionLabel}:</b> ~{f.plannedG} g carbohidrați în total ({f.carbsPerHour[0]}–{f.carbsPerHour[1]} g/oră); {f.note}. Intră o singură dată în totalul zilei.
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
          alts={swap === m.slot ? alternatives(day, m.slot, prefs, recent) : []}
          chosen={!!prefs.choices?.[me.today]?.[m.slot]}
          onChoose={(id) => void choose(m.slot, id)}
          busy={busy || local}
        />
      ))}
      {msg && <div className="wk-note">{msg}</div>}

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
              {prefs.exclude.length ? ` · fără ${prefs.exclude.join(', ')}` : ''} · {prefs.meals} {prefs.meals === 1 ? 'masă' : 'mese'}{prefs.currentMeals ? ` (acum ${prefs.currentMeals})` : ''} · {prefs.budget ? `${prefs.budget} RON/zi` : 'fără buget'}
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
          <p>
            Repaus (Mifflin-St Jeor): {n0(e.ree)} kcal · fără sport (× 1,4, regulă AIRON): {n0(e.base)} kcal · antrenamentele de azi, peste repaus (Compendium, MET): {n0(e.exercise)} kcal
            {e.adjustPct ? ` · ${e.adjustPct > 0 ? '+' : ''}${e.adjustPct}% (${day.goalNote})` : ''}. Intervalul de ±10% arată incertitudinea: e o estimare, nu o măsurătoare. Caloriile ceasului nu se adună peste.
          </p>
          <p>Compoziția: CoFID 2021 și eticheta producătorului; prețurile: Auchan online, 19.10.2026. Carbohidrații și vitaminele meselor nu sunt calculate încă.</p>
        </details>
      )}
      <p className="tiny muted">{NUTRITION_DISCLAIMER}</p>
    </div>
  );
}

function MealCard({ m, open, onToggle, swapping, onSwap, alts, chosen, onChoose, busy }: { m: Meal; open: boolean; onToggle: () => void; swapping: boolean; onSwap: () => void; alts: ReturnType<typeof alternatives>; chosen: boolean; onChoose: (id: string | null) => void; busy: boolean }) {
  return (
    <Card tight>
      <button className="exp-row" onClick={onToggle} aria-expanded={open}>
        <span>
          <small>{m.label}</small>
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
        <div className="meal-body">
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
            Alergeni: {m.allergens.length ? m.allergens.join(', ') : 'niciunul din cei urmăriți'} (verifică etichetele){m.missingPrices.length ? ` · fără preț: ${m.missingPrices.join(', ')}` : ''}
            {m.repeat ? ' · se repetă mai des decât regula, din cauza preferințelor' : ''}
          </div>
        </div>
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
      </div>
      {swapping && (
        <div className="meal-alts">
          {alts.length === 0 && <div className="small muted">Nu e altă variantă eligibilă cu energie apropiată (preferințe, alergii, fără repetare recentă).</div>}
          {alts.map((a) => (
            <button key={a.id} className="adapt-opt" onClick={() => onChoose(a.id)} disabled={busy}>
              <b>{a.name}</b>
              <span>
                {n0(a.kcal)} kcal · {n0(a.protein)} g proteine · {a.cost != null ? ron(a.cost) : 'preț incomplet'}
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
  const [confirmed, setConfirmed] = useState(cur.allergiesConfirmed);
  const [budget, setBudget] = useState(cur.budget != null ? String(cur.budget) : '');
  const [meals, setMeals] = useState<1 | 2 | 3 | 4>(cur.meals);
  const [currentMeals, setCurrentMeals] = useState<number | null>(cur.currentMeals ?? null);
  const [snacksOk, setSnacksOk] = useState(cur.snacksOk !== false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await submitForm('nutritie', { diet, exclude, allergiesConfirmed: confirmed, budget: budget.trim() === '' ? null : Number(budget), meals, currentMeals, snacksOk });
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
            {a}
          </button>
        ))}
      </div>
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
        <label className="small" style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={snacksOk} onChange={(e) => setSnacksOk(e.target.checked)} /> Accept o gustare înainte sau după antrenament, dacă mesele nu ajung
        </label>
      )}
      <div className="tiny muted" style={{ marginTop: 4 }}>Ce iei în timpul antrenamentului (geluri, băutură) e separat de mese.</div>
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
