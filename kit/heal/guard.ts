// The healer's rules, enforced by code instead of trusted to a prompt.
//
// checkDiff() looks at what the healer changed and returns:
//   - violations: the proposal is rejected and nothing is published
//   - warnings:   published, but flagged for careful review
//
// It works on added and removed lines only, so it stays simple and predictable.
// It is a safety net that catches the usual ways of making a red test green
// dishonestly, not a full TypeScript analysis.

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  added: string[];
  removed: string[];
}

export interface GuardOptions {
  /** Path prefixes the healer may touch. */
  allowed: string[];
}

export interface GuardResult {
  violations: string[];
  warnings: string[];
}

export const DEFAULT_ALLOWED = ['e2e/specs/', 'e2e/pages/', 'e2e/support/'];

const FORBIDDEN: [RegExp, string][] = [
  [/\btest(\.describe)?\.(skip|fixme|fail|only)\b/, 'skips, disables or isolates tests'],
  [/\.only\(/, 'adds .only'],
  [/\bwaitForTimeout\(/, 'adds a fixed wait (waitForTimeout)'],
  [/networkidle/, "waits for 'networkidle'"],
  [/^\s*\/\/.*\bexpect\(/, 'comments out an assertion'],
  [/\bcatch\s*[({]/, 'catches errors, which can swallow a failing assertion'],
];

const EXPECT = /\bexpect(?:\.soft|\.poll)?\(/g;
const MATCHER = /\.(?:not\.)?(to[A-Z]\w*)\(/g;
/** Matcher called with a string literal: captures matcher and value. */
const LITERAL_ARG = /\.(?:not\.)?(to[A-Z]\w*)\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
/** Matcher called with a regex literal. */
const REGEX_ARG = /\.(?:not\.)?(to[A-Z]\w*)\(\s*\//g;

/** Matchers that check a value once instead of retrying against the page. */
const NON_WEB_FIRST = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toBeTruthy', 'toBeFalsy']);

function count(lines: string[], re: RegExp): number {
  return lines.reduce((n, l) => n + (l.match(re)?.length ?? 0), 0);
}

function collect(lines: string[], re: RegExp, group = 1): string[] {
  return lines.flatMap((l) => [...l.matchAll(re)].map((m) => m[group]));
}

/** Multiset difference a − b. */
function minus(a: string[], b: string[]): string[] {
  const left = [...b];
  return a.filter((x) => {
    const i = left.indexOf(x);
    if (i === -1) return true;
    left.splice(i, 1);
    return false;
  });
}

export function checkDiff(files: FileChange[], options: GuardOptions = { allowed: DEFAULT_ALLOWED }): GuardResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  for (const f of files) {
    if (!options.allowed.some((p) => f.path.startsWith(p))) {
      violations.push(`${f.path}: outside the healer's area (${options.allowed.join(', ')})`);
      continue;
    }
    if (f.status === 'deleted') {
      violations.push(`${f.path}: deletes a file`);
      continue;
    }

    for (const line of f.added) {
      for (const [re, why] of FORBIDDEN) {
        if (re.test(line)) violations.push(`${f.path}: ${why}: \`${line.trim()}\``);
      }
    }

    const lost = count(f.removed, EXPECT) - count(f.added, EXPECT);
    if (lost > 0) violations.push(`${f.path}: removes ${lost} assertion(s)`);

    // Each kind of check that disappears must come back. Swapping a one-off
    // value check (toBe) for a web-first one (toHaveText) is a strengthening.
    const removedMatchers = collect(f.removed, MATCHER);
    const addedMatchers = collect(f.added, MATCHER);
    let spareWebFirst = minus(addedMatchers, removedMatchers).filter((m) => !NON_WEB_FIRST.has(m)).length;
    for (const m of minus(removedMatchers, addedMatchers)) {
      if (NON_WEB_FIRST.has(m) && spareWebFirst > 0) {
        spareWebFirst--;
        continue;
      }
      violations.push(`${f.path}: replaces or drops a ${m}() check`);
    }

    // Exact expected value → regex is the classic way to make a test stop caring.
    const regexAdded = collect(f.added, REGEX_ARG);
    for (const m of new Set(collect(f.removed, LITERAL_ARG))) {
      if (regexAdded.includes(m)) violations.push(`${f.path}: loosens ${m}() from an exact value to a pattern`);
    }

    // A changed expected value is only legitimate when the old one contradicted the
    // context file (class test-bug). Code can't judge that, so a human must.
    const before = [...f.removed.join('\n').matchAll(LITERAL_ARG)].map((m) => `${m[1]}:${m[3]}`);
    const after = [...f.added.join('\n').matchAll(LITERAL_ARG)].map((m) => `${m[1]}:${m[3]}`);
    for (const changed of minus(before, after)) {
      const [matcher, value] = changed.split(/:(.*)/s);
      if (after.some((a) => a.startsWith(`${matcher}:`))) {
        warnings.push(`${f.path}: changes the expected value of ${matcher}() (was "${value}")`);
      }
    }
  }

  return { violations, warnings };
}

/** Parse `git diff --unified=0` output into FileChange records. */
export function parseUnifiedDiff(diff: string): FileChange[] {
  const files: FileChange[] = [];
  let current: FileChange | undefined;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const path = line.split(' b/').pop() ?? '';
      current = { path, status: 'modified', added: [], removed: [] };
      files.push(current);
    } else if (!current) {
      continue;
    } else if (line.startsWith('new file mode')) {
      current.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
    } else if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      continue;
    } else if (line.startsWith('+')) {
      current.added.push(line.slice(1));
    } else if (line.startsWith('-')) {
      current.removed.push(line.slice(1));
    }
  }
  return files;
}
