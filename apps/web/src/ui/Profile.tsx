import { useEffect, useState } from 'react';
import { Card, CircleBtn, Icons, Label, LiveTitle, fmtDayMonth } from './common';
import { SyncButton } from './SyncButton';
import { fmtTime } from './sync';
import { useData, useMe } from '../data/store';
import { SERVER, hardReload, server } from '../data/api';
import { lastDoneWorkout } from '../data/model';
import { eveningComplete, morningComplete, type MorningForm } from '../forms/types';
import { BaselineList } from '../forms/Baseline';

const DEVICES: { provider: 'whoop' | 'strava' | 'oura'; name: string; note: string }[] = [
  { provider: 'whoop', name: 'Whoop', note: 'somn, HRV, puls, recuperare, antrenamente' },
  { provider: 'strava', name: 'Garmin / ceas, prin Strava', note: 'activitățile de pe ceas (Garmin nu mai primește aplicații noi)' },
  { provider: 'oura', name: 'Oura', note: 'somn, HRV, readiness' },
];

export function Profile({ onBack, onOpen }: { onBack: () => void; onOpen: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const { connect, logout, local, submitForm } = useData();
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lastDone = lastDoneWorkout(me);
  const lastDoneId = lastDone ? (me.activities.find((a) => a.sport === lastDone.sport && a.date >= lastDone.date && !a.unplanned)?.id ?? `plan-${lastDone.id}`) : null;
  const morning = me.forms.morning as MorningForm | null;
  const connected = (p: string) => me.devices.find((d) => d.provider === p);
  // Revenirea de la producător: #profil?conectat=whoop sau #profil?eroare=...
  const [oauthMsg, setOauthMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    const qs = new URLSearchParams(location.hash.split('?')[1] ?? '');
    if (qs.get('conectat')) return { ok: true, text: `${qs.get('conectat')} conectat. Primele date apar după o citire (câteva secunde).` };
    if (qs.get('eroare')) return { ok: false, text: `Conectarea n-a mers: ${qs.get('eroare')}` };
    return null;
  });
  useEffect(() => {
    if (oauthMsg) history.replaceState(null, '', '#profil');
  }, [oauthMsg]);

  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Profil</LiveTitle>
        </div>
        <div className="top-r">
          <span className="avatar" aria-hidden="true">
            {(me.user.name || 'S').slice(0, 1)}
          </span>
        </div>
      </header>

      <div className="stack">
        {oauthMsg && (
          <button type="button" className={oauthMsg.ok ? 'labs-alert ok-alert' : 'labs-alert'} onClick={() => setOauthMsg(null)}>
            <b>{oauthMsg.text}</b>
            <span>Atinge ca să închizi.</span>
          </button>
        )}
        <Card tight>
          <div className="row" style={{ gap: 12 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }} aria-hidden="true">
              {(me.user.name || 'S').slice(0, 1)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="num md">{me.user.name || me.user.email}</div>
              <div className="small muted">{me.user.raceName ? `${me.user.raceName}${me.user.raceDate ? ` · ${me.user.raceDate.split('-').reverse().join('.')}` : ''}` : me.user.email}</div>
            </div>
          </div>
        </Card>

        <Card>
          <Label icon={Icons.edit}>Chestionare</Label>
          <div className="kv">
            <div>
              <div style={{ fontWeight: 700 }}>De intrare</div>
              <div className="tiny muted">nivel, echipament, program, sănătate</div>
            </div>
            <button className={`pill ${me.intakeComplete ? '' : 'on'}`} onClick={() => onOpen('intake')}>
              {me.intakeComplete ? 'Editează' : 'Completează'}
            </button>
            <div>
              <div style={{ fontWeight: 700 }}>Dimineața</div>
              <div className="tiny muted">4 note + semnale · {fmtDayMonth(me.today)}</div>
            </div>
            <button className={`pill ${morningComplete(morning ?? undefined) ? '' : 'on'}`} onClick={() => onOpen('dimineata')}>
              {morningComplete(morning ?? undefined) ? 'Modifică' : 'Completează'}
            </button>
            {lastDone && lastDoneId && (
              <>
                <div>
                  <div style={{ fontWeight: 700 }}>După antrenament</div>
                  <div className="tiny muted">RPE, așteptări, durere · ultima ședință</div>
                </div>
                <button className={`pill ${eveningComplete(me.forms.evening[lastDoneId]) ? '' : 'on'}`} onClick={() => onOpen('seara', { activityId: lastDoneId })}>
                  {eveningComplete(me.forms.evening[lastDoneId]) ? 'Modifică' : 'Completează'}
                </button>
              </>
            )}
            <div>
              <div style={{ fontWeight: 700 }}>Săptămânal</div>
              <div className="tiny muted">duminica, 3 întrebări</div>
            </div>
            <button className="pill" onClick={() => onOpen('saptamanal')}>
              {me.forms.weeklyDone ? 'Modifică' : 'Deschide'}
            </button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Niciunul nu e obligatoriu. Fără cel de dimineață, decizia zilei e cel mult galbenă; fără cel de seară, antrenorii nu au RPE și durere.
          </div>
        </Card>

        <Card>
          <Label icon={Icons.pulse}>Date de bază</Label>
          <BaselineList onOpen={(s) => onOpen(s)} />
        </Card>

        <Card>
          <div className="row between" style={{ marginBottom: 8 }}>
            <Label icon={Icons.watch}>Brățări</Label>
            <SyncButton compact />
          </div>
          <div className="kv">
            {DEVICES.map((d) => {
              const c = connected(d.provider);
              return (
                <div key={d.provider} style={{ display: 'contents' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div className="tiny muted">{c ? `conectat · ultima citire ${c.lastSync ? fmtTime(c.lastSync) : '–'}${c.lastOk === false ? ` · eroare: ${c.detail ?? ''}` : ''}` : d.note}</div>
                  </div>
                  {c ? (
                    <button
                      className="pill"
                      onClick={() => {
                        if (confirmOff !== d.provider) {
                          setConfirmOff(d.provider);
                          return;
                        }
                        setConfirmOff(null);
                        void submitForm('deconectare', { provider: d.provider }).catch((e: Error) => setErr(e.message));
                      }}
                    >
                      {confirmOff === d.provider ? 'Sigur? Apasă din nou' : 'Deconectează'}
                    </button>
                  ) : SERVER?.providers && !SERVER.providers[d.provider] ? (
                    <span className="tiny muted">încă neactivat</span>
                  ) : (
                    <button
                      className="pill on"
                      onClick={() => {
                        setErr(null);
                        connect(d.provider).catch((e: Error) => setErr(e.message));
                      }}
                    >
                      Conectează
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {err && (
            <div className="small" style={{ marginTop: 8, color: 'var(--c-rosu)' }}>
              {err}
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 10 }}>
            „Conectează” te duce la pagina producătorului; te loghezi acolo, apeși „Allow” și te întorci aici cu ultimele 5 săptămâni citite. Citirea continuă singură: la deschidere, la revenire, la 15 minute, plus când brățara anunță o noapte sau o ședință nouă.
          </div>
        </Card>

        {!local && me.admin && <AdminKeys />}

        {!local && <AppleCard />}

        {!local && <AboutCard />}
        {!local && <CityCard />}

        <Card>
          <Label>Date disponibile</Label>
          <div className="kv">
            {me.dataAvailability.have.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <span className="ok">{Icons.check}</span>
              </div>
            ))}
            {me.dataAvailability.missing.map((x) => (
              <div key={x} style={{ display: 'contents' }}>
                <div className="k">{x}</div>
                <div className="no">lipsește</div>
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            Ce lipsește rămâne „fără date”, nu se estimează.
          </div>
        </Card>

        <Card tight>
          <Label>Program</Label>
          <div>
            <span className="num md">{me.budgetHours == null ? '–' : me.budgetHours.toLocaleString('ro-RO')}</span>
            <span className="unit">ore pe săptămână pentru plan</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Din ferestrele libere de minimum 45 de minute, × 0,8. Se schimbă din chestionar.
          </div>
          {!local && me.intakeComplete && <RegenPlan />}
        </Card>

        <Card tight>
          <Label>Cont și consimțământ</Label>
          <div className="small">18+ · date de sănătate · nu e serviciu medical · ștergerea contului la cerere</div>
          <div className="tiny muted" style={{ marginTop: 6 }}>Dacă ceva nu merge: „Repornește aplicația” șterge doar fișierele din telefon, nu datele tale.</div>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <button className="pill" onClick={() => onOpen('ghid')}>
              Arată ghidul
            </button>
            <button className="pill" onClick={() => void hardReload()}>
              Repornește aplicația
            </button>
            {me.admin && (
              <button className="pill on" onClick={() => onOpen('prieteni')}>
                Prieteni (admin)
              </button>
            )}
            <button className="pill" onClick={() => void logout()}>
              {local ? 'Șterge tot din acest telefon' : 'Ieși din cont'}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Orașul pentru prognoză: căldura, vântul și ploaia intră în decizia zilei. */
function AboutCard() {
  const me = useMe();
  const { submitForm } = useData();
  const [sex, setSex] = useState<'m' | 'f' | null>(me.profile.sex);
  const [year, setYear] = useState<string>(me.profile.birthYear ? String(me.profile.birthYear) : '');
  const [height, setHeight] = useState<string>(me.profile.heightCm ? String(me.profile.heightCm) : '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await submitForm('profil', { sex, anNastere: Number(year), inaltime: height ? Number(height) : null });
      setMsg('salvat');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Label>Despre tine</Label>
      <div className="about">
        <div className="about-sex">
          <button className={`pill ${sex === 'm' ? 'on' : ''}`} onClick={() => setSex('m')}>
            Bărbat
          </button>
          <button className={`pill ${sex === 'f' ? 'on' : ''}`} onClick={() => setSex('f')}>
            Femeie
          </button>
        </div>
        <label className="about-f">
          <span>Anul nașterii</span>
          <input className="date" type="number" inputMode="numeric" placeholder="1988" value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label className="about-f">
          <span>Înălțime (cm)</span>
          <input className="date" type="number" inputMode="numeric" placeholder="180" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
        <button className="btn about-save" disabled={busy || !sex || !year} onClick={() => void save()}>
          {busy ? 'Salvez…' : 'Salvează'}
        </button>
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>
        {msg ?? 'Sex, an, înălțime: contează pentru analize (fier, hemoglobină), necesarul de energie și recuperare.'}
      </div>
    </Card>
  );
}

function CityCard() {
  const me = useMe();
  const { submitForm } = useData();
  const [city, setCity] = useState(me.profile.city ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await submitForm('profil', { oras: city });
      setMsg(r.data?.oras ? `salvat: ${String(r.data.oras)}` : 'șters');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Label>Orașul tău</Label>
      <div className="row" style={{ gap: 8 }}>
        <input className="date" style={{ flex: 1, minWidth: 0 }} placeholder="ex. București" value={city} onChange={(e) => setCity(e.target.value)} />
        <button className="pill on" disabled={busy} onClick={() => void save()}>
          {busy ? '…' : 'Salvează'}
        </button>
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>
        {msg ?? (me.profile.city ? `Vremea vine pentru ${me.profile.city}.` : 'Fără oraș, antrenorii nu țin cont de vreme (căldură, vânt, ploaie, ger).')}
      </div>
    </Card>
  );
}

/** Apple Watch: somn, HRV și puls de repaus prin aplicația iPhone „Health Auto Export”; antrenamentele prin Strava. */
function AppleCard() {
  const me = useMe();
  const { submitForm } = useData();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setErr(null);
    try {
      const r = await submitForm('apple', {});
      setUrl(typeof r.data?.url === 'string' ? r.data.url : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Card>
      <Label icon={Icons.watch}>Apple Health · Garmin · Apple Watch</Label>
      <div className="small">
        {me.profile.appleConnected
          ? me.profile.appleLastSync
            ? `primește date · ultima trimitere ${fmtTime(me.profile.appleLastSync)}`
            : 'adresă creată · încă n-a venit nimic de pe iPhone'
          : 'Antrenamentele, somnul și pulsul din Apple Health (unde Garmin Connect și Apple Watch scriu singure) vin prin aplicația iPhone „Health Auto Export”.'}
      </div>
      {me.profile.appleLast && (
        <div className="tiny" style={{ marginTop: 6, color: me.profile.appleLast.ok ? 'var(--muted)' : 'var(--c-rosu)' }}>
          Ultima trimitere ({fmtTime(me.profile.appleLast.at)}): {me.profile.appleLast.ok ? `primită · ${me.profile.appleLast.detail ?? ''}` : `eșuată · ${me.profile.appleLast.detail ?? 'eroare necunoscută'}`}
        </div>
      )}
      {url ? (
        <>
          <div className="tiny" style={{ marginTop: 10, wordBreak: 'break-all', userSelect: 'all' }}>
            {url}
          </div>
          <button className="pill on" style={{ marginTop: 8 }} onClick={() => void copy()}>
            {copied ? 'Copiat' : 'Copiază adresa'}
          </button>
          <div className="apple-steps">
            <div className="as-step">
              <b>1. Ceasul scrie în Apple Health</b>
              <span>Garmin: aplicația Garmin Connect → Mai multe (☰) → Setări → Aplicații conectate → Apple Health → activează tot. Apple Watch: scrie singur, nu ai nimic de făcut.</span>
            </div>
            <div className="as-step">
              <b>2. Instalează „Health Auto Export”</b>
              <span>Din App Store. Exportul automat e în versiunea cu plată. La prima deschidere, permite accesul la toate datele Health.</span>
            </div>
            <div className="as-step">
              <b>3. Automatizarea pentru sănătate</b>
              <span>Automations → + → REST API. URL: adresa copiată mai sus. Format: JSON. Data Type: Health Metrics, cu: Heart Rate Variability, Resting Heart Rate, Respiratory Rate, Sleep Analysis, Body Mass, Body Fat Percentage. Sync Cadence: la o oră. Pornește „Enabled”.</span>
            </div>
            <div className="as-step">
              <b>4. Automatizarea pentru antrenamente</b>
              <span>Încă una la fel (aceeași adresă), cu Data Type: Workouts.</span>
            </div>
            <div className="as-step">
              <b>5. Prima trimitere</b>
              <span>În fiecare automatizare apasă „Manual Export” și alege ultimele 6 săptămâni. Apoi revino aici: sus apare „primește date”.</span>
            </div>
            <div className="tiny muted">Ce nu vine pe calea asta: traseul GPS și timpii pe fiecare km. Restul (puls, distanță, ritm, somn, HRV, respirație, greutate) vine.</div>
          </div>
        </>
      ) : (
        <button className="pill" style={{ marginTop: 10 }} onClick={() => void make()}>
          {me.profile.appleConnected ? 'Fă o adresă nouă' : 'Conectează Apple Health'}
        </button>
      )}
      {err && (
        <div className="small" style={{ marginTop: 8, color: 'var(--c-rosu)' }}>
          {err}
        </div>
      )}
    </Card>
  );
}

const PROVIDER_SETUP: { id: 'whoop' | 'strava' | 'oura'; name: string; site: string; steps: (u: string) => { label: string; value: string }[] }[] = [
  {
    id: 'whoop',
    name: 'WHOOP',
    site: 'https://developer-dashboard.whoop.com',
    steps: (u) => [
      { label: 'Redirect URI', value: `${u}/api/oauth/whoop/callback` },
      { label: 'Privacy Policy', value: `${u}/confidentialitate.html` },
      { label: 'Webhook URL (dacă cere)', value: `${u}/api/webhooks/whoop` },
    ],
  },
  {
    id: 'strava',
    name: 'Strava (pentru Garmin și Apple Watch)',
    site: 'https://www.strava.com/settings/api',
    steps: (u) => [
      { label: 'Website', value: u },
      { label: 'Authorization Callback Domain', value: u.replace(/^https?:\/\//, '') },
    ],
  },
  {
    id: 'oura',
    name: 'Oura',
    site: 'https://cloud.ouraring.com/oauth/applications',
    steps: (u) => [
      { label: 'Redirect URI', value: `${u}/api/oauth/oura/callback` },
      { label: 'Website', value: u },
      { label: 'Privacy Policy / Terms', value: `${u}/confidentialitate.html` },
    ],
  },
];

function CopyLine({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="tiny muted">{label}</div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <div className="tiny" style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', userSelect: 'all' }}>
          {value}
        </div>
        <button
          className="pill"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => setOk(true),
              () => setOk(false),
            );
          }}
        >
          {ok ? 'Copiat' : 'Copiază'}
        </button>
      </div>
    </div>
  );
}

/** Doar adminul: cheile aplicațiilor de la producători, puse din telefon (fără Vercel). */
function AdminKeys() {
  const me = useMe();
  const { submitForm } = useData();
  const [open, setOpen] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, { id: string; secret: string }>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const a = me.admin!;
  const save = async (p: 'whoop' | 'strava' | 'oura') => {
    const v = vals[p] ?? { id: '', secret: '' };
    setMsg({ ...msg, [p]: 'Salvez…' });
    try {
      await submitForm('admin-chei', { provider: p, clientId: v.id, clientSecret: v.secret });
      setMsg({ ...msg, [p]: 'Salvat. Acum apasă „Conectează” la brățara asta, mai sus.' });
      setVals({ ...vals, [p]: { id: '', secret: '' } });
    } catch (e) {
      setMsg({ ...msg, [p]: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Card>
      <Label icon={Icons.watch}>Activează brățările (doar tu, o singură dată)</Label>
      <div className="tiny muted" style={{ marginBottom: 10 }}>
        La fiecare producător faci o aplicație, copiezi acolo adresele de mai jos, apoi lipești aici Client ID și Client Secret. După asta, tu și prietenii vă conectați cu „Conectează”.
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {PROVIDER_SETUP.map((p) => (
          <div key={p.id} className="keys-box">
            <button className="row between" style={{ background: 'none', border: 0, color: 'inherit', padding: 0, font: 'inherit', cursor: 'pointer', width: '100%' }} onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              {a.providers[p.id] ? <span className="ok">{Icons.check} activ</span> : <span className="tiny muted">{open === p.id ? 'închide' : 'configurează'}</span>}
            </button>
            {open === p.id && (
              <>
                <a className="tiny" href={p.site} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)' }}>
                  1. Deschide {p.site.replace('https://', '')} și fă o aplicație nouă
                </a>
                <div className="tiny muted">2. Copiază în formularul lor:</div>
                {p.steps(a.appUrl).map((s) => (
                  <CopyLine key={s.label} label={s.label} value={s.value} />
                ))}
                <div className="tiny muted">3. Lipește aici ce îți dau ei:</div>
                <input className="date" placeholder="Client ID" autoComplete="off" value={vals[p.id]?.id ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: { id: e.target.value, secret: vals[p.id]?.secret ?? '' } })} />
                <input className="date" type="password" placeholder="Client Secret" autoComplete="off" value={vals[p.id]?.secret ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: { id: vals[p.id]?.id ?? '', secret: e.target.value } })} />
                <button className="btn" disabled={!vals[p.id]?.id || !vals[p.id]?.secret} onClick={() => void save(p.id)}>
                  Salvează cheile {p.name.split(' ')[0]}
                </button>
                {msg[p.id] && <div className="tiny">{msg[p.id]}</div>}
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Reface planul din chestionar: ședințele viitoare se regenerează (ex. forța pe programul Push / Pull / Legs); istoricul rămâne. */
function RegenPlan() {
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await server.regeneratePlan();
      setMsg(r.ok ? 'Planul a fost refăcut.' : r.reason ?? 'Nu s-a putut reface planul.');
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 10 }}>
      <button className="pill" disabled={busy} onClick={() => void run()}>
        {busy ? 'Refac planul…' : 'Refă planul'}
      </button>
      <div className="tiny muted" style={{ marginTop: 6 }}>{msg ?? 'Regenerează ședințele viitoare cu regulile de acum; ce ai făcut deja rămâne.'}</div>
    </div>
  );
}
