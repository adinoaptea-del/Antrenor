// Auditul v93, A94 — izolarea între conturi, verificată static pe server: orice scriere sau ștergere pe o tabelă cu
// date de sportiv filtrează pe contul lui (user_id, sau id-ul propriu pe tabela users). Plus criptarea tokenurilor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// Tabele fără user_id (globale) — scrierile pe ele nu sunt per sportiv.
const GLOBAL = new Set(['app_settings', 'schema_meta', 'invites']);

test('A94: update/remove pe date de sportiv au filtrul contului', () => {
  const bad: string[] = [];
  for (const f of files('server')) {
    if (f.includes('admin')) continue; // rutele de admin verifică rolul; acolo lucrul pe alt cont e intenționat
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(update|remove)\(\s*'(\w+)',\s*\{/g)) {
      const [, op, table] = m;
      // Filtrul: obiectul de după tabelă, cu acolade echilibrate (interpolările `${…}` conțin și ele acolade).
      let i = m.index! + m[0].length;
      let depth = 1;
      const start = i;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      const filter = src.slice(start, i - 1);
      if (GLOBAL.has(table!)) continue;
      const ok = /user_id\s*:/.test(filter) || (table === 'users' && /\bid\s*:\s*`eq\.\$\{(u\.id|userId|user\.id|j\.id)\}`/.test(filter));
      if (!ok) bad.push(`${f}: ${op}('${table}', {${filter.trim()}})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('A94: tokenurile se criptează când există cheia; citirea acceptă și forma veche', async () => {
  const prev = process.env.TOKEN_ENC_KEY;
  process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
  const { seal, unseal } = await import('../server/_lib/secretbox.js');
  const s = seal('abc-token')!;
  assert.ok(s.startsWith('enc:v1:') && !s.includes('abc-token'));
  assert.equal(unseal(s), 'abc-token');
  assert.equal(unseal('plain-old'), 'plain-old');
  delete process.env.TOKEN_ENC_KEY;
  assert.equal(seal('x'), 'x', 'fără cheie, ca înainte');
  assert.throws(() => unseal(s), /TOKEN_ENC_KEY/);
  if (prev) process.env.TOKEN_ENC_KEY = prev;
});
