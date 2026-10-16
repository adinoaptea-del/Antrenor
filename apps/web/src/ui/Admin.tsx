import { useEffect, useState } from 'react';
import { Card, CircleBtn, Icons, Label, LiveTitle } from './common';
import { server, type AdminUser } from '../data/api';
import { fmtTime } from './sync';

const NAME: Record<string, string> = { whoop: 'Whoop', strava: 'Strava', oura: 'Oura' };

/** Pentru admin: starea fiecărui prieten și reparațiile care se pot face de la distanță. */
export function Admin({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cost, setCost] = useState<{ month: number; today: number; tracking: boolean } | null>(null);
  const [out, setOut] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    server.adminList().then(
      (r) => {
        setUsers(r.users);
        setCost({ month: r.costMonth ?? 0, today: r.costToday ?? 0, tracking: !!r.tracking });
      },
      (e: Error) => setErr(e.message),
    );
  useEffect(() => {
    void load();
  }, []);
  const act = async (action: 'sync' | 'plan' | 'parola', id: string) => {
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
        {err && <Card tight><div className="small" style={{ color: 'var(--c-rosu)' }}>{err}</div></Card>}
        {!users && !err && <Card tight><div className="small muted">Citesc…</div></Card>}
        {users?.map((u) => (
          <Card key={u.id}>
            <div style={{ fontWeight: 700 }}>{u.name || u.email}</div>
            <div className="tiny muted">{u.email} · din {u.since.split('-').reverse().join('.')}{u.costMonth != null ? ` · ${usd(u.costMonth)} luna asta` : ''}</div>
            <div className="kv" style={{ marginTop: 8 }}>
              <div className="k">Chestionar</div>
              {u.intake ? <span className="ok">{Icons.check}</span> : <div className="no">necompletat</div>}
              <div className="k">Plan</div>
              {u.planStart ? <div className="tiny">din {u.planStart.split('-').reverse().join('.')}</div> : <div className="no">fără plan</div>}
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
                    {d.ok === false && d.detail ? <div className="tiny">{d.detail}</div> : null}
                  </div>
                </div>
              ))}
              <div className="k">Ultimul mesaj</div>
              <div className="tiny">{u.lastMessage ? fmtTime(u.lastMessage) : '–'}</div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="pill" disabled={!!busy} onClick={() => void act('sync', u.id)}>{busy === `sync:${u.id}` ? '…' : 'Citește brățările'}</button>
              <button className="pill" disabled={!!busy || !u.intake} onClick={() => void act('plan', u.id)}>{busy === `plan:${u.id}` ? '…' : 'Refă planul'}</button>
              <button className="pill" disabled={!!busy} onClick={() => void act('parola', u.id)}>{busy === `parola:${u.id}` ? '…' : 'Parolă temporară'}</button>
            </div>
            {out[u.id] && <div className="tiny" style={{ marginTop: 8, userSelect: 'all' }}>{out[u.id]}</div>}
          </Card>
        ))}
      </div>
    </>
  );
}

function usd(x: number): string {
  return `${x.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
