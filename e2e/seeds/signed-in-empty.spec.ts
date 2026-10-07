// Agent seed: a fresh signed-in user with no errands, on the errand list.

import { test, expect } from '../support/test';

test('seed: signed in, empty list', async ({ page, user, signIn }) => {
  await signIn(user);
  await page.goto('/#/errands');
  await expect(page.getByRole('heading', { name: 'Your errands' })).toBeVisible();
});
