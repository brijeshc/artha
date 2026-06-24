import { join } from 'node:path';
import { Box, Text, render, useApp, useInput, useStdin } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ArthaEntry } from '../schema/types';
import { logger } from '../util/logger';
import {
  type Identity,
  certifyDraft,
  loadProposed,
  openInEditor,
  readEntryFile,
  rejectDraft,
  resolveIdentity,
} from './actions';
import { type CommitSource, loadCommitSource } from './source';

type Mode = 'browsing' | 'confirmReject';
interface StatusMessage {
  tone: 'success' | 'error' | 'info';
  text: string;
}

export interface AppProps {
  repoRoot: string;
  /** The `proposed` queue to review (already loaded; never empty at mount). */
  initialQueue: ArthaEntry[];
  /** Stamp applied on certify. */
  identity: Identity;
  /** Override the commit→diff resolver (tests inject a fake to stay hermetic). */
  resolveSource?: (ref: string) => CommitSource;
}

const TONE_COLOR: Record<StatusMessage['tone'], string> = {
  success: 'green',
  error: 'red',
  info: 'cyan',
};

/**
 * The `artha review` TUI. Walks the `proposed` queue, showing each draft beside
 * its source commit/diff, and certifies / edits / rejects on a single keypress.
 * Certify and reject mutate `.artha/**` via the pure {@link certifyDraft} /
 * {@link rejectDraft} actions — this component is only state + presentation.
 */
export function App({ repoRoot, initialQueue, identity, resolveSource }: AppProps) {
  const { exit } = useApp();
  const { setRawMode, isRawModeSupported } = useStdin();
  const [queue, setQueue] = useState<ArthaEntry[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('browsing');
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const current = queue[index];

  // Keep the cursor valid as the queue shrinks; exit once everything is reviewed.
  useEffect(() => {
    if (queue.length === 0) {
      exit();
      return;
    }
    if (index > queue.length - 1) setIndex(queue.length - 1);
  }, [queue.length, index, exit]);

  const resolve = useMemo(
    () => resolveSource ?? ((ref: string) => loadCommitSource(repoRoot, ref)),
    [resolveSource, repoRoot],
  );

  const source = useMemo<CommitSource>(() => {
    const ref = current?.mined_from?.commit;
    return ref === undefined ? { found: false } : resolve(ref);
  }, [current, resolve]);

  function dropCurrent(text: string): void {
    setQueue((q) => q.filter((_, i) => i !== index));
    setMessage({ tone: 'success', text });
  }

  function onCertify(): void {
    if (current === undefined) return;
    try {
      const certified = certifyDraft(current, identity);
      dropCurrent(`certified ${certified.id} (by ${identity.certifiedBy})`);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    }
  }

  function onConfirmReject(): void {
    setMode('browsing');
    if (current === undefined) return;
    try {
      rejectDraft(current);
      dropCurrent(`rejected ${current.id} — file deleted`);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    }
  }

  function onEdit(): void {
    const path = current?.source_path;
    if (current === undefined || path === undefined) return;
    try {
      if (isRawModeSupported) setRawMode(false);
      openInEditor(path);
      const reloaded = readEntryFile(path);
      if (reloaded.ok) {
        const entry = reloaded.entry;
        setQueue((q) => q.map((e, i) => (i === index ? entry : e)));
        setMessage({ tone: 'success', text: `reloaded ${entry.id} after edit` });
      } else {
        setMessage({ tone: 'error', text: `edit not applied — ${reloaded.errors.join('; ')}` });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: `editor failed: ${(error as Error).message}` });
    } finally {
      if (isRawModeSupported) setRawMode(true);
    }
  }

  useInput((input, key) => {
    if (mode === 'confirmReject') {
      if (input === 'y' || input === 'Y') onConfirmReject();
      else if (input === 'n' || input === 'N' || key.escape) {
        setMode('browsing');
        setMessage({ tone: 'info', text: 'reject cancelled' });
      }
      return;
    }

    if (key.leftArrow || input === 'h') {
      setIndex((i) => Math.max(0, i - 1));
      setMessage(null);
    } else if (key.rightArrow || input === 'l') {
      setIndex((i) => Math.min(queue.length - 1, i + 1));
      setMessage(null);
    } else if (input === 'c') {
      onCertify();
    } else if (input === 'e') {
      onEdit();
    } else if (input === 'r' || input === 'x') {
      if (current !== undefined) setMode('confirmReject');
    } else if (input === 'q' || key.escape) {
      exit();
    }
  });

  if (current === undefined) {
    return <Text color="green">All drafts reviewed. Run `artha build` to index them.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>
          artha review {index + 1}/{queue.length} · <Text color="yellow">{current.id}</Text>
        </Text>
        <Text dimColor>{current.kind}</Text>
      </Box>

      <Box marginTop={1}>
        <Box width="50%" flexDirection="column" paddingRight={1}>
          <DraftView entry={current} />
        </Box>
        <Box flexGrow={1} flexDirection="column" paddingLeft={1}>
          <SourceView commit={current.mined_from?.commit} source={source} />
        </Box>
      </Box>

      {message !== null ? (
        <Box marginTop={1}>
          <Text color={TONE_COLOR[message.tone]}>{message.text}</Text>
        </Box>
      ) : null}

      {mode === 'confirmReject' ? (
        <Box marginTop={1}>
          <Text color="red">
            Reject {current.id}? This deletes the file. <Text bold>y</Text>/<Text bold>n</Text>
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>c certify · e edit · r reject · ←/→ prev/next · q quit</Text>
        </Box>
      )}
    </Box>
  );
}

