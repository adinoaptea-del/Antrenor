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
  const label = busy ? 'citesc…' : err ? 'eroare la citire' : me.devices.length === 0 ? 'nicio brățară' : compact ? <b>{fmtTime(me.lastSync)}</b> : <span>citit <b>{fmtTime(me.lastSync)}</b></span>;
  return (
    <button className={`sync ${busy ? 'busy' : ''}`} onClick={() => void run()} aria-label="Citește datele de pe brățări" title="Citește datele">
      <span className="circ-mini">{Icons.refresh}</span>
      {label}
    </button>
  );
}
