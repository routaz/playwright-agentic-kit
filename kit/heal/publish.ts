// Publish a heal run: a pull request with the healer's repairs, and an issue for
// each app bug or stale context entry. Runs after run-guard.ts and a fresh test run.
//
// Usage: node kit/heal/publish.ts --base <branch> --sha <sha> --run-url <url> --run-id <id> [--dry-run]

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  issueTitle,
  parseReport,
  renderIssue,
  renderPullRequest,
  summariseRun,
  type GuardSummary,
  type RunSummary,
} from './report.ts';

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

function sh(cmd: string, ...rest: string[]): string {
  if (dry && cmd !== 'git') {
    console.log(
      `[dry-run] ${cmd} ${rest.map((a) => (a.includes(' ') ? JSON.stringify(a.slice(0, 60)) : a)).join(' ')}`,
    );
    return '';
  }
  return execFileSync(cmd, rest, { encoding: 'utf8' });
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
  if (dry) {
    console.log(`[dry-run] would push ${branch} with: ${guard.files.join(', ')}`);
  } else {
    sh('git', 'switch', '-c', branch);
    sh('git', 'add', '--', ...guard.files);
    sh('git', 'commit', '-m', `${title}\n\nRepairs proposed by the e2e-healer agent for ${failedRunUrl}`);
    sh('git', 'push', 'origin', branch);
  }
  prUrl = sh(
    'gh',
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
const issues: string[] = [];
const toReport = report.escalated.filter((e) => e.class !== 'environment');
if (toReport.length) {
  sh(
    'gh',
    'label',
    'create',
    'e2e:app-bug',
    '--color',
    'B60205',
    '--force',
    '--description',
    'Found by the E2E healer',
  );
  sh(
    'gh',
    'label',
    'create',
    'e2e:context-drift',
    '--color',
    'FBCA04',
    '--force',
    '--description',
    'Context file looks stale',
  );
}
for (const e of toReport) {
  const title = issueTitle(e);
  const existing = dry
    ? ''
    : sh(
        'gh',
        'issue',
        'list',
        '--state',
        'open',
        '--search',
        `"${title}" in:title`,
        '--json',
        'url',
        '--jq',
        '.[0].url',
      ).trim();
  if (existing) {
    issues.push(`${title} (already open: ${existing})`);
    continue;
  }
  const url = sh(
    'gh',
    'issue',
    'create',
    '--title',
    title,
    '--label',
    `e2e:${e.class}`,
    '--body',
    renderIssue(e, opts),
  ).trim();
  issues.push(url ? `${title}: ${url}` : title);
  if (dry) console.log('\n' + renderIssue(e, opts) + '\n');
}

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
