// The demo app's adapter: how the kit makes users, signs them in and seeds data.
// Swap this file out when you use the template for a different app.

import { defineAdapter, uniqueEmail, type AdapterContext } from '../../kit';

export interface User {
  email: string;
  password: string;
  name: string;
}

export interface ErrandsData {
  /** Create a user that already has these errands. */
  userWithErrands(titles: string[]): Promise<User>;
}

async function createUser(ctx: AdapterContext, errands: string[] = []): Promise<User> {
  const user = { email: uniqueEmail(ctx.testInfo), password: 'test-password', name: 'Robin' };
  const res = await ctx.request.post('/__test__/users', { data: { ...user, errands } });
  if (!res.ok()) throw new Error(`Seeding user failed: ${res.status()} ${await res.text()}`);
  return user;
}

export const adapter = defineAdapter<User, ErrandsData>({
  data: (ctx) => ({
    userWithErrands: (titles) => createUser(ctx, titles),
  }),

  createUser: (ctx) => createUser(ctx),

  async signIn(context, user) {
    // Through the API, not the form: faster, and a broken login form then only
    // fails the tests that are about logging in.
    const res = await context.request.post('/api/session', { data: { email: user.email, password: user.password } });
    if (!res.ok()) throw new Error(`Sign-in failed for ${user.email}: ${res.status()}`);
  },

  async deleteUser(user, ctx) {
    await ctx.request.delete('/__test__/users', { data: { email: user.email } });
  },
});
