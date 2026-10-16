// Împachetează fiecare funcție din server/ într-un singur fișier apps/web/api/**/*.js (ESM, fără dependențe),
// în structura standard Vercel (api/forms/[kind].js → /api/forms/:kind). Fișierele generate se urcă în git.
// Rulează după orice schimbare în server/ sau src/: `npm run bundle-api`.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'server');
// Proiectul Vercel pornește din apps/web (Root Directory), deci funcțiile stau în apps/web/api.
const OUT = join(ROOT, 'apps', 'web', 'api');

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '_lib' ? [] : walk(p);
    return p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : [];
  });

rmSync(OUT, { recursive: true, force: true });
// Doar routerul devine funcție (limita de 12 funcții pe planul gratuit); el include toate celelalte.
const files = [join(SRC, 'router.ts')];
for (const file of files) {
  const out = join(OUT, relative(SRC, file).replace(/\.ts$/, '.js'));
  mkdirSync(dirname(out), { recursive: true });
  await esbuild.build({
    entryPoints: [file],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    loader: { '.sql': 'text' },
    banner: { js: "// GENERAT din server/ cu scripts/bundle-api.mjs — nu edita de mână.\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  });
}
console.log(`api/: ${files.length} funcții`);
