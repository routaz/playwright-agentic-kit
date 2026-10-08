// The example's adapter: everything generic comes from the kit's Supabase adapter.
// What's this app's own: finishing an account through complete_profile(), the way
// the onboarding form does, and a helper to add notes without clicking.

import { randomBytes } from 'node:crypto';
import {
  supabaseAdapter,
  type SupabaseAccount,
  type SupabaseHelpers,
} from '../../../../kit/adapters/supabase/index.ts';

export interface User extends SupabaseAccount {
  username: string;
}

export interface NewUserOptions {
  /** Create the account but skip complete_profile(), so it lands on onboarding. */
  onboarded?: boolean;
}

export interface NotesHelpers {
  /** Add notes as `user`, through the API. */
  addNotes(user: User, ...bodies: string[]): Promise<void>;
}

export type NotesData = SupabaseHelpers<User, NewUserOptions> & NotesHelpers;

export const adapter = supabaseAdapter<User, NewUserOptions, NotesHelpers>({
  async setUp(account, options = {}, { apiAs }) {
    const username = `e2e_${randomBytes(6).toString('hex')}`;
    if (options.onboarded !== false) {
      const r = await apiAs(account, 'POST', '/rest/v1/rpc/complete_profile', { chosen_username: username });
      if (r.status >= 300) throw new Error(`complete_profile failed: ${r.status} ${JSON.stringify(r.body)}`);
    }
    return { username };
  },

  data: ({ apiAs }) => ({
    async addNotes(user, ...bodies) {
      for (const body of bodies) {
        const r = await apiAs(user, 'POST', '/rest/v1/notes', { body });
        if (r.status >= 300) throw new Error(`Adding a note failed: ${r.status} ${JSON.stringify(r.body)}`);
      }
    },
  }),
});
