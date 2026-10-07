import { uniqueEmail } from '../../kit';
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

  test(
    'gives the same generic error for an unknown email',
    { annotation: { type: 'covers', description: 'sign-in#generic-error' } },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.signIn(uniqueEmail(test.info()), 'any-password');

      await expect(login.error).toHaveText('Wrong email or password.');
      await expect(page).toHaveURL(/#\/login$/);
    },
  );

  test(
    'server rejects the old session cookie after signing out',
    { annotation: { type: 'covers', description: 'sign-in#server-sign-out' } },
    async ({ signedInPage: page }) => {
      const errands = new ErrandsPage(page);
      await errands.goto();
      await expect(errands.heading).toBeVisible();
      const savedCookies = await page.context().cookies();
      expect(savedCookies.length).toBeGreaterThan(0);
      expect((await page.request.get('/api/me')).status()).toBe(200);

      // Wait for the server to answer the sign-out, not just for the UI to switch,
      // so the replay below can't race an unfinished request.
      const signedOut = page.waitForResponse(
        (r) => r.url().endsWith('/api/session') && r.request().method() === 'DELETE',
      );
      await errands.signOut.click();
      expect((await signedOut).ok()).toBe(true);
      await expect(new LoginPage(page).submit).toBeVisible();

      await page.context().addCookies(savedCookies);
      const response = await page.request.get('/api/me');
      expect(response.status()).toBe(401);
    },
  );

  test(
    'signs in when the email is typed in different capitalisation',
    { annotation: { type: 'covers', description: 'sign-in#edge:email-case' } },
    async ({ page, user }) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.signIn(user.email.toUpperCase(), user.password);

      await expect(new ErrandsPage(page).heading).toBeVisible();
      await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible();
    },
  );

  test(
    'blocks submission when fields are empty',
    { annotation: { type: 'covers', description: 'sign-in#edge:empty-fields' } },
    async ({ page }) => {
      const sessionRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/api/session')) sessionRequests.push(request.method());
      });

      const login = new LoginPage(page);
      await login.goto();
      await login.submit.click();

      await expect(login.email).toBeFocused();
      expect(sessionRequests).toEqual([]);
      await expect(login.error).toBeHidden();
      await expect(page).toHaveURL(/#\/login$/);
    },
  );
});
