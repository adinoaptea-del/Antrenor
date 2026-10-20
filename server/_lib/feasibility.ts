// Fezabilitatea obiectivului se reevaluează EXPLICIT (auditul de coaching, ch. 25 / item N): la un test nou și la
// bilanțul de duminică, nu doar la afișare. Rezultatul intră în jurnal (ajunge și la antrenorul AI, prefixul
// „calendar”) și, când ținta declarată devine nerealistă, într-un mesaj pentru sportiv. Nicio probabilitate inventată:
// doar cifrele pe care le calculează deja race-ready.ts (cea mai slabă verigă, acoperirea pe probe, verdictul țintei).
import { buildMe } from './me.js';
import { insert } from './db.js';

export async function reassessGoal(userId: string, today: string, trigger: 'test' | 'bilant'): Promise<string | null> {
  const me = await buildMe(userId, today).catch(() => null);
  const r = me?.raceReady;
  if (!r) return null;
  const parts = [
    r.ready != null ? `gata de cursă ${r.ready}% (veriga cea mai slabă: ${r.weakest ?? '–'})` : `evaluare incompletă: lipsesc date pentru ${r.coverage.missing.join(', ') || 'o probă'}`,
    `probe cu date ${r.coverage.withData}/${r.coverage.total}`,
    r.onTrack ? `pe drum ${r.onTrack.pct}% (chei ${r.onTrack.keyDone}/${r.onTrack.keyPlanned})` : null,
    r.target ? `ținta ${r.target.verdict.verdict}${r.target.adjusted ? ' (planul e pe timpul realist de acum, nu pe ținta declarată)' : ''}${r.target.best ? `; cel mai bun efort ${r.target.best.label}` : ''}` : null,
    r.estimate?.total != null ? `estimare ${Math.round(r.estimate.total)} min (${Math.round(r.estimate.low ?? r.estimate.total)}–${Math.round(r.estimate.high ?? r.estimate.total)})` : null,
  ].filter(Boolean);
  const entry = `calendar (fezabilitate, ${trigger === 'test' ? 'după test' : 'bilanț săptămânal'}): obiectivul rămâne; ${parts.join(' · ')}`;
  await insert('journal', { user_id: userId, date: today, entry }).catch(() => undefined);
  if (r.target?.adjusted && trigger === 'test') {
    await insert('messages', { user_id: userId, kind: 'avertisment', body: `După testul nou, ținta declarată rămâne a ta, dar nu e realistă pentru timpul rămas: planul e construit pe timpul realist de acum (${r.target.planSec ? `${Math.round(r.target.planSec / 60)} min` : 'fără reper'}). O rejudecăm la următorul test.`, decision: null }).catch(() => undefined);
  }
  return entry;
}
