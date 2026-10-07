import type { Page } from '@playwright/test';

/**
 * Hand values that only exist inside the test run (a fresh user's email and
 * password, an id) to the planner and generator agents, which explore from a
 * seed's page but can't see its fixtures. They read it with
 * `browser_evaluate(() => window.__e2e)`.
 *
 * Set before every navigation, so it survives the seed moving between pages.
 * Only for seeds: specs have the values directly.
 */
export async function exposeToAgents(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript((v) => {
    (window as unknown as { __e2e: unknown }).__e2e = v;
  }, values);
}
