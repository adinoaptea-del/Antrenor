import { useState } from 'react';
import { Labs } from '../forms/Baseline';
import { Icons } from './common';

// Pasul de după chestionar: analizele. Cu ele, planul e pe corpul tău; fără ele, merge, dar cu mementouri la 3 zile.
export function LabsGate({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'choice' | 'upload' | 'later'>('choice');
  if (mode === 'upload') return <Labs onBack={() => setMode('choice')} onDone={onDone} />;
  return (
    <div className="login">
      <div className="hub-name" style={{ paddingTop: 40 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1.05 }}>Analizele tale</div>
        <div className="sub">ultimul pas înainte de plan</div>
      </div>
      {mode === 'choice' ? (
        <div className="q" style={{ marginTop: 24 }}>
          <h3>Ai analize de sânge mai noi de 12 luni?</h3>
          <p className="hint">
            Din ele vin nutriția, fierul, vitamina D și semnalele de alarmă. Feritina sub 30 sau hemoglobina scăzută țin antrenamentul la Z1–Z2 până discuți cu medicul. Urci PDF-ul sau o poză; Claude transcrie valorile, tu le verifici.
          </p>
          <button className="btn" onClick={() => setMode('upload')}>
            Urc analizele acum {Icons.arrowRight}
          </button>
          <button className="btn dark" onClick={() => setMode('later')}>
            Nu am analize recente
          </button>
        </div>
      ) : (
        <div className="q" style={{ marginTop: 24 }}>
          <h3>Fac planul și fără ele</h3>
          <p className="hint">
            Dar nu e 100% pe corpul tău: fără analize nu știm fierul, vitamina D sau dacă ceva cere o discuție cu medicul. Fă-le cât mai repede (hemoleucogramă, feritină, vitamina D, CK, CRP, glicemie, profil lipidic, TSH) și urcă-le din Date de bază. Îți reamintesc o dată la 3 zile până apar.
          </p>
          <button className="btn" onClick={onDone}>
            Am înțeles {Icons.check}
          </button>
        </div>
      )}
    </div>
  );
}
