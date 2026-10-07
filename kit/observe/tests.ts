// The project's tests and what each one covers, read from Playwright's list mode,
// so nothing has to run.

import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';

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
  const raw = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const report = JSON.parse(raw.slice(raw.indexOf('{'))) as { config: { rootDir: string }; suites: Suite[] };
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
  for (const t of tests) if (!seen.has(`${t.file}:${t.line}`)) seen.set(`${t.file}:${t.line}`, t);
  return [...seen.values()];
}
