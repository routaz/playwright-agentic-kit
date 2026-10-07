// A ready-made adapter for apps on Supabase Auth with supabase-js in the browser.
//
//   export const adapter = supabaseAdapter<User, NewUserOptions>({
//     // Finish a new account the way the app's own signup does (optional).
//     async setUp(account, options, { apiAs }) {
//       await apiAs(account, 'POST', '/rest/v1/rpc/complete_signup', { ... });
//       return { username };
//     },
//     // App-specific helpers, built on the generic ones (optional).
//     data: (h) => ({ async makeFriends(a, b) { ... h.apiAs(a, ...) ... } }),
//   });
//
// What you get: every test makes its own confirmed users through the Auth admin
// API and deletes them afterwards; sign-in puts a real session where supabase-js
// keeps it; and helpers to check the database below the UI (apiAs, canSignIn,
// sessionIn, refreshTokenWorks). Local Supabase only: hosted projects are refused.

import type { Page } from '@playwright/test';
import { defineAdapter, type AdapterContext, type KitAdapter } from '../types.ts';
import { uniqueEmail } from '../../unique.ts';
import { localSupabase, storageKey, type SupabaseKeys } from './keys.ts';

export { localSupabase, resolveKeys, storageKey, type SupabaseKeys } from './keys.ts';
export { sweepStaleTestUsers } from './sweep.ts';

/** The account every Supabase test user has. Apps add their own fields through `setUp`. */
export interface SupabaseAccount {
  id: string;
  email: string;
  password: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: { id: string };
}

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export interface ApiResult {
  status: number;
  /** Parsed JSON, or the raw text when the response isn't JSON. */
  body: unknown;
}

/** The generic helpers on the `data` fixture. */
export interface SupabaseHelpers<TUser extends SupabaseAccount, TOptions> {
  /** A new user, set up with `options`. Deleted after the test like `user`. */
  createUser(options?: TOptions): Promise<TUser>;
  /**
   * Call the API as `user`, skipping the UI, to check what the database itself allows
   * (RLS, RPC guards). `path` is relative to the Supabase URL, e.g. `/rest/v1/rpc/my_fn`.
   */
  apiAs(user: SupabaseAccount, method: ApiMethod, path: string, body?: unknown): Promise<ApiResult>;
  /** Whether the account still exists and accepts its password. */
  canSignIn(user: SupabaseAccount): Promise<boolean>;
  /** The session supabase-js has stored in `page`, or null when signed out. */
  sessionIn(page: Page): Promise<Session | null>;
  /**
   * Whether Supabase still accepts this refresh token, i.e. the session wasn't ended on the
   * server. Checking uses the token up (Supabase rotates them): only check after the action.
   */
  refreshTokenWorks(refreshToken: string): Promise<boolean>;
}

export interface SupabaseAdapterOptions<TUser extends SupabaseAccount, TOptions, TExtra extends object> {
  /**
   * Finish a fresh, confirmed account the way the app's signup would: profile rows, an
   * onboarding RPC. Return the fields your user type adds to the account.
   */
  setUp?: (
    account: SupabaseAccount,
    options: TOptions | undefined,
    tools: { apiAs: SupabaseHelpers<TUser, TOptions>['apiAs'] },
  ) => Promise<Omit<TUser, keyof SupabaseAccount>>;
  /** App-specific helpers for the `data` fixture, built on the generic ones. */
  data?: (helpers: SupabaseHelpers<TUser, TOptions>, ctx: AdapterContext) => TExtra;
  /** Password for every test user. Must satisfy the project's password rules. */
  password?: string;
  /** Hosts besides localhost that may be used. Only for disposable environments. */
  allowedHosts?: string[];
}

const DEFAULT_PASSWORD = 'E2e-test-passw0rd!';

export function supabaseAdapter<
  TUser extends SupabaseAccount = SupabaseAccount,
  TOptions = undefined,
  TExtra extends object = Record<never, never>,
