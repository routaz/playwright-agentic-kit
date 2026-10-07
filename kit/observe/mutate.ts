// Prove the tests can fail: apply each mutation from e2e/mutations.ts, run only the
// tests covering what it breaks, and check that at least one fails.
//
// Usage: node kit/observe/mutate.ts [--only <id>] [--project <name>] [--file e2e/mutations.ts]
// Writes reports/mutations.md and reports/mutations.json. Exits 1 if any mutation
// survived, matched no tests, or no longer applies.
//
// Safety: original file contents go to .mutate/journal.json before any edit, and are
// restored after each mutation, on Ctrl-C, and at the start of the next run if a
// previous one was killed.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Mutation } from './mutations.ts';
import { listTests, uniqueTests, type ListedTest } from './tests.ts';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    project: { type: 'string' },
    file: { type: 'string', default: 'e2e/mutations.ts' },
  },
});

const JOURNAL = '.mutate/journal.json';
const RESULTS = '.mutate/results.json';

function restoreJournal(): string[] {
  if (!existsSync(JOURNAL)) return [];
  const originals = JSON.parse(readFileSync(JOURNAL, 'utf8')) as Record<string, string>;
  for (const [file, content] of Object.entries(originals)) writeFileSync(file, content);
  rmSync(JOURNAL);
  return Object.keys(originals);
}

const leftover = restoreJournal();
if (leftover.length) console.warn(`Restored ${leftover.join(', ')} from an interrupted earlier run.`);

let pendingUndo: (() => void | Promise<void>) | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    restoreJournal();
    await pendingUndo?.();
    console.error('\nInterrupted. Everything has been restored.');
    process.exit(130);
  });
}

const mutations = ((await import(pathToFileURL(resolve(args.file!)).href)).default as Mutation[]).filter(
  (m) => !args.only || m.id === args.only,
);
if (!mutations.length) throw new Error(args.only ? `No mutation "${args.only}"` : `No mutations in ${args.file}`);

const all = listTests();
const project = args.project ?? all[0]?.project;
const tests = uniqueTests(all.filter((t) => t.project === project));
const coversOf = (m: Mutation) => (Array.isArray(m.covers) ? m.covers : [m.covers]);
const testsFor = (m: Mutation) => tests.filter((t) => t.covers.some((c) => coversOf(m).includes(c)));

interface PwResult {
  suites: Suite[];
  errors?: { message?: string }[];
}
interface Suite {
  specs?: {
    title: string;
    line: number;
    file: string;
    tests: { status: string; results?: { status: string }[] }[];
  }[];
  suites?: Suite[];
}

/**
 * Run the given tests and return the titles of those that failed. Throws when the
 * run itself went wrong (no tests ran, the app server couldn't start): that must
 * never be mistaken for "all passed".
 */
function run(selected: ListedTest[]): string[] {
  mkdirSync('.mutate', { recursive: true });
  rmSync(RESULTS, { force: true });
  spawnSync(
    'npx',
    [
      'playwright',
      'test',
      ...selected.map((t) => `${t.file}:${t.line}`),
      `--project=${project}`,
      '--reporter=json',
      '--retries=0',
    ],
    { stdio: 'ignore', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: RESULTS, E2E_FRESH_SERVER: '1' } },
  );
  if (!existsSync(RESULTS)) throw new Error('The test run produced no results.');
  const report = JSON.parse(readFileSync(RESULTS, 'utf8')) as PwResult;
  const failed: string[] = [];
  let ran = 0;
  const walk = (s: Suite) => {
    for (const spec of s.specs ?? []) {
      ran += spec.tests.length;
      const bad = spec.tests.filter((t) => t.status === 'unexpected');
      if (!bad.length) continue;
      // A test timeout (not an assertion's) may be the break, or just a slow machine.
      const timedOut = bad.every((t) => t.results?.some((r) => r.status === 'timedOut'));
      failed.push(timedOut ? `${spec.title} (timed out)` : spec.title);
    }
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of report.suites) walk(s);
  const errors = (report.errors ?? []).map((e) => e.message?.split('\n')[0]).filter(Boolean);
  if (errors.length || ran === 0) throw new Error(errors[0] ?? 'No tests ran.');
  return failed;
}

// The tests must pass before anything is broken, or a "caught" would mean nothing.
const involved = uniqueTests(mutations.flatMap(testsFor));
console.log(`Baseline: running the ${involved.length} test(s) the mutations will use (${project})...`);
let baseline: string[];
try {
  baseline = run(involved);
} catch (e) {
  console.error(`The baseline run failed: ${(e as Error).message}`);
  process.exit(2);
}
if (baseline.length) {
  console.error(`These fail without any mutation, fix them first:\n  ${baseline.join('\n  ')}`);
  process.exit(2);
}

