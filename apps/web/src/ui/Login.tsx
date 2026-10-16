import { useState } from 'react';
import { signInWithEmail } from '../data/api';
import { Icons } from './common';

// Intrarea în cont: un e-mail, un link. Fără parole de ținut minte.
export function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const send = async () => {
    setState('sending');
    try {
      await signInWithEmail(email.trim());
      setState('sent');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };
  return (
    <div className="login">
      <div className="hub-name" style={{ paddingTop: 48 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 1 }}>Antrenor</div>
        <div className="sub">Ironman 70.3 · pregătire pe date, nu pe impresii</div>
      </div>
      {state === 'sent' ? (
        <div className="q" style={{ marginTop: 24 }}>
          <h3>Verifică e-mailul</h3>
          <p className="hint">Ți-am trimis un link la {email}. Deschide-l pe telefonul ăsta și intri direct.</p>
        </div>
      ) : (
        <div className="q" style={{ marginTop: 24 }}>
          <h3>Intră cu e-mailul</h3>
          <input className="date" type="email" inputMode="email" autoComplete="email" placeholder="adresa ta de e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          {state === 'error' && <p className="hint" style={{ color: 'var(--c-rosu)' }}>{err}</p>}
          <button className="btn" disabled={!/.+@.+\..+/.test(email) || state === 'sending'} onClick={() => void send()}>
            {state === 'sending' ? 'Trimit…' : 'Trimite-mi linkul'} {Icons.arrowRight}
          </button>
          <p className="hint">Datele de sănătate rămân în contul tău, pe un server din UE. Nu e serviciu medical. Le ștergi oricând dintr-un buton.</p>
        </div>
      )}
    </div>
  );
}

export function Unconfigured() {
  return (
    <div className="login">
      <div className="hub-name" style={{ paddingTop: 48 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, lineHeight: 1 }}>Antrenor</div>
        <div className="sub">serverul nu e configurat încă</div>
      </div>
      <div className="q" style={{ marginTop: 24 }}>
        <h3>Lipsesc cheile aplicației</h3>
        <p className="hint">
          Setează <code>VITE_SUPABASE_URL</code> și <code>VITE_SUPABASE_ANON_KEY</code> la build (Vercel → Environment Variables) și redeployează. Pașii compleți: <code>docs/pornire.md</code>.
        </p>
      </div>
    </div>
  );
}

export function Loading({ text = 'Citesc datele…' }: { text?: string }) {
  return (
    <div className="login" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <div className="sync busy" style={{ cursor: 'default' }}>
        <span className="circ-mini">{Icons.refresh}</span>
        {text}
      </div>
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
