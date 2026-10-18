import type { ReactNode } from 'react';
import { Icons } from './common';

/** Cuvântul AIRON, cu I-ul în lime (ca pe iconiță). */
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="AIRON">
      A<i>I</i>RON
    </span>
  );
}

/** Bara de sus pe ecranele principale: AIRON stânga, avatarul (Profil) dreapta. */
export function AppHeader({ name, onProfile, right }: { name: string; onProfile: () => void; right?: ReactNode }) {
  return (
    <header className="app-head">
      <Wordmark />
      <div className="app-head-r">
        {right}
        <button className="avatar-btn" onClick={onProfile} aria-label="Profil" title="Profil">
          {(name || 'S').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  );
}

/** Bara de sus pe ecranele secundare: înapoi, titlul. */
export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="back-head">
      <button className="back-btn" onClick={onBack} aria-label="Înapoi">
        {Icons.arrowLeft}
      </button>
      <h1>{title}</h1>
      <div className="back-r">{right}</div>
    </header>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}

/** Comutator cu două (sau mai multe) vederi: un singur buton activ, anunțat de cititorul de ecran. */
export function SubTabs<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} className={value === it.id ? 'on' : ''} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Lumina ambientală: două pete mari, difuze, cu centrele în afara ecranului, în culoarea deciziei zilei.
 * Fără date = neutră. Statică, nu prinde atingeri, se poate opri din Profil → Preferințe.
 */
export function Ambient({ level }: { level: string | null }) {
  const lv = level === 'stop' ? 'rosu' : level;
  return (
    <div className={`ambient amb-${lv ?? 'neutru'}`} aria-hidden="true">
      <i className="amb-a" />
      <i className="amb-b" />
    </div>
  );
}

const AMB_KEY = 'airon.ambient';
export function ambientOn(): boolean {
  try {
    return localStorage.getItem(AMB_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setAmbientOn(on: boolean): void {
  try {
    localStorage.setItem(AMB_KEY, on ? 'on' : 'off');
  } catch {
    /* fără storage: rămâne aprinsă */
  }
}
