# E2E tests: working rules for agents

This repo's E2E tests are planned, written and repaired by three agents in `.claude/agents/`,
with a human reviewing each step. They use the Playwright MCP server from `.mcp.json`.

| Agent           | Input                                                | Output                                                       |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `e2e-planner`   | `e2e/context/<feature>.feature.yaml`, existing specs | `e2e/plans/<feature>.plan.md`: only the gaps, plus findings  |
| `e2e-generator` | a reviewed plan                                      | new tests in `e2e/specs/<feature>.spec.ts`, verified passing |
| `e2e-healer`    | failing tests, `test-results/results.json`           | fixes for test-side failures, a heal report for the rest     |

## The loop

1. A human writes or updates `e2e/context/<feature>.feature.yaml`. Run `npm run context:check`.
2. **Plan:** "Use the e2e-planner agent to plan <feature>." A human reads the plan and its
   Findings. A finding is either an app bug or stale context; resolve it before generating.
3. **Generate:** "Use the e2e-generator agent to implement e2e/plans/<feature>.plan.md."
4. **Review:** run `npm run check && npm test` and review the diff like any pull request.
5. **Heal** when tests go red: "Use the e2e-healer agent on the failing tests." It fixes only
   failures where the test is wrong, and reports app bugs and context drift without touching them.
   In CI this happens automatically (`.github/workflows/heal.yml`), and `node kit/heal/run-guard.ts`
   checks the healer's diff before anything is published. Run the guard locally after a heal too.

## Ground rules (all agents, and you)

- `e2e/context/` is the source of truth for intended behaviour. Agents never edit it.
- Tests import `test` and `expect` from `e2e/support/test.ts`, use the kit fixtures for users
  and data, and use page objects from `e2e/pages/`.
- Every test carries a `covers` annotation pointing at a context id (`<feature>#<rule-or-journey-id>`
  or `<feature>#edge:<id>`).
- Never make a red test green by weakening what it checks, skipping it, or changing an expected
  value to match the app. Report it instead.
- The `kit/` folder is the reusable framework. Project-specific code belongs in `e2e/`.
