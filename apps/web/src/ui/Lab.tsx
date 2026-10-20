import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ENTRY_MS, EXIT, EXIT_MS, PHASES, PHASE_LABEL, type PhaseName } from '@core/motion/teleport.js';
import { FIRE, FIRE_EXIT_MS, FIRE_LABEL, type FireState } from '@core/motion/fireStorm.js';
import { WelcomeFire } from './WelcomeFire';
import { cheerFor } from '@core/cheers.js';
import type { CosmicClock } from './Cosmic';
import { Orb } from './Orb';
import { GlassFX } from './Glass';
import { Tube } from './Tube';
import { BurstAtTap, useOpenOrigin } from './OpenFrom';

/**
 * Laboratorul grafic (Administrare): previzualizare izolată, fără date fictive în cont. Moduri: întâmpinare,
 * felicitare, ședință, masă, tub. Replay, pauză, încetinire 4×, oprire pe fiecare fază, cursor pe toată scena și
 * închidere în orice moment (testul „închidere în fiecare fază”).
 */

type Mode = 'intampinare' | 'reusita' | 'sedinta' | 'masa' | 'tub';
const MODES: [Mode, string][] = [
  ['intampinare', 'Întâmpinare'],
  ['reusita', 'Felicitare'],
  ['sedinta', 'Ședință'],
  ['masa', 'Masă'],
  ['tub', 'Tub'],
];
/** Pe cursor: 0–3400 ms scena deschisă (intrare ~2,5 s + repaus), apoi ieșirea „03” și dezvăluirea Acasă. */
const OPEN_END = 5000;
const TOTAL = OPEN_END + Math.max(EXIT_MS, FIRE_EXIT_MS);
const mid = (r: readonly [number, number]) => Math.round((r[0] + r[1]) / 2);
const JUMP: Record<PhaseName, number> = {
  liniste: mid(PHASES.liniste),
  convergenta: mid(PHASES.convergenta),
  deformare: 1200,
  impuls: PHASES.impuls[0] + 60,
  condensare: mid(PHASES.condensare),
  mesaj: mid(PHASES.mesaj),
  repaus: 3100,
  estompare: OPEN_END + mid(EXIT.estompare),
  deschidere: OPEN_END + mid(EXIT.deschidere),
  fragmentare: OPEN_END + mid(EXIT.fragmentare),
  ecou: OPEN_END + mid(EXIT.ecou),
  dezvaluire: OPEN_END + mid(EXIT.dezvaluire),
};
const EXIT_PHASES = new Set<string>(['estompare', 'deschidere', 'fragmentare', 'ecou', 'dezvaluire', 'BREAKUP', 'STORM', 'REFORM', 'HOME_IDLE']);
/** Întâmpinarea „Fire → Furtună → Home”: formarea din fire, ruperea, furtuna și reconstrucția bulei (aici, bula din laborator). */
const JUMP_FIRE: [FireState, number][] = [
  ['LINE_BUILD', 1100],
  ['WELCOME_IDLE', 3200],
  ['BREAKUP', OPEN_END + 450],
  ['STORM', OPEN_END + 1400],
  ['REFORM', OPEN_END + 3000],
  ['HOME_IDLE', OPEN_END + FIRE_EXIT_MS],
];
type AnyPhase = PhaseName | FireState;
const labelOf = (p: AnyPhase) => FIRE_LABEL[p] ?? PHASE_LABEL[p as PhaseName] ?? p;

