import { useEffect, useState } from 'react';
import { Card, CircleBtn, Icons, Label, LiveTitle } from './common';
import { server, type AdminUser, type UsageSummary } from '../data/api';
import { fmtTime } from './sync';

const NAME: Record<string, string> = { whoop: 'Whoop', strava: 'Strava', oura: 'Oura', apple: 'Apple Health', android: 'Samsung Health' };

/** Pentru admin: starea fiecărui prieten și reparațiile care se pot face de la distanță. */
export function Admin({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cost, setCost] = useState<{ month: number; today: number; tracking: boolean } | null>(null);
  const [usageReady, setUsageReady] = useState(true);
  const [out, setOut] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [strava, setStrava] = useState<{ athletes: number; configured: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () =>
    server.adminList().then(
      (r) => {
        setUsers(r.users);
        setCost({ month: r.costMonth ?? 0, today: r.costToday ?? 0, tracking: !!r.tracking });
        setInvite(r.inviteUrl ?? null);
        setStrava(r.strava ?? null);
        setUsageReady(r.usageReady !== false);
      },
      (e: Error) => setErr(e.message),
    );
  useEffect(() => {
    void load();
  }, []);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const act = async (action: 'sync' | 'plan' | 'parola' | 'detalii' | 'sterge', id: string) => {
    setBusy(`${action}:${id}`);
    try {
      const r = await server.adminAction(action, id);
      setOut({ ...out, [id]: r.text });
      void load();
    } catch (e) {
      setOut({ ...out, [id]: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <header className="top">
        <div className="top-l">
          <CircleBtn icon={Icons.arrowLeft} label="Înapoi" onClick={onBack} />
        </div>
        <div className="top-c">
          <LiveTitle>Prieteni</LiveTitle>
        </div>
        <div className="top-r" />
      </header>
      <div className="stack">
        <Card tight>
          <div className="small muted">
            Dacă cuiva i se blochează aplicația: întâi îi spui să apese în Profil „Repornește aplicația”. Dacă nu ajunge, de aici: citești din nou brățările, refaci planul din chestionarul lui sau îi dai o parolă temporară.
          </div>
        </Card>
        {invite && (
          <Card tight>
            <Label>Link de invitație</Label>
            <div className="small muted">Un prieten nou își face cont doar din linkul ăsta. Dacă a ajuns unde nu trebuie, fă unul nou: cel vechi nu mai merge.</div>
            <div className="small" style={{ wordBreak: 'break-all', marginTop: 8, userSelect: 'all' }}>{invite}</div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button
                className="pill"
                onClick={() => {
                  navigator.clipboard?.writeText(invite).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? 'Copiat' : 'Copiază'}
              </button>
              <button
                className="pill"
                onClick={() => {
                  setCopied(false);
                  void server.newInvite().then((r) => setInvite(r.inviteUrl), (e: Error) => setErr(e.message));
                }}
              >
                Link nou
              </button>
            </div>
          </Card>
        )}
        {strava?.configured && (
          <Card tight>
            <Label>Strava (Garmin prin Strava)</Label>
            <div>
              <span className="num md">{strava.athletes}</span>
              <div className="tiny muted">{strava.athletes === 1 ? 'sportiv conectat' : 'sportivi conectați'} prin Strava</div>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Aplicația Strava a lui AIRON pornește în „Single Player Mode”: doar contul tău (dezvoltatorul) se poate conecta — un prieten primește eroare la
              autorizare. Ridici capacitatea la 10 sportivi singur, din <b>strava.com/settings/api</b> (contul tău de developer are nevoie de abonament Strava, cerut
              de Strava din 2026). Peste 10 sportivi: trimiți aplicația la review pe developers.strava.com (formularul Developer Program; capturi cu butonul „Connect
              with Strava” și cu locurile unde apar datele Strava). Până la aprobare, al 11-lea nu se poate conecta.
            </div>
          </Card>
        )}
        {cost && (
          <Card tight>
            <Label>Cost AI (Anthropic)</Label>
            <div className="grid-2">
              <div>
                <span className="num md">{usd(cost.today)}</span>
                <div className="tiny muted">azi</div>
              </div>
              <div>
                <span className="num md">{usd(cost.month)}</span>
                <div className="tiny muted">luna asta</div>
              </div>
            </div>
            <div className="tiny muted" style={{ marginTop: 8 }}>
              {cost.tracking ? 'Din tokenii raportați de Anthropic la fiecare apel, la prețul Sonnet 5.5 (2 $ / 10 $ pe milion). Factura exactă: console.anthropic.com → Usage.' : 'Se numără de acum: primul cost apare după următorul mesaj al antrenorului.'}
            </div>
          </Card>
        )}
        {users && <UsageOverview users={users} ready={usageReady} />}
        {err && <Card tight><div className="small" style={{ color: 'var(--c-rosu)' }}>{err}</div></Card>}
        {!users && !err && <Card tight><div className="small muted">Citesc…</div></Card>}
        {users?.map((u) => (
          <Card key={u.id}>
            <div style={{ fontWeight: 700 }}>{u.name || u.email}</div>
            <div className="tiny muted">{u.email} · din {u.since.split('-').reverse().join('.')}{u.costMonth != null ? ` · ${usd(u.costMonth)} luna asta` : ''}</div>
            {u.usage && <UsageBlock u={u.usage} />}
            {(u.rides42?.length || u.rides42Strava) && (
              <details style={{ marginTop: 8 }}>
                <summary className="tiny muted">Bicicletă în ultimele 6 săptămâni (ce intră la pregătire)</summary>
                <div className="tiny" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {(u.rides42 ?? []).map((r, i) => (
                    <div key={i}>
                      {r.date.slice(5).split('-').reverse().join('.')} · {r.minutes} min{r.km != null ? ` · ${r.km} km` : ''} · <b>{NAME[r.source] ?? r.source}</b> · „{(r.name ?? '').split(';')[0]}”
                    </div>
                  ))}
                  {u.rides42Strava && <div className="muted">+ ture din Strava (nu le vezi tu; sportivul le vede la el, în Plan → Sporturi → Bicicletă)</div>}
                </div>
              </details>
            )}
            {u.recent && u.recent.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="tiny muted">Ultimele ședințe ({u.recent.length})</summary>
                <div className="tiny" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {u.recent.map((r, i) => (
                    <div key={i}>
                      {r.date.slice(5).split('-').reverse().join('.')} · <b>{r.sport}</b> · {r.minutes} min{r.km != null ? ` · ${r.km} km` : ''} · {r.source} · „{(r.name ?? '').split(';')[0]}”
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className="kv" style={{ marginTop: 8 }}>
              <div className="k">Chestionar</div>
              {u.intake ? <span className="ok">{Icons.check}</span> : <div className="no">necompletat</div>}
              <div className="k">Plan</div>
              {u.planStart ? <div className="tiny">din {u.planStart.split('-').reverse().join('.')}</div> : <div className="no">fără plan</div>}
              {u.nutritionMissing && (
                <>
                  <div className="k">Mese</div>
                  {u.nutritionMissing.length ? <div className="no">nepersonalizate: lipsește {u.nutritionMissing.join(', ')}</div> : <div className="tiny">personalizate</div>}
                </>
              )}
              {u.devices.length === 0 && (
                <>
                  <div className="k">Brățări</div>
                  <div className="no">niciuna</div>
                </>
              )}
              {u.devices.map((d) => (
                <div key={d.provider} style={{ display: 'contents' }}>
                  <div className="k">{NAME[d.provider] ?? d.provider}</div>
                  <div className="tiny" style={{ textAlign: 'right', color: d.ok === false ? 'var(--c-rosu)' : undefined }}>
                    {d.lastSync ? `${d.ok === false ? 'eroare' : 'ok'} · ${fmtTime(d.lastSync)}` : 'încă necitit'}
                    {d.detail ? <div className="tiny" style={{ color: d.ok === false ? undefined : 'var(--muted)' }}>{d.detail}</div> : null}
                  </div>
                </div>
              ))}
              <div className="k">Ultimul mesaj</div>
              <div className="tiny">{u.lastMessage ? fmtTime(u.lastMessage) : '–'}</div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="pill" disabled={!!busy} onClick={() => void act('sync', u.id)}>{busy === `sync:${u.id}` ? '…' : 'Citește brățările'}</button>
              <button className="pill" disabled={!!busy || !u.intake} onClick={() => void act('plan', u.id)}>{busy === `plan:${u.id}` ? '…' : 'Refă planul'}</button>
              <button className="pill" disabled={!!busy || !u.intake} onClick={() => void act('detalii', u.id)}>{busy === `detalii:${u.id}` ? '…' : 'Vezi planul'}</button>
              <button className="pill" disabled={!!busy} onClick={() => void act('parola', u.id)}>{busy === `parola:${u.id}` ? '…' : 'Parolă temporară'}</button>
              {confirmDel !== u.id ? (
                <button className="pill" disabled={!!busy} onClick={() => setConfirmDel(u.id)}>
                  Șterge contul
                </button>
              ) : (
                <>
                  <button
                    className="pill"
                    style={{ borderColor: 'var(--c-rosu)', color: 'var(--c-rosu)' }}
                    disabled={!!busy}
                    onClick={() => {
                      setConfirmDel(null);
                      void act('sterge', u.id);
                    }}
                  >
                    {busy === `sterge:${u.id}` ? '…' : `Sigur: șterge definitiv ${u.email}`}
                  </button>
                  <button className="pill" disabled={!!busy} onClick={() => setConfirmDel(null)}>
                    Renunț
                  </button>
                </>
              )}
            </div>
            {confirmDel === u.id && (
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Se șterg contul, planul, activitățile, formularele și mesajele lui; brățările se deconectează (Strava eliberează locul). Nu se poate anula. Locul rămâne liber pentru alt prieten.
              </div>
            )}
            {out[u.id] && <div className="tiny" style={{ marginTop: 8, userSelect: 'all', whiteSpace: 'pre-wrap' }}>{out[u.id]}</div>}
          </Card>
        ))}
      </div>
    </>
  );
}

function usd(x: number): string {
  return `${x.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

const TREND: Record<UsageSummary['trend'], string> = { creste: 'revine mai des ↑', scade: 'revine mai rar ↓', stabil: 'la fel de des', nou: 'cont nou', inactiv: 'nu mai intră' };

/** „acum 3 h”, „ieri 21:40”, „acum 5 zile” — cât de recent a fost pe aplicație. */
function ago(iso: string | null): string {
  if (!iso) return 'niciodată (de când se numără)';
  const ms = Date.now() - Date.parse(iso);
  const min = Math.round(ms / 60_000);
  if (min < 2) return 'acum';
  if (min < 60) return `acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `acum ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? `ieri, ${fmtTime(iso)}` : `acum ${d} zile`;
}

/** Sus: cine a intrat în ultimele 7 zile și nota medie, pe toți prietenii. */
function UsageOverview({ users, ready }: { users: AdminUser[]; ready: boolean }) {
  if (!ready)
    return (
      <Card tight>
        <Label>Folosirea aplicației</Label>
        <div className="small muted">Baza se actualizează (schema 12) la următoarea deschidere a aplicației; de atunci încep să se numere intrările.</div>
      </Card>
    );
  const withU = users.filter((u) => u.usage);
  const active7 = withU.filter((u) => (u.usage?.activeDays7 ?? 0) > 0).length;
  const regular = withU.filter((u) => (u.usage?.activeDays7 ?? 0) >= 3).length;
  const sorted = [...withU].sort((a, b) => ((b.usage?.lastSeen ?? '') > (a.usage?.lastSeen ?? '') ? 1 : -1));
  return (
    <Card tight>
      <Label>Folosirea aplicației</Label>
      <div className="grid-2">
        <div>
          <span className="num md">{active7} / {withU.length}</span>
          <div className="tiny muted">au intrat în ultimele 7 zile</div>
        </div>
        <div>
          <span className="num md">{regular} / {withU.length}</span>
          <div className="tiny muted">intră des (3+ zile din 7)</div>
        </div>
      </div>
      <div className="kv" style={{ marginTop: 8 }}>
        {sorted.map((u) => (
          <div key={u.id} style={{ display: 'contents' }}>
            <div className="k">{(u.name || u.email).split(' ')[0]}</div>
            <div className="tiny" style={{ textAlign: 'right' }}>{ago(u.usage!.lastSeen)}</div>
          </div>
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>Se numără din 20.10.2026, fără ca ei să vadă ceva: intrări, minute, ce ecrane deschid. Nu și ce scrie pe ele. Cât le place se vede din comportament: revin singuri, des, și caută lucruri în aplicație.</div>
    </Card>
  );
}

/** Pe fiecare prieten: ultima intrare, cât de des revine, ce caută și nota lui. */
function UsageBlock({ u }: { u: UsageSummary }) {
  const maxInfo = Math.max(1, ...u.weeks.map((w) => w.info));
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
      <div className="kv">
        <div className="k">Ultima dată în aplicație</div>
        <div className="tiny" style={{ textAlign: 'right', fontWeight: 700 }}>{ago(u.lastSeen)}</div>
        <div className="k">Zile cu aplicația</div>
        <div className="tiny" style={{ textAlign: 'right' }}>{u.activeDays7}/7 · {u.activeDays28}/28 · {TREND[u.trend]}</div>
        <div className="k">Timp în aplicație</div>
        <div className="tiny" style={{ textAlign: 'right' }}>{u.weeks[3]!.minutes} min în ultimele 7 zile</div>
        <div className="k">Caută informații</div>
        <div className="tiny" style={{ textAlign: 'right' }}>{u.infoPerSession != null ? `${u.infoPerSession.toLocaleString('ro-RO')} deschideri / intrare` : '–'}</div>
      </div>
      <div className="tiny muted">Pe săptămâni (cea mai recentă în dreapta): informații căutate · zile · minute</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, alignItems: 'end' }} aria-label="Tendința pe 4 săptămâni">
        {u.weeks.map((w, i) => (
          <div key={i} style={{ display: 'grid', gap: 3, justifyItems: 'center' }}>
            <div style={{ width: '70%', height: 4 + (w.info / maxInfo) * 36, borderRadius: 4, background: i === 3 ? 'var(--accent)' : 'var(--accent-soft)' }} />
            <div className="tiny">{w.info} · {w.activeDays}z · {w.minutes}m</div>
          </div>
        ))}
      </div>
      {u.areas.length > 0 && (
        <div className="tiny">
          <span className="muted">Ce deschide (28 de zile): </span>
          {u.areas.map((a) => `${a.label} ${a.pct}%`).join(' · ')}
        </div>
      )}
    </div>
  );
}
