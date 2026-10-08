import type { Locator, Page } from '@playwright/test';

/** The whole example app: sign-in, onboarding and the notes list. */
export class NotesApp {
  // Sign-in
  readonly signInHeading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly alert: Locator;
  // Onboarding
  readonly onboardingHeading: Locator;
  readonly username: Locator;
  readonly continueButton: Locator;
  // Notes
  readonly notesHeading: Locator;
  readonly signedInAs: Locator;
  readonly newNote: Locator;
  readonly add: Locator;
  readonly list: Locator;
  readonly empty: Locator;
  readonly signOut: Locator;

  constructor(readonly page: Page) {
    this.signInHeading = page.getByRole('heading', { name: 'Sign in' });
    this.email = page.getByLabel('Email', { exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.alert = page.getByRole('alert');
    this.onboardingHeading = page.getByRole('heading', { name: 'Choose a username' });
    this.username = page.getByLabel('Username', { exact: true });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.notesHeading = page.getByRole('heading', { name: 'Your notes' });
    this.signedInAs = page.getByText(/^Signed in as @/);
    this.newNote = page.getByLabel('New note');
    this.add = page.getByRole('button', { name: 'Add', exact: true });
    this.list = page.getByRole('list', { name: 'Notes' });
    this.empty = page.getByText('No notes yet.');
    this.signOut = page.getByRole('button', { name: 'Sign out' });
  }

  async goto() {
    await this.page.goto('/');
  }

  async signIn(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signInButton.click();
  }

  async chooseUsername(username: string) {
    await this.username.fill(username);
    await this.continueButton.click();
  }

  note(body: string): Locator {
    return this.list.getByRole('listitem').filter({ hasText: body });
  }

  async addNote(body: string) {
    await this.newNote.fill(body);
    await this.add.click();
  }

  async deleteNote(body: string) {
    await this.page.getByRole('button', { name: `Delete ${body}` }).click();
  }
}
