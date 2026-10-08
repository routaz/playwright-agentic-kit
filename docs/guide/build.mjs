// Builds docs/guide/playwright-agentic-kit-guide.pdf (and .html) from this file.
// Run: npm run guide
//
// Code excerpts are read from the real source files when the guide is built, located by
// a line they start with. If a function is renamed or moved, the build fails instead of
// printing a stale excerpt.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'playwright-agentic-kit-guide');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KEYWORDS =
  /\b(export|default|function|async|await|const|let|return|if|else|for|of|in|new|throw|import|from|type|interface|try|catch|finally|continue|break|extends|keyof|typeof|true|false|null|undefined)\b/g;

/** Minimal highlighting: comments, strings, keywords. */
function highlight(source) {
  const token =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*(?=\n|$)|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)/g;
  let out = '';
  let last = 0;
  for (const m of source.matchAll(token)) {
    out += esc(source.slice(last, m.index)).replace(KEYWORDS, '<b>$1</b>');
    const t = m[0];
    const isComment = t.startsWith('//') || t.startsWith('/*') || (t.startsWith('#') && !/^#[a-z-]+$/i.test(t));
    out += `<span class="${isComment ? 'c' : 's'}">${esc(t)}</span>`;
    last = m.index + t.length;
  }
  return out + esc(source.slice(last)).replace(KEYWORDS, '<b>$1</b>');
}

function codeBlock(text, caption) {
  return `<figure class="code">${caption ? `<figcaption>${caption}</figcaption>` : ''}<pre>${highlight(text)}</pre></figure>`;
}

function lines(file) {
  return readFileSync(join(ROOT, file), 'utf8').split('\n');
}

const matches = (line, pattern) => (typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line));

/**
 * An excerpt from `file`, starting at the first line matching `start` and ending at the
 * first later line matching `end` (default: the closing `}` / `});` of a top-level block).
 */
function src(file, start, { end = /^(\}|\}\);|\]\);)\s*$/, from = 0, note } = {}) {
  const all = lines(file);
  const i = all.findIndex((l, k) => k >= from && matches(l, start));
  if (i < 0) throw new Error(`${file}: no line matching ${start}`);
  const j = all.findIndex((l, k) => k > i && matches(l, end));
  if (j < 0) throw new Error(`${file}: no end matching ${end} after line ${i + 1}`);
  const body = all.slice(i, j + 1);
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return codeBlock(
    body.map((l) => l.slice(indent)).join('\n'),
    `<code>${file}</code> · line ${i + 1}${note ? ` · ${note}` : ''}`,
  );
}

/** Lines `startLine`..`endLine` (1-based, inclusive) of a file, for config files without blocks. */
function head(file, count, note) {
  return codeBlock(
    lines(file).slice(0, count).join('\n'),
    `<code>${file}</code> · first ${count} lines${note ? ` · ${note}` : ''}`,
  );
}

