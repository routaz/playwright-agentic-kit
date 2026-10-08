# playwright-agentic-kit

A Playwright end-to-end testing template designed so that **AI agents plan, write and repair the tests while a human reviews every change**.

Most "AI testing" demos either generate a pile of throwaway scripts or quietly self-heal tests at runtime, which hides real bugs. This kit takes a different stance:

- **Agents work at authoring time, CI stays deterministic.** Agents propose tests and fixes as ordinary code in a pull request. CI runs plain Playwright tests, with no model calls and no surprises.
- **Agents are only as good as their context.** Each project describes its app and features in small, schema-validated YAML files: rules, journeys, risks, known issues. Agents read those instead of guessing from the DOM.
- **The project-specific surface is tiny.** To point the kit at a new app you write one adapter (create a user, sign them in, seed data) and the context files. Everything else is reusable.

> **Status:** All five phases done: a deterministic foundation, agents that plan, write and heal tests, a guard against dishonest healing, proof that every test can fail, and a ready-made Supabase adapter. It runs against the bundled demo app here, and against a real Supabase app with 77 tests.

**New here?** [The guide to the code (PDF)](docs/guide/playwright-agentic-kit-guide.pdf) walks through every part: entry points, the core fixtures, context files, the agents, the healing guard, coverage and mutation testing, and the Supabase adapter. Rebuild it with `npm run guide`; its code excerpts are read from the source, so it fails to build if it goes stale.

## How it fits together

```mermaid
flowchart LR
  subgraph Project["Your project (e2e/)"]
    CTX["context/*.yaml<br/>app + feature context"]
    AD["support/adapter.ts<br/>users · sign-in · seeding"]
    SPECS["specs/*.spec.ts<br/>pages/*.ts"]
  end
  subgraph Kit["Kit (kit/)"]
    CFG["defineKitConfig()"]
    FX["createKitTest()<br/>user · as() · data fixtures"]
    SCH["context schemas<br/>+ validator"]
  end
  subgraph Agents["Agents (.claude/agents)"]
    PL["planner"] --> GEN["generator"]
    HEAL["healer"]
  end
  CTX --> SCH
  CTX --> PL
  AD --> FX
  FX --> SPECS
  GEN -- "PR with new specs" --> SPECS
  HEAL -- "PR with proposed fix" --> SPECS
  SPECS --> CI["CI: plain Playwright run"]
  CI -- "results.json on failure" --> HEAL
```

## Quick start

```bash
npm install
npx playwright install chromium
npm test            # desktop + mobile, a few seconds
npm run test:ui     # Playwright's UI mode
npm run demo        # the demo app on http://localhost:4173 (demo@example.com / demo-password)
```

Node 22.18 or newer.

## What's in the box

