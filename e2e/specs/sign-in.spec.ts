import { test, expect } from '../support/test';
import { LoginPage } from '../pages/LoginPage';
import { ErrandsPage } from '../pages/ErrandsPage';

test.describe('sign-in', () => {
  test('signs in with valid credentials and lands on the errand list', async ({ page, user }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(user.email, user.password);

    const errands = new ErrandsPage(page);
    await expect(errands.heading).toBeVisible();
    await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible();
  });

  test('rejects a wrong password without revealing which field was wrong', async ({ page, user }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(user.email, 'not-the-password');

    await expect(login.error).toHaveText('Wrong email or password.');
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('sends signed-out visitors to the login page', async ({ page }) => {
    await new ErrandsPage(page).goto();
    await expect(new LoginPage(page).submit).toBeVisible();
  });

  test('signing out ends the session', async ({ signedInPage: page }) => {
    const errands = new ErrandsPage(page);
    await errands.goto();
    await errands.signOut.click();

    await expect(new LoginPage(page).submit).toBeVisible();
    await errands.goto();
    await expect(new LoginPage(page).submit).toBeVisible();
  });
});
