// Agent seed: signed out on the login page, with an account ready to sign in with.
// The agents can't see fixtures, so the account is on window.__e2e:
//   browser_evaluate(() => window.__e2e)  →  { email, password }

import { exposeToAgents } from '../../kit';
import { test, expect } from '../support/test';

test('seed: signed out, with an account', async ({ page, user }) => {
  await exposeToAgents(page, { email: user.email, password: user.password });
  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
