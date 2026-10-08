// Run a command on every platform. On Windows many CLIs are .cmd shims (npx, npm,
// claude installed with npm), which Node only starts through a shell: spawning one
// directly fails with ENOENT (`npx`) or EINVAL (`npx.cmd`, since the CVE-2024-27980
// fix). So there the arguments are quoted into one cmd.exe command line. They must
// be the kit's own (commands, flags, repo paths), never free text: anything cmd.exe
// could still expand is refused. Free text, like an agent's prompt, goes in on stdin.

import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from 'node:child_process';

export type RunOptions = Omit<SpawnSyncOptions, 'encoding' | 'shell'>;

/** The cmd.exe command line for `command <args>`. Throws for an argument it can't pass safely. */
export function windowsCommandLine(command: string, args: string[]): string {
  return [command, ...args]
    .map((arg) => {
      if (/["%!^\r\n]/.test(arg)) throw new Error(`Can't pass ${JSON.stringify(arg)} to ${command} through cmd.exe.`);
      if (/^[\w\-.,:/\\=@+]+$/.test(arg)) return arg;
      // A backslash before the closing quote would escape it, so double any at the end.
      return `"${arg.replace(/(\\+)$/, '$1$1')}"`;
    })
    .join(' ');
}

export function run(command: string, args: string[], options: RunOptions = {}): SpawnSyncReturns<string> {
  return process.platform === 'win32'
    ? spawnSync(windowsCommandLine(command, args), { ...options, shell: true, encoding: 'utf8' })
    : spawnSync(command, args, { ...options, encoding: 'utf8' });
}

/** `npx <args>`. */
export function npx(args: string[], options: RunOptions = {}): SpawnSyncReturns<string> {
  return run('npx', args, options);
}

/** Why a run failed, in one line: the spawn error, else the end of its stderr, else the exit code. */
export function failure(result: SpawnSyncReturns<string>): string {
  if (result.error) return result.error.message;
  const stderr = result.stderr?.trim();
  if (stderr)
    return stderr
      .split(/\s*\r?\n\s*/)
      .slice(-3)
      .join(' ');
  return result.signal ? `killed by ${result.signal}` : `exit code ${result.status}`;
}
