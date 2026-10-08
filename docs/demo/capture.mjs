// Runs the real commands the demo GIF shows and saves their output to outputs.json.
// Needs the example's Supabase running (npm run example:supabase).
// Run: npm run demo:capture, then npm run demo:build.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

function capture(script) {
  const r = spawnSync('npm', ['run', '--silent', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`npm run ${script} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('npm notice') && !l.startsWith('[WebServer]'));
}

const outputs = {
  test: capture('test'),
  mutate: capture('mutate'),
  exampleMutate: capture('example:mutate'),
  capturedAt: new Date().toISOString(),
};
writeFileSync(join(HERE, 'outputs.json'), JSON.stringify(outputs, null, 2) + '\n');
console.log(
  `Captured: test ${outputs.test.length} lines, mutate ${outputs.mutate.length}, example ${outputs.exampleMutate.length}`,
);
