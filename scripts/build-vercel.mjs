// Construiește ieșirea pentru Vercel (Build Output API v3), fără ghicitul Vercel despre TypeScript:
// fiecare fișier din api/ devine o funcție Node împachetată (esbuild), aplicația web (apps/web/dist) devine statică.
// Rulează după `vite build`. Rezultat: .vercel/output/{config.json, static/, functions/}.
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.vercel', 'output');
const WEB = process.env.WEB_DIST ?? join(ROOT, 'apps', 'web', 'dist');
const REGION = process.env.FUNCTION_REGION ?? 'fra1'; // Frankfurt: aproape de Supabase UE și de România

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '_lib' ? [] : walk(p);
    return p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : [];
  });
}

if (!existsSync(join(WEB, 'index.html'))) {
  console.error(`lipsește aplicația construită: ${WEB}/index.html (rulează întâi vite build)`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'static'), { recursive: true });
cpSync(WEB, join(OUT, 'static'), { recursive: true });

const dynamic = []; // rute cu parametri: /api/forms/:kind → /api/forms/_kind?kind=…
const entries = walk(join(ROOT, 'server'));
for (const file of entries) {
  // server/forms/[kind].ts → api/forms/[kind] (adresa publică rămâne /api/…; folderul nu se cheamă api ca Vercel să nu-l reconstruiască singur)
  const rel = 'api/' + relative(join(ROOT, 'server'), file).replace(/\\/g, '/').replace(/\.ts$/, '');
  const params = [...rel.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const fnPath = rel.replace(/\[([^\]]+)\]/g, '_$1'); // api/forms/_kind
  if (params.length) {
    const src = '^/' + rel.replace(/\[([^\]]+)\]/g, '([^/]+)') + '/?$';
    const query = params.map((p, i) => `${p}=$${i + 1}`).join('&');
    dynamic.push({ src, dest: `/${fnPath}?${query}` });
  }
  const dir = join(OUT, 'functions', `${fnPath}.func`);
  mkdirSync(dir, { recursive: true });
  await esbuild.build({
    entryPoints: [file],
    outfile: join(dir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    loader: { '.sql': 'text' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  });
  writeFileSync(
    join(dir, '.vc-config.json'),
    JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: true, maxDuration: 300, regions: [REGION] }, null, 2),
  );
}

const config = {
  version: 3,
  routes: [
    { src: '^/sw\\.js$', headers: { 'cache-control': 'no-cache' }, continue: true },
    { src: '^/index\\.html$', headers: { 'cache-control': 'no-cache' }, continue: true },
    { handle: 'filesystem' },
    ...dynamic,
    { src: '^/api/.*$', status: 404 },
    { src: '^/(.*)$', dest: '/index.html' },
  ],
};
writeFileSync(join(OUT, 'config.json'), JSON.stringify(config, null, 2));
console.log(`gata: ${entries.length} funcții, ${dynamic.length} rute cu parametri → ${relative(ROOT, OUT)}`);
