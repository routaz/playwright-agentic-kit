// Publish a heal run: a pull request with the healer's repairs, and an issue for
// each app bug or stale context entry. Runs after run-guard.ts and a fresh test run.
//
// Usage: node kit/heal/publish.ts --base <branch> --sha <sha> --run-url <url> --run-id <id> [--dry-run]

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { gh, reportIssues } from './github.ts';
import { parseReport, renderPullRequest, summariseRun, type GuardSummary, type RunSummary } from './report.ts';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string' },
    sha: { type: 'string' },
    'run-url': { type: 'string' },
    'run-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const dry = args['dry-run'];
const base = args.base ?? 'main';
const sha = args.sha ?? 'HEAD';
const failedRunUrl = args['run-url'] ?? '';
const runId = args['run-id'] ?? String(Date.now());

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function git(...args: string[]) {
  if (dry) console.log(`[dry-run] git ${args.join(' ')}`);
  else execFileSync('git', args, { encoding: 'utf8' });
}

function summary(md: string) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log(md);
}

if (!existsSync('.heal/report.json')) {
  summary('## Heal\n\nThe healer did not write `.heal/report.json`, so there is nothing to publish.');
  process.exit(1);
}
const report = parseReport(readJson('.heal/report.json'));
const guard: GuardSummary = readJson('.heal/guard.json');
const run: RunSummary = existsSync('test-results/results.json')
  ? summariseRun(readJson('test-results/results.json'))
  : { passed: 0, failed: 0, flaky: 0, failing: ['(no results.json from the re-run)'] };

const opts = { failedRunUrl, sha };
let prUrl = '';

// 1. Pull request with the repairs.
const changed = guard.files.length > 0 && report.healed.length > 0;
if (changed) {
  const branch = `heal/${runId}`;
  const title = `Heal ${report.healed.length} failing E2E test${report.healed.length === 1 ? '' : 's'} on ${base}`;
  git('switch', '-c', branch);
  git('add', '--', ...guard.files);
  git('commit', '-m', `${title}\n\nRepairs proposed by the e2e-healer agent for ${failedRunUrl}`);
  git('push', 'origin', branch);
  prUrl = gh(
    dry,
    'pr',
    'create',
    '--base',
    base,
    '--head',
    branch,
    '--title',
    title,
    '--body',
    renderPullRequest({ report, guard, run, ...opts }),
  ).trim();
  if (dry) console.log('\n' + renderPullRequest({ report, guard, run, ...opts }) + '\n');
}

// 2. One issue per real problem the healer refused to paper over.
const toReport = report.escalated.filter((e) => e.class !== 'environment');
const issues = reportIssues(report, { ...opts, dry });

// 3. Job summary.
summary(
  [
    '## Heal',
    '',
    `- Repaired: ${report.healed.length}${prUrl ? ` (${prUrl})` : ''}`,
    `- Reported: ${toReport.length}`,
    ...issues.map((i) => `  - ${i}`),
    ...report.escalated
      .filter((e) => e.class === 'environment')
      .map((e) => `- Environment problem, not reported as an issue: ${e.test}: ${e.actual}`),
    `- Suite after healing: ${run.passed} passed, ${run.failed} failed, ${run.flaky} flaky`,
  ].join('\n'),
);