const box = (x, y, w, h, title, sub = '', cls = '') =>
  `<g class="box ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/><text x="${x + w / 2}" y="${y + (sub ? h / 2 - 4 : h / 2 + 5)}" class="t">${title}</text>${
    sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 13}" class="st">${sub}</text>` : ''
  }</g>`;
const arrow = (x1, y1, x2, y2, label = '', dashed = false) =>
  `<g class="arrow"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#a)" ${dashed ? 'stroke-dasharray="5 4"' : ''}/>${
    label ? `<text x="${(x1 + x2) / 2 + 6}" y="${(y1 + y2) / 2 - 5}" class="al">${label}</text>` : ''
  }</g>`;
const svg = (w, h, body, caption) =>
  `<figure class="diagram"><svg viewBox="0 0 ${w} ${h}" width="100%"><defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${body}</svg>${
    caption ? `<figcaption>${caption}</figcaption>` : ''
  }</figure>`;

const table = (headers, rows) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

const note = (title, body) => `<aside class="note"><strong>${title}</strong> ${body}</aside>`;
const explain = (body) => `<aside class="explain"><strong>Explain it like this:</strong> ${body}</aside>`;

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------

const route = (d, label = '', lx = 0, ly = 0, dashed = false) =>
  `<g class="arrow"><path d="${d}" fill="none" marker-end="url(#a)" ${dashed ? 'stroke-dasharray="5 4"' : ''}/>${
    label ? `<text x="${lx}" y="${ly}" class="al">${label}</text>` : ''
  }</g>`;

const loopDiagram = svg(
  760,
  330,
  [
    // Authoring, left to right.
    box(20, 30, 150, 60, 'Context', 'e2e/context/*.yaml', 'human'),
    box(215, 30, 150, 60, 'Planner agent', 'plan: only the gaps', 'agent'),
    box(410, 30, 150, 60, 'Review', 'a person edits the plan', 'human'),
    box(600, 30, 145, 60, 'Generator agent', 'specs + page objects', 'agent'),
    arrow(170, 60, 215, 60),
    arrow(365, 60, 410, 60),
    arrow(560, 60, 600, 60),
    // Every change: CI, then proof.
    box(600, 140, 145, 60, 'CI', 'plain Playwright', 'code'),
    box(410, 140, 150, 60, 'Coverage + mutate', 'prove the tests', 'code'),
    arrow(672, 90, 672, 140),
    arrow(600, 170, 560, 170, 'proves'),
    // When tests go red: heal, guard, review.
    box(215, 140, 150, 60, 'Healer agent', 'when tests go red', 'agent'),
    box(20, 140, 150, 60, 'Guard', 'code, not a prompt', 'code'),
    route('M 672 200 L 672 230 L 290 230 L 290 200', 'red', 480, 224, true),
    arrow(215, 170, 170, 170),
    box(20, 260, 345, 50, 'Pull request + issues for a person to review', '', 'human'),
    arrow(95, 200, 95, 260),
  ].join(''),
  'The loop. Blue: people decide. Purple: agents propose. Grey: deterministic code checks.',
);

const fixtureDiagram = svg(
  760,
  250,
  [
    box(300, 15, 160, 46, 'adapterCtx', 'request · baseURL · testInfo', 'code'),
    box(60, 100, 150, 46, 'data', 'adapter.data()'),
    box(300, 100, 160, 46, 'createdUsers', 'cleanup list'),
    box(550, 100, 150, 46, 'as(user)', 'new context per user'),
    box(180, 185, 140, 46, 'newUser()', 'adapter.createUser'),
    box(360, 185, 110, 46, 'user', ''),
    box(510, 185, 160, 46, 'signedInPage', 'page + signIn'),
    arrow(330, 61, 150, 100),
    arrow(380, 61, 380, 100),
    arrow(430, 61, 600, 100),
    arrow(135, 146, 220, 185),
    arrow(370, 146, 270, 185),
    arrow(320, 208, 360, 208),
    arrow(470, 208, 510, 208),
  ].join(''),
  'Fixture dependencies in createKitTest(). An arrow means "is built from". Teardown runs in reverse: users are deleted after the test that used them.',
);

const healDiagram = svg(
  760,
  160,
  [
    box(10, 50, 120, 60, 'Run suite', 'all green? stop', 'code'),
    box(150, 50, 120, 60, 'Snapshot', 'git tree, temp index', 'code'),
    box(290, 50, 120, 60, 'Healer', 'edits + report.json', 'agent'),
    box(430, 50, 120, 60, 'Guard', 'checkDiff()', 'code'),
    box(570, 50, 180, 60, 'Re-run, summarise', 'guard ok: leave or commit', 'code'),
    box(430, 125, 120, 30, 'violation → undo', '', 'human'),
    arrow(130, 80, 150, 80),
    arrow(270, 80, 290, 80),
    arrow(410, 80, 430, 80),
    arrow(550, 80, 570, 80),
    arrow(490, 110, 490, 125),
  ].join(''),
  'npm run heal (kit/heal/local.ts). The CI workflow is the same, with publish.ts opening a pull request at the end.',
);

const mutateDiagram = svg(
  760,
  175,
  [
    box(10, 20, 130, 56, 'List tests', 'covers per test', 'code'),
    box(160, 20, 130, 56, 'Baseline', 'involved tests green?', 'code'),
    box(310, 20, 130, 56, 'Journal', 'save originals', 'code'),
    box(460, 20, 130, 56, 'Apply break', 'edits / apply()', 'agent'),
    box(610, 20, 140, 56, 'Run covering', 'fresh server, own port', 'code'),
    box(610, 105, 140, 56, 'Classify', 'caught · survived · …', 'code'),
    box(310, 105, 280, 56, 'Undo + restore journal (always, in finally)', '', 'human'),
    arrow(140, 48, 160, 48),
    arrow(290, 48, 310, 48),
    arrow(440, 48, 460, 48),
    arrow(590, 48, 610, 48),
    arrow(680, 76, 680, 105),
    arrow(610, 133, 590, 133),
    arrow(375, 105, 375, 76, 'next break', true),
  ].join(''),
  'npm run mutate (kit/observe/mutate.ts), once per break in e2e/mutations.ts.',
);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const sections = [];
const h2 = (id, title) => {
  sections.push({ id, title, level: 2 });
  return `<h2 id="${id}">${title}</h2>`;
};
const h3 = (id, title) => {
  sections.push({ id, title, level: 3 });
  return `<h3 id="${id}">${title}</h3>`;
};

const body = [];

// --- 1. How to read --------------------------------------------------------
body.push(`
${h2('read', '1. How to read this guide')}
<p>This guide walks through <strong>playwright-agentic-kit</strong>, a Playwright end-to-end testing template where AI agents plan, write and repair the tests, and deterministic code checks everything they do. It is written so you can learn the code from the top down and explain any part of it in detail.</p>
<p><strong>Suggested reading order:</strong> sections 2 and 3 give you the whole picture in fifteen minutes. Section 4 (the core) is the part every test touches; read it with the source open. Sections 5 to 9 are independent of each other, so read them in the order you need. Section 11 collects the questions people tend to ask, with answers.</p>
<p>Every code excerpt is taken from the repository when this PDF is built, with its file and line number. If an excerpt and the code ever disagree, the build fails, so the guide can't quietly go stale.</p>

