// Agent seed: a signed-in user with two open errands, on the errand list.

import { test, expect } from '../support/test';

test('seed: signed in, two errands', async ({ page, data, signIn }) => {
  await signIn(await data.userWithErrands(['Buy milk', 'Post parcel']));
  await page.goto('/#/errands');
  await expect(page.getByRole('listitem')).toHaveCount(2);
});
