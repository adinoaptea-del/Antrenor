import { useEffect, useState } from 'react';

// Prima intrare, după chestionar: 3, 2, 1, „Mult succes”, apoi aplicația.
export function Countdown({ onDone }: { onDone: () => void }) {
  const steps = ['3', '2', '1', 'Mult succes'];
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    const last = i === steps.length - 1;
    const t = setTimeout(() => {
      if (!last) setI(i + 1);
      else {
        setOut(true);
        setTimeout(onDone, 500);
      }
    }, last ? 1600 : 900);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const word = steps[i]!;
  return (
    <div className={`startcd ${out ? 'out' : ''}`} role="status" aria-live="assertive">
      <span key={i} className={word.length > 1 ? 'cd-word' : 'cd-num'}>
        {word}
      </span>
    </div>
  );
}
