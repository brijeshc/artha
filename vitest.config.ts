import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Mirror the build-time define so `__ARTHA_VERSION__` resolves under vitest
  // (which transforms sources itself and never runs tsup).
  define: {
    __ARTHA_VERSION__: JSON.stringify(pkg.version),
  },
  // Ink's TUI is `.tsx`; use the automatic JSX runtime so no `import React` is
  // needed (mirrors tsconfig `jsx: react-jsx`).
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
