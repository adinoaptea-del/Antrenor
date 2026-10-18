import { useState } from 'react';
import { chunkSamsung, samsungExport, samsungTableOf, type SamsungFile } from '@core/import/samsung-export.js';
import { unzipNeeded } from '@core/import/zip.js';
import { useData } from '../data/store';

/** Istoricul din Samsung Health: exportul de date personale, citit pe telefon, trimis în AIRON pe bucăți. */
export function SamsungImport() {
  const { submitForm, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setErr(null);
    setMsg('Citesc fișierele…');
    try {
      const files: SamsungFile[] = [];
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) files.push(...(await unzipNeeded(await f.arrayBuffer())));
        else if (samsungTableOf(f.name)) files.push({ name: f.name, text: await f.text() });
      }
      if (!files.length) throw new Error('n-am găsit fișierele Samsung Health (com.samsung.shealth.exercise…, …sleep…). Alege toate fișierele din folderul exportului sau arhiva .zip.');
      const imp = samsungExport(files);
      const total = imp.body.exercise.length + imp.body.sleep.length + imp.body.weight.length;
      if (!total) throw new Error('fișierele n-au antrenamente, somn sau greutate pe care să le putem citi.');
      let zile = 0;
      let antr = 0;
      const parts = chunkSamsung(imp.body);
      for (let i = 0; i < parts.length; i++) {
        setMsg(`Trimit ${i + 1} din ${parts.length}…`);
        const r = await submitForm('samsung-import', parts[i]);
        if (!r.ok) throw new Error(r.info ?? 'trimiterea a eșuat');
        zile += Number(r.data?.zile ?? 0);
        antr += Number(r.data?.antrenamente ?? 0);
      }
      setMsg(`Gata: ${antr} antrenamente și ${zile} zile cu somn sau greutate, din ${imp.read.map((x) => `${x.file.split('.')[3] ?? x.file} (${x.rows})`).join(', ')}.${imp.unknownExercise.length ? ` Tipuri de exercițiu necunoscute (nu le-am importat): ${imp.unknownExercise.join(', ')}.` : ''}`);
      await refresh();
    } catch (e) {
      setMsg(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-step" style={{ marginTop: 12 }}>
      <b>4. Istoricul (o singură dată)</b>
      <span>
        Health Connect are doar datele de la conectare încoace. Pentru istoric: Samsung Health → ⋮ → Setări → Descărcare date personale → Descărcare. Apoi atinge butonul de mai jos și alege toate fișierele din folderul Download/Samsung Health/samsunghealth_… (sau arhiva .zip). Citim doar antrenamentele, somnul și greutatea.
      </span>
      <label className="pill" style={{ marginTop: 8, display: 'inline-flex', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Import…' : 'Importă istoricul Samsung'}
        <input type="file" multiple accept=".csv,.zip,text/csv,application/zip" style={{ display: 'none' }} disabled={busy} onChange={(e) => void onFiles(e.target.files)} />
      </label>
      {msg && <span className="tiny" style={{ marginTop: 6 }}>{msg}</span>}
      {err && <span className="tiny" style={{ marginTop: 6, color: 'var(--c-rosu)' }}>{err}</span>}
    </div>
  );
}
