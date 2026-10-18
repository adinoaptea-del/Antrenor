import { useEffect, useState } from 'react';
import { BOOT_STAGE, SERVER, hardReload, runSetup, signInWithPassword, signUp } from '../data/api';
import { useData } from '../data/store';
import { Icons } from './common';
import { Wordmark } from './Shell';

// Intrarea în cont: e-mail și parolă. Contul se face din aplicație, fără e-mail de confirmare.
export function Login() {
  const { refresh } = useData();
  const first = !!SERVER?.firstUser;
  const [mode, setMode] = useState<'intru' | 'cont'>(first ? 'cont' : 'intru');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = /.+@.+\..+/.test(email) && pw.length >= (mode === 'cont' ? 8 : 1);
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      if (mode === 'cont') await signUp(email.trim(), pw);
      else await signInWithPassword(email.trim(), pw);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <div className="login-head">
        <div className="brand-lg"><img src="./icon-192.png" alt="" width={72} height={72} /><Wordmark /></div>
        <div className="sub">antrenorul AI pentru triatlon</div>
      </div>
      <div className="q" style={{ marginTop: 24 }}>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === 'intru'} className={mode === 'intru' ? 'on' : ''} onClick={() => setMode('intru')}>
            Am cont
          </button>
          <button role="tab" aria-selected={mode === 'cont'} className={mode === 'cont' ? 'on' : ''} onClick={() => setMode('cont')}>
            Cont nou
          </button>
        </div>
        {first && mode === 'cont' && <p className="hint">Ești primul: contul tău devine contul de administrator.</p>}
        <input className="date" type="email" inputMode="email" autoComplete="email" placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="date"
          type="password"
          autoComplete={mode === 'cont' ? 'new-password' : 'current-password'}
          placeholder={mode === 'cont' ? 'parolă (minimum 8 caractere)' : 'parolă'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && !busy && void go()}
        />
        {err && <p className="hint" style={{ color: 'var(--c-rosu)' }}>{err}</p>}
        <button className="btn" disabled={!valid || busy} onClick={() => void go()}>
          {busy ? 'Un moment…' : mode === 'cont' ? 'Creează contul' : 'Intră'} {Icons.arrowRight}
        </button>
        {mode === 'cont' && SERVER?.signupOpen === false && <p className="hint">Locurile sunt ocupate. Cere-i adminului să mărească MAX_USERS.</p>}
        <p className="hint">Datele de sănătate rămân în contul tău, pe un server din UE. Nu e serviciu medical. Le ștergi oricând.</p>
      </div>
    </div>
  );
}

export function Unconfigured({ reason }: { reason?: string | null }) {
  return (
    <div className="login">
      <div className="login-head">
        <div className="brand-lg"><img src="./icon-192.png" alt="" width={56} height={56} /><Wordmark /></div>
        <div className="sub">serverul nu e gata încă</div>
      </div>
      <div className="q" style={{ marginTop: 24 }}>
        <h3>Lipsește baza de date</h3>
        <p className="hint">{reason ?? 'Serverul nu răspunde.'}</p>
        <p className="hint">În Vercel: proiectul → Storage → Supabase → Connect. Apoi Deployments → Redeploy.</p>
      </div>
    </div>
  );
}

/** Prima pornire: un buton care creează tabelele și programările (citirea brățărilor la 15 minute, dimineața, seara). */
export function Setup() {
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<{ step: string; ok: boolean; detail?: string }[]>([]);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await runSetup();
      setSteps(r.steps);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <div className="login-head">
        <div className="brand-lg"><img src="./icon-192.png" alt="" width={72} height={72} /><Wordmark /></div>
        <div className="sub">prima pornire</div>
      </div>
      <div className="q" style={{ marginTop: 24 }}>
        <h3>Pregătește aplicația</h3>
        <p className="hint">Un singur apăsat: creez tabelele în baza de date și programez citirea brățărilor (la 15 minute), mesajul de dimineață și pe cel de seară. Durează câteva secunde.</p>
        <button className="btn" disabled={busy} onClick={() => void go()}>
          {busy ? 'Pregătesc…' : 'Pregătește'} {Icons.check}
        </button>
        {err && <p className="hint" style={{ color: 'var(--c-rosu)' }}>{err}</p>}
        {steps.length > 0 && (
          <div className="kv" style={{ marginTop: 6 }}>
            {steps.map((s) => (
              <div key={s.step} style={{ display: 'contents' }}>
                <div className="tiny">
                  {s.step}
                  {s.detail ? <span className="muted"> · {s.detail}</span> : null}
                </div>
                {s.ok ? <span className="ok">{Icons.check}</span> : <span className="no">eroare</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Loading({ text = 'Citesc datele…' }: { text?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="login" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', gap: 14 }}>
      <div className="sync busy" style={{ cursor: 'default' }}>
        <span className="circ-mini">{Icons.refresh}</span>
        {text}
      </div>
      {slow && (
        <div className="q" style={{ textAlign: 'center' }}>
          <p className="hint">Durează mai mult decât trebuie. Etapa: {BOOT_STAGE}.</p>
          <button className="btn" onClick={() => location.reload()}>
            Încearcă din nou
          </button>
          <button className="btn dark" onClick={() => void hardReload()}>
            Repornește aplicația
          </button>
        </div>
      )}
    </div>
  );
}

export function ErrorScreen({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="login">
      <div className="q" style={{ marginTop: 48 }}>
        <h3>Nu am putut citi datele</h3>
        <p className="hint">{error}</p>
        <button className="btn dark" onClick={retry}>
          Încearcă din nou
        </button>
      </div>
    </div>
  );
}
