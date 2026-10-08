import type { Locator, Page } from '@playwright/test';

export class ErrandsPage {
  readonly heading: Locator;
  readonly newErrand: Locator;
  readonly add: Locator;
  readonly list: Locator;
  readonly remaining: Locator;
  readonly empty: Locator;
  readonly signOut: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Your errands' });
    this.newErrand = page.getByLabel('New errand');
    this.add = page.getByRole('button', { name: 'Add' });
    this.list = page.getByRole('list', { name: 'Errands' });
    this.remaining = page.getByRole('status');
    this.empty = page.getByText('Nothing to do');
    this.signOut = page.getByRole('button', { name: 'Sign out' });
  }

  async goto() {
    await this.page.goto('/#/errands');
  }

  item(title: string): Locator {
    return this.list.getByRole('listitem').filter({ hasText: title });
  }

  checkbox(title: string): Locator {
    return this.page.getByRole('checkbox', { name: title });
  }

  /** Elements of the given tag rendered inside the list; used to prove titles are not parsed as HTML. */
  renderedElements(tag: string): Locator {
    return this.list.locator(tag);
  }

  deleteButton(title: string): Locator {
    return this.page.getByRole('button', { name: `Delete ${title}` });
  }

  async addErrand(title: string) {
    await this.newErrand.fill(title);
    await this.add.click();
  }

  async remove(title: string) {
    await this.deleteButton(title).click();
  }
}
