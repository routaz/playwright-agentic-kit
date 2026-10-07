// Fail if tracked files or commit messages mention anything on a private denylist,
// e.g. the names of client projects this template was used on.
//
// The denylist itself must never be committed (that would leak it), so it comes from
//   - the LEAK_DENYLIST environment variable (comma or newline separated), used in CI
//     via a repository secret, and/or
//   - a local, git-ignored `.denylist` file, one term per line.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const terms = [process.env.LEAK_DENYLIST ?? '', existsSync('.denylist') ? readFileSync('.denylist', 'utf8') : '']
  .join('\n')
  .split(/[,\n]/)
  .map((t) => t.trim().toLowerCase())
  .filter((t) => t && !t.startsWith('#'));

if (terms.length === 0) {
  console.warn('check-leaks: no denylist configured (LEAK_DENYLIST or .denylist). Skipping.');
  process.exit(0);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const hits = [];

for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
  if (!existsSync(file)) continue;
  const lower = file.toLowerCase();
  for (const t of terms) if (lower.includes(t)) hits.push(`path: ${file}`);
  const text = readFileSync(file, 'utf8').toLowerCase();
  text.split('\n').forEach((line, i) => {
    if (terms.some((t) => line.includes(t))) hits.push(`${file}:${i + 1}`);
  });
}

// Commit messages and author names travel with the repo too.
let log = '';
try {
  log = git('log', '--format=%H %an <%ae>%n%B%x00');
} catch {
  // No commits yet.
}
for (const entry of log.split('\0')) {
  if (terms.some((t) => entry.toLowerCase().includes(t))) hits.push(`commit ${entry.trim().slice(0, 12)}`);
}

if (hits.length) {
  // Print where, never which term, so CI logs don't leak the denylist either.
  console.error(`check-leaks: ${hits.length} match(es) for denylisted terms:`);
  for (const h of [...new Set(hits)]) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`check-leaks: clean (${terms.length} term(s) checked).`);