>(
  options: SupabaseAdapterOptions<TUser, TOptions, TExtra> = {},
): KitAdapter<TUser, SupabaseHelpers<TUser, TOptions> & TExtra> {
  const password = options.password ?? DEFAULT_PASSWORD;
  const keys = (): SupabaseKeys => localSupabase(options.allowedHosts);
  /** Users made through `data.createUser`, per test, for cleanup. */
  const createdBy = new WeakMap<object, TUser[]>();

  async function request(ctx: AdapterContext, method: ApiMethod, path: string, token: string, body?: unknown) {
    const { url, anonKey, serviceRoleKey } = keys();
    const asService = token === serviceRoleKey;
    const res = await ctx.request.fetch(`${url}${path}`, {
      method,
      headers: { apikey: asService ? serviceRoleKey : anonKey, Authorization: `Bearer ${token}` },
      data: body,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON; keep the text.
    }
    return { status: res.status(), ok: res.ok(), body: parsed };
  }

  async function passwordGrant(ctx: AdapterContext, user: SupabaseAccount): Promise<Session> {
    const r = await request(ctx, 'POST', '/auth/v1/token?grant_type=password', keys().anonKey, {
      email: user.email,
      password: user.password,
    });
    if (!r.ok) throw new Error(`Signing in ${user.email} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as Session;
  }

  async function apiAs(ctx: AdapterContext, user: SupabaseAccount, method: ApiMethod, path: string, body?: unknown) {
    const session = await passwordGrant(ctx, user);
    const { status, body: parsed } = await request(ctx, method, path, session.access_token, body);
    return { status, body: parsed };
  }

  async function newUser(ctx: AdapterContext, opts?: TOptions): Promise<TUser> {
    const account: SupabaseAccount = { id: '', email: uniqueEmail(ctx.testInfo), password };
    const r = await request(ctx, 'POST', '/auth/v1/admin/users', keys().serviceRoleKey, {
      email: account.email,
      password,
      email_confirm: true,
    });
    if (!r.ok) throw new Error(`Creating test user failed: ${r.status} ${JSON.stringify(r.body)}`);
    account.id = (r.body as { id: string }).id;
    const extra = options.setUp
      ? await options.setUp(account, opts, { apiAs: (u, m, p, b) => apiAs(ctx, u, m, p, b) })
      : {};
    return { ...account, ...extra } as TUser;
  }

  /** Delete an account. One that's already gone (a test deleted it on purpose) counts as done. */
  async function deleteAccount(ctx: AdapterContext, id: string) {
    const r = await request(ctx, 'DELETE', `/auth/v1/admin/users/${id}`, keys().serviceRoleKey);
    if (!r.ok && r.status !== 404) throw new Error(`Deleting test user ${id} failed: ${r.status}`);
  }

  async function tokenWorks(ctx: AdapterContext, grant: 'password' | 'refresh_token', body: object) {
    const r = await request(ctx, 'POST', `/auth/v1/token?grant_type=${grant}`, keys().anonKey, body);
    return r.ok;
  }

  return defineAdapter<TUser, SupabaseHelpers<TUser, TOptions> & TExtra>({
    data(ctx) {
      const created: TUser[] = [];
      const helpers: SupabaseHelpers<TUser, TOptions> = {
        async createUser(opts) {
          const user = await newUser(ctx, opts);
          created.push(user);
          return user;
        },
        apiAs: (user, method, path, body) => apiAs(ctx, user, method, path, body),
        canSignIn: (user) => tokenWorks(ctx, 'password', { email: user.email, password: user.password }),
        async sessionIn(page) {
          const raw = await page.evaluate((key) => localStorage.getItem(key), storageKey(keys().url));
          return raw ? (JSON.parse(raw) as Session) : null;
        },
        refreshTokenWorks: (refreshToken) => tokenWorks(ctx, 'refresh_token', { refresh_token: refreshToken }),
      };
      const data = { ...helpers, ...(options.data?.(helpers, ctx) ?? ({} as TExtra)) };
      createdBy.set(data, created);
      return data;
    },

    async disposeData(data, ctx) {
      const errors: unknown[] = [];
      for (const u of createdBy.get(data) ?? []) await deleteAccount(ctx, u.id).catch((e: unknown) => errors.push(e));
      if (errors.length) throw new AggregateError(errors, `Cleaning up ${errors.length} test user(s) failed`);
    },

    createUser: (ctx) => newUser(ctx),

    async signIn(context, user, ctx) {
      const session = await passwordGrant(ctx, user);
      await context.setStorageState({
        cookies: [],
        origins: [
          {
            origin: new URL(ctx.baseURL).origin,
            localStorage: [{ name: storageKey(keys().url), value: JSON.stringify(session) }],
          },
        ],
      });
    },

    deleteUser: (user, ctx) => deleteAccount(ctx, user.id),
  });
}
