import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDiff, parseUnifiedDiff, type FileChange } from './guard.ts';

const spec = (removed: string[], added: string[], path = 'e2e/specs/x.spec.ts'): FileChange => ({
  path,
  status: 'modified',
  removed,
  added,
});

describe('heal guard', () => {
  test('accepts a locator fix in a page object', () => {
    const r = checkDiff([
      spec(
        [`    this.add = page.getByRole('button', { name: 'Add' });`],
        [`    this.add = page.getByRole('button', { name: 'Add errand' });`],
        'e2e/pages/ErrandsPage.ts',
      ),
    ]);
    assert.deepEqual(r, { violations: [], warnings: [] });
  });

  test('accepts swapping a one-off check for a web-first assertion', () => {
    const r = checkDiff([
      spec(
        [`expect(await status.textContent()).toBe('1 errand left');`],
        [`await expect(status).toHaveText('1 errand left');`],
      ),
    ]);
    assert.deepEqual(r.violations, []);
  });

  test('rejects edits outside the allowed folders', () => {
    const r = checkDiff([spec(['a'], ['b'], 'e2e/context/errands.feature.yaml'), spec(['a'], ['b'], 'src/app.js')]);
    assert.equal(r.violations.length, 2);
    assert.match(r.violations[0], /outside the healer's area/);
  });

  test('rejects deleting a spec', () => {
    const r = checkDiff([{ path: 'e2e/specs/x.spec.ts', status: 'deleted', added: [], removed: ['test()'] }]);
    assert.match(r.violations[0], /deletes a file/);
  });

  for (const [line, why] of [
    [`  test.skip('flaky', async () => {});`, /skips/],
    [`  test.fixme();`, /skips/],
    [`  test.describe.only('x', () => {});`, /skips|only/],
    [`  await page.waitForTimeout(2000);`, /fixed wait/],
    [`  await page.waitForLoadState('networkidle');`, /networkidle/],
    [`  // await expect(errands.remaining).toHaveText('1 errand left');`, /comments out/],
    [`  await expect(x).toBeVisible().catch(() => {});`, /catches/],
  ] as const) {
    test(`rejects: ${line.trim()}`, () => {
      const r = checkDiff([spec([], [line])]);
      assert.ok(
        r.violations.some((v) => why.test(v)),
        r.violations.join('\n'),
      );
    });
  }

  test('rejects removing an assertion', () => {
    const r = checkDiff([
      spec([`await expect(a).toBeVisible();`, `await expect(b).toHaveText('x');`], [`await expect(a).toBeVisible();`]),
    ]);
    assert.ok(r.violations.some((v) => /removes 1 assertion/.test(v)));
  });

  test('rejects weakening toHaveText to toBeVisible', () => {
    const r = checkDiff([
      spec([`await expect(status).toHaveText('1 errand left');`], [`await expect(status).toBeVisible();`]),
    ]);
    assert.ok(r.violations.some((v) => /toHaveText/.test(v)));
  });

  test('rejects weakening toHaveText to toContainText', () => {
    const r = checkDiff([
      spec([`await expect(s).toHaveText('1 errand left');`], [`await expect(s).toContainText('errand');`]),
    ]);
    assert.ok(r.violations.some((v) => /toHaveText/.test(v)));
  });

  test('rejects loosening an exact value to a regex', () => {
    const r = checkDiff([
      spec([`await expect(s).toHaveText('1 errand left');`], [`await expect(s).toHaveText(/errand/);`]),
    ]);
    assert.ok(r.violations.some((v) => /loosens toHaveText/.test(v)));
  });

  test('warns, but allows, a changed expected value', () => {
    const r = checkDiff([
      spec([`await expect(s).toHaveText('1 errand left');`], [`await expect(s).toHaveText('1 item left');`]),
    ]);
    assert.deepEqual(r.violations, []);
    assert.match(r.warnings[0], /changes the expected value of toHaveText\(\) \(was "1 errand left"\)/);
  });

  test('parses git diff output, including new files', () => {
    const diff = [
      'diff --git a/e2e/pages/LoginPage.ts b/e2e/pages/LoginPage.ts',
      'index 1..2 100644',
      '--- a/e2e/pages/LoginPage.ts',
      '+++ b/e2e/pages/LoginPage.ts',
      '@@ -1 +1 @@',
      "-    this.submit = page.getByRole('button', { name: 'Sign in' });",
      "+    this.submit = page.getByRole('button', { name: 'Log in' });",
      'diff --git a/e2e/specs/new.spec.ts b/e2e/specs/new.spec.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/e2e/specs/new.spec.ts',
      '@@ -0,0 +1 @@',
      '+test.only("x", () => {});',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    assert.equal(files.length, 2);
    assert.equal(files[0].path, 'e2e/pages/LoginPage.ts');
    assert.equal(files[0].removed.length, 1);
    assert.equal(files[1].status, 'added');
    assert.ok(checkDiff(files).violations.some((v) => /new\.spec\.ts.*only/.test(v)));
  });
});
