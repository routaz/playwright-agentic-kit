import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, npx, run, windowsCommandLine } from './run.ts';

describe('run', () => {
  test('starts npx on this platform', () => {
    const result = npx(['--version']);
    assert.equal(result.status, 0, failure(result));
    assert.match(result.stdout, /^\d+\.\d+/);
  });

  test('passes stdin through, so free text never touches a command line', () => {
    const result = run(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      input: 'a "quoted" 100% line\nand another',
    });
    assert.equal(result.status, 0, failure(result));
    assert.equal(result.stdout, 'a "quoted" 100% line\nand another');
  });

  test('leaves plain arguments bare and quotes the rest for cmd.exe', () => {
    assert.equal(
      windowsCommandLine('npx', [
        'playwright',
        'test',
        'e2e/specs/chat.spec.ts:12',
        '--project=mobile',
        'my specs/a&b.spec.ts',
        'Read,mcp__playwright-test__*',
        'C:\\Program Files\\Claude\\',
      ]),
      'npx playwright test e2e/specs/chat.spec.ts:12 --project=mobile "my specs/a&b.spec.ts" ' +
        '"Read,mcp__playwright-test__*" "C:\\Program Files\\Claude\\\\"',
    );
  });

  test('refuses arguments cmd.exe would still expand', () => {
    for (const arg of ['"quoted"', '%PATH%', 'a^b', 'wow!', 'line\nbreak']) {
      assert.throws(() => windowsCommandLine('npx', [arg]), /Can't pass/);
    }
  });

  test('explains a failure by its cause', () => {
    const base = { pid: 0, output: [], stdout: '', status: 1, signal: null };
    assert.equal(
      failure({ ...base, stderr: 'a\nb\r\nNo such container\nTry --debug.\n' }),
      'b No such container Try --debug.',
    );
    assert.equal(failure({ ...base, stderr: '', error: new Error('spawnSync npx ENOENT') }), 'spawnSync npx ENOENT');
    assert.equal(failure({ ...base, stderr: '' }), 'exit code 1');
  });
});
