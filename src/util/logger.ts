type Level = 'debug' | 'info' | 'success' | 'warn' | 'error';

const useColor = process.stderr.isTTY === true && !process.env.NO_COLOR;

const code = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const;

function paint(c: string, text: string): string {
  return useColor ? `${c}${text}${code.reset}` : text;
}

const tag: Record<Level, string> = {
  debug: paint(code.dim, 'debug'),
  info: paint(code.cyan, 'info'),
  success: paint(code.green, 'ok'),
  warn: paint(code.yellow, 'warn'),
  error: paint(code.red, 'error'),
};

function write(level: Level, message: string): void {
  // Every diagnostic goes to stderr so stdout stays clean for machine-readable
  // output (MCP stdio framing, `export` payloads, structured results).
  process.stderr.write(`${paint(code.dim, 'artha')} ${tag[level]} ${message}\n`);
}

/** Tiny, dependency-free logger. All output is on stderr. */
export const logger = {
  /** Only emitted when ARTHA_DEBUG is set. */
  debug(message: string): void {
    if (process.env.ARTHA_DEBUG) write('debug', message);
  },
  info(message: string): void {
    write('info', message);
  },
  success(message: string): void {
    write('success', message);
  },
  warn(message: string): void {
    write('warn', message);
  },
  error(message: string): void {
    write('error', message);
  },
};
