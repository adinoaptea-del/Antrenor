import { useEffect, useState } from 'react';
import { Card, Icons, Label, fmtDayMonth } from './common';
import { BackHeader, setAmbientOn } from './Shell';
import { SyncButton } from './SyncButton';
import { fmtTime } from './sync';
import { useData, useMe } from '../data/store';
import { SERVER, hardReload, server } from '../data/api';
import { lastDoneWorkout } from '../data/model';
import { eveningComplete, morningComplete, type MorningForm } from '../forms/types';
import { BaselineList } from '../forms/Baseline';

const DEVICES: { provider: 'whoop' | 'strava' | 'oura'; name: string; note: string }[] = [
  { provider: 'whoop', name: 'Whoop', note: 'somn, HRV, puls, recuperare, antrenamente' },
  { provider: 'strava', name: 'Garmin · Samsung · alt ceas, prin Strava', note: 'activitățile de pe ceas (Garmin și Samsung Health le trimit în Strava)' },
  { provider: 'oura', name: 'Oura', note: 'somn, HRV, readiness' },
];

type Section = 'index' | 'obiectiv' | 'dispozitive' | 'chestionare' | 'sanatate' | 'preferinte' | 'cont' | 'admin';
const SECTIONS: { id: Exclude<Section, 'index' | 'admin'>; title: string; sub: string; icon: keyof typeof Icons }[] = [
  { id: 'obiectiv', title: 'Obiectiv și disponibilitate', sub: 'cursa, orele pentru sport, refacerea planului', icon: 'flag' },
  { id: 'dispozitive', title: 'Dispozitive', sub: 'starea conexiunii și prospețimea datelor', icon: 'watch' },
  { id: 'chestionare', title: 'Chestionare', sub: 'inițial · dimineața · după ședință', icon: 'edit' },
  { id: 'sanatate', title: 'Date de sănătate', sub: 'analize, test de efort, aviz · la cerere', icon: 'heart' },
  { id: 'preferinte', title: 'Preferințe', sub: 'lumină, despre tine, oraș', icon: 'sliders' },
  { id: 'cont', title: 'Cont', sub: 'consimțământ, ghid, ieșire', icon: 'user' },
];