function DraftView({ entry }: { entry: ArthaEntry }) {
  const heading = entry.kind === 'decision' ? entry.title : entry.name;
  const pins = entry.pins?.map((pin) => pin.symbol) ?? [];
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {heading}
      </Text>
      {draftFields(entry).map((field) => (
        <Box key={field.label} flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            {field.label}
          </Text>
          <Text>{field.value}</Text>
        </Box>
      ))}
      {pins.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            pins
          </Text>
          {pins.map((symbol) => (
            <Text key={symbol}>· {symbol}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function SourceView({ commit, source }: { commit?: string; source: CommitSource }) {
  if (commit === undefined) {
    return <Text dimColor>No source commit linked (hand-written draft).</Text>;
  }
  if (!source.found) {
    return (
      <Text color="yellow">commit {commit} not found in this repo (rebased or shallow clone?)</Text>
    );
  }
  return (
    <Box flexDirection="column">
      <Text bold color="magenta">
        {commit}
      </Text>
      <Text bold>{source.subject}</Text>
      {source.body !== undefined && source.body !== '' ? (
        <Box marginTop={1}>
          <Text dimColor>{source.body}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Diff patch={source.patch ?? ''} />
      </Box>
    </Box>
  );
}

const MAX_DIFF_LINES = 60;

function Diff({ patch }: { patch: string }) {
  const lines = patch.split('\n');
  const shown = lines.slice(0, MAX_DIFF_LINES);
  return (
    <Box flexDirection="column">
      {shown.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a diff is a fixed positional list, never reordered
        <Text key={i} color={diffColor(line)} wrap="truncate-end">
          {line === '' ? ' ' : line}
        </Text>
      ))}
      {lines.length > MAX_DIFF_LINES ? (
        <Text dimColor>… {lines.length - MAX_DIFF_LINES} more diff line(s)</Text>
      ) : null}
    </Box>
  );
}

function diffColor(line: string): string | undefined {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'green';
  if (line.startsWith('-') && !line.startsWith('---')) return 'red';
  if (line.startsWith('@@')) return 'cyan';
  return undefined;
}

function draftFields(entry: ArthaEntry): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  switch (entry.kind) {
    case 'decision':
      fields.push({ label: 'context', value: entry.context });
      fields.push({ label: 'decision', value: entry.decision });
      if (entry.consequences) fields.push({ label: 'consequences', value: entry.consequences });
      if (entry.supersedes) fields.push({ label: 'supersedes', value: entry.supersedes });
      return fields;
    case 'invariant':
      fields.push({ label: 'rule', value: entry.rule });
      fields.push({ label: 'scope', value: entry.scope.join(', ') });
      if (entry.why) fields.push({ label: 'why', value: entry.why });
      if (entry.severity) fields.push({ label: 'severity', value: entry.severity });
      return fields;
    case 'convention':
      fields.push({ label: 'rule', value: entry.rule });
      fields.push({ label: 'scope', value: entry.scope.join(', ') });
      if (entry.example_good) fields.push({ label: 'example (good)', value: entry.example_good });
      if (entry.example_bad) fields.push({ label: 'example (bad)', value: entry.example_bad });
      return fields;
    case 'concept':
      fields.push({ label: 'summary', value: entry.summary });
      for (const s of entry.states ?? []) {
        const note = s.effect ?? s.invariant;
        fields.push({ label: `state ${s.name}`, value: note ?? '' });
      }
      for (const t of entry.transitions ?? []) {
        fields.push({ label: 'transition', value: `${t.from} → ${t.to}: ${t.trigger}` });
      }
      return fields;
    case 'flow':
      fields.push({ label: 'summary', value: entry.summary });
      for (const p of entry.entry ?? []) fields.push({ label: 'entry', value: p.symbol });
      for (const step of entry.steps ?? []) {
        const prefix = step.on ? `${step.on} → ` : '';
        const pin = step.pin ? `  [${step.pin.symbol}]` : '';
        fields.push({ label: 'step', value: `${prefix}${step.do}${pin}` });
      }
      return fields;
  }
}

/**
 * Load the `proposed` queue, resolve the certifier identity, and mount the TUI.
 * Returns immediately (logging) when there is nothing to review or no TTY.
 */
export async function runReview(opts: { repoRoot: string }): Promise<void> {
  const arthaDir = join(opts.repoRoot, '.artha');
  const queue = loadProposed(arthaDir);
  if (queue.length === 0) {
    logger.info('No proposed drafts to review. Run `artha mine` to draft some.');
    return;
  }
  if (process.stdin.isTTY !== true) {
    logger.error('`artha review` needs an interactive terminal (TTY).');
    return;
  }
  const identity = resolveIdentity(opts.repoRoot);
  const { waitUntilExit } = render(
    <App repoRoot={opts.repoRoot} initialQueue={queue} identity={identity} />,
  );
  await waitUntilExit();
}
