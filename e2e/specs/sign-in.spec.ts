import { test, expect } from '../support/test';
import { LoginPage } from '../pages/LoginPage';
import { ErrandsPage } from '../pages/ErrandsPage';

test.describe('sign-in', () => {
  test(
    'signs in with valid credentials and lands on the errand list',
    { annotation: { type: 'covers', description: 'sign-in#sign-in' } },
    async ({ page, user }) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.signIn(user.email, user.password);

      const errands = new ErrandsPage(page);
      await expect(errands.heading).toBeVisible();
      await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible();
    },
  );

  test(
    'rejects a wrong password without revealing which field was wrong',
    {
      annotation: [
        { type: 'covers', description: 'sign-in#wrong-password' },
        { type: 'covers', description: 'sign-in#generic-error' },
      ],
    },
    async ({ page, user }) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.signIn(user.email, 'not-the-password');

      await expect(login.error).toHaveText('Wrong email or password.');
      await expect(page).toHaveURL(/#\/login$/);
    },
  );

  test(
    'sends signed-out visitors to the login page',
    { annotation: { type: 'covers', description: 'sign-in#private-pages' } },
    async ({ page }) => {
      await new ErrandsPage(page).goto();
      await expect(new LoginPage(page).submit).toBeVisible();
    },
  );

  test(
    'signing out ends the session',
    { annotation: { type: 'covers', description: 'sign-in#sign-out' } },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();
      await errands.signOut.click();

      await expect(new LoginPage(page).submit).toBeVisible();
      await errands.goto();
      await expect(new LoginPage(page).submit).toBeVisible();
    },
  );
});
