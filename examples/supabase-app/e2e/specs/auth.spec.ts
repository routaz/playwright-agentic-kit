import { test, expect } from '../support/test';
import { NotesApp } from '../pages/NotesApp';

test.describe('auth', () => {
  test(
    'signs in and shows the notes',
    { annotation: { type: 'covers', description: 'auth#sign-in' } },
    async ({ page, user }) => {
      const app = new NotesApp(page);
      await app.goto();
      await app.signIn(user.email, user.password);

      await expect(app.notesHeading).toBeVisible();
      await expect(app.signedInAs).toHaveText(`Signed in as @${user.username}`);
    },
  );

  test(
    'gives an unknown email the same message as a wrong password',
    { annotation: { type: 'covers', description: 'auth#generic-error' } },
    async ({ page, user }) => {
      const app = new NotesApp(page);
      await app.goto();
      await app.signIn(user.email, 'Not-the-passw0rd!');
      await expect(app.alert).toHaveText('Wrong email or password.');

      await app.goto();
      await app.signIn(`nobody-${Date.now()}@example.test`, 'Not-the-passw0rd!');
      await expect(app.alert).toHaveText('Wrong email or password.');
    },
  );

  test(
    'signing out ends the session on the server',
    {
      annotation: [
        { type: 'covers', description: 'auth#sign-out' },
        { type: 'covers', description: 'auth#sign-out-ends-session' },
      ],
    },
    async ({ signedInPage: page, data }) => {
      const app = new NotesApp(page);
      await app.goto();
      await expect(app.notesHeading).toBeVisible();
      // Read the token now; checking it would use it up, so only check after signing out.
      const { refresh_token } = (await data.sessionIn(page))!;

      await app.signOut.click();
      await expect(app.signInHeading).toBeVisible();
      expect(await data.refreshTokenWorks(refresh_token)).toBe(false);

      await page.reload();
      await expect(app.signInHeading).toBeVisible();
    },
  );
});
