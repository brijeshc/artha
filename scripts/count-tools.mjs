// Parse a `claude -p --output-format stream-json` transcript and tally tool use.
// Discovery = the calls an agent makes to *find* conventions in the codebase.
// Usage: node scripts/count-tools.mjs <transcript.jsonl>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node count-tools.mjs <transcript.jsonl>');
  process.exit(2);
}

const byName = {};
let resultText = '';
let bashDiscovery = 0;
const READLIKE = /\b(grep|rg|cat|find|ls|head|tail|sed|awk|less|fd|tree|wc)\b/;

for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    continue;
  }
  if (ev.type === 'result' && typeof ev.result === 'string') resultText = ev.result;
  const content = ev?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const block of content) {
    if (block?.type !== 'tool_use') continue;
    const name = block.name ?? 'unknown';
    byName[name] = (byName[name] ?? 0) + 1;
    if (name === 'Bash' && READLIKE.test(block.input?.command ?? '')) bashDiscovery++;
  }
}

const sum = (keys) => keys.reduce((s, k) => s + (byName[k] ?? 0), 0);
const discovery = sum(['Read', 'Grep', 'Glob', 'NotebookRead']);
const artha = Object.keys(byName)
  .filter((n) => n.toLowerCase().includes('artha'))
  .reduce((s, n) => s + byName[n], 0);

console.log(
  JSON.stringify(
    {
      discovery, // Read + Grep + Glob + NotebookRead
      bashDiscovery, // read-like Bash commands (grep/cat/find/...)
      discoveryTotal: discovery + bashDiscovery,
      arthaCalls: artha, // calls to the Artha MCP tools (the point, not noise)
      edits: sum(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']),
      totalToolCalls: Object.values(byName).reduce((a, b) => a + b, 0),
      byName,
      resultPreview: resultText.slice(0, 800),
    },
    null,
    2,
  ),
);
