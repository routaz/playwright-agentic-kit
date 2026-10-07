import type { APIRequestContext, BrowserContext, TestInfo } from '@playwright/test';

/** What every adapter method is handed. */
export interface AdapterContext {
  /** Request context bound to `baseURL`, independent of any browser page. */
  request: APIRequestContext;
  baseURL: string;
  testInfo: TestInfo;
}

/**
 * The contract between the kit and the app under test. This is the only code a
 * new project has to write before tests run: how to make a user, how to sign one
 * in, and whatever app-specific seeding helpers its tests need.
 *
 * Each test gets fresh users from `createUser`, so tests stay independent and
 * can run in parallel against one shared backend.
 */
export interface KitAdapter<TUser, TData> {
  /** App-specific seeding helpers, exposed to tests as the `data` fixture. */
  data(ctx: AdapterContext): TData | Promise<TData>;
  /** Create a brand-new user that no other test can see. */
  createUser(ctx: AdapterContext, data: TData): Promise<TUser>;
  /** Make `context` signed in as `user`. Prefer an API call over clicking through the login form. */
  signIn(context: BrowserContext, user: TUser, ctx: AdapterContext): Promise<void>;
  /** Remove what `createUser` made. Runs after each test, pass or fail. */
  deleteUser?(user: TUser, ctx: AdapterContext): Promise<void>;
}

export function defineAdapter<TUser, TData>(adapter: KitAdapter<TUser, TData>): KitAdapter<TUser, TData> {
  return adapter;
}
