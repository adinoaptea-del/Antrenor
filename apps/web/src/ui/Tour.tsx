import { useEffect, useLayoutEffect, useState } from 'react';

// Ghidul de la prima folosire: evidențiază pe rând ce e pe ecran. Se poate sări oricând; se reia din Profil.
export const TOUR_KEY = 'airon.ghid.v1';

const STEPS: { sel: string | null; title: string; text: string }[] = [
  { sel: '.today-card', title: 'Astăzi', text: 'O singură decizie pe zi: verde, galbenă, roșie sau stop, cu motivul. Ședința de azi și un singur buton. Fără date de la brățări, aplicația te întreabă pe tine.' },
  { sel: '.race-panel', title: 'Repere pentru cursă', text: 'Un indice pe fiecare probă, față de reperele ei. O probă fără date rămâne „fără date”: nu afișăm un procent global pe jumătate.' },
  { sel: '.sync', title: 'Citește datele', text: 'Apeși după un antrenament ca aplicația să-l vadă imediat. Altfel serverul citește singur la 15 minute.' },
  { sel: '.avatar-btn', title: 'Profilul tău', text: 'Obiectiv și disponibilitate, dispozitive, chestionare, date de sănătate, preferințe, cont. Scurt, câte un ecran.' },
  { sel: '.tabbar', title: 'Patru taburi', text: 'Acasă · Plan (calendar și sporturi) · Evoluție (starea de azi și obiectivul) · Coach (decizia explicată).' },
  { sel: null, title: 'Lumina din fundal', text: 'Se colorează discret după decizia zilei; neutră când lipsesc datele. O poți opri din Profil → Preferințe.' },
];

export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i]!;

  useLayoutEffect(() => {
    const el = step.sel ? document.querySelector(step.sel) : null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const r = el.getBoundingClientRect();
    setRect(r);
  }, [i, step.sel]);

  useEffect(() => {
    const onResize = () => {
      const el = step.sel ? document.querySelector(step.sel) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [step.sel]);

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* fără storage: ghidul poate reapărea, nu strică nimic */
    }
    window.scrollTo({ top: 0 });
    onClose();
  };
  const last = i === STEPS.length - 1;
  const pad = 6;
  const below = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Ghid">
      {rect ? (
        <div className="hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="hole" style={{ top: '50%', left: '50%', width: 0, height: 0, outline: 'none' }} />
      )}
      <div className="tip" style={rect ? (below ? { top: Math.min(rect.bottom + 16, window.innerHeight - 200) } : { bottom: Math.min(window.innerHeight - rect.top + 16, window.innerHeight - 200) }) : { top: '38%' }}>
        <div className="count">
          {i + 1} din {STEPS.length}
        </div>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        <div className="row">
          <button className="pill" onClick={finish}>
            Sari peste
          </button>
          <div className="row" style={{ gap: 6 }}>
            {i > 0 && (
              <button className="pill" onClick={() => setI(i - 1)}>
                Înapoi
              </button>
            )}
            <button className="pill on" onClick={() => (last ? finish() : setI(i + 1))}>
              {last ? 'Gata' : 'Următorul'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return false;
  }
}
