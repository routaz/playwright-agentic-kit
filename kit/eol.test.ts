import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inEolOf } from './eol.ts';

test('matches the line endings of the content it edits', () => {
  assert.equal(inEolOf('a\r\nb\r\n', 'x\ny'), 'x\r\ny');
  assert.equal(inEolOf('a\r\nb\r\n', 'x\r\ny'), 'x\r\ny');
  assert.equal(inEolOf('a\nb\n', 'x\ny'), 'x\ny');
  assert.equal(inEolOf('one line', 'x\ny'), 'x\ny');
});
