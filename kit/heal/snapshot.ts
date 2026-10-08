// Snapshot the whole working tree (tracked, modified and new files; ignored files
// excluded) as a git tree object, without touching the real index or any branch.
// Diffing two snapshots gives exactly what changed in between, e.g. what the healer
// did, even when the developer has uncommitted work of their own.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseUnifiedDiff, type FileChange } from './guard.ts';

export function snapshotTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'heal-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { env });
    execFileSync('git', ['add', '--all'], { env });
    return execFileSync('git', ['write-tree'], { env, encoding: 'utf8' }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function diffTrees(from: string, to: string): FileChange[] {
  const diff = execFileSync('git', ['diff', from, to, '--unified=0', '--no-color', '--no-ext-diff'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseUnifiedDiff(diff);
}

/** Put the given paths back the way they were in `tree`; delete ones that didn't exist. */
export function restoreFrom(tree: string, files: FileChange[]): void {
  for (const f of files) {
    if (f.status === 'added') rmSync(f.path, { force: true });
    else execFileSync('git', ['restore', `--source=${tree}`, '--worktree', '--', f.path]);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(snapshotTree());
}