${h3('pitch', 'The 30-second version')}
<p>Most "AI testing" either generates throwaway scripts or quietly self-heals tests at runtime, which hides real bugs. This kit takes the opposite stance:</p>
<ul>
<li><strong>Agents work at authoring time; CI stays deterministic.</strong> The agents propose tests and repairs as ordinary code in a pull request. CI runs plain Playwright, with no model calls.</li>
<li><strong>Agents are only as good as their context.</strong> Each feature is described in a small, schema-validated YAML file: its rules, journeys and edge cases, each with an id. Every test names the ids it covers.</li>
<li><strong>Rules are enforced by code, not trusted to a prompt.</strong> A guard rejects any repair that weakens a test. A coverage report maps rules to tests. A mutation runner breaks the app on purpose to prove each test can fail.</li>
<li><strong>The project-specific surface is tiny.</strong> A new app writes one adapter (make a user, sign one in, seed data) and the context files. Supabase apps get a ready-made adapter.</li>
</ul>
${loopDiagram}
`);

// --- 2. Repository map ------------------------------------------------------
body.push(`
${h2('map', '2. The repository at a glance')}
<p>The repository has two halves: <code>kit/</code> is the reusable framework and never mentions a specific app; <code>e2e/</code> is the project side, which a new project replaces. The demo app in <code>examples/</code> exists so the template runs on its own.</p>
${table(
  ['Path', 'Side', 'What it is'],
  [
    [
      '<code>kit/config.ts</code>',
      'kit',
      '<code>defineKitConfig()</code>: the Playwright configuration every project starts from',
    ],
    [
      '<code>kit/fixtures.ts</code>',
      'kit',
      '<code>createKitTest(adapter)</code>: the test fixtures (users, sign-in, data, two-person flows)',
    ],
    ['<code>kit/adapters/types.ts</code>', 'kit', 'The adapter contract: the only code a new project must write'],
    ['<code>kit/adapters/supabase/</code>', 'kit', 'A ready-made adapter for Supabase apps, plus database breaks'],
    ['<code>kit/context/</code>', 'kit', 'JSON schemas for context files and <code>check.ts</code>, the validator'],
    [
      '<code>kit/heal/</code>',
      'kit',
      'The healing pipeline: guard, snapshots, report, <code>npm run heal</code>, CI publisher',
    ],
    ['<code>kit/observe/</code>', 'kit', 'Coverage report and mutation runner'],
    [
      '<code>kit/unique.ts</code>, <code>kit/agents.ts</code>',
      'kit',
      'Unique test emails; handing seed values to agents',
    ],
    ['<code>.claude/agents/</code>', 'kit', 'The planner, generator and healer agent definitions'],
    ['<code>e2e/context/</code>', 'project', '<code>app.yaml</code> and one <code>*.feature.yaml</code> per feature'],
    [
      '<code>e2e/support/</code>',
      'project',
      "<code>adapter.ts</code> (the app's adapter) and <code>test.ts</code> (the project's <code>test</code>)",
    ],
    ['<code>e2e/specs/</code>, <code>e2e/pages/</code>', 'project', 'Tests and page objects'],
    ['<code>e2e/seeds/</code>', 'project', 'Known starting states for the agents; they also run as smoke tests'],
    ['<code>e2e/plans/</code>', 'project', 'Test plans written by the planner and reviewed by a person'],
    ['<code>e2e/mutations.ts</code>', 'project', 'Deliberate breaks of the app, each tied to the rule it violates'],
    ['<code>examples/demo-app/</code>', 'demo', 'A dependency-free errands app with sign-in'],
    ['<code>scripts/check-leaks.mjs</code>', 'repo', 'Fails CI if a private name appears in files or commit history'],
  ],
)}
`);

// --- 3. Entry points --------------------------------------------------------
body.push(`
${h2('entry', '3. Entry points')}
<p>Everything starts from one of these. Knowing which file each command runs is the fastest way into the code.</p>
${table(
  ['Command', 'Runs', 'Does'],
  [
    [
      '<code>npm test</code>',
      '<code>playwright.config.ts</code> → <code>kit/config.ts</code>',
      'The E2E suite, desktop and mobile',
    ],
    [
      '<code>npm run context:check</code>',
      '<code>kit/context/check.ts</code>',
      'Validates every context file against its schema',
    ],
    [
      '<code>npm run test:unit</code>',
      '<code>node --test "kit/**/*.test.ts"</code>',
      'Unit tests of the guard, report and Supabase keys',
    ],
    ['<code>npm run coverage</code>', '<code>kit/observe/coverage.ts</code>', 'Which context items have tests'],
    [
      '<code>npm run mutate</code>',
      '<code>kit/observe/mutate.ts</code> + <code>e2e/mutations.ts</code>',
      'Break the app on purpose; check the tests fail',
    ],
    ['<code>npm run heal</code>', '<code>kit/heal/local.ts</code>', 'Run the healer agent locally, behind the guard'],
    ['<code>npm run check</code>', 'several', 'Typecheck, format, context, unit tests, leak check'],
    ['<code>npm run demo</code>', '<code>examples/demo-app/server.mjs</code>', 'The demo app on port 4173'],
    ['<code>npm run guide</code>', '<code>docs/guide/build.mjs</code>', 'Rebuilds this PDF'],
    [
      'Claude Code: "Use the e2e-planner agent…"',
      '<code>.claude/agents/*.md</code> + <code>.mcp.json</code>',
      'Plan, generate or heal tests',
    ],
    ['CI: push or pull request', '<code>.github/workflows/ci.yml</code>', 'Jobs "Tests" and "Mutation check"'],
    ['CI: failed run (opt-in)', '<code>.github/workflows/heal.yml</code>', 'Heal in CI and open a pull request'],
  ],
)}

