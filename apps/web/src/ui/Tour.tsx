import { useEffect, useLayoutEffect, useState } from 'react';

// Ghidul de la prima folosire: evidențiază pe rând ce e pe ecran. Se poate sări oricând; se reia din Profil.
export const TOUR_KEY = 'airon.ghid.v1';

const STEPS: { sel: string | null; title: string; text: string }[] = [
  { sel: '.name-ring', title: 'Profilul tău', text: 'Apasă pe numele tău. Brățări, analize, oraș, aviz, chestionare și setări. Tot aici, ca admin, activezi brățările pentru toată lumea.' },
  { sel: '.progress', title: 'Bara de pregătire', text: 'Cât de pregătit ești pentru cursă, din 5 componente reale. Ce nu se poate măsura rămâne „fără date”, nu se estimează.' },
  { sel: '.sync', title: 'Citește datele', text: 'Apeși după un antrenament ca aplicația să-l vadă imediat. Altfel citește singură la 15 minute.' },
  { sel: '.forms-row', title: 'Formularele', text: 'Dimineața (20 de secunde), după antrenament și duminica. Cu cât răspunzi, cu atât antrenorii știu mai bine.' },
  { sel: '.sports', title: 'Cele trei sporturi', text: 'Următoarea ședință pe fiecare. Atingi un sport: detalii, recorduri și totalul de la începutul pregătirii.' },
  { sel: '.boxes', title: 'Recuperare, forță, calendar', text: 'Calendarul are tot planul până la cursă: atingi o zi și vezi fiecare ședință pe pași.' },
  { sel: '.nav', title: 'Navigarea', text: 'Antrenament, Acasă (la mijloc) și Recuperare.' },
  { sel: '.fab', title: 'Antrenorul', text: 'Mesajele head coach-ului: dimineața la 5:30, după antrenament și duminica. Doar el îți scrie; specialiștii lucrează în spate.' },
  { sel: null, title: 'Marginea ecranului', text: 'Își schimbă culoarea după cum te-ai recuperat: verde, galben, portocaliu sau roșu. Apare după analiza de dimineață.' },
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