export function GraphicsLab({ name, onClose }: { name: string | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('intampinare');
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<AnyPhase>('LINE_BUILD');
  const [ended, setEnded] = useState(false);
  const [compact, setCompact] = useState(false);
  const [ui, setUi] = useState({ playing: true, speed: 1, T: 0 });
  const tl = useRef({ T0: 0, base: performance.now(), playing: true, speed: 1, closeAt: null as number | null });
  const now = () => {
    const x = tl.current;
    return x.playing ? x.T0 + (performance.now() - x.base) * x.speed : x.T0;
  };
  const setT = (T: number, playing: boolean) => {
    tl.current.T0 = T;
    tl.current.base = performance.now();
    tl.current.playing = playing;
    setUi({ playing, speed: tl.current.speed, T });
  };
  const clock: CosmicClock = () => {
    const T = now();
    const ca = tl.current.closeAt;
    return ca == null ? { t: T, out: null } : { t: ca, out: T - ca };
  };
  // Cursorul urmează scena cât rulează.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (tl.current.playing) setUi((u) => ({ ...u, T: Math.min(TOTAL, now()) }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const replay = () => {
    setEnded(false);
    tl.current.closeAt = null;
    setT(0, true);
    setRun((r) => r + 1);
  };
  const pause = () => setT(now(), !tl.current.playing);
  const slow = () => {
    const T = now();
    tl.current.speed = tl.current.speed === 1 ? 0.25 : 1;
    setT(T, tl.current.playing);
  };
  const jump = (p: AnyPhase, at: number) => {
    tl.current.closeAt = EXIT_PHASES.has(p) ? OPEN_END : null;
    setT(at, false);
  };
  // Felicitarea folosește aceeași scenă ca întâmpinarea (audit grafic G05).
  const fire = mode === 'intampinare' || mode === 'reusita';
  const jumps: [AnyPhase, number][] =
    fire
      ? JUMP_FIRE
      : (Object.entries(JUMP) as [PhaseName, number][]);
  const scrub = (v: number) => {
    tl.current.closeAt = v > OPEN_END ? OPEN_END : null;
    setT(v, false);
  };
  /** „Continuă”: ieșirea pornește doar după ce mesajul e lizibil (ca în aplicație). */
  const closeNow = () => {
    if (tl.current.closeAt != null) return;
    const T = now();
    if (T < (fire ? FIRE.ready : ENTRY_MS)) return;
    tl.current.closeAt = T;
    if (!tl.current.playing) setT(T, true);
  };
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const cheer = cheerFor({ sport: 'alergare', ratio: 1, name, minutes: 30, km: 5, nThisSport14: 1, seed: 'lab' });
  const scene = mode === 'intampinare' || mode === 'reusita';

  return createPortal(
    <div className="gfx-lab" role="dialog" aria-modal="true" aria-label="Laboratorul grafic">
      <div className="gfx-top">
        <b>Laborator grafic</b>
        <button className="sheet-x" onClick={onClose} aria-label="Închide laboratorul">
          ×
        </button>
      </div>
      <div className="seg gfx-modes" role="tablist">
        {MODES.map(([m, l]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'on' : ''}
            onClick={() => {
              setMode(m);
              replay();
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {scene && (
        <>
          <div className="azi gfx-home">
            <Orb decor onPress={() => undefined} label="">
              <span className="gfx-orb-t">Azi</span>
            </Orb>
          </div>
          <div className="row-card gfx-card">
            <span>
              <b>Acasă (exemplu)</b>
              <small>trebuie să apară doar la final</small>
            </span>
          </div>
          {!ended && fire && (
            <WelcomeFire
              key={`${mode}-${run}`}
              inline
              kicker={mode === 'reusita' ? 'Antrenament finalizat' : 'Ziua 12 din 342'}
              text={mode === 'reusita' ? (cheer?.text ?? 'Ai bifat ședința.') : `Fiecare zonă 2 făcută cum trebuie e o cărămidă în plus${first ? `, ${first}` : ''}.`}
              clock={clock}
              onRequestContinue={closeNow}
              onPhase={setPhase}
              onClose={() => setEnded(true)}
            />
          )}
          <div className={`gfx-bar ${compact ? 'compact' : ''}`}>
            <div className="gfx-phase">
              {labelOf(phase)} · {Math.round(ui.T)} ms{ui.speed !== 1 ? ' · încetinit 4×' : ''}
            </div>
            <input type="range" min={0} max={TOTAL} value={Math.round(ui.T)} onChange={(e) => scrub(Number(e.target.value))} aria-label="Momentul scenei" />
            <div className="wk-btns">
              <button className="pill on" onClick={replay}>
                Replay
              </button>
              <button className="pill" onClick={pause}>
                {ui.playing ? 'Pauză' : 'Pornește'}
              </button>
              <button className="pill" onClick={() => setCompact(!compact)} aria-expanded={!compact}>
                {compact ? 'Arată controalele' : 'Ascunde controalele'}
              </button>
              <button className="pill" onClick={slow}>
                {ui.speed === 1 ? 'Încet' : 'Normal'}
              </button>
              <button className="pill" onClick={closeNow} disabled={ui.T < (fire ? FIRE.ready : ENTRY_MS)}>
                Continuă (ieșire)
              </button>
            </div>
            <div className="wk-btns gfx-jumps">
              {jumps.map(([p, at]) => (
                <button key={p} className={`pill ${phase === p ? 'on' : ''}`} onClick={() => jump(p, at)}>
                  {labelOf(p)}
                </button>
              ))}
            </div>
            <p className="tiny muted">
              Intrare ~{ENTRY_MS} ms · ieșire {EXIT.ecou[1]} ms + Acasă {EXIT.dezvaluire[1] - EXIT.dezvaluire[0]} ms. „Sari peste” e în scenă, jos.
            </p>
          </div>
        </>
      )}
      {mode === 'sedinta' && <LabSheet key={run} onReplay={replay} />}
      {mode === 'masa' && <LabMeal key={run} />}
      {mode === 'tub' && (
        <div className="gfx-tubes">
          {([null, 0, 5, 50, 93, 100] as (number | null)[]).map((p) => (
            <div key={String(p)} className="gfx-tube">
              <span className="small muted">{p == null ? 'fără date' : `${p}%`}</span>
              <Tube pct={p} size="big" label={`Test ${p == null ? 'fără date' : `${p}%`}`} />
            </div>
          ))}
          <p className="tiny muted">Fără date = contur punctat, fără lichid. 0% = gol. 100% = lichidul închide tubul. La procente mici, ondulația și particulele se reduc.</p>
        </div>
      )}
    </div>,
    document.body,
  );
}


/** Ședința: fereastra se deschide din punctul atins (varianta scurtă), cu carduri translucide peste materie. */
function LabSheet({ onReplay }: { onReplay: () => void }) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLButtonElement>(null);
  return (
    <div className="gfx-pad">
      <button ref={card} className="row-card" onClick={() => setOpen(true)}>
        <span>
          <b>Forță · Picioare A</b>
          <small>45 min · atinge ca să deschizi</small>
        </span>
      </button>
      <button className="pill" onClick={onReplay}>
        Replay
      </button>
      {open && <DemoSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

function DemoSheet({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tap = useOpenOrigin(box);
  return (
    <div className="sheet-wrap" onClick={onClose} style={{ zIndex: 115 }}>
      <BurstAtTap tap={tap} />
      <div className="sheet" ref={box} onClick={(e) => e.stopPropagation()}>
        <GlassFX level={0.16} />
        <div className="sheet-head">
          <div className="sheet-t">
            <b>Forță · Picioare A</b>
            <small>45 min</small>
          </div>
          <button className="sheet-x" onClick={onClose} aria-label="Închide">
            ×
          </button>
        </div>
        <div className="sheet-body">
          {['Genuflexiuni la aparat · 4 × 12', 'Presă picioare · 3 × 12', 'Fandări cu gantere · 3 × 10 pe parte', 'Extensii cvadriceps · 3 × 15'].map((x) => (
            <div key={x} className="str-row">
              <span>{x}</span>
            </div>
          ))}
          <div className="sheet-tip">Exemplu fix pentru laborator, nu ședința ta.</div>
        </div>
      </div>
    </div>
  );
}

/** Masa: rețeta se extinde din cardul atins, cu același material. */
function LabMeal() {
  const [open, setOpen] = useState(false);
  return (
    <div className="gfx-pad">
      <div className="card tight">
        <button className="exp-row" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>
            <small>Prânz</small>
            <b>Exemplu: orez cu pui și legume</b>
            <small>rețetă demonstrativă</small>
          </span>
        </button>
        {open && <LabMealBody />}
      </div>
    </div>
  );
}
function LabMealBody() {
  const ref = useRef<HTMLDivElement>(null);
  const tap = useOpenOrigin(ref);
  return (
    <div className="meal-body" ref={ref}>
      <BurstAtTap tap={tap} />
      <div className="sheet-k">Ce și cât</div>
      <p className="small">Text demonstrativ pentru animația de extindere; nu e o rețetă din planul tău.</p>
    </div>
  );
}
