// Validate every e2e/context/*.yaml against its schema.
// Usage: node kit/context/check.ts [dir]   (Node 22.18+ runs TypeScript directly)

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Ajv } from 'ajv';
import { parse } from 'yaml';

const dir = resolve(process.argv[2] ?? 'e2e/context');
const schemaDir = new URL('.', import.meta.url);

const ajv = new Ajv({ allErrors: true });
const validateApp = ajv.compile(JSON.parse(await readFile(new URL('app.schema.json', schemaDir), 'utf8')));
const validateFeature = ajv.compile(JSON.parse(await readFile(new URL('feature.schema.json', schemaDir), 'utf8')));

const files = (await readdir(dir)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
let failed = 0;

if (!files.includes('app.yaml')) {
  console.error(`✗ ${join(dir, 'app.yaml')} is missing. Every project needs one app context.`);
  failed++;
}

for (const file of files) {
  const doc = parse(await readFile(join(dir, file), 'utf8'));
  const validate = file === 'app.yaml' ? validateApp : validateFeature;
  if (validate(doc)) {
    console.log(`✓ ${file}`);
    continue;
  }
  failed++;
  console.error(`✗ ${file}`);
  for (const err of validate.errors ?? []) console.error(`    ${err.instancePath || '/'} ${err.message}`);
}

if (failed) process.exit(1);
