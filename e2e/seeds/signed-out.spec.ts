// Agent seed: a visitor who is not signed in, on the login page.
// Seeds give the planner and generator agents a known starting state. They run
// as ordinary smoke tests too, so a broken seed fails CI instead of confusing an agent.

import { test, expect } from '../support/test';

test('seed: signed out', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
