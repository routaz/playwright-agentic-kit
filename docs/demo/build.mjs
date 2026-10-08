// Builds docs/demo/demo.gif: a short walkthrough from context to proof.
// Everything it shows is real: excerpts are read from the repository, and terminal
// output comes from outputs.json, captured by running the commands (npm run demo:capture).
//
// How: an HTML page renders the frame for any time t; Playwright steps through the
// timeline and screenshots each frame; gifenc encodes them, merging repeated frames.
// Run: npm run demo:build

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const WIDTH = 880;
const HEIGHT = 495;
const FPS = 6;

const outputs = JSON.parse(readFileSync(join(HERE, 'outputs.json'), 'utf8'));
const file = (path) => readFileSync(join(ROOT, path), 'utf8').split('\n');

/** Lines from the first matching `start` to the first later matching `end`, both inclusive. */
function excerpt(path, start, end) {
  const lines = file(path);
  const i = lines.findIndex((l) => l.includes(start));
  const j = lines.findIndex((l, k) => k > i && l.includes(end));
  if (i < 0 || j < 0) throw new Error(`${path}: excerpt ${start} … ${end} not found`);
  return lines.slice(i, j + 1);
}

const strip = (l) => l.replace(/\*\*/g, '');
/** Terminal lines longer than the panel end in an ellipsis, like a narrow terminal would show them. */
const fit = (l, max = 98) => (l.length > max ? l.slice(0, max - 1) + '…' : l);

