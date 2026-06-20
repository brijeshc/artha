# Artha

Certified product-meaning for AI coding agents. Artha mines a team's
`decision`s, `invariant`s, and `convention`s from git history, lets a human
certify them in a TUI, compiles them into a queryable index, and serves the
certified meaning to coding agents over MCP — so the team's hard-won context
shows up mid-task without being pasted into a prompt.

> v0.1 is under active construction. See [SPEC.md](SPEC.md) for the build spec
> and [tasks/](tasks/) for the task breakdown.

## Quickstart (development)

```bash
npm install
npm run build      # → dist/cli.js + dist/mcp.js
node dist/cli.js --help
```

## CLI

```
artha init      scaffold .artha/ and a default config.yaml
artha mine      draft decision entries from git history (Anthropic API)
artha review    certify / edit / reject proposed drafts in a TUI
artha build     compile .artha/ YAML into the SQLite + FTS5 index
artha export    emit a compact AGENTS.md of certified entries
artha mcp       start the stdio MCP server
```

Every subcommand is currently a stub — the scaffold (task 01) is in place and
later tasks fill in behavior.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Bundle the CLI + MCP entries to `dist/` (tsup) |
| `npm run dev` | Rebuild on change |
| `npm test` | Run the vitest suite |
| `npm run lint` | Lint + format check (Biome) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |

## License

MIT — see [LICENSE](LICENSE).
