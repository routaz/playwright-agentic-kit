// Run the guard on everything the healer changed in the working tree.
// Usage: node kit/heal/run-guard.ts   → writes .heal/guard.json, exits 1 on violations.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { checkDiff, parseUnifiedDiff } from './guard.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Mark new files as intended-to-add so they show up in the diff. Ignored paths
// (.heal/, test-results/) stay out.
git('add', '--intent-to-add', '--all');
const files = parseUnifiedDiff(git('diff', 'HEAD', '--unified=0', '--no-color', '--no-ext-diff'));
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
