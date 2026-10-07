import { test as base, type Page } from '@playwright/test';
import type { AdapterContext, KitAdapter } from './adapters/types';

export interface KitFixtures<TUser, TData> {
  /** App-specific seeding helpers from the adapter. */
  data: TData;
  /** A fresh user created for this test only. Not signed in until you use `signedInPage` or `as`. */
  user: TUser;
  /** A page whose browser context is already signed in as `user`. */
  signedInPage: Page;
  /**
   * Open a page signed in as any user, each in its own browser context.
   * Use it for flows between accounts, like messaging or sharing.
   */
  as: (user: TUser) => Promise<Page>;
  /** Make another fresh user, cleaned up after the test like `user`. */
  newUser: () => Promise<TUser>;
}

interface Internal<TUser> {
  adapterCtx: AdapterContext;
  createdUsers: TUser[];
}

/** Build the project's `test` object from its adapter. Specs import `test` and `expect` from there. */
export function createKitTest<TUser, TData>(adapter: KitAdapter<TUser, TData>) {
  return base.extend<KitFixtures<TUser, TData> & Internal<TUser>>({
    adapterCtx: async ({ request, baseURL }, use, testInfo) => {
      if (!baseURL) throw new Error('baseURL is not set. Configure it with defineKitConfig().');
      await use({ request, baseURL, testInfo });
    },

    data: async ({ adapterCtx }, use) => {
      await use(await adapter.data(adapterCtx));
    },

    createdUsers: async ({ adapterCtx }, use) => {
      const created: TUser[] = [];
      await use(created);
      if (adapter.deleteUser) {
        for (const u of created) await adapter.deleteUser(u, adapterCtx);
      }
    },

    newUser: async ({ adapterCtx, data, createdUsers }, use) => {
      await use(async () => {
        const u = await adapter.createUser(adapterCtx, data);
        createdUsers.push(u);
        return u;
      });
    },

    user: async ({ newUser }, use) => {
      await use(await newUser());
    },

    as: async (
      { browser, adapterCtx, baseURL, locale, timezoneId, serviceWorkers, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch },
      use,
    ) => {
      const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
      // Same options the built-in `page` gets, so every user sees the same device and locale.
      const options = { baseURL, locale, timezoneId, serviceWorkers, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch };
      await use(async (u) => {
        const context = await browser.newContext(options);
        contexts.push(context);
        await adapter.signIn(context, u, adapterCtx);
        return context.newPage();
      });
      for (const c of contexts) await c.close();
    },

    signedInPage: async ({ page, user, adapterCtx }, use) => {
      await adapter.signIn(page.context(), user, adapterCtx);
      await use(page);
    },
  });
}

export { expect } from '@playwright/test';
