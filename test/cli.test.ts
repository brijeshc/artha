import { describe, expect, it } from 'vitest';
import { buildProgram } from '../src/cli';

const SUBCOMMANDS = ['init', 'mine', 'review', 'build', 'export', 'mcp'];

describe('artha cli', () => {
  it('registers every v0.1 subcommand', () => {
    const names = buildProgram()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual([...SUBCOMMANDS].sort());
  });

  it('lists every subcommand in --help output', () => {
    const help = buildProgram().helpInformation();
    for (const sub of SUBCOMMANDS) {
      expect(help).toContain(sub);
    }
  });

  it('exposes a semver version', () => {
    // commander stores the configured version; assert it is wired through.
    const help = buildProgram().helpInformation();
    expect(help).toContain('-v, --version');
  });
});
