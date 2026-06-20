# Task 01 — Project scaffold & tooling

**Depends on:** nothing. This is the foundation every other task builds on.
**Spec refs:** SPEC.md §"In scope" (implementation stack), §Constraints.

## Goal

Stand up the npm package that ships the `artha` CLI and the MCP server, with a working
build, test runner, and a CLI shell whose subcommands exist but say "not implemented yet."
Nobody should have to argue about tooling again after this lands.

## Scope

- **Package:** TypeScript / Node, ESM. `package.json` with:
  - `"bin": { "artha": "dist/cli.js" }`
  - `"type": "module"`, Node ≥ 20 engine.
  - scripts: `build`, `dev`, `test`, `lint`, `typecheck`.
- **Build tooling:** `tsup` (or esbuild) → `dist/`. Source maps on. Bundle the CLI entry and a separate `dist/mcp.js` entry for the MCP server (T08 will fill it in).
- **TypeScript:** `tsconfig.json`, `strict: true`, `moduleResolution: "bundler"` (or NodeNext), target ES2022.
- **CLI framework:** pick one (`commander` recommended; `clipanion` acceptable) and wire `src/cli.ts` with these subcommands, each printing a stub message + exit 0:
  - `artha init`
  - `artha mine`
  - `artha review`
  - `artha build`
  - `artha export [--agents-md]`
  - `artha mcp` (starts the stdio server — stub for now)
  - `artha --help` / `--version` must work.
- **Test harness:** `vitest`. One smoke test asserting `artha --help` lists all subcommands.
- **Lint/format:** ESLint + Prettier (or Biome). Wire `lint` + `typecheck` into CI-able scripts.
- **Repo hygiene:** `.gitignore` (node_modules, dist, *.db, .artha local test fixtures as appropriate), `README.md` stub, `LICENSE` placeholder.

## Out of scope

- Any real command behavior (each subcommand is a stub).
- The MCP protocol wiring itself (T08) — just the entry file + `artha mcp` route.

## Contracts produced (downstream tasks rely on these)

- `src/cli.ts` exports a `run(argv)` and registers subcommands; each command lives in `src/commands/<name>.ts` exporting a single handler. Other tasks add their logic inside their command file.
- A shared `src/util/` is available for logging + error formatting (a tiny `logger` and an `ArthaError` class with an actionable message + exit code). All commands fail via `ArthaError` so messaging is consistent (used heavily by T06's no-API-key path).
- `dist/cli.js` and `dist/mcp.js` are the two bin/entry artifacts.

## Acceptance criteria

- [ ] `npm install` then `npm run build` produces `dist/cli.js` and `dist/mcp.js`.
- [ ] `node dist/cli.js --help` (and the linked `artha` bin) lists init/mine/review/build/export/mcp.
- [ ] Each subcommand runs and exits 0 with a "not implemented" notice.
- [ ] `npm test`, `npm run lint`, `npm run typecheck` all pass.
