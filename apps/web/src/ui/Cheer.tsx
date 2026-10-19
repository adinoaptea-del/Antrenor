import { useEffect, useMemo, useState } from 'react';
import type { Me } from '@core/api-types.js';
import type { PlannedWorkout } from '@core/types.js';
import { addDays, diffDays } from '@core/util/dates.js';
import { cheerFor, type CheerSport } from '@core/cheers.js';
import { CosmicMessage, homeOrbRect, workoutRect } from './Cosmic';
import { activityFor, colorOf } from '../data/model';
import { strengthOf } from './WorkoutSheet';

/**
 * Felicitarea de după o ședință: mesajul cosmic, varianta „reușită” (ui/Cosmic.tsx), pornit din cardul ședinței.
 * Doar pentru ședințele de azi și ieri CONFIRMATE (activitate importată și legată de ședință, sau jurnalul de forță
 * trimis) și executate cel puțin 60% (src/cheers.ts). O singură dată pe ședință: cheia e id-ul ședinței din plan, așa
 * că sincronizarea, reîncărcarea sau un import duplicat nu o mai declanșează. Deschiderea detaliilor nu felicită nimic.
 */

const SEEN_KEY = (uid: string) => `airon-cheer-${uid}`;
const readSeen = (uid: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY(uid)) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const writeSeen = (uid: string, ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY(uid), JSON.stringify(ids.slice(-200)));
  } catch {
    /* fără stocare: felicitarea poate reapărea o dată */
  }
};

/** Cât din ședință s-a făcut: minutele față de plan; la forță, exercițiile notate față de cele propuse. */
export function executionOf(me: Me, w: PlannedWorkout): { ratio: number | null; minutes: number | null; km: number | null } {
  const act = activityFor(me, w);
  if (w.sport === 'forta') {
    const rx = strengthOf(me, w);
    const logs = (me.strengthLog ?? []).filter((e) => e.date === w.date);
    if (rx && logs.length) {
      // Un exercițiu se numără făcut doar cu seriile cerute (cel puțin 3, regula de forță), nu doar atins.
      const done = rx.items.filter((r) => logs.some((e) => e.exercise === r.ex.id && e.sets.length >= Math.min(3, r.sets))).length;
      return { ratio: done / Math.max(1, rx.items.length), minutes: act?.minutes ?? null, km: null };
    }
  }
  if (!act || !w.plannedMinutes) return { ratio: null, minutes: null, km: null };
  return { ratio: act.minutes / w.plannedMinutes, minutes: act.minutes, km: act.distanceKm ?? null };
}

function nextCheer(me: Me, seen: string[]) {
  const from = addDays(me.today, -1);
  const list = me.plan
    .filter((w) => w.date >= from && w.date <= me.today && w.type !== 'odihna' && w.status !== 'sters' && w.status !== 'anulat_sistem' && !seen.includes(w.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const w of list) {
    if (colorOf(me, w) === 'rosu') continue;
    const ex = executionOf(me, w);
    const sport = w.sport as CheerSport;
    const same = me.activities.filter((a) => a.sport === w.sport && a.date <= w.date && diffDays(a.date, w.date) < 14);
    const act = activityFor(me, w);
    // Dovada pentru „din ce în ce mai bine”: ritm (alergare) sau viteză (bicicletă) mai bune decât media ultimelor 3.
    const prev = same.filter((a) => a.id !== act?.id).slice(-3);
    const speed = (a: { distanceKm: number | null; minutes: number }) => (a.distanceKm && a.minutes ? a.distanceKm / a.minutes : null);
    const now = act ? speed(act) : null;
    const prevS = prev.map(speed).filter((x): x is number => x != null);
    const improving = now != null && prevS.length >= 2 && now > (prevS.reduce((s, x) => s + x, 0) / prevS.length) * 1.02;
    const c = cheerFor({
      sport,
      ratio: ex.ratio,
      name: me.user.name,
      minutes: ex.minutes,
      km: ex.km,
      nThisSport14: same.length,
      nSwimTotal: me.activities.filter((a) => a.sport === 'inot').length,
      improving,
      seed: w.id,
    });
    if (c) return { w, c };
  }
  return null;
}

/** Previzualizarea (Administrare): arată felicitarea pentru un sport, cu numele tău, fără să depindă de o ședință. */
export function previewCheer(sport: CheerSport, tier: 'fix' | 'bine' = 'fix') {
  window.dispatchEvent(new CustomEvent('airon-cheer-preview', { detail: { sport, tier } }));
}

/** Există o felicitare de arătat acum? (App o folosește ca să nu mai arate și întâmpinarea: una singură.) */
export function pendingCheer(me: Me): boolean {
  return !!nextCheer(me, readSeen(me.user.id ?? 'eu'));
}

export function Cheer({ me, blocked, onShow }: { me: Me; blocked: boolean; onShow?: () => void }) {
  const uid = me.user.id ?? 'eu';
  const [seen, setSeen] = useState<string[]>(() => readSeen(uid));
  const [demo, setDemo] = useState<{ w: PlannedWorkout; c: NonNullable<ReturnType<typeof cheerFor>> } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ sport: CheerSport; tier: 'fix' | 'bine' }>).detail;
      const seed = `demo-${d.sport}-${Date.now()}`;
      const c = cheerFor({ sport: d.sport, ratio: d.tier === 'fix' ? 1 : 0.75, name: me.user.name, minutes: 45, km: d.sport === 'alergare' ? 8 : d.sport === 'bicicleta' ? 32 : null, nThisSport14: 1, nSwimTotal: 2, seed });
      if (c) setDemo({ w: { id: seed, date: me.today, sport: d.sport, type: 'z2', plannedMinutes: 45, targetZones: [], key: false, status: 'planificat' }, c });
    };
    window.addEventListener('airon-cheer-preview', on);
    return () => window.removeEventListener('airon-cheer-preview', on);
  }, [me.user.name, me.today]);
  const real = useMemo(() => (blocked ? null : nextCheer(me, seen)), [me, seen, blocked]);
  const pick = demo ?? real;
  useEffect(() => {
    if (pick) onShow?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.w.id]);
  if (!pick) return null;
  const done = () => {
    if (demo) {
      setDemo(null);
      return;
    }
    const next = [...seen, pick.w.id];
    writeSeen(uid, next);
    setSeen(next);
  };
  const id = pick.w.id;
  return <CosmicMessage key={id} variant="reusita" kicker="Antrenament finalizat" text={pick.c.text} seed={id.length + 3} origin={() => workoutRect(id) ?? homeOrbRect()} returnTo={homeOrbRect} onClose={done} />;
}