type Status = 'caught' | 'survived' | 'no tests' | 'stale' | 'error';
const results: {
  id: string;
  description: string;
  covers: string[];
  status: Status;
  tests: number;
  failed: string[];
  note?: string;
}[] = [];

for (const m of mutations) {
  const selected = testsFor(m);
  const base = {
    id: m.id,
    description: m.description,
    covers: coversOf(m),
    tests: selected.length,
    failed: [] as string[],
  };
  if (!selected.length) {
    results.push({ ...base, status: 'no tests', note: 'no test covers these ids' });
    continue;
  }

  // Check every edit still applies before touching anything.
  const originals: Record<string, string> = {};
  let stale: string | undefined;
  for (const e of m.edits ?? []) {
    const content = originals[e.file] ?? (existsSync(e.file) ? readFileSync(e.file, 'utf8') : undefined);
    const count = content?.split(e.find).length ?? 0;
    if (content === undefined) stale = `${e.file} doesn't exist`;
    else if (count - 1 !== 1) stale = `"${e.find.slice(0, 40)}" occurs ${count - 1} times in ${e.file}, expected once`;
    if (stale) break;
    originals[e.file] ??= content!;
  }
  if (stale) {
    results.push({ ...base, status: 'stale', note: stale });
    continue;
  }

  process.stdout.write(`${m.id} ... `);
  mkdirSync('.mutate', { recursive: true });
  writeFileSync(JOURNAL, JSON.stringify(originals));
  try {
    const current = { ...originals };
    for (const e of m.edits ?? []) {
      current[e.file] = current[e.file].replace(e.find, e.replace);
      writeFileSync(e.file, current[e.file]);
    }
    pendingUndo = m.undo;
    try {
      // A break that can't be applied (its target changed) is stale, not a crash.
      try {
        await m.apply?.();
      } catch (e) {
        results.push({ ...base, status: 'stale', note: `apply() failed: ${(e as Error).message.split('\n')[0]}` });
        console.log('STALE');
        continue;
      }
      const failed = run(selected);
      const status: Status = failed.length ? 'caught' : 'survived';
      const onlyTimeouts = failed.length > 0 && failed.every((f) => f.endsWith('(timed out)'));
      results.push({
        ...base,
        status,
        failed,
        note: onlyTimeouts ? 'caught only by test timeouts: check it is the break, not a slow run' : undefined,
      });
      console.log(status === 'caught' ? `caught by ${failed.length}` : 'SURVIVED');
    } catch (e) {
      // The run broke (server didn't start, nothing ran): unknown, never "survived".
      results.push({ ...base, status: 'error', note: (e as Error).message });
      console.log(`ERROR: ${(e as Error).message}`);
    }
  } finally {
    await m.undo?.();
    pendingUndo = undefined;
    restoreJournal();
  }
}

const icon: Record<Status, string> = { caught: '✅', survived: '❌', 'no tests': '⚠️', stale: '⚠️', error: '⚠️' };
const caught = results.filter((r) => r.status === 'caught').length;
const cell = (s: string) => s.replace(/\|/g, '\\|');
const md = [
  '## Mutation check',
  '',
  `**${caught} of ${results.length}** deliberate breaks were caught by the tests covering them (${project}).`,
  '',
  '| | Break | Covers | Tests run | Result |',
  '| --- | --- | --- | --- | --- |',
  ...results.map(
    (r) =>
      `| ${icon[r.status]} | **${r.id}**: ${cell(r.description)} | ${r.covers.map((c) => `\`${c}\``).join(' ')} | ${r.tests} | ${
        r.status === 'caught'
          ? `caught by ${r.failed.map((f) => `"${cell(f)}"`).join(', ')}${r.note ? ` ⚠️ ${cell(r.note)}` : ''}`
          : `${r.status}${r.note ? `: ${cell(r.note)}` : ''}`
      } |`,
  ),
  '',
  '✅ caught · ❌ survived: the covering tests passed with the app broken · ⚠️ no covering tests, the break no longer applies, or the run itself failed',
  '',
].join('\n');

mkdirSync('reports', { recursive: true });
writeFileSync('reports/mutations.md', md);
writeFileSync('reports/mutations.json', JSON.stringify(results, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
rmSync('.mutate', { recursive: true, force: true });
console.log('\n' + md);
process.exit(caught === results.length ? 0 : 1);
