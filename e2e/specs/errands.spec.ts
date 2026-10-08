import { test, expect } from '../support/test';
import { ErrandsPage } from '../pages/ErrandsPage';

test.describe('errands', () => {
  test(
    'a new user starts with an empty list',
    { annotation: { type: 'covers', description: 'errands#remaining-counter' } },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();

      await expect(errands.empty).toBeVisible();
      await expect(errands.remaining).toHaveText('0 errands left');
    },
  );

  test(
    'adds an errand and counts it as remaining',
    {
      annotation: [
        { type: 'covers', description: 'errands#add-errand' },
        { type: 'covers', description: 'errands#remaining-counter' },
      ],
    },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();
      await errands.addErrand('Return library books');

      await expect(errands.item('Return library books')).toBeVisible();
      await expect(errands.remaining).toHaveText('1 errand left');
      await expect(errands.newErrand).toHaveValue('');
    },
  );

  test(
    'completing an errand updates the count and survives a reload',
    {
      annotation: [
        { type: 'covers', description: 'errands#complete-errand' },
        { type: 'covers', description: 'errands#done-persists' },
      ],
    },
    async ({ page, data, as }) => {
      const owner = await data.userWithErrands(['Buy milk', 'Post parcel']);
      page = await as(owner);
      const errands = new ErrandsPage(page);
      await errands.goto();

      await errands.checkbox('Buy milk').check();
      await expect(errands.remaining).toHaveText('1 errand left');

      await page.reload();
      await expect(errands.checkbox('Buy milk')).toBeChecked();
      await expect(errands.checkbox('Post parcel')).not.toBeChecked();
    },
  );

  test(
    'deletes an errand',
    { annotation: { type: 'covers', description: 'errands#delete-errand' } },
    async ({ data, as }) => {
      const page = await as(await data.userWithErrands(['Water plants']));
      const errands = new ErrandsPage(page);
      await errands.goto();

      await errands.remove('Water plants');
      await expect(errands.empty).toBeVisible();
    },
  );

  test(
    'a blank title adds nothing',
    {
      annotation: [
        { type: 'covers', description: 'errands#no-blank-titles' },
        { type: 'covers', description: 'errands#edge:whitespace-title' },
      ],
    },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();
      // The empty state is already showing, so wait for the server's answer and
      // reload: otherwise this passes before anything could have been saved.
      // (Found by `npm run mutate`: it survived the server saving blank titles.)
      const answered = page.waitForResponse((r) => r.url().endsWith('/api/errands') && r.request().method() === 'POST');
      await errands.addErrand('   ');
      await answered;
      await page.reload();

      await expect(errands.empty).toBeVisible();
      await expect(errands.remaining).toHaveText('0 errands left');
    },
  );

  test(
    "one user's errands are invisible to another",
    {
      annotation: [
        { type: 'covers', description: 'errands#private-lists' },
        { type: 'covers', description: 'errands#edge:two-users' },
      ],
    },
    async ({ data, as, newUser }) => {
      const alice = await as(await data.userWithErrands(['Private errand']));
      const bob = await as(await newUser());

      await new ErrandsPage(alice).goto();
      await expect(new ErrandsPage(alice).item('Private errand')).toBeVisible();

      const bobsList = new ErrandsPage(bob);
      await bobsList.goto();
      await expect(bobsList.empty).toBeVisible();
    },
  );

  test(
    'persists a newly added errand, unchecked, across reload',
    { annotation: { type: 'covers', description: 'errands#add-errand' } },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();
      await errands.addErrand('Return library books');

      await expect(errands.checkbox('Return library books')).toBeVisible();
      await expect(errands.checkbox('Return library books')).not.toBeChecked();
      await expect(errands.newErrand).toHaveValue('');
      await expect(errands.remaining).toHaveText('1 errand left');

      await page.reload();
      await expect(errands.checkbox('Return library books')).toBeVisible();
      await expect(errands.checkbox('Return library books')).not.toBeChecked();
      await expect(errands.remaining).toHaveText('1 errand left');
    },
  );

  test(
    'renders a title containing HTML as plain text',
    { annotation: { type: 'covers', description: 'errands#edge:html-title' } },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();
      await errands.addErrand('<b>bold</b>');

      await expect(errands.page.getByText('<b>bold</b>')).toBeVisible();
      await expect(errands.checkbox('<b>bold</b>')).toBeVisible();
      await expect(errands.list.getByRole('listitem')).toHaveCount(1);
      await expect(errands.renderedElements('b')).toHaveCount(0);

      await page.reload();
      await expect(errands.page.getByText('<b>bold</b>')).toBeVisible();
      await expect(errands.list.getByRole('listitem')).toHaveCount(1);
      await expect(errands.renderedElements('b')).toHaveCount(0);
    },
  );

  test(
    'uses singular and plural correctly in the remaining counter',
    { annotation: { type: 'covers', description: 'errands#remaining-counter' } },
    async ({ data, as }) => {
      const page = await as(await data.userWithErrands(['Buy milk', 'Post parcel']));
      const errands = new ErrandsPage(page);
      await errands.goto();
      await expect(errands.remaining).toHaveText('2 errands left');

      await errands.checkbox('Buy milk').check();
      await expect(errands.remaining).toHaveText('1 errand left');

      await errands.checkbox('Post parcel').check();
      await expect(errands.remaining).toHaveText('0 errands left');
    },
  );

  test(
    'unchecking an errand raises the counter and persists',
    { annotation: { type: 'covers', description: 'errands#done-persists' } },
    async ({ data, as }) => {
      const page = await as(await data.userWithErrands(['Buy milk', 'Post parcel']));
      const errands = new ErrandsPage(page);
      await errands.goto();

      await errands.checkbox('Buy milk').check();
      await expect(errands.remaining).toHaveText('1 errand left');

      await errands.checkbox('Buy milk').uncheck();
      await expect(errands.remaining).toHaveText('2 errands left');

      await page.reload();
      await expect(errands.checkbox('Buy milk')).not.toBeChecked();
      await expect(errands.remaining).toHaveText('2 errands left');
    },
  );

  test(
    'deleting one errand keeps the others, and the deletion persists',
    { annotation: { type: 'covers', description: 'errands#delete-errand' } },
    async ({ data, as }) => {
      const page = await as(await data.userWithErrands(['Buy milk', 'Post parcel']));
      const errands = new ErrandsPage(page);
      await errands.goto();

      await errands.remove('Buy milk');
      await expect(errands.item('Buy milk')).toHaveCount(0);
      await expect(errands.item('Post parcel')).toBeVisible();
      await expect(errands.remaining).toHaveText('1 errand left');
      await expect(errands.empty).toBeHidden();

      await page.reload();
      await expect(errands.item('Post parcel')).toBeVisible();
      await expect(errands.item('Buy milk')).toHaveCount(0);
    },
  );

  test(
    'a very long title without spaces wraps and stays usable',
    { annotation: { type: 'covers', description: 'errands#edge:long-title' } },
    async ({ signedInPage: page }) => {
      const title = 'LongWord'.repeat(40);
      const errands = new ErrandsPage(page);
      await page.setViewportSize({ width: 375, height: 800 });
      await errands.goto();

      const saved = page.waitForResponse((r) => r.url().endsWith('/api/errands') && r.request().method() === 'POST');
      await errands.addErrand(title);
      await saved;

      await expect(errands.checkbox(title)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(errands.deleteButton(title)).toBeInViewport();

      await page.reload();
      await expect(errands.checkbox(title)).toBeVisible();

      await errands.remove(title);
      await expect(errands.empty).toBeVisible();
    },
  );
});
