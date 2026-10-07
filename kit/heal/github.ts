// GitHub side of a heal run, through the `gh` CLI: issues for app bugs and stale
// context. Used by CI (publish.ts) and locally (local.ts, with the developer's own login).

import { execFileSync } from 'node:child_process';
import { issueTitle, renderIssue, type HealReport } from './report.ts';

export function gh(dry: boolean, ...args: string[]): string {
  if (dry) {
    console.log(`[dry-run] gh ${args.map((a) => (a.includes(' ') ? JSON.stringify(a.slice(0, 60)) : a)).join(' ')}`);
    return '';
  }
  return execFileSync('gh', args, { encoding: 'utf8' });
}

/** File one issue per app bug or context drift, skipping any already open. Returns a line per issue. */
export function reportIssues(report: HealReport, opts: { failedRunUrl: string; sha: string; dry: boolean }): string[] {
  const toReport = report.escalated.filter((e) => e.class !== 'environment');
  if (!toReport.length) return [];

  const { dry } = opts;
  gh(dry, 'label', 'create', 'e2e:app-bug', '--color', 'B60205', '--force', '--description', 'Found by the E2E healer');
  gh(
    dry,
    'label',
    'create',
    'e2e:context-drift',
    '--color',
    'FBCA04',
    '--force',
    '--description',
    'Context file looks stale',
  );

  const lines: string[] = [];
  for (const e of toReport) {
    const title = issueTitle(e);
    const existing = dry
      ? ''
      : gh(
          dry,
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
      lines.push(`${title} (already open: ${existing})`);
      continue;
    }
    const body = renderIssue(e, opts);
    const url = gh(dry, 'issue', 'create', '--title', title, '--label', `e2e:${e.class}`, '--body', body).trim();
    if (dry) console.log('\n' + body + '\n');
    lines.push(url ? `${title}: ${url}` : title);
  }
  return lines;
}
