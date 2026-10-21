#!/usr/bin/env bash
# Construiește aplicația în modul local (demo) și rulează auditul de layout pe mai multe lățimi de telefon.
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-/tmp/airon-layout-audit}"
mkdir -p "$OUT"
NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/esbuild entry.tsx --bundle --outfile="$OUT/app.js" --jsx=automatic \
  --alias:@core=../../src --loader:.css=css --loader:.png=file --loader:.svg=file \
  --define:import.meta.env='{"VITE_SUPABASE_URL":"","VITE_SUPABASE_ANON_KEY":"","VITE_LOCAL":"1","MODE":"production"}'
cp ../../apps/web/public/icon-192.png "$OUT/"
sed -e 's#<script type="module" src="/src/main.tsx"></script>#<link rel="stylesheet" href="app.css"><script src="app.js"></script>#' -e 's#./manifest.webmanifest#manifest.json#' ../../apps/web/index.html > "$OUT/index.html"
NODE_PATH=/opt/npm-tools/node_modules node audit.cjs "$OUT"