${h3('trace', 'Follow one test from start to finish')}
<ol>
<li><code>npx playwright test</code> loads <code>playwright.config.ts</code>, which calls <code>defineKitConfig()</code>. That sets the test folder (<code>e2e</code>), browsers, reporters and the web server that starts the app.</li>
<li>Playwright finds <code>e2e/specs/errands.spec.ts</code>. It imports <code>test</code> from <code>e2e/support/test.ts</code>, which is <code>createKitTest(adapter)</code>: Playwright's <code>test</code> extended with the kit's fixtures.</li>
<li>A test asks for <code>signedInPage</code>. Playwright builds the fixtures it depends on: <code>adapterCtx</code>, then <code>data</code>, <code>createdUsers</code>, <code>newUser</code>, <code>user</code> (which calls <code>adapter.createUser()</code>), and finally <code>signedInPage</code>, which calls <code>adapter.signIn()</code> on the page's browser context.</li>
<li>The test body runs against a page that is already signed in as a fresh, private user.</li>
<li>Teardown runs in reverse: the page closes, then <code>createdUsers</code> calls <code>adapter.deleteUser()</code> for every user the test made, and <code>data</code> calls <code>adapter.disposeData()</code>.</li>
<li>The reporters write <code>test-results/results.json</code> (read by the healer and mutation runner), <code>test-results/junit.xml</code> (read by the CI test report) and the HTML report.</li>
</ol>
`);

// --- 4. Core ------------------------------------------------------------------
body.push(`
${h2('core', '4. The core: config, adapter contract, fixtures')}
${h3('config', '4.1 defineKitConfig()')}
<p>Every project's <code>playwright.config.ts</code> is a call to this function. It returns a normal Playwright config, with decisions baked in that make tests stable and agent-friendly.</p>
${src('kit/config.ts', 'export function defineKitConfig')}
<p>The decisions, and why:</p>
<ul>
<li><strong><code>E2E_BASE_URL</code></strong> retargets a run (for example at staging) without editing the config. When it's set, no local web server starts.</li>
<li><strong><code>testIgnore: ['**/kit/**']</code></strong>: the kit can live inside the test folder (<code>e2e/kit</code>) in a real project. Its own unit tests use <code>node:test</code> and must not be loaded by Playwright.</li>
<li><strong>Retries only in CI, and only one.</strong> The report marks a retried test as flaky. A retry exists to collect a trace, not to turn red into green.</li>
<li><strong>Three reporters.</strong> A human one, <code>results.json</code> for machines (healer, mutation runner) and <code>junit.xml</code> for the CI report. <code>includeProjectInTestName</code> keeps desktop and mobile runs of a test apart.</li>
<li><strong>Locale and timezone are pinned</strong> (<code>en-US</code>, <code>UTC</code>), so text locators and dates don't change with the machine.</li>
<li><strong>Service workers are blocked</strong>: they cache aggressively and make runs depend on each other.</li>
<li><strong><code>reuseExistingServer</code></strong> is on locally for speed, but <code>E2E_FRESH_SERVER</code> turns it off. The mutation runner sets it, because a server kept alive from earlier would still be running unbroken code.</li>
</ul>

${h3('contract', '4.2 The adapter contract')}
<p>This interface is the boundary between the kit and an app. Everything app-specific goes through it, which is why the rest of the kit never mentions any particular app.</p>
${src('kit/adapters/types.ts', 'export interface AdapterContext', { end: /^}/ })}
${src('kit/adapters/types.ts', 'export interface KitAdapter')}
${table(
  ['Method', 'Called by', 'When'],
  [
    [
      '<code>data(ctx)</code>',
      '<code>data</code> fixture',
      'Once per test that uses <code>data</code> (or anything built on it)',
    ],
    [
      '<code>createUser(ctx, data)</code>',
      '<code>newUser()</code> / <code>user</code>',
      'Each time a test needs a fresh user',
    ],
    [
      '<code>signIn(context, user, ctx)</code>',
      '<code>signedInPage</code>, <code>signIn()</code>, <code>as()</code>',
      'Before the page is used',
    ],
    ['<code>deleteUser(user, ctx)</code>', '<code>createdUsers</code> teardown', 'After the test, pass or fail'],
    [
      '<code>disposeData(data, ctx)</code>',
      '<code>data</code> teardown',
      'After the test, for users the data helpers made',
    ],
  ],
)}
${explain('"The adapter is a contract with five methods. A new app implements how to make a user, sign one in and clean up; the kit turns that into fixtures every test can use. That boundary is why the framework stays reusable."')}

${h3('fixtures', '4.3 createKitTest(): the fixtures')}
<p>A Playwright <em>fixture</em> is a value a test asks for by name. Its code runs <em>setup</em> before <code>await use(value)</code>, the test runs during <code>use</code>, and <em>teardown</em> runs after it. Fixtures can depend on other fixtures. That's all you need to read this file.</p>
${fixtureDiagram}
${src('kit/fixtures.ts', 'export interface KitFixtures')}
<p>The first fixtures: the context handed to every adapter method, the data helpers, and the cleanup list.</p>
${src('kit/fixtures.ts', 'adapterCtx: async', { end: /^    },$/ })}
${src('kit/fixtures.ts', 'createdUsers: async', { end: /^    },$/, note: 'cleanup tries every user even if one fails' })}
${src('kit/fixtures.ts', 'newUser: async', { end: /^    },$/ })}
<p><code>user</code> is simply <code>await newUser()</code>. <code>signedInPage</code> signs the built-in <code>page</code>'s context in as <code>user</code>; <code>signIn(user)</code> does the same for any user (seeds use it, because the agents take over the default page).</p>
${src('kit/fixtures.ts', 'signedInPage: async', { end: /^    },$/ })}
<p><code>as(user)</code> is the two-person fixture. Each user gets their own browser context, which means their own cookies and storage, so two people can be signed in at once. It copies the project's device options so both users see the same phone or desktop.</p>
${src('kit/fixtures.ts', '    as: async (', { end: /^    },$/ })}
${note('Why a separate createdUsers fixture?', 'Teardown order. Because <code>newUser</code> depends on <code>createdUsers</code>, Playwright tears <code>createdUsers</code> down <em>after</em> every page and context that used those users, so a user is never deleted while a page still needs them.')}

${h3('small', '4.4 Small helpers')}
${src('kit/unique.ts', 'export function uniqueEmail')}
<p>Worker index, retry number, a timestamp and a counter make the address unique even with parallel workers and retries against one shared backend. The <code>e2e-</code> prefix is what the stale-user sweep looks for.</p>
${src('kit/agents.ts', 'export async function exposeToAgents')}
<p>The planner and generator explore from a seed's page, but they can't see its fixtures. A seed that creates an account hands the credentials over on <code>window.__e2e</code>; the agents read them with their browser tool. An init script survives navigation, so the values stay available as the agent moves around.</p>

