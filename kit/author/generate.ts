// `npm run generate -- <plan>`: the e2e-generator agent, headlessly, with your own Claude login.
//
//   1. snapshot the working tree (your own uncommitted work is left alone)
//   2. run the generator on the plan (or part of it, with --only)
//   3. guard what it changed with the healer's guard: tests and page objects only, nothing
//      skipped, no existing assertion weakened. Violations undo all its changes.
//   4. run the new and changed specs, then show context coverage
//
// Flags: --only "1.1-1.5" limits the scenarios; --max-turns <n> overrides heal.local.json.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { maxTurnsFrom, requireClaude, runAgent } from '../claude.ts';
import { loadConfig } from '../heal/config.ts';
import { checkDiff } from '../heal/guard.ts';
import { diffTrees, restoreFrom, snapshotTree } from '../heal/snapshot.ts';

// The script's own name, so hints match the project (e.g. `generate` here, `e2e:generate` in an app).
const self = process.env.npm_lifecycle_event ?? 'generate';
const sibling = self.replace('generate', 'plan');

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { only: { type: 'string' }, 'max-turns': { type: 'string' } },
});
const planFile = positionals[0];
if (!planFile || !existsSync(planFile)) {
  console.error(
    `${planFile ? `No plan at ${planFile}.` : 'Which plan?'} Usage: npm run ${self} -- e2e/plans/<feature>.plan.md [--only "1.1-1.5"]`,
  );
  process.exit(2);
}

const config = loadConfig();
const maxTurns = maxTurnsFrom(flags['max-turns'], config);
requireClaude(config);

const before = snapshotTree();
const scope = flags.only ? `scenarios ${flags.only} of ` : '';
console.log(
  `\n\x1b[1mGenerating ${scope}${planFile}\x1b[0m (max ${maxTurns} turns${config.model ? `, model ${config.model}` : ''})`,
);
const status = runAgent(config, {
  agent: 'e2e-generator',
  prompt: `Implement ${scope}${planFile}. Follow your instructions: run each new test, and report any scenario you could not make pass as blocked.`,
  tools: 'Read,Glob,Grep,LS,Edit,Write,mcp__playwright-test__*',
  maxTurns,
  model: config.model || undefined,
});
if (status !== 0) console.warn(`\nThe generator exited with code ${status}. Checking what it left behind.`);

console.log('\n\x1b[1mGuarding its changes\x1b[0m');
const changes = diffTrees(before, snapshotTree());
const guard = checkDiff(changes);
for (const f of changes) console.log(`  ${f.status}: ${f.path}`);
for (const w of guard.warnings) console.log(`  ! ${w}`);
if (guard.violations.length) {
  for (const v of guard.violations) console.log(`  ✗ ${v}`);
  restoreFrom(before, changes);
  console.log('\nRejected: the changes above broke the rules, so they have been undone. Your own work is untouched.');
  process.exit(1);
}

const specs = changes.filter((f) => f.status !== 'deleted' && f.path.endsWith('.spec.ts')).map((f) => f.path);
if (!specs.length) {
  console.error('\nNo tests were written. Try again with more turns, or a smaller --only range.');
  process.exit(1);
}

console.log(`\n\x1b[1mRunning ${specs.join(', ')}\x1b[0m`);
const tests = spawnSync('npx', ['playwright', 'test', ...specs], { stdio: 'inherit' });

const coverage = spawnSync(process.execPath, [fileURLToPath(new URL('../observe/coverage.ts', import.meta.url))], {
  encoding: 'utf8',
});
const headline = coverage.stdout?.split('\n').find((l) => l.startsWith('**'));
if (headline) console.log(`\nContext coverage: ${headline.replace(/\*\*/g, '')}`);

console.log(
  `\nNext: review the changes like any pull request:\n  git diff -- ${changes.map((f) => f.path).join(' ')}` +
    '\nFor a new rule, add a break to e2e/mutations.ts and check it with the mutation runner.',
);
process.exit(tests.status === 0 ? 0 : 1);
