import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, renderPullRequest } from './report.ts';

const guard = { files: ['e2e/pages/ErrandsPage.ts'], violations: [], warnings: [] };
const run = { passed: 34, failed: 0, flaky: 0, failing: [] };

describe('heal report', () => {
  test('renders context suggestions in their own section', () => {
    const report = parseReport({
      healed: [{ test: 't', class: 'selector', change: 'Add → Save', evidence: 'snapshot' }],
      escalated: [],
      context_suggestions: [{ context: 'errands#add-errand', suggestion: "The journey still says 'Press Add'" }],
    });
    const md = renderPullRequest({ report, guard, run, failedRunUrl: 'https://example.test/run', sha: 'abcdef1234' });
    assert.match(md, /## Context suggestions \(for a person to decide\)/);
    assert.match(md, /`errands#add-errand`: The journey still says 'Press Add'/);
  });

  test('leaves the section out when there are none', () => {
    const report = parseReport({ healed: [], escalated: [] });
    const md = renderPullRequest({ report, guard, run, failedRunUrl: '', sha: 'abcdef1234' });
    assert.doesNotMatch(md, /Context suggestions/);
  });

  test('rejects a malformed report', () => {
    assert.throws(() => parseReport({ healed: [] }), /"healed" and "escalated"/);
    assert.throws(() => parseReport({ healed: [], escalated: [], context_suggestions: 'x' }), /must be an array/);
  });
});
