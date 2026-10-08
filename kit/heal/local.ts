// `npm run heal`: the heal workflow on your own machine, with your own Claude Code login.
//
//   1. run the E2E suite        → all green? stop
//   2. snapshot the working tree (your own uncommitted work is left alone)
//   3. run the e2e-healer agent
//   4. guard what it changed    → violations? undo its changes and stop
//   5. run the suite again and print a summary
//   6. leave the repairs for review, or commit them (heal.local.json → afterHeal)
//
// Settings: heal.local.json (see heal.local.example.json). Flags: --dry-run skips GitHub calls.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { requireClaude, runAgent } from '../claude.ts';
import { loadConfig } from './config.ts';
import { reportIssues } from './github.ts';
import { checkDiff } from './guard.ts';
import { parseReport, summariseRun } from './report.ts';
import { diffTrees, restoreFrom, snapshotTree } from './snapshot.ts';

const { values: flags } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });
const config = loadConfig();
const step = (n: number, text: string) => console.log(`\n\x1b[1m${n}. ${text}\x1b[0m`);

function runSuite(): boolean {
  return spawnSync('npx', ['playwright', 'test'], { stdio: 'inherit' }).status === 0;
}

requireClaude(config);

step(1, 'Running the E2E suite');
if (runSuite()) {
  console.log('\nAll green. Nothing to heal.');
  process.exit(0);
}

step(2, 'Snapshotting the working tree');
const before = snapshotTree();
rmSync('.heal', { recursive: true, force: true });
mkdirSync('.heal');

step(3, `Running the e2e-healer agent (max ${config.maxTurns} turns${config.model ? `, model ${config.model}` : ''})`);
const healerStatus = runAgent(config, {
  agent: 'e2e-healer',
  prompt:
    'Heal the tests that fail in test-results/results.json. Write .heal/report.json as your instructions describe. Do not commit.',
  tools: 'Read,Glob,Grep,LS,Edit,Write,mcp__playwright-test__*',
  maxTurns: config.maxTurns,
  model: config.model || undefined,
});
if (healerStatus !== 0) console.warn(`\nThe healer exited with code ${healerStatus}. Checking what it left behind.`);

step(4, 'Guarding its changes');
const changes = diffTrees(before, snapshotTree());
const guard = checkDiff(changes);
for (const f of changes) console.log(`  changed: ${f.path}`);
for (const w of guard.warnings) console.log(`  ! ${w}`);
if (guard.violations.length) {
  for (const v of guard.violations) console.log(`  ✗ ${v}`);
  restoreFrom(before, changes);
  console.log(
    '\nRejected. The healer broke the rules above, so its changes have been undone. Your own work is untouched.',
  );
  process.exit(1);
}
console.log(`  guard passed (${changes.length} file(s))`);

step(5, 'Running the suite again');
runSuite();

const report = existsSync('.heal/report.json')
  ? parseReport(JSON.parse(readFileSync('.heal/report.json', 'utf8')))
  : undefined;
const run = existsSync('test-results/results.json')
  ? summariseRun(JSON.parse(readFileSync('test-results/results.json', 'utf8')))
  : undefined;

console.log('\n\x1b[1mHeal summary\x1b[0m');
if (!report) console.log('  The healer wrote no .heal/report.json, so there is no explanation for its changes.');
for (const h of report?.healed ?? []) console.log(`  repaired  [${h.class}] ${h.test}\n            ${h.change}`);
for (const e of report?.escalated ?? [])
  console.log(
    `  reported  [${e.class}] ${e.test}\n            expected: ${e.expected}\n            actual:   ${e.actual}`,
  );
for (const c of report?.context_suggestions ?? []) console.log(`  context   ${c.context}: ${c.suggestion}`);
if (run) console.log(`  suite now: ${run.passed} passed, ${run.failed} failed, ${run.flaky} flaky`);

// 6. What to do with the result.
if (report && config.reportIssues) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  for (const line of reportIssues(report, { failedRunUrl: '(local run)', sha, dry: flags['dry-run'] }))
    console.log(`  issue: ${line}`);
}

if (changes.length && config.afterHeal === 'commit') {
  const n = report?.healed.length ?? changes.length;
  execFileSync('git', ['add', '--', ...changes.map((f) => f.path)]);
  execFileSync('git', [
    'commit',
    '-m',
    `Heal ${n} failing E2E test${n === 1 ? '' : 's'}\n\nRepairs by the e2e-healer agent, checked by kit/heal/guard.ts.`,
  ]);
  console.log('\nCommitted the repairs as their own commit. Review it with `git show`; undo with `git reset HEAD~1`.');
} else if (changes.length) {
  console.log(
    `\nThe repairs are in your working tree, uncommitted. Review them with:\n  git diff -- ${changes.map((f) => f.path).join(' ')}`,
  );
}
process.exit(run && run.failed > 0 ? 1 : 0);