/** Profilul: un index de ecrane scurte. Administrarea (chei, prieteni) e separată și apare doar proprietarului. */
export function Profile({ onBack, onOpen, ambient, onAmbient }: { onBack: () => void; onOpen: (screen: string, opts?: { activityId?: string }) => void; ambient: boolean; onAmbient: (v: boolean) => void }) {
  const me = useMe();
  const { local } = useData();
  const [section, setSection] = useState<Section>(() => (new URLSearchParams(location.hash.split('?')[1] ?? '').get('conectat') || new URLSearchParams(location.hash.split('?')[1] ?? '').get('eroare') ? 'dispozitive' : 'index'));
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

  if (section !== 'index') {
    const title = section === 'admin' ? 'Administrare' : SECTIONS.find((x) => x.id === section)!.title;
    return (
      <>
        <BackHeader title={title} onBack={() => setSection('index')} />
        <div className="stack">
          {oauthMsg && section === 'dispozitive' && (
            <button type="button" className={oauthMsg.ok ? 'labs-alert ok-alert' : 'labs-alert'} onClick={() => setOauthMsg(null)}>
              <b>{oauthMsg.text}</b>
              <span>Atinge ca să închizi.</span>
            </button>
          )}
          {section === 'obiectiv' && <GoalSection onOpen={onOpen} />}
          {section === 'dispozitive' && <DevicesSection />}
          {section === 'chestionare' && <FormsSection onOpen={onOpen} />}
          {section === 'sanatate' && <HealthSection onOpen={onOpen} />}
          {section === 'preferinte' && <PrefsSection ambient={ambient} onAmbient={onAmbient} />}
          {section === 'cont' && <AccountSection onOpen={onOpen} />}
          {section === 'admin' && me.admin && !local && (
            <>
              <AdminKeys />
              <Card tight>
                <Label icon={Icons.users}>Prietenii</Label>
                <div className="small muted">Starea fiecărui sportiv și trei reparații (citire, plan, parolă temporară). Serverul refuză ruta fără rolul de admin.</div>
                <button className="pill on" style={{ marginTop: 10 }} onClick={() => onOpen('prieteni')}>
                  Deschide lista
                </button>
              </Card>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <BackHeader title="Profilul tău" onBack={onBack} />
      <div className="stack">
        <Card tight>
          <div className="row between" style={{ gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="h-md">{me.user.name || me.user.email}</div>
              <div className="small muted">{me.user.raceDate ? `${me.user.raceName ?? 'Cursa'} · ${me.user.raceDate.split('-').reverse().join('.')}` : 'fără cursă încă'}</div>
            </div>
            {me.user.goal && <span className="chip-lime">{me.user.goal}</span>}
          </div>
        </Card>

        <section className="card tight">
          {SECTIONS.map((sec) => (
            <button key={sec.id} className="exp-row" onClick={() => setSection(sec.id)}>
              <span className="row" style={{ gap: 12 }}>
                <span className="row-ic">{Icons[sec.icon]}</span>
                <span>
                  <b>{sec.title}</b>
                  <small>{sec.sub}</small>
                </span>
              </span>
              {Icons.chevronRight}
            </button>
          ))}
        </section>

        {me.admin && !local && (
          <section className="card tight">
            <button className="exp-row" onClick={() => setSection('admin')}>
              <span className="row" style={{ gap: 12 }}>
                <span className="row-ic">{Icons.shield}</span>
                <span>
                  <b>Administrare</b>
                  <small>numai pentru proprietar · chei, prieteni</small>
                </span>
              </span>
              {Icons.chevronRight}
            </button>
          </section>
        )}
      </div>
    </>
  );
}

function GoalSection({ onOpen }: { onOpen: (screen: string) => void }) {
  const me = useMe();
  const { local } = useData();
  return (
    <>
      <Card tight>
        <Label icon={Icons.flag}>Cursa</Label>
        <div className="h-md">{me.user.raceName ?? 'fără cursă'}</div>
        <div className="small muted">{me.user.raceDate ? `${me.user.raceDate.split('-').reverse().join('.')} · ${daysTo(me.today, me.user.raceDate)} zile` : 'Data cursei vine din chestionarul de intrare.'}</div>
        <button className="pill" style={{ marginTop: 10 }} onClick={() => onOpen('intake')}>
          {me.intakeComplete ? 'Editează chestionarul de intrare' : 'Completează chestionarul'}
        </button>
      </Card>
      <Card tight>
        <Label>Disponibilitatea și programul</Label>
        <ProgramCard />
        {!local && me.intakeComplete && <RegenPlan />}
      </Card>
    </>
  );
}

function daysTo(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Dispozitive: conexiune, ultima încercare, ultima citire reușită, ultima zi cu date și ce lipsește azi — separat. */
function DevicesSection() {
  const me = useMe();
  const { connect, local, submitForm } = useData();
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const srcOf = (p: string) => me.sources?.find((s) => s.id === p);
  const connected = (p: string) => me.devices.find((d) => d.provider === p);
  return (
    <>
      <Card>
        <div className="row between" style={{ marginBottom: 8 }}>
          <Label icon={Icons.watch}>Brățări</Label>
          <SyncButton compact />
        </div>
        <div className="dev-list">
          {DEVICES.map((d) => {
            const c = connected(d.provider);
            const s = srcOf(d.provider);
            return (
              <div key={d.provider} className="dev">
                <div className="row between" style={{ gap: 10 }}>
                  <b>{d.name}</b>
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
                {c && s ? (
                  <div className="kv dev-kv">
                    <span>Conexiune</span>
                    <b>{s.error ? 'conectat · ultima citire a eșuat' : 'conectat'}</b>
                    <span>Ultima încercare</span>
                    <b>{s.lastAttempt ? fmtTime(s.lastAttempt) : '—'}</b>
                    <span>Ultima citire reușită</span>
                    <b>{s.lastSync ? fmtTime(s.lastSync) : '—'}</b>
                    <span>Ultima zi cu date</span>
                    <b>{s.lastData ? fmtDayMonth(s.lastData) : 'nicio observație încă'}</b>
                    {s.missingToday && s.missingToday.length > 0 && (
                      <>
                        <span>Lipsește azi</span>
                        <b>{s.missingToday.join(', ')}</b>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="tiny muted">{d.note}</div>
                )}
                {c && s && !s.error && s.lastSync && s.missingToday?.length === 4 && <div className="tiny muted">Conectat; datele de azi nu au sosit încă. O citire fără date noi nu schimbă data observațiilor.</div>}
                {s?.error && <div className="tiny" style={{ color: 'var(--c-rosu)' }}>Eroare la ultima citire: {s.error}</div>}
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
          „Conectează” te duce la pagina producătorului; te loghezi acolo, apeși „Allow” și te întorci aici. Serverul citește brățările singur: la deschiderea aplicației, la 15 minute și când brățara anunță o noapte sau o ședință nouă. Ecranul se actualizează la deschidere și când apeși butonul de citire.
        </div>
      </Card>
      {!local && <AppleCard />}
      {!local && <SamsungCard />}
    </>
  );
}

/**
 * Samsung Watch / Galaxy Watch: Samsung nu are un API în cloud pentru aplicații ca a noastră. Două căi reale:
 *  1. antrenamentele cu GPS: Samsung Health → Strava (setare oficială), apoi Strava → AIRON (deja conectat);
 *  2. somnul, HRV-ul, pulsul de repaus și antrenamentele fără GPS: Health Connect (Android) + aplicația
 *     „Health Connect Webhook”, care trimite înregistrările la adresa personală de mai jos (aceeași ca la Apple Health).
 */
function SamsungCard() {
  const me = useMe();
  const { submitForm } = useData();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setErr(null);
    try {
      const r = await submitForm('apple', {});
      const u = typeof r.data?.url === 'string' ? r.data.url : null;
      setUrl(u ? u.replace('/api/webhooks/apple?', '/api/webhooks/android?') : null);
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
  const last = me.profile.androidLast;
  return (
    <Card>
      <Label icon={Icons.watch}>Samsung Watch · Samsung Health</Label>
      <div className="small">{last ? (last.ok ? `primește date · ultima trimitere ${fmtTime(last.at)}` : `ultima trimitere (${fmtTime(last.at)}) a eșuat`) : 'Samsung nu dă acces direct din cloud. Antrenamentele vin prin Strava; somnul și pulsul prin Health Connect, de pe telefon.'}</div>
      {last && (
        <div className="tiny" style={{ marginTop: 6, color: last.ok ? 'var(--muted)' : 'var(--c-rosu)' }}>
          {last.ok ? `primită · ${last.detail ?? ''}` : `eșuată · ${last.detail ?? 'eroare necunoscută'}`}
        </div>
      )}
      <div className="apple-steps">
        <div className="as-step">
          <b>1. Antrenamentele: Samsung Health → Strava</b>
          <span>În Samsung Health: ⋮ → Setări → Servicii conectate → Strava → autorizează. Apoi conectează Strava aici (mai sus). Vin doar antrenamentele cu GPS (alergare, bicicletă afară); înotul în bazin și banda nu trec prin Strava.</span>
        </div>
        <div className="as-step">
          <b>2. Somnul, HRV-ul, pulsul: Health Connect</b>
          <span>Pe telefon: Samsung Health → Setări → Health Connect → permite scrierea (somn, puls, HRV, exerciții). Instalează din Play Store „Health Connect Webhook” (com.hcwebhook.app, open source) și dă-i acces la Health Connect.</span>
        </div>
        <div className="as-step">
          <b>3. Adresa personală</b>
          <span>În Health Connect Webhook adaugi un webhook cu adresa de mai jos (JSON, POST), programat la o oră. Primul pachet ne arată și ce tipuri trimite telefonul tău; dacă apare „tipuri necunoscute”, le adăugăm.</span>
        </div>
      </div>
      {url ? (
        <>
          <div className="tiny" style={{ marginTop: 10, wordBreak: 'break-all', userSelect: 'all' }}>
            {url}
          </div>
          <button className="pill on" style={{ marginTop: 8 }} onClick={() => void copy()}>
            {copied ? 'Copiat' : 'Copiază adresa'}
          </button>
          <div className="tiny muted" style={{ marginTop: 8 }}>Aceeași adresă personală servește și Apple Health; dacă o refaci, cea veche nu mai primește date.</div>
        </>
      ) : (
        <button className="pill" style={{ marginTop: 10 }} onClick={() => void make()}>
          {me.profile.appleConnected ? 'Arată / refă adresa pentru Android' : 'Conectează Samsung Health'}
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

function FormsSection({ onOpen }: { onOpen: (screen: string, opts?: { activityId?: string }) => void }) {
  const me = useMe();
  const lastDone = lastDoneWorkout(me);
  const lastDoneId = lastDone ? (me.activities.find((a) => a.sport === lastDone.sport && a.date >= lastDone.date && !a.unplanned)?.id ?? `plan-${lastDone.id}`) : null;
  const morning = me.forms.morning as MorningForm | null;
  return (
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
          <div style={{ fontWeight: 700 }}>Check-in de dimineață</div>
          <div className="tiny muted">4 note + semnale · {fmtDayMonth(me.today)}{morningComplete(morning ?? undefined) ? ' · completat' : ''}</div>
        </div>
        <button className={`pill ${morningComplete(morning ?? undefined) ? '' : 'on'}`} onClick={() => onOpen('dimineata')}>
          {morningComplete(morning ?? undefined) ? 'Editează check-in-ul' : 'Completează'}
        </button>
        {lastDone && lastDoneId && (
          <>
            <div>
              <div style={{ fontWeight: 700 }}>După ședință</div>
              <div className="tiny muted">efort perceput, durere, comentariu · {lastDone.sport} {fmtDayMonth(lastDone.date)}{eveningComplete(me.forms.evening[lastDoneId]) ? ' · completat' : ''}</div>
            </div>
            <button className={`pill ${eveningComplete(me.forms.evening[lastDoneId]) ? '' : 'on'}`} onClick={() => onOpen('seara', { activityId: lastDoneId })}>
              {eveningComplete(me.forms.evening[lastDoneId]) ? 'Editează' : 'Completează'}
            </button>
          </>
        )}
        <div>
          <div style={{ fontWeight: 700 }}>Săptămânal</div>
          <div className="tiny muted">duminica, 3 întrebări{me.forms.weeklyDone ? ' · completat' : ''}</div>
        </div>
        <button className="pill" onClick={() => onOpen('saptamanal')}>
          {me.forms.weeklyDone ? 'Editează' : 'Deschide'}
        </button>
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Niciunul nu e obligatoriu. Fără check-in-ul de dimineață, decizia zilei e cel mult galbenă; fără feedback după ședință, antrenorii nu au efortul perceput și durerea. Lipsa unui răspuns nu e „răspuns zero”.
      </div>
    </Card>
  );
}

/** Sănătate: documente primite vs. declarații, cu data; o bifă nu e autorizare universală. */
function HealthSection({ onOpen }: { onOpen: (screen: string) => void }) {
  const me = useMe();
  return (
    <>
      <Card>
        <Label icon={Icons.pulse}>Date de bază</Label>
        <BaselineList onOpen={(s) => onOpen(s)} />
        <div className="tiny muted" style={{ marginTop: 10 }}>
          Avizul cardiologic e declarat de tine în chestionar; documentul urcat și restricțiile din analize sunt stări separate. Un document nou nu produce o prescripție medicală: planul urmează regulile de siguranță existente și orice interpretare e cu medicul tău.
        </div>
      </Card>
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
    </>
  );
}

function PrefsSection({ ambient, onAmbient }: { ambient: boolean; onAmbient: (v: boolean) => void }) {
  const { local } = useData();
  return (
    <>
      <Card tight>
        <Label icon={Icons.sun}>Lumina ambientală</Label>
        <div className="row between" style={{ gap: 10 }}>
          <div className="small">Fundalul se colorează discret după decizia zilei (verde, galben, roșu; neutru fără date). Statică, fără animații.</div>
          <button className={`switch ${ambient ? 'on' : ''}`} style={{ width: 'auto' }} role="switch" aria-checked={ambient} aria-label="Lumina ambientală" onClick={() => { onAmbient(!ambient); setAmbientOn(!ambient); }}>
            <span className="knob" />
          </button>
        </div>
      </Card>
      {!local && <AboutCard />}
      {!local && <CityCard />}
    </>
  );
}

function AccountSection({ onOpen }: { onOpen: (screen: string) => void }) {
  const me = useMe();
  const { logout, local } = useData();
  return (
    <Card tight>
      <Label icon={Icons.user}>Cont și consimțământ</Label>
      <div className="small">{me.user.email}</div>
      <div className="small" style={{ marginTop: 6 }}>18+ · date de sănătate cu consimțământ · nu e serviciu medical · ștergerea contului la cerere, din aplicație sau pe e-mail</div>
      <div className="tiny muted" style={{ marginTop: 6 }}>„Repornește aplicația” șterge doar fișierele aplicației salvate în telefon (cache) și reîncarcă pagina; datele tale rămân pe server, iar răspunsurile netrimise se trimit la următoarea conexiune.</div>
      <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
        <button className="pill" onClick={() => onOpen('ghid')}>
          Arată ghidul
        </button>
        <button className="pill" onClick={() => void hardReload()}>
          Repornește aplicația
        </button>
        <button className="pill" onClick={() => void logout()}>
          {local ? 'Șterge tot din acest telefon' : 'Ieși din cont'}
        </button>
      </div>
    </Card>
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
function ProgramCard() {
  const me = useMe();
  const { submitForm, local, refresh } = useData();
  const av = me.availability;
  const [busy, setBusy] = useState(false);
  const fmt = (x: number) => x.toLocaleString('ro-RO', { maximumFractionDigits: 1 });
  const setHours = async (ore: number) => {
    setBusy(true);
    try {
      await submitForm('ore-sport', { ore });
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  if (!av) {
    return (
      <div>
        <span className="num md">{me.budgetHours == null ? '–' : fmt(me.budgetHours)}</span>
        <span className="unit">ore pe săptămână pentru plan</span>
      </div>
    );
  }
  return (
    <>
      <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
        <div>
          <span className="num md">{fmt(av.sportHours)}</span>
          <span className="unit">h/săpt. pentru sport</span>
        </div>
        <div className="muted">
          <span className="num sm">{fmt(av.freeHours)}</span>
          <span className="unit">h timp liber bifat</span>
        </div>
      </div>
      <div className="avail-days" aria-label="Ore pentru sport pe zile">
        {av.perDay.map((m, d) => (
          <span key={d} className={m ? '' : 'off'}>
            <small>{['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'][d]}</small>
            <b>{m ? fmt(m / 60) : '–'}</b>
          </span>
        ))}
      </div>
      <div className="pref-k" style={{ marginTop: 10 }}>Ore pe săptămână pentru sport</div>
      <div className="wk-btns">
        {[4, 6, 8, 10, 12, 14, 16, 20].map((h) => (
          <button key={h} className={`pill ${av.declaredHours === h ? 'on' : ''}`} disabled={busy || local} onClick={() => void setHours(h)} aria-pressed={av.declaredHours === h}>
            {h} h
          </button>
        ))}
      </div>
      {!av.valid && <div className="warn-line">Ai bifat {fmt(av.freeHours)} ore libere. Alege câte ore ai pentru sport; până atunci planul nu se reface.</div>}
      {av.valid && av.planHours != null && Math.abs(av.planHours - av.sportHours) >= 1 && (
        <div className="warn-line">Planul activ e făcut pe {fmt(av.planHours)} h/săpt. Disponibilitatea de acum e {fmt(av.sportHours)} h: refă planul ca să se potrivească.</div>
      )}
      <div className="tiny muted" style={{ marginTop: 6 }}>Ferestrele de minimum 45 de minute, cel mult 5 h pe zi, × 0,8, plafonat la orele pentru sport. Ferestrele se schimbă din chestionar.</div>
    </>
  );
}

function RegenPlan() {
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prev, setPrev] = useState<Awaited<ReturnType<typeof server.regeneratePlan>> | null>(null);
  const fmt = (x: number) => x.toLocaleString('ro-RO', { maximumFractionDigits: 1 });
  const preview = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await server.regeneratePlan(true);
      if (r.ok) setPrev(r);
      else setMsg(r.reason ?? 'Nu s-a putut reface planul.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    setBusy(true);
    try {
      const r = await server.regeneratePlan(false);
      setMsg(r.ok ? 'Planul a fost refăcut.' : r.reason ?? 'Nu s-a putut reface planul.');
      setPrev(null);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: 10 }}>
      {!prev ? (
        <button className="pill" disabled={busy} onClick={() => void preview()}>
          {busy ? 'Calculez…' : 'Refă planul'}
        </button>
      ) : (
        <div className="regen-preview">
          <div>
            <b>Ce se schimbă</b>
          </div>
          <div className="small">
            Buget: {prev.currentBudgetHours != null ? `${fmt(prev.currentBudgetHours)} → ` : ''}
            <b>{fmt(prev.budgetHours)} h/săpt.</b>
            {prev.from ? ` · de luni, ${prev.from.split('-').reverse().slice(0, 2).join('.')}` : ''}
          </div>
          {prev.firstWeekSessions != null && (
            <div className="small">
              Prima săptămână: {prev.firstWeekSessions} ședințe, {fmt(prev.firstWeekHours ?? 0)} h. Ce ai făcut deja și săptămâna asta rămân cum sunt.
            </div>
          )}
          <div className="wk-btns">
            <button className="btn sm" disabled={busy} onClick={() => void run()}>
              {busy ? 'Refac…' : 'Confirm'}
            </button>
            <button className="pill" disabled={busy} onClick={() => setPrev(null)}>
              Renunț
            </button>
          </div>
        </div>
      )}
      <div className="tiny muted" style={{ marginTop: 6 }}>{msg ?? 'Vezi întâi ce se schimbă, apoi confirmi.'}</div>
    </div>
  );
}
