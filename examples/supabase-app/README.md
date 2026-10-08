# Supabase example

A small notes app on a real local Supabase stack, tested with the kit's [Supabase adapter](../../kit/adapters/supabase/index.ts). It exists to prove the adapter in public: CI starts this stack and runs everything below on every push.

**The app:** sign up or sign in, choose a username once (`complete_profile()`, a `SECURITY DEFINER` function), then keep notes that only you can read. The rules that matter live in the database ([`supabase/migrations`](supabase/migrations)): row-level security on notes, a unique and lowercase username, no blank notes.

**The tests** ([`e2e/`](e2e)) follow the same layout as the template: context files, an adapter of about 40 lines built on `supabaseAdapter()`, page object, specs and deliberate breaks. Every privacy rule is checked in the page _and_ through the API with `data.apiAs`, with a control call as the owner. The sign-out test proves the session ended on the server.

## Run it

```bash
npm run example:supabase    # starts this example's own Supabase (ports 553xx, next to any 543xx stack)
npm run example:test        # 13 tests, desktop and mobile
npm run example:coverage    # context coverage
npm run example:mutate      # 7 breaks of the app and its database
```

Docker is needed for Supabase. Stop the stack with `cd examples/supabase-app && npx supabase stop`.

## What the breaks found

One break survived at first: loosening the delete policy didn't let another person delete a note. In Postgres a `DELETE ... WHERE` must also pass the table's read policy, because the `WHERE` clause reads the row, so the rule was enforced twice. The break now loosens both, and the test catches it. When a break survives, check whether the rule has a second layer before blaming the test.