| Path                       | Owner   | What it does                                                                                                                                                                                |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit/config.ts`            | kit     | `defineKitConfig()`: pinned locale and timezone, service workers blocked, traces on failure, a JSON report for agents, optional mobile project, `E2E_BASE_URL` to retarget a run at staging |
| `kit/fixtures.ts`          | kit     | `createKitTest(adapter)`: fresh `user` per test, `signedInPage`, `as(user)` for multi-account flows, `newUser()`, app `data` helpers, automatic cleanup                                     |
| `kit/adapters/supabase/`   | kit     | Ready-made adapter for Supabase apps, plus database breaks for the mutation runner                                                                                                          |
| `kit/adapters/types.ts`    | kit     | The adapter contract, the only code a new project must write                                                                                                                                |
| `kit/context/`             | kit     | JSON schemas for app and feature context, plus `npm run context:check`                                                                                                                      |
| `e2e/support/adapter.ts`   | project | Demo app adapter, seeding through test-only endpoints                                                                                                                                       |
| `e2e/context/`             | project | `app.yaml` (conventions every test follows) and `*.feature.yaml` (rules, journeys, edge cases)                                                                                              |
| `e2e/pages/`, `e2e/specs/` | project | Page objects and specs                                                                                                                                                                      |
| `e2e/seeds/`               | project | Starting states for the agents, which double as smoke tests                                                                                                                                 |
| `e2e/plans/`               | project | Test plans written by the planner and reviewed by a human                                                                                                                                   |
| `.claude/agents/`          | kit     | The planner, generator and healer agents                                                                                                                                                    |
| `examples/demo-app/`       | demo    | A small dependency-free errands app with sign-in, so the template runs on its own                                                                                                           |
| `kit/heal/`                | kit     | Guard, snapshots, report format, `npm run heal` and the CI publisher                                                                                                                        |
| `kit/observe/`             | kit     | Context coverage report and the mutation runner                                                                                                                                             |
| `e2e/mutations.ts`         | project | Deliberate breaks of the app, each tied to the context id it violates                                                                                                                       |
| `scripts/check-leaks.mjs`  | kit     | Fails CI if any private term (client names, say) appears in files or commit history                                                                                                         |

## The agents

Three Claude Code subagents in `.claude/agents/`, driving a real browser through the Playwright MCP server in `.mcp.json`. They started from Playwright's own `init-agents` templates and were rewritten around the context files and one principle: **an agent may fix a test that is wrong, never a test that is right about a broken app.**

| Agent           | Reads                                                        | Produces                                                                             | Key constraint                                                                                                                                |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e-planner`   | feature context, existing `covers` annotations, the live app | `e2e/plans/<feature>.plan.md` with a coverage table, new scenarios and findings      | Plans only the gaps. When the app contradicts a context rule, it records a finding instead of planning a test around the bug.                 |
| `e2e-generator` | a plan someone has reviewed                                  | tests in `e2e/specs/`, using kit fixtures and page objects, each run until it passes | Never edits an expectation to match the app. If the app disagrees with the plan, the scenario is reported as blocked.                         |
| `e2e-healer`    | failing tests, `test-results/results.json`                   | locator, timing, test-bug and data fixes, plus a heal report                         | Classifies every failure first. `app-bug` and `context-drift` are reported, never "healed". No skips, no weaker assertions, no context edits. |

Agents start from **seeds** (`e2e/seeds/`), small tests that put the browser in a known state (signed out, signed in with an empty list, signed in with data). The seeds also run as smoke tests, so a broken seed fails CI instead of confusing an agent. Agents can't see fixture values, so a seed that creates an account hands its credentials over with `exposeToAgents()`, and the agents read them from `window.__e2e`. That way they can try the successful paths too, not only the failures.

Every test carries a `covers` annotation (`errands#private-lists`, `errands#edge:long-title`) pointing at an id in the context file, so coverage can be traced from rule to test and back.

Try it: open this folder in Claude Code, approve the `playwright-test` MCP server, and ask _"Use the e2e-planner agent to plan sign-in."_ [`CLAUDE.md`](CLAUDE.md) describes the full loop.

## Healing

When tests go red, the healer repairs what's wrong with the tests and reports what's wrong with the app. **Its rules are enforced by code, not just written in its prompt.** It runs in two places with the same guard.

```
red tests ─► e2e-healer ─► guard ─► re-run ─► repairs for review + issues for app bugs
                             │
                   rejects?  the healer's changes are undone, nothing is published
```

### On your machine: `npm run heal`

Uses **your own Claude Code login**, so no shared token or API key is needed and each developer pays from their own plan.

```bash
cp heal.local.example.json heal.local.json   # optional, git-ignored
npm run heal
```

1. Runs the suite. If everything passes, it stops.
2. Snapshots the working tree, so your own uncommitted work is never mistaken for the healer's.
3. Runs Claude Code headlessly as the `e2e-healer` agent, with a turn limit.
4. Guards exactly what the healer changed. On a violation it **undoes the healer's changes** and stops; your work is untouched.
5. Runs the suite again and prints what was repaired and what was reported.
6. Leaves the repairs uncommitted for review, or commits them, depending on your settings.

| `heal.local.json` | Default       | Meaning                                                               |
| ----------------- | ------------- | --------------------------------------------------------------------- |
| `claudePath`      | `claude`      | Path to the Claude Code CLI (or set `HEAL_CLAUDE_PATH`)               |
| `model`           | agent default | e.g. `haiku` to stretch a small plan further                          |
| `maxTurns`        | `40`          | Hard stop for the agent, to cap usage                                 |
| `afterHeal`       | `leave`       | `leave` the repairs uncommitted, or `commit` them as their own commit |
| `reportIssues`    | `false`       | Open GitHub issues for app bugs with your own `gh` login              |

