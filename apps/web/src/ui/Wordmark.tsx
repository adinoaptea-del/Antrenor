import { WM, WORDMARK_W, wordmarkPaths } from '@core/motion/wordmark.js';

const PATHS = wordmarkPaths();

/**
 * Cuvântul AIRON, același vector peste tot (antet, autentificare, intro-ul întâmpinării): litere geometrice monoline din
 * src/motion/wordmark.ts, fără font extern. `height` = înălțimea majusculei, în px; culoarea vine din CSS (.wordmark).
 */
export function Wordmark({ height = 14, className = '' }: { height?: number; className?: string }) {
  return (
    <svg
      className={`wordmark ${className}`.trim()}
      viewBox={`0 0 ${Math.round(WORDMARK_W * 100 * 1000) / 1000} 100`}
      height={height}
      width={Math.round(height * WORDMARK_W * 100) / 100}
      role="img"
      aria-label="AIRON"
      fill="none"
      stroke="currentColor"
      strokeWidth={WM.stroke * 100}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS.map((p) => (
        <path key={p.letter} d={p.d} />
      ))}
    </svg>
  );
}
