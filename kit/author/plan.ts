// `npm run plan -- <feature>`: the e2e-planner agent, headlessly, with your own Claude login.
//
//   1. check e2e/context/<feature>.feature.yaml exists and is valid
//   2. run the planner (it explores the app and saves e2e/plans/<feature>.plan.md)
//   3. undo anything it changed outside e2e/plans/ (it shouldn't, and isn't trusted to)
//   4. summarise the plan and point at the next step: a person reviews it
//
// Flags: --max-turns <n> overrides heal.local.json for this run.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { maxTurnsFrom, requireClaude, runAgent } from '../claude.ts';
import { loadConfig } from '../heal/config.ts';
import { diffTrees, restoreFrom, snapshotTree } from '../heal/snapshot.ts';

// The script's own name, so hints match the project (e.g. `plan` here, `e2e:plan` in an app).
const self = process.env.npm_lifecycle_event ?? 'plan';
const sibling = self.replace('plan', 'generate');

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'max-turns': { type: 'string' } },
});
const feature = positionals[0];
const features = existsSync('e2e/context')
  ? readdirSync('e2e/context')
      .filter((f) => f.endsWith('.feature.yaml'))
      .map((f) => f.replace('.feature.yaml', ''))
  : [];

if (!feature || !features.includes(feature)) {
  console.error(
    `${feature ? `No e2e/context/${feature}.feature.yaml.` : 'Which feature?'} Usage: npm run ${self} -- <feature>` +
      `\nFeatures with a context file: ${features.join(', ') || '(none)'}`,
  );
  process.exit(2);
}

const config = loadConfig();
const maxTurns = maxTurnsFrom(flags['max-turns'], config);
requireClaude(config);

const check = spawnSync(process.execPath, [fileURLToPath(new URL('../context/check.ts', import.meta.url))], {
  stdio: 'inherit',
});
if (check.status !== 0) {
  console.error('\nFix the context files first: the planner only plans from valid context.');
  process.exit(2);
}

const planFile = `e2e/plans/${feature}.plan.md`;
const previous = existsSync(planFile) ? readFileSync(planFile, 'utf8') : undefined;
const before = snapshotTree();

console.log(
  `\n\x1b[1mPlanning ${feature}\x1b[0m (max ${maxTurns} turns${config.model ? `, model ${config.model}` : ''})`,
);
const status = runAgent(config, {
  agent: 'e2e-planner',
  prompt: `Plan the ${feature} feature from e2e/context/${feature}.feature.yaml. Save the plan to ${planFile}.`,
  tools: 'Read,Glob,Grep,LS,mcp__playwright-test__*',
  maxTurns,
  model: config.model || undefined,
});
if (status !== 0) console.warn(`\nThe planner exited with code ${status}.`);

// The planner may only write plans. Anything else it touched is undone.
const outside = diffTrees(before, snapshotTree()).filter((f) => !f.path.startsWith('e2e/plans/'));
if (outside.length) {
  restoreFrom(before, outside);
  console.warn(`\nUndid changes outside e2e/plans/: ${outside.map((f) => f.path).join(', ')}`);
}

const plan = existsSync(planFile) ? readFileSync(planFile, 'utf8') : undefined;
if (!plan || plan === previous) {
  console.error(
    `\nNo new plan in ${planFile}. Try again with more turns: npm run ${self} -- ${feature} --max-turns 60`,
  );
  process.exit(1);
}

const scenarios = plan.split('\n').filter((l) => /^#{3,4} \d+\.\d+/.test(l));
const findings = /## Findings\s*\n([\s\S]*?)(?=\n## |$)/.exec(plan)?.[1].trim();
console.log(`\n\x1b[1mPlan summary\x1b[0m: ${planFile}`);
console.log(`  ${scenarios.length} scenario(s)`);
for (const s of scenarios) console.log(`    ${s.replace(/^#+\s*/, '')}`);
console.log(`  findings: ${findings ? findings.split('\n')[0].slice(0, 140) : 'none'}`);
console.log(
  `\nNext: review the plan (and decide any findings), then\n  npm run ${sibling} -- ${planFile}` +
    `\nTo generate part of it: npm run ${sibling} -- ${planFile} --only "1.1-1.5"`,
);
