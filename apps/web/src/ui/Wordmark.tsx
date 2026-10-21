import { useId } from 'react';
import { WORDMARK_W, wordmarkPaths } from '@core/motion/wordmark.js';

const PATHS = wordmarkPaths();
const VB_W = Math.round(WORDMARK_W * 100 * 1000) / 1000;

/**
 * Cuvântul AIRON, același vector peste tot (antet, autentificare, intro-ul întâmpinării): literele din imaginea de
 * referință a ghidului (src/motion/wordmark.ts), fără font extern. Fiecare tușă e desenată cu capete drepte și
 * îmbinări ascuțite și decupată în cutia literei (vârful lui A retezat, diagonala lui N care taie colțurile, fantele
 * lui A și O). `height` = înălțimea majusculei, în px; culoarea vine din CSS (.wordmark).
 */
export function Wordmark({ height = 14, className = '' }: { height?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const width = Math.round(height * WORDMARK_W * 100) / 100;
  // Mărimea e dată explicit (atribute + stil inline), nu lăsată pe „auto”: un <svg> cu lățime automată e tratat de unele
  // versiuni de WebKit (iOS) ca 100% din container și împinge butoanele din antet în afara ecranului.
  return (
    <svg
      className={`wordmark ${className}`.trim()}
      viewBox={`0 0 ${VB_W} 100`}
      preserveAspectRatio="xMinYMid meet"
      height={height}
      width={width}
      style={{ width, height, flex: 'none' }}
      role="img"
      aria-label="AIRON"
      fill="none"
      stroke="currentColor"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      overflow="visible"
    >
      <defs>
        {PATHS.map((p, i) => (
          <clipPath key={i} id={`${id}c${i}`} clipPathUnits="userSpaceOnUse">
            <path d={p.clip} clipRule="evenodd" />
          </clipPath>
        ))}
      </defs>
      {PATHS.map((p, i) => (
        <path key={i} d={p.d} strokeWidth={p.width} clipPath={`url(#${id}c${i})`} />
      ))}
    </svg>
  );
}
