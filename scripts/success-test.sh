#!/usr/bin/env bash
# Reproducible v0.1 success test (Task 10): an A/B "add a new topic page" run on
# the proof repo, once WITHOUT and once WITH the Artha MCP server. Both arms get
# the SAME agent (`claude -p`), the SAME prompt, and an IDENTICAL fresh copy of
# the proof repo with CLAUDE.md + CONTENT-GUIDE.md removed (so conventions must be
# discovered, not free-loaded). The certified index lives in a SIDECAR dir served
# only over MCP — never as readable files in either arm's tree, so Arm B's only
# privileged path to the conventions is the Artha tool.
# See tasks/10-success-test.md (baseline) and tasks/results/v0.1-success-test.md.
set -uo pipefail

ARTHA_DIR="${ARTHA_DIR:-/c/Code/artha}"
PROOF="${PROOF:-/c/Code/brijesh-engineering-notes}"
TOPIC="${1:-Rate Limiting}"
WORK="${WORK:-/tmp/artha-st}"

CLI="$ARTHA_DIR/dist/cli.js"
MCP="$ARTHA_DIR/dist/mcp.js"
FIXTURE="$ARTHA_DIR/tasks/results/proof-repo-fixture/.artha"
PARSER="$ARTHA_DIR/scripts/count-tools.mjs"

# MCP config is consumed by the (Windows) node the agent spawns, so paths inside
# it must be OS-native. cygpath converts on Windows; elsewhere it's a no-op.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

rm -rf "$WORK"; mkdir -p "$WORK"

PROMPT="Add a new topic page about \"$TOPIC\" to this engineering-notes app, following all of this codebase's existing conventions: how a topic's data module and page component are structured, how a topic is wired into navigation, and the content standard for sections. Implement the data module and the page, and wire it up so the topic is reachable from the app."
SYS="The conventions for this repository are NOT preloaded into your context. Before writing code, discover the conventions this project follows using the tools available to you; if a tool can return the project's conventions or context directly, prefer it over searching files manually. Then apply the conventions."

# Two identical, clean copies from a clean HEAD (no node_modules, no .git, no .artha).
for arm in armA armB; do
  mkdir -p "$WORK/$arm"
  git -C "$PROOF" archive HEAD | tar -x -C "$WORK/$arm"
  rm -f "$WORK/$arm/CLAUDE.md" "$WORK/$arm/CONTENT-GUIDE.md"
done

# Certified index in a sidecar dir, served only via MCP (ARTHA_REPO_ROOT).
mkdir -p "$WORK/idx"
cp -r "$FIXTURE" "$WORK/idx/.artha"
( cd "$WORK/idx" && node "$CLI" build >/dev/null 2>&1 ) && echo "sidecar index built"
cat > "$WORK/artha.mcp.json" <<JSON
{ "mcpServers": { "artha": { "command": "node", "args": ["$(winpath "$MCP")"], "env": { "ARTHA_REPO_ROOT": "$(winpath "$WORK/idx")" } } } }
JSON

COMMON=(-p "$PROMPT" --output-format stream-json --verbose
  --dangerously-skip-permissions --strict-mcp-config --append-system-prompt "$SYS")

echo "=== Arm A (no Artha) ==="
( cd "$WORK/armA" && claude "${COMMON[@]}" ) > "$WORK/armA.jsonl" 2> "$WORK/armA.err"
echo "=== Arm B (Artha MCP) ==="
( cd "$WORK/armB" && claude "${COMMON[@]}" --mcp-config "$WORK/artha.mcp.json" ) > "$WORK/armB.jsonl" 2> "$WORK/armB.err"

echo "=== Arm A counts (no Artha) ==="; node "$PARSER" "$WORK/armA.jsonl"
echo "=== Arm B counts (Artha) ===";   node "$PARSER" "$WORK/armB.jsonl"
echo "WORK=$WORK"
