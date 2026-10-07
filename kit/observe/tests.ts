// The project's tests and what each one covers, read from Playwright's list mode,
// so nothing has to run.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

export interface ListedTest {
  /** Path relative to the working directory, usable as a Playwright filter (`file:line`). */
  file: string;
  line: number;
  title: string;
  project: string;
  /** Context ids from `covers` annotations, e.g. `sign-in#generic-error`. */
  covers: string[];
}

interface Annotation {
  type: string;
  description?: string;
  location?: { file: string };
}
interface Suite {
  specs?: { title: string; line: number; tests: { projectName: string; annotations: Annotation[] }[] }[];
  suites?: Suite[];
}

export function listTests(): ListedTest[] {
  // Read the JSON from a file, not stdout: anything else printing (a web server,
  // a stray console.log in a spec) would corrupt it.
  const dir = mkdtempSync(join(tmpdir(), 'pw-list-'));
  const file = join(dir, 'list.json');
  try {
    execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
      stdio: 'ignore',
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: file },
    });
  } catch {
    // A non-zero exit still writes the report when listing works; checked below.
  }
  if (!existsSync(file)) throw new Error('Listing the tests failed. Run `npx playwright test --list` to see why.');
  const report = JSON.parse(readFileSync(file, 'utf8')) as { config: { rootDir: string }; suites: Suite[] };
  rmSync(dir, { recursive: true, force: true });
  const out: ListedTest[] = [];
  const walk = (suite: Suite, file: string | undefined) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const covers = t.annotations.filter((a) => a.type === 'covers' && a.description).map((a) => a.description!);
        const where = t.annotations.find((a) => a.location)?.location?.file ?? file ?? '';
        out.push({
          file: relative(process.cwd(), where),
          line: spec.line,
          title: spec.title,
          project: t.projectName,
          covers,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of report.suites) walk(suite, `${report.config.rootDir}/${(suite as { file?: string }).file ?? ''}`);
  return out;
}

/** One entry per test, however many browser projects it runs in. */
export function uniqueTests(tests: ListedTest[]): ListedTest[] {
  const seen = new Map<string, ListedTest>();
  for (const t of tests) {
    // Tests generated in a loop share a line, so the title is part of the key.
    const key = `${t.file}:${t.line}:${t.title}`;
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()];
}