### In CI: opt-in

[`.github/workflows/heal.yml`](.github/workflows/heal.yml) does the same when CI fails, and publishes repairs as a `heal/<run>` pull request against the failing branch, plus deduplicated issues for app bugs and stale context. It is **off by default**. Switch it on with a `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` secret and a `HEAL_IN_CI=true` repository variable. A failure that doesn't reproduce is reported as flaky, not healed.

### The guard

[`kit/heal/guard.ts`](kit/heal/guard.ts) rejects the run if the healer:

- touched anything outside `e2e/specs`, `e2e/pages` or `e2e/support` (context files, the app, workflows);
- added `test.skip`, `.fixme`, `.only`, `waitForTimeout`, `networkidle`, a `catch`, or a commented-out assertion;
- left fewer assertions than before, or swapped a check for a weaker one (`toHaveText` → `toBeVisible` or `toContainText`);
- loosened exact text to a pattern.

A changed expected value isn't rejected, because fixing a wrong test can need one, but it's flagged for careful review. Every rule has [unit tests](kit/heal/guard.test.ts). Rehearsed against the demo app with a stand-in healer: an honest locator repair went through. A dishonest one tried to edit the context file, skip a test, weaken a check and loosen exact text to a pattern; it was rejected and undone, leaving the developer's own uncommitted change intact.

## Proving the tests: coverage and mutations

AI-written tests are only worth something if they test the right things and can actually fail. Two reports check both, locally and in CI.

**Context coverage** (`npm run coverage`) maps every rule, journey and edge case in `e2e/context/` to the tests whose `covers` annotation names it. It reads Playwright's list mode, so nothing has to run. With `--strict` (as in CI) it fails on a `covers` id that matches nothing, usually a typo or a renamed id, and on any rule or critical journey with no test.

**The mutation check** (`npm run mutate`) breaks the app on purpose. Each break in [`e2e/mutations.ts`](e2e/mutations.ts) names the context id it violates:

```ts
{
  id: 'sign-out-keeps-session',
  covers: 'sign-in#server-sign-out',
  description: 'sign-out clears the cookie but the server session lives on',
  edits: [{ file: 'examples/demo-app/server.mjs', find: 'if (sid) sessions.delete(sid);', replace: '' }],
}
```

The runner applies it, runs **only the tests covering that id**, and expects at least one to fail. A break the tests don't notice means the tests are too weak. Breaks outside files, like a database function, use `apply()` and `undo()` instead of `edits`.

- **The tests must pass first.** A baseline run of every involved test has to be green, or nothing counts.
- **Always restored.** Original files are journaled before each edit and put back afterwards, on Ctrl-C, and at the start of the next run if one was killed. Each run starts a fresh app server, on its own port (see `playwright.config.ts`), so neither a leftover server holding old code nor an agent session's server can produce a false result; a run that couldn't start is reported as an error, never as "survived".
- **A break that no longer applies** (its text changed or appears twice) is reported as stale instead of silently skipped.

Its first run found a weak test, one written by hand: "a blank title adds nothing" passed even when the server saved blank titles, because it checked an empty list that was already empty before the server answered. The generator's instructions now cover that case.

## Supabase apps

For apps on Supabase Auth with supabase-js in the browser, [`kit/adapters/supabase`](kit/adapters/supabase/index.ts) is a ready-made adapter. A project only writes what's its own:

```ts
import { supabaseAdapter, type SupabaseAccount } from '../kit/adapters/supabase/index.ts';

interface User extends SupabaseAccount {
  username: string;
}

export const adapter = supabaseAdapter<User, { onboarded?: boolean }, { makeFriends(a: User, b: User): Promise<void> }>(
  {
    // Finish a new account the way the app's own signup does.
    async setUp(account, options = {}, { apiAs }) {
      const username = `e2e_${Math.random().toString(36).slice(2, 10)}`;
      if (options.onboarded !== false) {
        await apiAs(account, 'POST', '/rest/v1/rpc/complete_signup', { chosen_username: username });
      }
      return { username };
    },
    // App-specific helpers, built on the generic ones.
    data: ({ apiAs }) => ({
      async makeFriends(a, b) {
        /* the app's own friend-request RPCs, through apiAs */
      },
    }),
  },
);
```

