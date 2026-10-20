import { useState } from 'react';
import { feedbackDue } from '@core/usage.js';
import { useData, useMe } from '../data/store';
import { firstUseDate, sendRating } from '../data/usage';

const ASKED = 'airon-feedback-asked';
const readAsked = () => {
  try {
    return localStorage.getItem(ASKED);
  } catch {
    return null;
  }
};
const markAsked = (d: string) => {
  try {
    localStorage.setItem(ASKED, d);
  } catch {
    /* fără stocare: întrebarea poate reveni */
  }
};

/**
 * „Cât de mult îți place AIRON?” — o notă 1–5 pe Acasă, la cel mult 14 zile, după primele 3 zile de folosire
 * (src/usage.ts feedbackDue). O vede Cuza în Admin → Prieteni. Nu la admin și nu în modul demo.
 */
export function FeedbackCard() {
  const me = useMe();
  const { local } = useData();
  const [due, setDue] = useState(() => !me.admin && !local && feedbackDue(firstUseDate(), readAsked(), me.today));
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!due) return null;
  if (done)
    return (
      <section className="card note-card">
        <b>Mulțumesc!</b>
        <p className="small muted">Te mai întreb peste două săptămâni.</p>
      </section>
    );
  const send = async () => {
    if (score == null) return;
    setBusy(true);
    setErr(null);
    try {
      await sendRating(score, text.trim() || null);
      markAsked(me.today);
      setDone(true);
      window.setTimeout(() => setDue(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card note-card" aria-label="Cât de mult îți place AIRON">
      <b>Cât de mult îți place AIRON?</b>
      <p className="small muted">1 = deloc, 5 = foarte mult. Durează 5 secunde.</p>
      <div className="row" style={{ gap: 6, marginTop: 8 }} role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={score === n} className={`pill${score === n ? ' on' : ''}`} style={{ flex: 1 }} onClick={() => setScore(n)}>
            {n}
          </button>
        ))}
      </div>
      {score != null && (
        <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder={score <= 3 ? 'Ce te deranjează? (opțional)' : 'Ce-ți place cel mai mult? (opțional)'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Comentariu" maxLength={500} />
      )}
      {err && <p className="small" style={{ color: 'var(--c-rosu)' }}>{err}</p>}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="pill on" disabled={score == null || busy} onClick={() => void send()}>
          {busy ? '…' : 'Trimite'}
        </button>
        <button
          className="pill"
          onClick={() => {
            markAsked(me.today);
            setDue(false);
          }}
        >
          Mai târziu
        </button>
      </div>
    </section>
  );
}
