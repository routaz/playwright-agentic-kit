// Deliberate breaks of the example app. `npm run example:mutate` applies each, runs
// the tests covering it, and expects at least one to fail. Database breaks change the
// example's local Supabase and restore each object from its real definition.

import { defineMutations } from '../../../kit/observe/mutations.ts';
import { db, dbDropConstraint, dbFunction, dbOpenPolicy, dbSql } from '../../../kit/adapters/supabase/db.ts';

const APP = 'public/app.js';

export default defineMutations([
  {
    id: 'notes-readable-by-all',
    covers: 'notes#private-notes',
    description: 'a row-level security policy lets every member read every note',
    ...dbOpenPolicy('notes'),
  },
  {
    id: 'anyone-deletes-notes',
    covers: 'notes#delete-own-only',
    description:
      "anyone can delete anyone's notes (the delete policy, and the read policy a DELETE ... WHERE also needs, both loosened)",
    ...db(
      dbOpenPolicy('notes'),
      dbSql(
        'drop policy "delete own notes" on public.notes; create policy "delete own notes" on public.notes for delete to authenticated using (true);',
        'drop policy "delete own notes" on public.notes; create policy "delete own notes" on public.notes for delete to authenticated using (owner = (select auth.uid()));',
      ),
    ),
  },
  {
    id: 'blank-notes-saved',
    covers: 'notes#no-blank-notes',
    description: 'blank notes are saved (the page and the table both stop checking)',
    edits: [{ file: APP, find: "if (!body) return renderNotes(profile, 'Write something first.');", replace: '' }],
    ...dbDropConstraint(
      'notes',
      'notes_body_not_blank',
      'delete from public.notes where char_length(btrim(body)) not between 1 and 500',
    ),
  },
  {
    id: 'usernames-keep-capitals',
    covers: 'onboarding#edge:username-case',
    description: 'complete_profile() stops lowercasing usernames',
    ...dbFunction(
      'complete_profile',
      "lower(btrim(coalesce(chosen_username, '')))",
      "btrim(coalesce(chosen_username, ''))",
    ),
  },
  {
    id: 'duplicate-usernames',
    covers: 'onboarding#unique-username',
    description: 'two people can have the same username',
    ...db(
      dbDropConstraint(
        'profiles',
        'profiles_username_key',
        'delete from public.profiles p using public.profiles q where p.username = q.username and p.created_at > q.created_at',
      ),
    ),
  },
  {
    id: 'onboarding-skipped',
    covers: 'onboarding#gate',
    description: 'an account without a username goes straight to the notes',
    edits: [
      {
        file: APP,
        find: 'if (!profile) return renderOnboarding();',
        replace: "if (!profile) return renderNotes({ username: '' });",
      },
    ],
  },
  {
    id: 'sign-out-browser-only',
    covers: 'auth#sign-out-ends-session',
    description: 'sign-out forgets the session in the browser but never tells the server',
    edits: [
      {
        file: APP,
        find: '  await db.auth.signOut();\n  route();',
        replace:
          "  for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k);\n  location.reload();",
      },
    ],
  },
]);
