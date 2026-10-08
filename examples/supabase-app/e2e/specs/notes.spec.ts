import { test, expect } from '../support/test';
import { NotesApp } from '../pages/NotesApp';

test.describe('notes', () => {
  test(
    'adds a note that is still there after a reload',
    { annotation: { type: 'covers', description: 'notes#add-note' } },
    async ({ signedInPage: page }) => {
      const app = new NotesApp(page);
      await app.goto();
      await expect(app.empty).toBeVisible();

      await app.addNote('Water the plants');
      await expect(app.note('Water the plants')).toBeVisible();
      await page.reload();
      await expect(app.note('Water the plants')).toBeVisible();
    },
  );

  test(
    'deletes a note for good',
    { annotation: { type: 'covers', description: 'notes#delete-note' } },
    async ({ signedInPage: page, user, data }) => {
      await data.addNotes(user, 'Delete me', 'Keep me');
      const app = new NotesApp(page);
      await app.goto();

      await app.deleteNote('Delete me');
      await expect(app.note('Delete me')).toBeHidden();
      await page.reload();
      await expect(app.note('Keep me')).toBeVisible();
      await expect(app.note('Delete me')).toBeHidden();
    },
  );

  test(
    'never saves a blank note',
    { annotation: { type: 'covers', description: 'notes#no-blank-notes' } },
    async ({ signedInPage: page, user, data }) => {
      const app = new NotesApp(page);
      await app.goto();
      await app.addNote('   ');
      await expect(app.alert).toBeVisible();

      // The database refuses it too, whatever the page does.
      const r = await data.apiAs(user, 'POST', '/rest/v1/notes', { body: '   ' });
      expect(r.status).toBe(400);
      await page.reload();
      await expect(app.empty).toBeVisible();
    },
  );

  test(
    "one person's notes are invisible to another, in the page and the API",
    { annotation: { type: 'covers', description: 'notes#private-notes' } },
    async ({ user, newUser, data, as }) => {
      await data.addNotes(user, 'My secret');
      const other = await newUser();

      const otherApp = new NotesApp(await as(other));
      await otherApp.goto();
      await expect(otherApp.empty).toBeVisible();

      const asOther = await data.apiAs(other, 'GET', '/rest/v1/notes?select=body');
      expect(asOther.body).toEqual([]);
      // Control: the same query as the owner finds it, so the empty list above is the policy at work.
      const asOwner = await data.apiAs(user, 'GET', '/rest/v1/notes?select=body');
      expect(asOwner.body).toEqual([{ body: 'My secret' }]);
    },
  );

  test(
    "nobody can delete someone else's note",
    { annotation: { type: 'covers', description: 'notes#delete-own-only' } },
    async ({ user, newUser, data }) => {
      await data.addNotes(user, 'Mine');
      const [{ id }] = (await data.apiAs(user, 'GET', '/rest/v1/notes?select=id')).body as { id: string }[];
      const other = await newUser();

      await data.apiAs(other, 'DELETE', `/rest/v1/notes?id=eq.${id}`);
      const still = await data.apiAs(user, 'GET', '/rest/v1/notes?select=body');
      expect(still.body).toEqual([{ body: 'Mine' }]);
    },
  );
});
