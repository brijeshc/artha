import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Two bin/entry artifacts: the CLI and the standalone MCP server. T08 fills
  // in the server; the entry plumbing lives here so it never moves again.
  entry: {
    cli: 'src/cli.ts',
    mcp: 'src/mcp/main.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
  shims: false,
  // Baked at build time so the CLI reports a version without reading package.json
  // from disk at runtime. Mirrored in vitest.config.ts for the test environment.
  define: {
    __ARTHA_VERSION__: JSON.stringify(pkg.version),
  },
});
