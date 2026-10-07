// Run the guard on what the healer changed.
// Usage: node kit/heal/run-guard.ts [--since <tree>]
//   --since  snapshot taken before the healer ran (kit/heal/snapshot.ts). Defaults to HEAD.
// Writes .heal/guard.json and exits 1 on violations.

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkDiff } from './guard.ts';
import { diffTrees, snapshotTree } from './snapshot.ts';

const { values } = parseArgs({ options: { since: { type: 'string' } } });
const files = diffTrees(values.since ?? 'HEAD^{tree}', snapshotTree());
const result = { files: files.map((f) => f.path), ...checkDiff(files) };

mkdirSync('.heal', { recursive: true });
writeFileSync('.heal/guard.json', JSON.stringify(result, null, 2) + '\n');

console.log(`guard: ${files.length} changed file(s)`);
for (const v of result.violations) console.log(`  ✗ ${v}`);
for (const w of result.warnings) console.log(`  ! ${w}`);
if (result.violations.length) {
  console.log('guard: rejected. Nothing will be published.');
  process.exit(1);
}
console.log('guard: passed');
