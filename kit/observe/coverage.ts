// Coverage from context to tests: for every rule, journey and edge case in
// e2e/context/*.feature.yaml, which tests cover it (by their `covers` annotations).
// Also flags covers ids that point at nothing, usually a typo or a renamed id.
//
// Usage: node kit/observe/coverage.ts [--strict] [--context e2e/context]
//   --strict  exit 1 on unknown covers ids, or on rules and critical journeys with no test
// Writes reports/coverage.md, and the job summary when running in GitHub Actions.

import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { listTests, uniqueTests, type ListedTest } from './tests.ts';

const { values: args } = parseArgs({
  options: { strict: { type: 'boolean', default: false }, context: { type: 'string', default: 'e2e/context' } },
});

interface Item {
  feature: string;
  id: string; // as used in covers: <feature>#<id> or <feature>#edge:<id>
  kind: 'rule' | 'journey' | 'edge case';
  text: string;
  /** Rules and critical journeys must be covered; the rest are reported. */
  required: boolean;
}

interface Feature {
  feature: string;
  rules?: { id: string; rule: string }[];
  journeys?: { id: string; name: string; priority: string }[];
  edge_cases?: { id: string; case: string }[];
}

const items: Item[] = [];
for (const file of readdirSync(args.context!)
  .filter((f) => f.endsWith('.feature.yaml'))
  .sort()) {
  const f = parse(readFileSync(join(args.context!, file), 'utf8')) as Feature;
  for (const r of f.rules ?? [])
    items.push({ feature: f.feature, id: `${f.feature}#${r.id}`, kind: 'rule', text: r.rule, required: true });
  for (const j of f.journeys ?? [])
    items.push({
      feature: f.feature,
      id: `${f.feature}#${j.id}`,
      kind: 'journey',
      text: j.name,
      required: j.priority === 'critical',
    });
  for (const e of f.edge_cases ?? [])
    items.push({
      feature: f.feature,
      id: `${f.feature}#edge:${e.id}`,
      kind: 'edge case',
      text: e.case,
      required: false,
    });
}

const tests = uniqueTests(listTests());
const byId = new Map<string, ListedTest[]>();
for (const t of tests) for (const c of t.covers) byId.set(c, [...(byId.get(c) ?? []), t]);

const known = new Set(items.map((i) => i.id));
const unknown = [...byId.entries()].filter(([id]) => !known.has(id));
const missing = items.filter((i) => !byId.has(i.id));
const missingRequired = missing.filter((i) => i.required);
const covered = items.length - missing.length;
const pct = items.length ? Math.round((covered / items.length) * 100) : 100;
const untagged = tests.filter((t) => t.covers.length === 0 && !t.file.includes('/seeds/'));

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines: string[] = [
  '## Context coverage',
  '',
  `**${covered} of ${items.length}** context items have at least one test (${pct}%). ${tests.length} tests.`,
  '',
];
for (const feature of [...new Set(items.map((i) => i.feature))]) {
  const mine = items.filter((i) => i.feature === feature);
  const done = mine.filter((i) => byId.has(i.id)).length;
  lines.push(`### ${feature}: ${done}/${mine.length}`, '', '| | Item | Kind | Tests |', '| --- | --- | --- | --- |');
  for (const i of mine) {
    const ts = byId.get(i.id) ?? [];
    const mark = ts.length ? '✅' : i.required ? '❌' : '⚪';
    lines.push(`| ${mark} | \`${i.id.split('#')[1]}\` ${cell(i.text)} | ${i.kind} | ${ts.length || '–'} |`);
  }
  lines.push('');
}
if (missing.length) {
  lines.push('### Not covered', '');
  for (const i of missing) lines.push(`- ${i.required ? '❌ **required**' : '⚪'} \`${i.id}\` (${i.kind}): ${i.text}`);
  lines.push('');
}
if (unknown.length) {
  lines.push('### Covers ids that match nothing in the context', '');
  for (const [id, ts] of unknown) lines.push(`- \`${id}\` in ${ts.map((t) => `${t.file}:${t.line}`).join(', ')}`);
  lines.push('');
}
if (untagged.length) {
  lines.push('### Tests without a covers annotation', '');
  for (const t of untagged) lines.push(`- ${t.file}:${t.line} "${t.title}"`);
  lines.push('');
}
lines.push('✅ covered · ❌ rule or critical journey with no test · ⚪ optional item with no test');

const md = lines.join('\n') + '\n';
mkdirSync('reports', { recursive: true });
writeFileSync('reports/coverage.md', md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);

if (args.strict && (unknown.length || missingRequired.length)) {
  console.error(
    `coverage: ${unknown.length} unknown covers id(s), ${missingRequired.length} required item(s) without a test.`,
  );
  process.exit(1);
}
