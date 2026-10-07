import type { TestInfo } from '@playwright/test';

let counter = 0;

/**
 * An address no other test (or worker, or retry) will generate, so tests can
 * share one backend without stepping on each other's data.
 */
export function uniqueEmail(testInfo: TestInfo, domain = 'example.test'): string {
  const stamp = Date.now().toString(36);
  return `e2e-w${testInfo.workerIndex}-r${testInfo.retry}-${stamp}-${++counter}@${domain}`;
}