${h3('project', '4.5 The project side: adapter, test object, specs')}
<p>The demo app's adapter shows the contract in its simplest form: test-only endpoints create users, and sign-in goes through the API, not the form.</p>
${src('e2e/support/adapter.ts', 'export const adapter = defineAdapter')}
${head('e2e/support/test.ts', 6)}
<p>A spec reads like a normal Playwright test. The <code>covers</code> annotation links it to context ids; that link is what the coverage report and the mutation runner rely on.</p>
${src('e2e/specs/errands.spec.ts', "'completing an errand updates", { from: 0, end: /^  \);$/, note: 'starts inside the test() call' })}
`);

// --- 5. Context -------------------------------------------------------------
body.push(`
${h2('context', '5. Context files')}
<p>Context is the source of truth for what the app <em>should</em> do. People write it; agents read it and never edit it. It is structured YAML with a schema, so it can be validated, versioned with the code and fed to agents without prompt sprawl.</p>
${head('e2e/context/errands.feature.yaml', 25, 'a feature context')}
<ul>
<li><strong>Every rule, journey and edge case has an id.</strong> A test names what it covers as <code>feature#id</code> (or <code>feature#edge:id</code>), so coverage can be traced in both directions.</li>
<li><strong><code>risk</code></strong> tells the planner how deep to go: high means every rule, journey and edge case, with negative paths.</li>
<li><strong><code>known_issues</code></strong> lists real bugs that are accepted for now, so the healer neither reports them again nor "heals" around them.</li>
<li><strong><code>app.yaml</code></strong> holds project-wide conventions: locator rules, how tests get data, things never to do, and what can't be automated.</li>
</ul>
${src('kit/context/check.ts', 'for (const file of files)', { end: /^}$/ })}
`);

// --- 6. Agents ----------------------------------------------------------------
body.push(`
${h2('agents', '6. The agents')}
<p>An agent is a Markdown file in <code>.claude/agents/</code>: a short header (name, description, the exact tools it may use, model) and instructions. Claude Code runs it; the Playwright MCP server in <code>.mcp.json</code> gives it a real browser and the ability to run tests. They started from Playwright's own <code>init-agents</code> templates and were rewritten around the context files.</p>
${table(
  ['Agent', 'Reads', 'Writes', 'Key constraint'],
  [
    [
      'e2e-planner',
      'the feature context, existing <code>covers</code> annotations, the live app',
      '<code>e2e/plans/&lt;feature&gt;.plan.md</code>',
      'Plans only gaps. If the app contradicts a rule, it records a <em>finding</em> instead of planning a test around a bug.',
    ],
    [
      'e2e-generator',
      'a plan someone has reviewed, page objects, fixtures',
      'tests in <code>e2e/specs/</code>, page-object methods',
      'Never bends an expectation to match the app; a scenario that fails is reported as blocked.',
    ],
    [
      'e2e-healer',
      'failing tests, <code>results.json</code>, the context',
      'fixes, <code>.heal/report.json</code>',
      'Classifies every failure first. App bugs and stale context are reported, never "healed".',
    ],
  ],
)}
<p><strong>Seeds</strong> (<code>e2e/seeds/</code>) are tiny tests that put the browser in a known state: signed out, signed in with an empty list, signed in with data. An agent starts from a seed, and because seeds also run as smoke tests, a broken seed fails CI instead of confusing an agent.</p>
<p>The healer's classification is the heart of honest healing:</p>
${table(
  ['Class', 'Meaning', 'What the healer does'],
  [
    ['selector', 'Same control, same purpose, different name or structure', 'Updates the locator, in the page object'],
    [
      'timing',
      'The assertion ran before the UI settled',
      'Uses a web-first assertion on the awaited state; never a fixed wait',
    ],
    ['test-bug', 'The test contradicts the context', 'Fixes the test to match the context'],
    ['data', 'Seeding or fixture problem', 'Fixes the adapter or fixture usage'],
    ['environment', 'Server down, browser missing', 'Changes nothing; reports it'],
    ['app-bug', 'The app breaks a rule in the context', 'Changes nothing; reports it with the rule quoted'],
    ['context-drift', 'The app changed on purpose; the context is stale', 'Changes nothing; reports the stale entry'],
  ],
)}
${explain('"A failing test is evidence. The healer only repairs failures where the test is wrong and the app is right. Everything else becomes a report. And because a prompt can be ignored, code checks every change it makes."')}
`);

// --- 7. Healing -----------------------------------------------------------------
body.push(`
${h2('heal', '7. Healing, and the guard that keeps it honest')}
${healDiagram}
${h3('guard', '7.1 The guard: kit/heal/guard.ts')}
<p>The guard is a pure function: it takes what changed (added and removed lines per file) and returns violations (reject everything) and warnings (publish, but flag for review). Pure means easy to unit-test, and every rule has a test in <code>guard.test.ts</code>.</p>
${src('kit/heal/guard.ts', 'export interface FileChange', { end: /^}/ })}
${src('kit/heal/guard.ts', 'const FORBIDDEN', { end: /^];/ })}
${src('kit/heal/guard.ts', 'export function checkDiff')}
<p>The checks, in order: <strong>only allowed folders</strong> (<code>e2e/specs</code>, <code>pages</code>, <code>support</code>; never context, app code or workflows); <strong>no deleted files</strong>; <strong>no forbidden patterns</strong> on added lines (skips, <code>.only</code>, fixed waits, swallowed errors, commented-out assertions); <strong>no fewer <code>expect(</code> calls</strong>; <strong>no matcher may disappear</strong>, except a one-off <code>toBe</code> swapped for a web-first matcher, which is stronger; <strong>no exact value loosened to a regex</strong>. A changed expected value is only a <em>warning</em>, because fixing a genuinely wrong test can need one, and only a person can judge that.</p>
${note('Why line-based?', 'It is a safety net against the usual ways of making a red test green dishonestly, not a full TypeScript analysis. Simple rules are predictable, explainable and fast to test.')}

${h3('snapshot', '7.2 Snapshots: knowing exactly what the healer changed')}
<p>A developer often heals with uncommitted work of their own in the tree. Comparing against <code>HEAD</code> would blame that work on the healer. So the kit snapshots the whole working tree as a git tree object before the healer runs, and again after, and diffs the two.</p>
${src('kit/heal/snapshot.ts', 'export function snapshotTree')}
<p>The trick is <code>GIT_INDEX_FILE</code>: git uses a temporary index, so <code>git add --all</code> captures every file (respecting <code>.gitignore</code>) without touching the developer's real staging area or any branch. <code>restoreFrom()</code> uses the same snapshot to undo the healer's changes when the guard rejects them.</p>

${h3('local', '7.3 npm run heal: kit/heal/local.ts')}
${src('kit/heal/local.ts', 'const before = snapshotTree();', { end: 'console.log(`  guard passed' })}
<p>The healer runs as a headless Claude Code session (<code>--agent e2e-healer</code>) with a turn limit, using the developer's own login. Settings come from a git-ignored <code>heal.local.json</code> (<code>kit/heal/config.ts</code>): where Claude Code is, model, turn limit, whether to commit the repairs, whether to file issues.</p>

${h3('report', '7.4 The report and publishing')}
<p>The healer writes a machine-readable report; everything after it reads that, not the agent's chat output.</p>
${src('kit/heal/report.ts', 'export interface HealReport')}
<p>In CI, <code>.github/workflows/heal.yml</code> runs when CI fails (only if the <code>HEAL_IN_CI</code> repository variable is <code>true</code>, never for <code>heal/</code> branches, never for forks). It reproduces the failure, runs the healer, the guard and the suite, then <code>kit/heal/publish.ts</code> opens a <code>heal/&lt;run&gt;</code> pull request and <code>kit/heal/github.ts</code> files deduplicated issues for app bugs and stale context.</p>
`);

// --- 8. Observability ---------------------------------------------------------
body.push(`
${h2('observe', '8. Proving the tests: coverage and mutations')}
<p>AI-written tests are only worth something if they test the right things and can actually fail. Two tools check both. They share one helper that reads the tests without running them.</p>
${src('kit/observe/tests.ts', 'export function listTests')}
<p>Playwright's list mode (<code>--list --reporter=json</code>) returns every test with its file, line, browser project and annotations. The JSON goes to a file rather than stdout, so stray output can't corrupt it. <code>uniqueTests()</code> collapses the desktop and mobile copies of a test, keyed by file, line <em>and title</em>, because tests generated in a loop share a line.</p>

${h3('coverage', '8.1 Coverage: kit/observe/coverage.ts')}
<p>It loads every feature context, builds the list of items (rules, journeys, edge cases), and maps each to the tests whose <code>covers</code> annotation names it.</p>
${src('kit/observe/coverage.ts', 'const tests = uniqueTests(listTests());', { end: 'const untagged' })}
<p>With <code>--strict</code> (used in CI) it fails on an id that matches nothing, usually a typo or a renamed id, and on any rule or critical journey without a test. Optional items are reported but don't fail the build.</p>

${h3('mutate', '8.2 Mutations: kit/observe/mutate.ts')}
${mutateDiagram}
<p>A project declares its breaks in <code>e2e/mutations.ts</code>. Each names the context id it violates, and either text edits or <code>apply()</code>/<code>undo()</code> functions.</p>
${src('kit/observe/mutations.ts', 'export interface Mutation')}
<p>The safety net comes first. Original file contents are written to a journal before any edit, and restored after every break, on Ctrl-C, and at the start of the next run if a run was killed.</p>
${src('kit/observe/mutate.ts', 'function restoreJournal')}
<p>Running the covering tests. Note the two refusals at the end: a run that produced no results, or where nothing ran (for example, the app server couldn't start), throws, so it can never be mistaken for "all passed".</p>
${src('kit/observe/mutate.ts', 'function run(selected')}
<p>The main loop, one break at a time. Every edit is checked first (it must occur exactly once, or the break is <em>stale</em>), then applied, the covering tests run, and the result is classified. The <code>finally</code> block always restores.</p>
${src('kit/observe/mutate.ts', 'for (const m of mutations)')}
${table(
  ['Status', 'Meaning'],
  [
    [
      'caught',
      'At least one covering test failed with the app broken. Flagged if only test timeouts caught it, since a slow run looks the same.',
    ],
    ['survived', 'Every covering test passed with the app broken: the tests are too weak.'],
    ['no tests', "Nothing covers the break's ids."],
    ['stale', 'The break no longer applies: its text changed or appears twice, or <code>apply()</code> failed.'],
    ['error', 'The run itself failed. Unknown; never counted as caught or survived.'],
  ],
)}
${note('A real catch', 'Its first run found a weak test written by hand: "a blank title adds nothing" checked an empty list that was already empty before the server answered, so it passed even when the server saved blank titles. The fix: wait for the server\'s answer and reload before asserting.')}
`);

// --- 9. Supabase ------------------------------------------------------------------
body.push(`
${h2('supabase', '9. The Supabase adapter')}
<p><code>kit/adapters/supabase/</code> is a ready-made adapter for apps on Supabase Auth with supabase-js in the browser. An app only writes its own parts: how to finish a new account (<code>setUp</code>) and its own helpers (<code>data</code>).</p>
${src('kit/adapters/supabase/index.ts', 'export interface SupabaseAdapterOptions')}
${h3('sb-keys', '9.1 Keys and the local-only guard')}
${src('kit/adapters/supabase/keys.ts', 'export function resolveKeys')}
<p>Tests create and delete accounts, so any host but localhost is refused. <code>resolveKeys</code> takes its inputs as parameters (environment and a status function), which is what makes it unit-testable without a running Supabase.</p>
${h3('sb-users', '9.2 Users and sessions')}
${src('kit/adapters/supabase/index.ts', '  async function newUser', { end: /^  }$/ })}
<p>Users are created confirmed through the Auth admin API (service-role key), then handed to the app's <code>setUp</code>, for example to call an onboarding RPC the way the real signup form does.</p>
${src('kit/adapters/supabase/index.ts', '    async signIn(context, user, ctx)', { end: /^    },$/ })}
<p>Sign-in gets a real session with a password grant and puts it where supabase-js keeps it, under the same storage key supabase-js derives from the URL. <code>setStorageState</code> sets it once; an init script would restore it on every page load and quietly undo sign-out in tests.</p>
<p>The <code>data</code> fixture also gets helpers for checking below the UI: <code>apiAs(user, method, path, body)</code> calls the API as that user, to prove what row-level security and database functions allow; <code>canSignIn(user)</code> says whether an account still exists; <code>sessionIn(page)</code> and <code>refreshTokenWorks(token)</code> prove a sign-out ended the session on the server. Checking a refresh token uses it up (Supabase rotates them), so check only after the action under test.</p>
${h3('sb-db', '9.3 Database breaks')}
${src('kit/adapters/supabase/db.ts', 'export function dbFunction')}
<p>Each helper reads the object's real definition from the local database at the moment it applies, and restores exactly that, so it never works from a stale copy. <code>db()</code> combines several breaks, undone in reverse; that's how a rule enforced twice (for example a function check plus a table constraint) is broken in both places at once.</p>
`);

// --- 10. CI -----------------------------------------------------------------------
body.push(`
${h2('ci', '10. CI and repository hygiene')}
${table(
  ['Job / step', 'What it proves'],
  [
    ['Typecheck, format and context', 'The code compiles, follows Prettier, and every context file matches its schema'],
    ['Unit tests', 'The guard, report and Supabase key handling; results published as a check'],
    ['Leak check', 'No private name (from a secret denylist) in files or commit history'],
    ['E2E tests', 'The whole suite, desktop and mobile; results published as a check with failures annotated'],
    ['Context coverage (strict)', 'No broken covers ids; every rule and critical journey has a test'],
    ['Mutation check (own job)', 'Every declared break is caught'],
  ],
)}
<p>Test results are published with <code>dorny/test-reporter</code> from the JUnit files, as check runs on the commit or pull request. That needs <code>checks: write</code> on the job and <code>use-actions-summary: false</code>, otherwise version 3 writes to the job summary instead.</p>
${src('scripts/check-leaks.mjs', 'const terms = [', { end: ".filter((t) => t && !t.startsWith('#'));" })}
<p>The denylist is never committed, because a committed list would itself leak the names. It comes from a repository secret in CI and a git-ignored <code>.denylist</code> locally, and the script prints only where a match is, never which term matched.</p>
`);

// --- 11. Q&A ----------------------------------------------------------------------
const qa = [
  [
    'Why TypeScript and not Python, like many agentic-testing articles?',
    "The articles' Python is orchestration code (LangChain calling a model). Here the orchestration is the agents themselves, defined as prompt files, so the only code is tests and the kit. Playwright's agent tooling (its test MCP server) is Node-only, and the type checker catches agent mistakes for free: a page-object method or fixture an agent invents fails <code>tsc</code> before a person reviews it.",
  ],
  [
    'Why not let tests self-heal at runtime?',
    'Because a test that rewrites itself to pass can hide a real bug: if "Log in" quietly becomes "Delete account", a healed test passes. Here repairs are proposals: classified, checked by code, re-run and reviewed in a pull request.',
  ],
  [
    'What stops the healer from cheating anyway?',
    'The guard, which is code, not a prompt. It rejects edits outside the test folders, skips, fixed waits, swallowed errors, fewer assertions, weaker matchers and loosened values, and the rejected changes are undone. It was rehearsed with a deliberately dishonest healer and rejected every cheat.',
  ],
  [
    'How do you know the AI-written tests are any good?',
    "Three ways. A person reviews each plan before tests are generated. The coverage report shows which rules have tests. The mutation runner breaks each rule on purpose and checks the covering tests fail; a test that can't fail is caught there.",
  ],
  [
    'Why do tests create their own users?',
    'Independence. No shared seed accounts means tests can run in parallel against one backend and never fail because another test changed "their" data. Cleanup is automatic, even when a test fails.',
  ],
  [
    'Why sign in through the API instead of the form?',
    'Speed and isolation: only sign-in tests depend on the login form, so a broken form fails a few tests instead of all of them.',
  ],
  [
    'Why accessible locators only?',
    'Tests that find elements the way assistive technology does catch accessibility regressions for free, survive styling changes, and are what agents generate most reliably.',
  ],
  [
    'What happens to a mutation run that gets killed?',
    'The journal on disk holds the original file contents; the next run restores them before doing anything else. Database breaks restore from definitions read at apply time.',
  ],
  [
    'What would you improve next?',
    'An example Supabase project in this repository so the adapter has its own CI, a combined dashboard of coverage and mutation results over time, and a planner prompt that also proposes the matching breaks for <code>e2e/mutations.ts</code>.',
  ],
];
body.push(`
${h2('qa', '11. Explaining it: questions and answers')}
${qa.map(([q, a]) => `<div class="qa"><p class="q">${q}</p><p>${a}</p></div>`).join('')}
`);

// --- 12. Glossary -----------------------------------------------------------------
body.push(`
${h2('glossary', '12. Glossary')}
${table(
  ['Term', 'Meaning here'],
  [
    ['Adapter', 'The app-specific code behind the fixtures: make, sign in and delete users; seed data'],
    ['Agent', 'A Claude Code subagent defined in <code>.claude/agents/*.md</code>'],
    ['Context', 'YAML describing what a feature should do; the source of truth'],
    ['Covers', 'The test annotation naming the context ids a test covers, e.g. <code>errands#private-lists</code>'],
    ['Fixture', 'A value a Playwright test asks for by name, with setup and teardown'],
    ['Guard', '<code>checkDiff()</code>: the code that rejects dishonest repairs'],
    ['Healing', 'Repairing tests that are wrong while reporting apps that are wrong'],
    ['MCP', 'Model Context Protocol; here the server that gives agents a browser and a test runner'],
    ['Mutation', 'A deliberate break of the app, to prove the covering tests fail'],
    ['Seed', 'A tiny test that sets up a known starting state for an agent'],
    ['Web-first assertion', 'An <code>expect(locator)</code> assertion that retries until it passes or times out'],
  ],
)}
`);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const toc = sections.map((s) => `<li class="l${s.level}"><a href="#${s.id}">${s.title}</a></li>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>playwright-agentic-kit: a guide to the code</title>
<style>
@page { size: A4; margin: 18mm 16mm 20mm; }
:root { --ink:#1c2230; --muted:#5b6475; --line:#d9dee7; --soft:#f4f6fa; --accent:#3651d4; --agent:#7a4fd1; --human:#2a7de1; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.55 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; }
h1 { font-size: 30pt; line-height: 1.15; margin: 0 0 8mm; letter-spacing: -0.5px; }
h2 { font-size: 17pt; margin: 0 0 4mm; padding-top: 2mm; color: var(--accent); break-before: page; }
h3 { font-size: 12.5pt; margin: 7mm 0 2mm; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
code { font: 9pt/1.4 "SF Mono", Menlo, Consolas, monospace; background: var(--soft); padding: 0 3px; border-radius: 3px; }
figure { margin: 4mm 0; }
figure.code { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; break-inside: avoid; }
figure.code figcaption { font-size: 8pt; color: var(--muted); background: var(--soft); padding: 1.5mm 3mm; border-bottom: 1px solid var(--line); }
figure.code pre { margin: 0; padding: 3mm; font: 8.1pt/1.45 "SF Mono", Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
pre b { color: #a5306b; font-weight: 600; } pre .c { color: #6b7385; font-style: italic; } pre .s { color: #1d7a52; }
table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.3pt; break-inside: auto; }
th { text-align: left; background: var(--soft); }
th, td { border: 1px solid var(--line); padding: 1.6mm 2.2mm; vertical-align: top; }
tr { break-inside: avoid; }
aside { border-left: 3px solid var(--accent); background: var(--soft); padding: 2.5mm 4mm; margin: 4mm 0; break-inside: avoid; font-size: 9.8pt; }
aside.explain { border-color: var(--agent); }
figure.diagram { break-inside: avoid; text-align: center; }
figure.diagram figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 1mm; }
svg .box rect { fill: #eef1f6; stroke: #9aa3b5; stroke-width: 1.2; }
svg .box.agent rect { fill: #efe8fb; stroke: var(--agent); }
svg .box.human rect { fill: #e6f0fc; stroke: var(--human); }
svg .box.code rect { fill: #eef1f6; stroke: #6b7385; }
svg .t { font: 600 12px sans-serif; text-anchor: middle; fill: #1c2230; }
svg .st { font: 10px sans-serif; text-anchor: middle; fill: #5b6475; }
svg .arrow line, svg .arrow path { stroke: #6b7385; stroke-width: 1.4; } svg marker path { fill: #6b7385; }
svg .al { font: 10px sans-serif; fill: #5b6475; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
.cover .sub { font-size: 14pt; color: var(--muted); max-width: 140mm; }
.cover .meta { margin-top: 20mm; font-size: 10pt; color: var(--muted); }
.toc { break-before: page; } .toc ol { list-style: none; padding: 0; } .toc li { margin: 1.2mm 0; }
.toc .l3 { margin-left: 7mm; font-size: 9.5pt; } .toc a { color: var(--ink); text-decoration: none; }
.qa { break-inside: avoid; margin-bottom: 4mm; } .qa .q { font-weight: 700; margin-bottom: 1mm; }
a { color: var(--accent); }
</style></head><body>
<section class="cover">
  <h1>playwright-agentic-kit<br>A guide to the code</h1>
  <p class="sub">Entry points, the most important functions, and a walkthrough of every part: the core fixtures, context files, agents, the healing guard, coverage and mutation testing, and the Supabase adapter.</p>
  <p class="meta">Built ${new Date().toISOString().slice(0, 10)} from the repository. Code excerpts are read from the source at build time.</p>
</section>
<section class="toc"><h2 style="break-before:avoid">Contents</h2><ol>${toc}</ol></section>
${body.join('\n')}
</body></html>`;

writeFileSync(`${OUT}.html`, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({
  path: `${OUT}.pdf`,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font:8px sans-serif;color:#8a93a5;padding:0 16mm;display:flex;justify-content:space-between"><span>playwright-agentic-kit · guide to the code</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
});
await browser.close();
console.log(`Wrote ${OUT}.pdf`);