What the kit handles:

- **Local only.** Keys come from `E2E_SUPABASE_*` variables or `supabase status`, and any host but localhost is refused, because tests create and delete accounts.
- **Real users per test.** They're confirmed through the Auth admin API, set up through your `setUp`, and deleted afterwards, including any made through `data.createUser(options)`. A user a test deleted on purpose counts as cleaned up.
- **Real sessions.** Sign-in puts a password-grant session where supabase-js keeps it, set once so sign-out tests stay honest.
- **Checks below the UI.** `apiAs(user, method, path, body)` calls the API as a user, so you can check what RLS and RPC guards allow; `canSignIn(user)` tells you whether an account still exists; `sessionIn(page)` and `refreshTokenWorks(token)` let a test prove a sign-out really ended the session on the server.
- **Clean-up after agents.** `sweepStaleTestUsers()` is a global setup that removes test users left behind by runs that never finished, such as an agent session that ended inside a seed.
- **Database breaks for the mutation runner.** `kit/adapters/supabase/db.ts` has `dbFunction`, `dbDropIndex`, `dbDropConstraint` and `dbOpenPolicy`, plus `db()` to combine them. Each reads the object's real definition from the local stack and restores exactly that.

It was extracted from a real project, where it backs 77 tests and 29 breaks, 13 of them in the database. That project's own adapter shrank from 265 lines to 71.

## Design decisions

**Every test makes its own users.** No shared seed accounts, no global reset between tests. That keeps tests independent, lets them run fully in parallel against one backend, and means a test never fails because another one changed "its" data.

**Sign in through the API, not the form.** Only the sign-in specs touch the login form. Everything else uses `signedInPage` or `as(user)`, so a broken login form fails a few tests instead of all of them.

**Accessible locators only.** `getByRole` and `getByLabel` first, `getByTestId` as a last resort, never CSS or XPath. Tests that find elements the way assistive technology does catch accessibility regressions for free, and they're also what agents generate most reliably.

**Context as data, not prose.** Feature context is structured YAML with a schema, so it can be validated in CI, versioned with the code and fed to agents without prompt sprawl. Rules, journeys and edge cases all have ids, so they double as a coverage checklist.

**Retries only to collect evidence.** One retry in CI, and retried tests show up as flaky in the report. A retry that turns red into green is a bug report, not a fix.

## Using it for your own app

1. Click **Use this template** on GitHub.
2. Replace `e2e/support/adapter.ts` with your app's version: how to create a user, how to sign one in, any seeding helpers. On Supabase, start from `supabaseAdapter()` instead.
3. Point `playwright.config.ts` at your app (`baseURL`, and `webServer` to start it).
4. Rewrite `e2e/context/app.yaml` and add a `*.feature.yaml` per feature.
5. Replace the seeds in `e2e/seeds/` with your app's starting states, then delete `examples/demo-app/` and the demo specs.
6. Optional: create a git-ignored `.denylist` and a `LEAK_DENYLIST` repository secret listing names that must never appear in the repo.

## Roadmap

- [x] **Phase 1: Foundation.** Config factory, adapter contract, fixtures, context schemas and validator, demo app, 20 tests, CI, leak check.
- [x] **Phase 2: Agents.** Planner, generator and healer as Claude Code subagents driving a real browser through Playwright MCP, all reading `e2e/context/`. First run: the planner found 4 coverage gaps in sign-in (including a sign-out test that only checked the UI, not the server), and the generator closed them. Each new test was checked by breaking the app on purpose; all four caught the break.
- [x] **Phase 3: Healing.** `npm run heal` on a developer's own Claude login, plus an opt-in CI workflow that publishes a pull request and issues for real app bugs. Either way, a guard written in code rejects any repair that weakens a test.
- [x] **Phase 4: Observability.** Context coverage report (strict in CI), a mutation runner that proves each test can fail by breaking the app on purpose, and context suggestions in the heal report.
- [x] **Phase 5: Adapters.** A ready-made Supabase adapter (accounts, sessions, checks below the UI, stale-user sweep, database breaks), extracted from a real project.

## Licence

MIT
