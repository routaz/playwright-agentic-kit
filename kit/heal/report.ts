// The healer's report format and the Markdown the heal workflow publishes from it.

export type HealedClass = 'selector' | 'timing' | 'test-bug' | 'data';
export type EscalatedClass = 'app-bug' | 'context-drift' | 'environment';

export interface HealReport {
  healed: { test: string; class: HealedClass; change: string; evidence: string }[];
  escalated: {
    test: string;
    class: EscalatedClass;
    covers?: string;
    expected: string;
    actual: string;
    evidence: string;
  }[];
  /**
   * Notes for a person: context entries that look stale or incomplete, noticed while
   * healing (e.g. a journey still says "Press Add" after a rename). Never acted on by the agent.
   */
  context_suggestions?: { context: string; suggestion: string }[];
}

export interface GuardSummary {
  files: string[];
  violations: string[];
  warnings: string[];
}

export interface RunSummary {
  passed: number;
  failed: number;
  flaky: number;
  failing: string[];
}

const HEALED = new Set(['selector', 'timing', 'test-bug', 'data']);
const ESCALATED = new Set(['app-bug', 'context-drift', 'environment']);

export function parseReport(raw: unknown): HealReport {
  const r = raw as Partial<HealReport>;
  if (!r || !Array.isArray(r.healed) || !Array.isArray(r.escalated)) {
    throw new Error('Heal report must have "healed" and "escalated" arrays.');
  }
  for (const h of r.healed) if (!HEALED.has(h.class)) throw new Error(`Unknown healed class "${h.class}"`);
  for (const e of r.escalated) if (!ESCALATED.has(e.class)) throw new Error(`Unknown escalated class "${e.class}"`);
  if (r.context_suggestions !== undefined && !Array.isArray(r.context_suggestions)) {
    throw new Error('"context_suggestions" must be an array when present.');
  }
  return r as HealReport;
}

interface PwSuite {
  title: string;
  file?: string;
  specs?: { title: string; file: string; tests: { projectName: string; status: string }[] }[];
  suites?: PwSuite[];
}

/** Summarise Playwright's JSON reporter output (test-results/results.json). */
export function summariseRun(results: {
  stats: { expected: number; unexpected: number; flaky: number };
  suites: PwSuite[];
}): RunSummary {
  const failing: string[] = [];
  const walk = (s: PwSuite, path: string[]) => {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests) {
        if (t.status === 'unexpected')
          failing.push(`[${t.projectName}] ${spec.file} › ${[...path, spec.title].join(' › ')}`);
      }
    }
    for (const child of s.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const s of results.suites) walk(s, []);
  return {
    passed: results.stats.expected,
    failed: results.stats.unexpected,
    flaky: results.stats.flaky,
    failing,
  };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderPullRequest(o: {
  report: HealReport;
  guard: GuardSummary;
  run: RunSummary;
  failedRunUrl: string;
  sha: string;
}): string {
  const { report, guard, run } = o;
  const lines = [
    `The heal workflow repaired tests that failed in [this CI run](${o.failedRunUrl}) on \`${o.sha.slice(0, 7)}\`.`,
    '',
    '## Repaired',
    '',
    '| Test | Class | Change | Evidence |',
    '| --- | --- | --- | --- |',
    ...report.healed.map((h) => `| ${cell(h.test)} | \`${h.class}\` | ${cell(h.change)} | ${cell(h.evidence)} |`),
  ];
  if (report.escalated.length) {
    lines.push(
      '',
      '## Not repaired (reported instead)',
      '',
      '| Test | Class | Expected | Actual |',
      '| --- | --- | --- | --- |',
      ...report.escalated.map((e) => `| ${cell(e.test)} | \`${e.class}\` | ${cell(e.expected)} | ${cell(e.actual)} |`),
    );
  }
  if (report.context_suggestions?.length) {
    lines.push(
      '',
      '## Context suggestions (for a person to decide)',
      '',
      ...report.context_suggestions.map((c) => `- \`${c.context}\`: ${c.suggestion}`),
    );
  }
  lines.push(
    '',
    '## Checks',
    '',
    `- **Guard:** passed for ${guard.files.length} file(s): ${guard.files.map((f) => `\`${f}\``).join(', ')}.`,
  );
  if (guard.warnings.length) {
    lines.push(
      '- **Review carefully.** These changes alter what a test expects. They are only correct if the old value contradicted the context file:',
      ...guard.warnings.map((w) => `  - ${w}`),
    );
  }
  lines.push(
    `- **Full suite after healing:** ${run.passed} passed, ${run.failed} failed, ${run.flaky} flaky.`,
    ...run.failing.map((f) => `  - still failing: ${f}`),
    '',
    '> Pull requests opened by GitHub Actions do not trigger CI on their own. The numbers above come from the heal run itself; push a commit or close and reopen this PR to run CI again.',
  );
  return lines.join('\n');
}

export function issueTitle(e: HealReport['escalated'][number]): string {
  return `[e2e] ${e.class}: ${e.covers ?? e.test}`;
}

export function renderIssue(e: HealReport['escalated'][number], o: { failedRunUrl: string; sha: string }): string {
  const what =
    e.class === 'app-bug'
      ? 'The app breaks a rule or journey in its context file. The healer left the test unchanged.'
      : 'The app seems to have changed on purpose, and the context file looks out of date. Update the context first; the tests follow from it.';
  return [
    what,
    '',
    `- **Test:** ${e.test}`,
    e.covers ? `- **Covers:** \`${e.covers}\`` : '',
    `- **Expected:** ${e.expected}`,
    `- **Actual:** ${e.actual}`,
    `- **Evidence:** ${e.evidence}`,
    `- **Found in:** [CI run](${o.failedRunUrl}) on \`${o.sha.slice(0, 7)}\``,
  ]
    .filter(Boolean)
    .join('\n');
}