/** The plan's coverage table as two columns: context item and what the planner decided. */
function coverageColumns(lines) {
  const rows = lines
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
    .map((l) =>
      l
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean),
    )
    .map(([item, , action]) => [item.replace(/`/g, ''), action]);
  const width = Math.max(...rows.map(([item]) => item.length)) + 4;
  return ['## Coverage', '', ...rows.map(([item, action]) => item.padEnd(width) + action)];
}

// --- The story -------------------------------------------------------------------

const scenes = [
  {
    kind: 'title',
    duration: 2.6,
    title: 'playwright-agentic-kit',
    sub: 'AI agents plan, write and repair Playwright tests.<br>Code proves every one of them can fail.',
  },
  {
    kind: 'file',
    duration: 4.2,
    caption: '1 · People describe the feature: rules, journeys, edge cases',
    path: 'e2e/context/errands.feature.yaml',
    lines: excerpt('e2e/context/errands.feature.yaml', 'feature: errands', 'rule: Completed state persists'),
    highlight: (l) => l.includes('- id:'),
  },
  {
    kind: 'file',
    duration: 5,
    caption: "2 · The planner agent plans only what isn't tested · a person reviews",
    path: 'e2e/plans/sign-in.plan.md',
    lines: coverageColumns(excerpt('e2e/plans/sign-in.plan.md', '## Coverage', 'known issues')),
    highlight: (l) => l.includes('planned:'),
  },
  {
    kind: 'file',
    duration: 4.2,
    caption: '3 · The generator writes tests that name the rule they cover',
    path: 'e2e/specs/errands.spec.ts',
    lines: excerpt('e2e/specs/errands.spec.ts', "one user's errands are invisible", 'bobsList.empty'),
    highlight: (l) => l.includes("'covers'"),
  },
  {
    kind: 'term',
    duration: 5,
    caption: '4 · CI runs plain Playwright: no AI at run time',
    command: 'npm test',
    lines: [outputs.test[0], ...outputs.test.slice(1, -1).slice(-9), outputs.test.at(-1)].map((l) => fit(l)),
    highlight: (l) => /passed/.test(l) && !l.includes('✓'),
  },
  {
    kind: 'term',
    duration: 7.5,
    caption: '5 · Break the app on purpose: the tests covering each rule must fail',
    command: 'npm run mutate',
    lines: outputs.mutate
      .slice(0, outputs.mutate.findIndex((l) => l.startsWith('**')) + 1)
      .map(strip)
      .filter((l) => !l.startsWith('##')),
    highlight: (l) => /deliberate breaks were caught/.test(l),
  },
  {
    kind: 'term',
    duration: 6.5,
    caption: '6 · Same on real Supabase: row-level security, constraints, functions',
    command: 'npm run example:mutate',
    lines: outputs.exampleMutate
      .slice(0, outputs.exampleMutate.findIndex((l) => l.startsWith('**')) + 1)
      .map(strip)
      .filter((l) => !l.startsWith('##')),
    highlight: (l) => /deliberate breaks were caught/.test(l),
  },
  {
    kind: 'title',
    duration: 3.2,
    title: 'github.com/routaz/playwright-agentic-kit',
    sub: 'Template · MIT · a 37-page guide to the code in docs/guide',
  },
];

for (const s of scenes) if (s.highlight) s.marks = s.lines.map(s.highlight);
const total = scenes.reduce((n, s) => n + s.duration, 0);

// --- The player page ----------------------------------------------------------------

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; background: #0d1117; overflow: hidden;
  font: 15px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #e6edf3; }
#stage { position: absolute; inset: 0; padding: 22px 26px; }
.caption { font-size: 17px; font-weight: 600; color: #e6edf3; margin-bottom: 12px; }
.caption .bar { display: inline-block; width: 4px; height: 17px; background: #7c3aed; margin-right: 10px; vertical-align: -2px; border-radius: 2px; }
.panel { border: 1px solid #30363d; border-radius: 8px; overflow: hidden; background: #161b22; height: ${HEIGHT - 100}px; }
.panel .head { font: 12px/1 "SF Mono", Menlo, monospace; color: #8b949e; padding: 9px 12px; border-bottom: 1px solid #30363d; background: #0d1117; }
.panel pre { font: 13px/1.6 "SF Mono", Menlo, Consolas, monospace; padding: 10px 14px; white-space: pre; color: #c9d1d9; }
.panel pre.small { font-size: 11.2px; line-height: 1.75; }
.panel .hl { background: rgba(124, 58, 237, 0.28); color: #f0e7ff; display: inline-block; width: 100%; }
.panel .ok { color: #3fb950; font-weight: 700; }
.prompt { color: #3fb950; } .cursor { background: #e6edf3; color: #0d1117; }
.title { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; }
.title h1 { font-size: 38px; letter-spacing: -0.5px; margin-bottom: 16px; }
.title p { font-size: 18px; color: #8b949e; line-height: 1.6; }
.dots { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; }
.dots i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #30363d; margin: 0 4px; }
.dots i.on { background: #7c3aed; }
</style></head><body><div id="stage"></div><div class="dots" id="dots"></div>
<script>
const scenes = ${JSON.stringify(scenes, (k, v) => (k === 'highlight' ? undefined : v))};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function find(t) {
  for (let i = 0; i < scenes.length; i++) { if (t < scenes[i].duration) return [i, t]; t -= scenes[i].duration; }
  return [scenes.length - 1, scenes.at(-1).duration];
}
window.render = (t) => {
  const [i, local] = find(t);
  const s = scenes[i];
  const stage = document.getElementById('stage');
  document.getElementById('dots').innerHTML = scenes.map((_, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('');
  if (s.kind === 'title') {
    stage.innerHTML = '<div class="title"><h1>' + s.title + '</h1><p>' + s.sub + '</p></div>';
    return;
  }
  const head = s.kind === 'file' ? s.path : 'terminal';
  let body = '';
  if (s.kind === 'file') {
    // Reveal the file over the first second, then hold.
    const shown = Math.min(s.lines.length, Math.ceil((local / 1.0) * s.lines.length));
    body = s.lines.slice(0, shown).map((l, k) => (s.marks[k] && local > 1.3 ? '<span class="hl">' + esc(l) + '</span>' : esc(l))).join('\\n');
  } else {
    // Type the command, then print the output line by line, keeping the last lines in view.
    const typed = Math.min(s.command.length, Math.floor(local * 22));
    const typing = typed < s.command.length;
    let out = [];
    if (!typing) {
      const start = s.command.length / 22 + 0.3;
      const per = (s.duration - start - 1.6) / s.lines.length;
      const n = Math.max(0, Math.min(s.lines.length, Math.floor((local - start) / per) + 1));
      out = s.lines.slice(0, n).map((l, k) => (s.marks[k] ? '<span class="ok">' + esc(l) + '</span>' : esc(l)));
    }
    const prompt = '<span class="prompt">$</span> ' + esc(s.command.slice(0, typed)) + (typing || out.length === 0 ? '<span class="cursor"> </span>' : '');
    body = [prompt, ...out].slice(-17).join('\\n');
  }
  stage.innerHTML = '<div class="caption"><span class="bar"></span>' + esc(s.caption) + '</div>' +
    '<div class="panel"><div class="head">' + esc(head) + '</div><pre class="' + (s.small ? 'small' : '') + '">' + body + '</pre></div>';
};
render(0);
</script></body></html>`;

writeFileSync(join(HERE, 'player.html'), page);

// --- Record --------------------------------------------------------------------------

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await tab.setContent(page);

const gif = GIFEncoder();
let previous;
let pending; // { data, delay }
const flush = () => {
  if (!pending) return;
  const palette = quantize(pending.data, 128);
  gif.writeFrame(applyPalette(pending.data, palette), WIDTH, HEIGHT, { palette, delay: pending.delay });
};

const frames = Math.ceil(total * FPS);
for (let f = 0; f < frames; f++) {
  await tab.evaluate((t) => window.render(t), f / FPS);
  const png = PNG.sync.read(await tab.screenshot({ type: 'png' }));
  const data = new Uint8Array(png.data);
  if (previous && Buffer.compare(Buffer.from(previous), Buffer.from(data)) === 0) {
    pending.delay += 1000 / FPS; // Same picture: hold the previous frame longer.
    continue;
  }
  flush();
  pending = { data, delay: 1000 / FPS };
  previous = data;
}
flush();
gif.finish();
await browser.close();

const bytes = gif.bytes();
writeFileSync(join(HERE, 'demo.gif'), bytes);
console.log(`Wrote docs/demo/demo.gif: ${total.toFixed(1)}s, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
