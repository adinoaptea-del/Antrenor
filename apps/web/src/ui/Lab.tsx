import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PHASES, PHASE_LABEL, type PhaseName } from '@core/motion/teleport.js';
import { cheerFor } from '@core/cheers.js';
import { CosmicMessage, type CosmicClock } from './Cosmic';
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
/** Pe cursor: 0–1600 ms scena deschisă, 1600–2250 ms reintegrarea. */
const OPEN_END = 1600;
const TOTAL = OPEN_END + 650;
const JUMP: Record<PhaseName, number> = {
  chemare: 90,
  convergenta: 300,
  curbare: 490,
  materializare: 720,
  mesaj: 1000,
  repaus: 1400,
  reintegrare: OPEN_END + 320,
};

export function GraphicsLab({ name, onClose }: { name: string | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('intampinare');
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<PhaseName>('chemare');
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
  const jump = (p: PhaseName) => {
    tl.current.closeAt = p === 'reintegrare' ? OPEN_END : null;
    setT(JUMP[p], false);
  };
  const scrub = (v: number) => {
    tl.current.closeAt = v > OPEN_END ? OPEN_END : null;
    setT(v, false);
  };
  const closeNow = () => {
    if (tl.current.closeAt == null) tl.current.closeAt = now();
    if (!tl.current.playing) setT(now(), true);
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
          <div className="row-card gfx-card" data-wid="gfx-card">
            <span>
              <b>Alergare ușoară</b>
              <small>30 min · făcut</small>
            </span>
          </div>
          <CosmicMessage
            key={`${mode}-${run}`}
            variant={mode}
            kicker={mode === 'reusita' ? 'Antrenament finalizat' : 'Ziua 12 din 342'}
            text={mode === 'reusita' ? (cheer?.text ?? 'Ai bifat ședința.') : `Fiecare zonă 2 făcută cum trebuie e o cărămidă în plus${first ? `, ${first}` : ''}.`}
            origin={mode === 'reusita' ? () => rectOfSel('[data-wid="gfx-card"]') : undefined}
            anchor={() => rectOfSel('.gfx-home .orb')}
            clock={clock}
            onRequestClose={closeNow}
            onPhase={setPhase}
            onClose={() => undefined}
          />
          <div className="gfx-bar">
            <div className="gfx-phase">
              {PHASE_LABEL[phase]} · {Math.round(ui.T)} ms{ui.speed !== 1 ? ' · încetinit 4×' : ''}
            </div>
            <input type="range" min={0} max={TOTAL} value={Math.round(ui.T)} onChange={(e) => scrub(Number(e.target.value))} aria-label="Momentul scenei" />
            <div className="wk-btns">
              <button className="pill on" onClick={replay}>
                Replay
              </button>
              <button className="pill" onClick={pause}>
                {ui.playing ? 'Pauză' : 'Continuă'}
              </button>
              <button className="pill" onClick={slow}>
                {ui.speed === 1 ? 'Încet' : 'Normal'}
              </button>
              <button className="pill" onClick={closeNow}>
                Închide acum
              </button>
            </div>
            <div className="wk-btns gfx-jumps">
              {(Object.keys(JUMP) as PhaseName[]).map((p) => (
                <button key={p} className={`pill ${phase === p ? 'on' : ''}`} onClick={() => jump(p)}>
                  {PHASE_LABEL[p]}
                </button>
              ))}
            </div>
            <p className="tiny muted">
              Repere de design: chemare {PHASES.chemare.join('–')} ms, convergență {PHASES.convergenta.join('–')}, curbare {PHASES.curbare.join('–')}, materializare {PHASES.materializare.join('–')}, mesaj {PHASES.mesaj.join('–')}, reintegrare 650 ms.
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

const rectOfSel = (sel: string) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 1 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};

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
