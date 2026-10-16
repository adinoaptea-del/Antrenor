import { useState } from 'react';
import { Icons } from './common';
import { useData, useMe } from '../data/store';
import { fmtTime } from './sync';

export function SyncButton({ compact = false }: { compact?: boolean }) {
  const me = useMe();
  const { sync } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      await sync();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };
  // Apple Health contează ca sursă: își trimite singur datele, deci ultima lui trimitere e și ea o citire.
  const apple = me.profile.appleLastSync ?? null;
  const last = [me.lastSync, apple].filter((x): x is string => !!x).sort().pop() ?? null;
  const none = me.devices.length === 0 && !me.profile.appleConnected;
  const label = busy ? 'citesc…' : err ? 'eroare la citire' : none ? 'nicio brățară' : !last ? 'aștept date' : compact ? <b>{fmtTime(last)}</b> : <span>citit <b>{fmtTime(last)}</b></span>;
  return (
    <button className={`sync ${busy ? 'busy' : ''}`} onClick={() => void run()} aria-label="Citește datele de pe brățări" title="Citește datele">
      <span className="circ-mini">{Icons.refresh}</span>
      {label}
    </button>
  );
}
