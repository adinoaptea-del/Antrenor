import { useState } from 'react';
import type { BodyForm, LabsForm, TestsForm } from '@core/api-types.js';
import { CircleBtn, Icons, LiveTitle } from '../ui/common';
import { Chips, Q } from './controls';
import { useData, useMe } from '../data/store';

// Datele de bază ale protocolului: analize de sânge, test de efort / zone, compoziție corporală.
// Introduse de mână, cu unitățile laboratorului; încărcarea PDF-ului vine după ce există serverul (extragere + verificare).

function Num({ value, onChange, unit, placeholder }: { value: number | null; onChange: (v: number | null) => void; unit: string; placeholder?: string }) {
  return (
    <label className="numfield">
      <input type="number" inputMode="decimal" step="any" value={value ?? ''} placeholder={placeholder ?? '–'} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value.replace(',', '.')))} />
      <span className="unit">{unit}</span>
    </label>
  );
}

export function Labs({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const me = useMe();
  const { submitForm, local } = useData();
  const [l, setL] = useState<LabsForm>(me.baseline.labs ?? { data: me.today, feritina: null, vitamina_d: null, hemoglobina: null, ck: null, crp: null });
  const [busy, setBusy] = useState(false);
  const any = [l.feritina, l.vitamina_d, l.hemoglobina, l.ck, l.crp].some((v) => v != null) || !!l.alte?.length;
  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Analize</LiveTitle>
        </div>
        <div className="top-r" />
      </header>
      <div className="wizard">
        <p className="hint" style={{ marginTop: 0 }}>
          Cinci valori din buletinul de analize, cu unitățile de pe el. Nutriționistul recomandă suplimente doar din ele; fără ele nu recomandă nimic. Celelalte valori (lipide, hormoni, markeri cardiaci) le discuți cu medicul, nu cu aplicația.
        </p>
        {!local && <LabsUpload onRead={(r) => setL(r)} current={l} />}
        <Q title="Data recoltării">
          <input className="date" type="date" value={l.data} onChange={(e) => setL({ ...l, data: e.target.value })} />
        </Q>
        <Q title="Feritină" hint="Sub 30 µg/L: de discutat cu nutriționistul și medicul.">
          <Num value={l.feritina} onChange={(v) => setL({ ...l, feritina: v })} unit="µg/L" />
        </Q>
        <Q title="Vitamina D (25-OH)">
          <Num value={l.vitamina_d} onChange={(v) => setL({ ...l, vitamina_d: v })} unit="ng/mL" />
        </Q>
        <Q title="Hemoglobină">
          <Num value={l.hemoglobina} onChange={(v) => setL({ ...l, hemoglobina: v })} unit="g/dL" />
        </Q>
        <Q title="CK (creatinkinază)">
          <Num value={l.ck} onChange={(v) => setL({ ...l, ck: v })} unit="U/L" />
        </Q>
        <Q title="CRP (proteina C reactivă)">
          <Num value={l.crp} onChange={(v) => setL({ ...l, crp: v })} unit="mg/L" />
        </Q>
        {!!l.alte?.length && <OtherValues values={l.alte} />}
        <p className="hint">Nu ai analize? Lista pentru laborator: hemoleucogramă, feritină, vitamina D, CK, CRP, glicemie, profil lipidic, TSH. Se repetă la 6 luni sau după o perioadă grea.</p>
      </div>
      <div className="wizard-nav">
        <div className="small muted">{any ? 'Intră în pachetul agenților' : 'Cel puțin o valoare'}</div>
        <button
          className="btn"
          disabled={!any || busy}
          onClick={() => {
            setBusy(true);
            submitForm('analize' as never, l)
              .then(() => onDone())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Salvez…' : 'Salvează'} {Icons.check}
        </button>
      </div>
    </>
  );
}

const EMPTY_TESTS: TestsForm = { data: '', tip: 'teren', fcmax: null, alergare_z: [null, null, null, null, null], pace_prag: null, ftp: null, bicicleta_z: [null, null, null, null, null], css: null };

export function Tests({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const me = useMe();
  const { submitForm } = useData();
  const [t, setT] = useState<TestsForm>(me.baseline.tests ?? { ...EMPTY_TESTS, data: me.today });
  const [busy, setBusy] = useState(false);
  const setZ = (k: 'alergare_z' | 'bicicleta_z', i: number, v: number | null) => {
    const arr = [...t[k]] as TestsForm['alergare_z'];
    arr[i] = v;
    setT({ ...t, [k]: arr });
  };
  const any = t.fcmax != null || t.ftp != null || t.css != null || t.alergare_z.some((v) => v != null) || t.bicicleta_z.some((v) => v != null) || !!t.pace_prag;
  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Teste și zone</LiveTitle>
        </div>
        <div className="top-r" />
      </header>
      <div className="wizard">
        <p className="hint" style={{ marginTop: 0 }}>
          Zonele vin dintr-un test, nu din estimările ceasului: test de efort cardiopulmonar (CPET), test de lactat sau test de teren. Până atunci planul rămâne pe Z1–Z2 și pe testul vorbirii.
        </p>
        <Q title="Ce test?">
          <Chips value={t.tip} options={[{ id: 'cpet', label: 'CPET', sub: 'cu praguri ventilatorii' }, { id: 'lactat', label: 'Lactat' }, { id: 'teren', label: 'Test de teren', sub: '30 min alergare / 20 min bicicletă' }, { id: 'altul', label: 'Altul' }]} onChange={(tip) => setT({ ...t, tip })} />
        </Q>
        <Q title="Data testului">
          <input className="date" type="date" value={t.data} onChange={(e) => setT({ ...t, data: e.target.value })} />
        </Q>
        <Q title="FC maximă măsurată">
          <Num value={t.fcmax} onChange={(v) => setT({ ...t, fcmax: v })} unit="bpm" />
        </Q>
        <Q title="Alergare: limita de sus a fiecărei zone" hint="Z1 … Z5, în bpm, din raportul testului.">
          <div className="zrow">
            {t.alergare_z.map((v, i) => (
              <Num key={i} value={v} onChange={(x) => setZ('alergare_z', i, x)} unit={`Z${i + 1}`} />
            ))}
          </div>
        </Q>
        <Q title="Ritm de prag la alergare">
          <input className="date" placeholder="ex. 5:45" value={t.pace_prag ?? ''} onChange={(e) => setT({ ...t, pace_prag: e.target.value || null })} />
        </Q>
        <Q title="Bicicletă: FTP (dacă ai senzor de putere)">
          <Num value={t.ftp} onChange={(v) => setT({ ...t, ftp: v })} unit="W" />
        </Q>
        <Q title="Bicicletă: limitele zonelor pe FC" hint="Doar dacă nu ai FTP. FC pe bicicletă e mai mică decât la alergare; nu copia zonele de alergare.">
          <div className="zrow">
            {t.bicicleta_z.map((v, i) => (
              <Num key={i} value={v} onChange={(x) => setZ('bicicleta_z', i, x)} unit={`Z${i + 1}`} />
            ))}
          </div>
        </Q>
        <Q title="Înot: CSS" hint="Din testul 400 m + 200 m, abia după ce înoți 400 m continuu.">
          <Num value={t.css} onChange={(v) => setT({ ...t, css: v })} unit="s / 100 m" />
        </Q>
      </div>
      <div className="wizard-nav">
        <div className="small muted">{any ? 'Zonele intră în plan la următoarea regenerare' : 'Cel puțin o valoare'}</div>
        <button
          className="btn"
          disabled={!any || !t.data || busy}
          onClick={() => {
            setBusy(true);
            submitForm('teste' as never, t)
              .then(() => onDone())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Salvez…' : 'Salvează'} {Icons.check}
        </button>
      </div>
    </>
  );
}

export function Body({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const me = useMe();
  const { submitForm } = useData();
  const [b, setB] = useState<BodyForm>({ data: me.today, greutate: me.baseline.body?.greutate ?? null, grasime_pct: me.baseline.body?.grasime_pct ?? null });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Corp</LiveTitle>
        </div>
        <div className="top-r" />
      </header>
      <div className="wizard">
        <p className="hint" style={{ marginTop: 0 }}>
          Greutatea dimineața, după baie, înainte de masă. Grăsimea din BIA sau DEXA, la început și o dată la 6–8 săptămâni. Nutriționistul calculează gramele pe media a 7 zile; sub 7 cântăriri spune că sunt provizorii.
        </p>
        <Q title="Data">
          <input className="date" type="date" value={b.data} onChange={(e) => setB({ ...b, data: e.target.value })} />
        </Q>
        <Q title="Greutate">
          <Num value={b.greutate} onChange={(v) => setB({ ...b, greutate: v })} unit="kg" />
        </Q>
        <Q title="Grăsime corporală" hint="Opțional.">
          <Num value={b.grasime_pct} onChange={(v) => setB({ ...b, grasime_pct: v })} unit="%" />
        </Q>
      </div>
      <div className="wizard-nav">
        <div />
        <button
          className="btn"
          disabled={b.greutate == null || busy}
          onClick={() => {
            setBusy(true);
            submitForm('corp' as never, b)
              .then(() => onDone())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Salvez…' : 'Salvează'} {Icons.check}
        </button>
      </div>
    </>
  );
}

/** Lista datelor de bază, cu ce deblochează fiecare. Pe Acasă și în Profil. */
export function BaselineList({ onOpen }: { onOpen: (screen: string) => void }) {
  const me = useMe();
  const b = me.baseline;
  const items: { k: string; title: string; done: boolean; value: string; unlock: string; screen: string | null }[] = [
    { k: 'analize', title: 'Analize de sânge', done: !!b.labs, value: b.labs ? `din ${b.labs.data.split('-').reverse().join('.')}` : 'lipsesc', unlock: 'suplimentele și fierul vin doar din ele', screen: 'analize' },
    { k: 'teste', title: 'Test de efort / zone', done: !!b.tests, value: b.tests ? `${b.tests.tip.toUpperCase()}, ${b.tests.data.split('-').reverse().join('.')}` : 'lipsesc', unlock: 'fără ele planul rămâne pe Z1–Z2 și pe testul vorbirii', screen: 'teste' },
    { k: 'corp', title: 'Greutate și grăsime', done: !!b.body, value: b.body ? `${b.body.greutate?.toLocaleString('ro-RO')} kg${b.body.grasime_pct != null ? ` · ${b.body.grasime_pct}%` : ''}` : 'lipsesc', unlock: 'gramele de carbohidrați și proteine se calculează pe kg', screen: 'corp' },
  ];
  return (
    <div className="baseline">
      {items.map((it) => (
        <button key={it.k} className={`base-row ${it.done ? 'done' : ''}`} onClick={() => it.screen && onOpen(it.screen)}>
          <span className="ic">{it.done ? Icons.check : Icons.arrowRight}</span>
          <span className="tx">
            <span className="t">
              {it.title} <small>· {it.value}</small>
            </span>
            <span className="s">{it.unlock}</span>
          </span>
        </button>
      ))}
      <AvizRow />
    </div>
  );
}

/** Avizul cardiologic: o bifă. Ai aviz sau nu ai; fără el, planul rămâne la Z1–Z2. */
function AvizRow() {
  const me = useMe();
  const { submitForm } = useData();
  const [busy, setBusy] = useState(false);
  const has = me.baseline.cardiolog === 'da';
  const toggle = async () => {
    setBusy(true);
    try {
      await submitForm('aviz', { aviz: has ? 'nu' : 'da' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={`base-row ${has ? 'done' : ''}`} role="switch" aria-checked={has} disabled={busy} onClick={() => void toggle()}>
      <span className="ic">{has ? Icons.check : null}</span>
      <span className="tx">
        <span className="t">
          Aviz cardiologic <small>· {has ? 'am aviz' : 'nu am aviz'}</small>
        </span>
        <span className="s">{has ? 'intensitatea peste Z2 e permisă, după zonele testate' : 'atinge dacă ai avizul; fără el planul rămâne la Z1–Z2'}</span>
      </span>
    </button>
  );
}

interface Reading {
  lizibil: boolean;
  data_recoltarii: string | null;
  laborator: string | null;
  valori: NonNullable<LabsForm['alte']>;
  cele5: { feritina: number | null; vitamina_d: number | null; hemoglobina: number | null; ck: number | null; crp: number | null };
  note: string[];
}

/** Poza se micșorează în telefon (max 2000 px, JPEG): serverul primește cel mult ~4 MB. */
async function fileToPayload(f: File): Promise<{ file: string; mediaType: string }> {
  const toB64 = (buf: ArrayBuffer) => {
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  if (f.type === 'application/pdf') {
    if (f.size > 3_000_000) throw new Error('PDF-ul are peste 3 MB; fă o poză clară a paginilor cu rezultate');
    return { file: toB64(await f.arrayBuffer()), mediaType: 'application/pdf' };
  }
  if (!f.type.startsWith('image/')) throw new Error('doar PDF sau poză');
  const img = await createImageBitmap(f);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('nu pot citi poza'))), 'image/jpeg', 0.85));
  return { file: toB64(await blob.arrayBuffer()), mediaType: 'image/jpeg' };
}

function LabsUpload({ onRead, current }: { onRead: (l: LabsForm) => void; current: LabsForm }) {
  const { submitForm } = useData();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setState('busy');
    setMsg('');
    try {
      const r = await submitForm('analize-citire', await fileToPayload(f));
      const c = r.data?.citire as Reading | undefined;
      if (!c || !c.lizibil) throw new Error('nu pare un buletin de analize sau nu se citește; încearcă o poză mai clară');
      onRead({ ...current, data: c.data_recoltarii ?? current.data, ...c.cele5, alte: c.valori, laborator: c.laborator });
      setState('done');
      setMsg(`${c.valori.length} valori citite${c.laborator ? ` · ${c.laborator}` : ''}. Verifică-le cu buletinul, apoi Salvează.${c.note.length ? ` ${c.note.join('; ')}.` : ''}`);
    } catch (e) {
      setState('err');
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="q">
      <h3>Încarcă buletinul</h3>
      <p className="hint">PDF sau poză. Claude transcrie valorile exact cum sunt pe buletin, cu intervalele laboratorului; nu salvează nimic până nu verifici tu.</p>
      <label className="btn dark" style={{ textAlign: 'center' }}>
        {state === 'busy' ? 'Citesc buletinul…' : 'Alege PDF sau poză'}
        <input type="file" accept="application/pdf,image/*" hidden disabled={state === 'busy'} onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {msg && (
        <p className="hint" style={state === 'err' ? { color: 'var(--c-rosu)' } : undefined}>
          {msg}
        </p>
      )}
    </section>
  );
}

function OtherValues({ values }: { values: NonNullable<LabsForm['alte']> }) {
  const out = values.filter((v) => v.in_afara);
  return (
    <section className="q">
      <h3>Toate valorile din buletin</h3>
      <p className="hint">{out.length ? `${out.length} în afara intervalului laboratorului: de discutat cu medicul. Aplicația nu le interpretează.` : 'Toate în intervalul laboratorului.'}</p>
      <div className="kv">
        {values.map((v, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className="tiny" style={{ minWidth: 0 }}>
              <b>{v.nume}</b>
              {v.ref_text ? <span className="muted"> · ref. {v.ref_text}</span> : null}
            </div>
            <div className="tiny" style={{ textAlign: 'right', color: v.in_afara ? 'var(--c-rosu)' : undefined, fontWeight: v.in_afara ? 700 : 400 }}>
              {v.valoare ?? v.valoare_text ?? '–'} {v.unitate ?? ''}
              {v.in_afara === 'sub' ? ' ↓' : v.in_afara === 'peste' ? ' ↑' : ''}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
