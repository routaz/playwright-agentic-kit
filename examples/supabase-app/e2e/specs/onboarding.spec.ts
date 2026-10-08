import { randomBytes } from 'node:crypto';
import { test, expect } from '../support/test';
import { NotesApp } from '../pages/NotesApp';

const freshUsername = () => `e2e_${randomBytes(5).toString('hex')}`;

test.describe('onboarding', () => {
  test(
    'an account without a username sees only the onboarding form',
    { annotation: { type: 'covers', description: 'onboarding#gate' } },
    async ({ page, data, signIn }) => {
      await signIn(await data.createUser({ onboarded: false }));
      const app = new NotesApp(page);
      await app.goto();

      await expect(app.onboardingHeading).toBeVisible();
      await expect(app.notesHeading).toBeHidden();
      await expect(app.newNote).toBeHidden();
    },
  );

  test(
    'choosing a username opens the notes',
    { annotation: { type: 'covers', description: 'onboarding#choose-username' } },
    async ({ page, data, signIn }) => {
      await signIn(await data.createUser({ onboarded: false }));
      const app = new NotesApp(page);
      await app.goto();
      const username = freshUsername();
      await app.chooseUsername(username);

      await expect(app.signedInAs).toHaveText(`Signed in as @${username}`);
      await page.reload();
      await expect(app.notesHeading).toBeVisible();
    },
  );

  test(
    'stores a username typed with capitals in lowercase',
    { annotation: { type: 'covers', description: 'onboarding#edge:username-case' } },
    async ({ page, data, signIn }) => {
      await signIn(await data.createUser({ onboarded: false }));
      const app = new NotesApp(page);
      await app.goto();
      const username = freshUsername();
      await app.chooseUsername(username.toUpperCase());

      await expect(app.signedInAs).toHaveText(`Signed in as @${username}`);
    },
  );

  test(
    'refuses a username in the wrong shape',
    { annotation: { type: 'covers', description: 'onboarding#username-shape' } },
    async ({ page, data, signIn }) => {
      const member = await data.createUser({ onboarded: false });
      await signIn(member);
      const app = new NotesApp(page);
      await app.goto();
      await app.chooseUsername('no spaces!');

      await expect(app.alert).toHaveText('Usernames are 3 to 20 characters: a-z, 0-9 and underscore');
      // The database is the real guard: the same name through the API is refused too.
      const r = await data.apiAs(member, 'POST', '/rest/v1/rpc/complete_profile', { chosen_username: 'ab' });
      expect(r.status).toBe(400);
    },
  );

  test(
    'refuses a username someone else has',
    { annotation: { type: 'covers', description: 'onboarding#unique-username' } },
    async ({ page, user, data, signIn }) => {
      await signIn(await data.createUser({ onboarded: false }));
      const app = new NotesApp(page);
      await app.goto();
      await app.chooseUsername(user.username);

      await expect(app.alert).toHaveText('That username is taken');
      await expect(app.onboardingHeading).toBeVisible();
    },
  );
});
