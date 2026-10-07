import { test, expect } from '../support/test';
import { ErrandsPage } from '../pages/ErrandsPage';

test.describe('errands', () => {
  test('a new user starts with an empty list', async ({ signedInPage: page }) => {
    const errands = new ErrandsPage(page);
    await errands.goto();

    await expect(errands.empty).toBeVisible();
    await expect(errands.remaining).toHaveText('0 errands left');
  });

  test('adds an errand and counts it as remaining', async ({ signedInPage: page }) => {
    const errands = new ErrandsPage(page);
    await errands.goto();
    await errands.addErrand('Return library books');

    await expect(errands.item('Return library books')).toBeVisible();
    await expect(errands.remaining).toHaveText('1 errand left');
    await expect(errands.newErrand).toHaveValue('');
  });

  test('completing an errand updates the count and survives a reload', async ({ page, data, as }) => {
    const owner = await data.userWithErrands(['Buy milk', 'Post parcel']);
    page = await as(owner);
    const errands = new ErrandsPage(page);
    await errands.goto();

    await errands.checkbox('Buy milk').check();
    await expect(errands.remaining).toHaveText('1 errand left');

    await page.reload();
    await expect(errands.checkbox('Buy milk')).toBeChecked();
    await expect(errands.checkbox('Post parcel')).not.toBeChecked();
  });

  test('deletes an errand', async ({ data, as }) => {
    const page = await as(await data.userWithErrands(['Water plants']));
    const errands = new ErrandsPage(page);
    await errands.goto();

    await errands.remove('Water plants');
    await expect(errands.empty).toBeVisible();
  });

  test('a blank title adds nothing', async ({ signedInPage: page }) => {
    const errands = new ErrandsPage(page);
    await errands.goto();
    await errands.addErrand('   ');

    await expect(errands.empty).toBeVisible();
  });

  test("one user's errands are invisible to another", async ({ data, as, newUser }) => {
    const alice = await as(await data.userWithErrands(['Private errand']));
    const bob = await as(await newUser());

    await new ErrandsPage(alice).goto();
    await expect(new ErrandsPage(alice).item('Private errand')).toBeVisible();

    const bobsList = new ErrandsPage(bob);
    await bobsList.goto();
    await expect(bobsList.empty).toBeVisible();
  });
});
