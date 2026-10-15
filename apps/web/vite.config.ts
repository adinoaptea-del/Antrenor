import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// `@core` = nucleul determinist din rădăcina repo-ului (src/). Aplicația nu rescrie nicio regulă; le importă.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@core': fileURLToPath(new URL('../../src', import.meta.url)) },
  },
  server: { fs: { allow: ['../..'] } },
});
