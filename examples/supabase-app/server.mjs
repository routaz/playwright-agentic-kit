// Static server for the Supabase example. Serves the page, supabase-js from
// node_modules, and /config.json with the Supabase URL and anon key from the
// environment. No build step.
//
// SUPABASE_URL=… SUPABASE_ANON_KEY=… PORT=4175 node examples/supabase-app/server.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const PORT = Number(process.env.PORT ?? 4175);
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const SUPABASE_JS = createRequire(import.meta.url).resolve('@supabase/supabase-js/dist/umd/supabase.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const config = JSON.stringify({ url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY });
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (see `npx supabase status` in examples/supabase-app).');
  process.exit(1);
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  try {
    if (path === '/config.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(config);
    }
    if (path === '/vendor/supabase.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(await readFile(SUPABASE_JS));
    }
    // A single-page app: anything that isn't a file gets index.html.
    const file = normalize(join(PUBLIC_DIR, extname(path) ? path : 'index.html'));
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => console.log(`Notes example on http://127.0.0.1:${PORT}`));
