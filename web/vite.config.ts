import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// The dashboard build. Roots at `web/` and emits a static bundle to `dist/web/`,
// served by `artha serve`. Kept entirely separate from the offline CLI bundle
// (tsup → dist/cli.js); React never enters the CLI hot path. `base: './'` keeps
// asset paths relative so the bundle works served from the server root.
export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(here, '../dist/web'),
    emptyOutDir: true,
  },
});
