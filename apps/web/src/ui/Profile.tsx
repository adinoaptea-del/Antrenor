import { previewCheer } from './Cheer';
import { SamsungImport } from './SamsungImport';
import { useCallback, useEffect, useState } from 'react';
import { Card, Icons, Label, fmtDayMonth } from './common';
import { BackHeader, setAmbientOn, useLocalBack } from './Shell';
import { InstallCard } from './Install';
import { SyncButton } from './SyncButton';
import { fmtTime } from './sync';
import { useData, useMe } from '../data/store';
import { SERVER, changePassword, hardReload, loadServerConfig, runSetup, server } from '../data/api';
import { SCHEMA_VERSION } from '@core/schema-version.js';
import { serverBuild } from '../data/api';
import { GOAL_LABEL } from '@core/calendar/phases.js';
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
    if (oauthMsg) history.replaceState(history.state, '', '#profil');
  }, [oauthMsg]);
  const toIndex = useCallback(() => setSection('index'), []);
  useLocalBack(section !== 'index', toIndex);

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
          {section === 'dispozitive' && <DevicesSection onAdmin={me.admin && !local ? () => setSection('admin') : undefined} />}
          {section === 'chestionare' && <FormsSection onOpen={onOpen} />}
          {section === 'sanatate' && <HealthSection onOpen={onOpen} />}
          {section === 'preferinte' && <PrefsSection ambient={ambient} onAmbient={onAmbient} />}
          {section === 'cont' && (
            <>
              <InstallCard />
              <AccountSection onOpen={onOpen} />
            </>
          )}
          {section === 'admin' && me.admin && !local && (
            <>
              <AdminDb />
              <AdminKeys />
              <Card tight>
                <Label icon={Icons.sparkle}>Felicitarea după ședință: previzualizare</Label>
                <div className="small muted">Vezi cum apare fereastra la sportivi, cu numele tău. Nu salvează nimic. La sportivi apare singură, după o ședință făcută cel puțin 60%.</div>
                <div className="wk-btns" style={{ marginTop: 10 }}>
                  {([['alergare', 'Alergare'], ['bicicleta', 'Bicicletă'], ['inot', 'Înot'], ['forta', 'Forță'], ['mers', 'Mers']] as const).map(([s, l]) => (
                    <button key={s} className="pill" onClick={() => previewCheer(s)}>
                      {l}
                    </button>
                  ))}
                  <button className="pill" onClick={() => previewCheer('alergare', 'bine')}>
                    Alergare la 75%
                  </button>
                </div>
              </Card>
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
            {me.user.goal && <span className="chip-lime">{me.user.goal in GOAL_LABEL ? GOAL_LABEL[me.user.goal as keyof typeof GOAL_LABEL] : me.user.goal}</span>}
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
function DevicesSection({ onAdmin }: { onAdmin?: () => void }) {
  const me = useMe();
  const { connect, local, submitForm } = useData();
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Butonul arată ce se întâmplă: „Se deschide…” până pleacă spre producător; o eroare apare sub brățara respectivă.
  const [opening, setOpening] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ p: string; text: string } | null>(null);
  const start = (p: 'whoop' | 'strava' | 'oura', name: string) => {
    setErr(null);
    setRowErr(null);
    setOpening(p);
    connect(p)
      .then(() => {
        // Dacă după câteva secunde suntem tot aici, navigarea n-a pornit (blocată de browser/aplicație): spunem asta.
        window.setTimeout(() => {
          setOpening((cur) => (cur === p ? null : cur));
          if (document.visibilityState === 'visible') setRowErr({ p, text: `Pagina ${name} nu s-a deschis. Încearcă din nou; dacă aplicația e instalată pe ecran, deschide-o o dată în browser (Safari / Chrome) și conectează de acolo.` });
        }, 6000);
      })
      .catch((e: Error) => {
        setOpening(null);
        setRowErr({ p, text: /nu e configurat/.test(e.message) ? `${name} nu e activat încă pe server.` : e.message });
      });
  };
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
                    onAdmin ? (
                      <button className="pill" onClick={onAdmin}>
                        Activează (chei)
                      </button>
                    ) : (
                      <span className="tiny muted">în curând</span>
                    )
                  ) : (
                    <button className="pill on" disabled={opening === d.provider} onClick={() => start(d.provider, d.name)}>
                      {opening === d.provider ? `Se deschide ${d.name}…` : 'Conectează'}
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
                {!c && SERVER?.providers && !SERVER.providers[d.provider] && (
                  <div className="tiny muted">{onAdmin ? `Lipsesc cheile aplicației ${d.name} pe server: le pui o dată în Administrare (pașii sunt acolo), apoi butonul „Conectează” apare pentru toți.` : `Conectarea ${d.name} nu e activată încă de administrator.`}</div>
                )}
                {rowErr?.p === d.provider && (
                  <div className="tiny" role="alert" style={{ color: 'var(--c-rosu)' }}>
                    {rowErr.text}
                  </div>
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
  const make = async (fresh = false) => {
    setErr(null);
    try {
      const r = await submitForm(fresh ? 'apple' : 'apple-arata', {});
      const u = typeof r.data?.url === 'string' ? r.data.url : null;
      setUrl(u ? u.replace('/api/webhooks/apple?', '/api/webhooks/android?') : null);
      setCopied(false);
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
      <div className="small">{last ? (last.ok && (last.detail ?? '').startsWith('test') ? `adresa e bună (test reușit la ${fmtTime(last.at)}) · încă n-au venit date de sănătate din Health Connect` : last.ok ? `primește date · ultima trimitere ${fmtTime(last.at)}` : `ultima trimitere (${fmtTime(last.at)}) a eșuat`) : 'Samsung nu dă acces direct din cloud. Antrenamentele vin prin Strava; somnul și pulsul prin Health Connect, de pe telefon.'}</div>
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
        <SamsungImport />
      </div>
      {url ? (
        <>
          <div className="tiny" style={{ marginTop: 10, wordBreak: 'break-all', userSelect: 'all' }}>
            {url}
          </div>
          <button className="pill on" style={{ marginTop: 8 }} onClick={() => void copy()}>
            {copied ? 'Copiat' : 'Copiază adresa'}
          </button>
          <div className="tiny muted" style={{ marginTop: 8 }}>Aceeași adresă servește și Apple Health. O schimbi doar dacă a ajuns la altcineva: cea veche nu mai primește date și trebuie lipită din nou în telefon.</div>
          <button className="link-btn" style={{ marginTop: 4 }} onClick={() => void make(true)}>
            Fă o adresă nouă
          </button>
        </>
      ) : (
        <button className="pill" style={{ marginTop: 10 }} onClick={() => void make()}>
          {me.profile.appleConnected ? 'Arată adresa pentru Android' : 'Conectează Samsung Health'}
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
  const [pw, setPw] = useState(false);
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
        {!local && (
          <button className="pill" onClick={() => setPw(!pw)}>
            Schimbă parola
          </button>
        )}
      </div>
      {pw && !local && <PasswordForm onDone={() => setPw(false)} />}
      {serverBuild() && <div className="tiny muted" style={{ marginTop: 8 }}>Versiunea aplicației: {serverBuild()}</div>}
    </Card>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = next && next.length < 8 ? 'parola nouă: minimum 8 caractere' : again && again !== next ? 'parolele noi nu coincid' : null;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(cur, next);
      setMsg({ ok: true, text: 'Parola a fost schimbată. Data viitoare intri cu cea nouă.' });
      setCur('');
      setNext('');
      setAgain('');
      setTimeout(onDone, 2500);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      style={{ marginTop: 10, display: 'grid', gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem && cur && next && again) void save();
      }}
    >
      <input type="email" autoComplete="username" value={me.user.email} readOnly hidden />
      <input className="date" type="password" autoComplete="current-password" placeholder="parola actuală" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input className="date" type="password" autoComplete="new-password" placeholder="parola nouă (minimum 8 caractere)" value={next} onChange={(e) => setNext(e.target.value)} />
      <input className="date" type="password" autoComplete="new-password" placeholder="parola nouă, încă o dată" value={again} onChange={(e) => setAgain(e.target.value)} />
      {problem && <div className="tiny muted">{problem}</div>}
      {msg && <div className={msg.ok ? 'tiny' : 'err tiny'}>{msg.text}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="pill" type="submit" disabled={busy || !!problem || !cur || !next || !again}>
          {busy ? '…' : 'Salvează parola'}
        </button>
        <button className="pill" type="button" onClick={onDone}>
          Renunță
        </button>
      </div>
      <div className="tiny muted">Ai uitat parola actuală? Ieși din cont și cere-i adminului o parolă temporară, apoi o schimbi de aici.</div>
    </form>
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

const PROVIDER_SETUP: { id: 'whoop' | 'strava' | 'oura'; name: string; site: string; steps: (u: string) => { label: string; value: string }[]; before?: { text: string; href?: string }[]; after?: string[]; final?: string[] }[] = [
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
    site: 'https://developer.ouraring.com/',
    // Pas cu pas (portalul nou: cloud.ouraring.com a fost retras pentru aplicații noi): nu e nevoie de inel, doar de un cont Oura (gratuit).
    before: [
      { text: 'Cont Oura (dacă nu ai): contul se face doar din aplicația Oura. iPhone: App Store → Oura (link).', href: 'https://apps.apple.com/app/oura/id1043837948' },
      { text: 'Android: Google Play → Oura (link). În aplicație: Start → emailul tău → codul primit pe email. Setarea inelului și abonamentul le poți sări: pentru chei nu trebuie inel.', href: 'https://play.google.com/store/apps/details?id=com.ouraring.oura' },
      { text: 'Deschide developer.ouraring.com (portalul nou pentru aplicații) și intră cu același email; Oura îți trimite un cod pe email.', href: 'https://developer.ouraring.com/' },
      { text: 'Creează o aplicație API nouă (Create / New application).', href: 'https://developer.ouraring.com/' },
    ],
    steps: (u) => [
      { label: 'Display Name (numele aplicației)', value: 'AIRON' },
      { label: 'Description', value: 'AIRON: antrenor personal pentru prieteni (somn, HRV, readiness, antrenamente). Datele se folosesc doar pentru planul sportivului.' },
      { label: 'Contact Email', value: 'adresa ta de email (o scrii tu)' },
      { label: 'Website', value: u },
      { label: 'Privacy Policy', value: `${u}/confidentialitate.html` },
      { label: 'Terms of Service', value: `${u}/confidentialitate.html` },
      { label: 'Redirect URIs (exact, fără spațiu la final)', value: `${u}/api/oauth/oura/callback` },
      { label: 'Scopes: bifează exact acestea cinci', value: 'personal, daily, heartrate, workout, session' },
    ],
    after: [
      'Bifează „I agree to the Oura API Agreement” și apasă „Create Application”.',
      'La aplicația nouă: „View Details” → copiezi Client ID și Client Secret.',
    ],
    final: [
      'Verificare: Profil → Dispozitive → Oura → Conectează. Dacă Oura refuză, eroarea apare sus în Profil.',
      'Prietenii cu inel Gen3 sau Ring 4 au nevoie de abonament Oura activ: fără el, Oura nu dă datele nicio aplicației.',
      'Aplicația nouă primește până la 10 oameni. Peste 10: în pagina aplicației, „Request more users” (după ce s-a conectat primul om).',
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
/**
 * Starea bazei de date, vizibilă adminului: actualizarea schemei rulează singură la pornire, în fundal,
 * dar o eroare acolo n-ar fi văzută de nimeni. Aici se vede dacă schema e la zi și se poate rula din nou, cu pașii la vedere.
 */
function AdminDb() {
  const [state, setState] = useState<'verific' | 'la-zi' | 'veche' | 'eroare'>('verific');
  const [steps, setSteps] = useState<{ step: string; ok: boolean; detail?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setState('verific');
    try {
      const c = await loadServerConfig();
      setState(!c.ready ? 'eroare' : c.upgrade ? 'veche' : 'la-zi');
    } catch {
      setState('eroare');
    }
  };
  useEffect(() => {
    void check();
  }, []);
  const run = async () => {
    setBusy(true);
    setSteps(null);
    try {
      const r = await runSetup();
      setSteps(r.steps);
    } catch (e) {
      setSteps([{ step: 'actualizare', ok: false, detail: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
      void check();
    }
  };
  const text = state === 'verific' ? 'verific…' : state === 'la-zi' ? `la zi (schema ${SCHEMA_VERSION})` : state === 'veche' ? `schema e mai veche decât aplicația (cerută: ${SCHEMA_VERSION})` : 'serverul nu răspunde';
  return (
    <Card tight>
      <Label icon={Icons.shield}>Baza de date</Label>
      <div className="row between" style={{ gap: 12, marginTop: 6 }}>
        <span className={`small ${state === 'la-zi' ? 'ok' : state === 'veche' || state === 'eroare' ? 'warn-text' : 'muted'}`} style={{ minWidth: 0 }}>
          {state === 'la-zi' ? Icons.check : null} {text}
        </span>
        <button className="pill" style={{ flexShrink: 0 }} onClick={() => void run()} disabled={busy}>
          {busy ? 'Rulează…' : state === 'veche' ? 'Actualizează acum' : 'Rulează din nou'}
        </button>
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Actualizarea rulează singură la pornirea aplicației, fără întrebări; e idempotentă și nu atinge datele. Aici vezi rezultatul.</div>
      {steps && (
        <div className="list-rows" style={{ marginTop: 10 }}>
          {steps.map((s, i) => (
            <div key={i} className="row between small" style={{ gap: 10 }}>
              <span>
                <b>{s.step}</b>
                {s.detail ? <small className="muted"> · {s.detail}</small> : null}
              </span>
              <span className={s.ok ? 'ok' : 'warn-text'}>{s.ok ? 'ok' : 'eroare'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

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
                {p.before ? (
                  p.before.map((b, i) => (
                    <a key={b.text} className="tiny" href={b.href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)' }}>
                      {i + 1}. {b.text}
                    </a>
                  ))
                ) : (
                  <a className="tiny" href={p.site} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)' }}>
                    1. Deschide {p.site.replace('https://', '')} și fă o aplicație nouă
                  </a>
                )}
                <div className="tiny muted">{(p.before?.length ?? 1) + 1}. Copiază în formularul lor, câmp cu câmp:</div>
                {p.steps(a.appUrl).map((s) => (
                  <CopyLine key={s.label} label={s.label} value={s.value} />
                ))}
                {p.after?.map((t, i) => (
                  <div key={t} className="tiny muted">
                    {(p.before?.length ?? 1) + 2 + i}. {t}
                  </div>
                ))}
                <div className="tiny muted">{(p.before?.length ?? 1) + 2 + (p.after?.length ?? 0)}. Lipește aici ce îți dau ei:</div>
                <input className="date" placeholder="Client ID" autoComplete="off" value={vals[p.id]?.id ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: { id: e.target.value, secret: vals[p.id]?.secret ?? '' } })} />
                <input className="date" type="password" placeholder="Client Secret" autoComplete="off" value={vals[p.id]?.secret ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: { id: vals[p.id]?.id ?? '', secret: e.target.value } })} />
                <button className="btn" disabled={!vals[p.id]?.id || !vals[p.id]?.secret} onClick={() => void save(p.id)}>
                  Salvează cheile {p.name.split(' ')[0]}
                </button>
                {msg[p.id] && <div className="tiny">{msg[p.id]}</div>}
                {p.final?.map((t, i) => (
                  <div key={t} className="tiny muted">
                    {(p.before?.length ?? 1) + 3 + (p.after?.length ?? 0) + i}. {t}
                  </div>
                ))}
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
      {/* Doza recomandată ≠ timpul disponibil (auditul F55, F04): avertizare doar când planul NU încape. */}
      {av.valid && av.planHours != null && av.planHours > av.sportHours + 0.25 && (
        <div className="warn-line">Planul activ cere {fmt(av.planHours)} h/săpt., mai mult decât ai acum ({fmt(av.sportHours)} h): refă planul ca să încapă.</div>
      )}
      {av.valid && av.planHours != null && av.planHours <= av.sportHours + 0.25 && av.sportHours - av.planHours >= 1 && (
        <div className="tiny muted" style={{ marginTop: 6 }}>Planul folosește {fmt(av.planHours)} h din {fmt(av.sportHours)} h: doza e aleasă după nivel, etapă și frecvență, nu ca să umple tot timpul liber. Nu e nevoie să-l refaci.</div>
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
    if (busy) return;
    setBusy(true);
    try {
      const r = await server.regeneratePlan(false, prev?.signature);
      if (r.stale) {
        // Datele s-au schimbat între previzualizare și confirmare: arătăm varianta nouă, nu activăm nimic în tăcere.
        setPrev(r);
        setMsg(r.reason ?? 'S-au schimbat datele; verifică din nou.');
        return;
      }
      setMsg(r.ok ? (r.unchanged ? 'Planul era deja acesta: nimic de schimbat.' : `Planul a fost refăcut.${r.note ? ` ${r.note}` : ''}`) : r.reason ?? 'Nu s-a putut reface planul.');
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
              Prima săptămână: {prev.firstWeekSessions} ședințe, {fmt(prev.firstWeekHours ?? 0)} h (exact ce se activează). Ce ai făcut deja și săptămâna asta rămân cum sunt.
            </div>
          )}
          {(prev.awayApplied ?? 0) > 0 && <div className="small">Plecările anunțate rămân: {prev.awayApplied} ședințe schimbate sau anulate în zilele acelea.</div>}
          {(prev.kept ?? []).length > 0 && (
            <div className="small">
              Ce ai ajustat tu rămâne:
              <ul className="regen-list">
                {prev.kept!.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          )}
          {(prev.dropped ?? []).length > 0 && (
            <div className="small warn-line">
              Ajustări care nu se mai aplică:
              <ul className="regen-list">
                {prev.dropped!.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
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
