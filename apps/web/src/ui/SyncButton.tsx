import { Icons } from './common';
import { useForms } from '../forms/store';
import { fmtTime, sync, useSyncing } from './sync';

export function SyncButton({ compact = false }: { compact?: boolean }) {
  const busy = useSyncing();
  const { lastSync } = useForms();
  return (
    <button className={`sync ${busy ? 'busy' : ''}`} onClick={() => void sync()} aria-label="Citește datele de pe brățări" title="Citește datele">
      <span className="circ-mini">{Icons.refresh}</span>
      {busy ? 'citesc…' : compact ? <b>{fmtTime(lastSync)}</b> : <span>citit <b>{fmtTime(lastSync)}</b></span>}
    </button>
  );
}
