// Errands: a deliberately small demo app for the kit to test against.
// In-memory store, cookie sessions, no dependencies. Start with `npm run demo`.
//
// When TEST_HOOKS=1 it also exposes /__test__/* endpoints so tests can create
// their own isolated users and data instead of sharing a global fixture.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4173);
const TEST_HOOKS = process.env.TEST_HOOKS === '1';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

/** @type {Map<string, {email: string, password: string, name: string}>} */
const users = new Map();
/** @type {Map<string, string>} session id -> email */
const sessions = new Map();
/** @type {Map<string, {id: string, owner: string, title: string, done: boolean}>} */
const errands = new Map();

users.set('demo@example.com', { email: 'demo@example.com', password: 'demo-password', name: 'Demo' });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function send(res, status, body, headers = {}) {
  const isJson = body !== undefined && typeof body !== 'string';
  res.writeHead(status, { 'content-type': isJson ? 'application/json' : 'text/plain', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function currentUser(req) {
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  const email = sid && sessions.get(sid);
  return email ? users.get(email) : undefined;
}

function listFor(email) {
  return [...errands.values()].filter((e) => e.owner === email).map(({ owner, ...e }) => e);
}

async function api(req, res, path) {
  const method = req.method ?? 'GET';

  if (path === '/api/session' && method === 'POST') {
    const { email, password } = await readJson(req);
    const user = users.get(String(email ?? '').toLowerCase());
    if (!user || user.password !== password) return send(res, 401, { error: 'invalid_credentials' });
    const sid = randomUUID();
    sessions.set(sid, user.email);
    return send(
      res,
      200,
      { email: user.email, name: user.name },
      {
        'set-cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
      },
    );
  }

  if (path === '/api/session' && method === 'DELETE') {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    if (sid) sessions.delete(sid);
    return send(res, 204, '', { 'set-cookie': 'sid=; Path=/; Max-Age=0' });
  }

  const user = currentUser(req);
  if (path === '/api/me')
    return user ? send(res, 200, { email: user.email, name: user.name }) : send(res, 401, { error: 'unauthenticated' });
  if (!user) return send(res, 401, { error: 'unauthenticated' });

  if (path === '/api/errands' && method === 'GET') return send(res, 200, listFor(user.email));

  if (path === '/api/errands' && method === 'POST') {
    const title = String((await readJson(req)).title ?? '').trim();
    if (!title) return send(res, 422, { error: 'title_required' });
    const errand = { id: randomUUID(), owner: user.email, title, done: false };
    errands.set(errand.id, errand);
    return send(res, 201, { id: errand.id, title, done: false });
  }

  const match = /^\/api\/errands\/([\w-]+)$/.exec(path);
  const errand = match && errands.get(match[1]);
  if (match && (!errand || errand.owner !== user.email)) return send(res, 404, { error: 'not_found' });

  if (errand && method === 'PATCH') {
    errand.done = Boolean((await readJson(req)).done);
    return send(res, 200, { id: errand.id, title: errand.title, done: errand.done });
  }
  if (errand && method === 'DELETE') {
    errands.delete(errand.id);
    return send(res, 204, '');
  }

  return send(res, 404, { error: 'not_found' });
}

async function testHooks(req, res, path) {
  if (path === '/__test__/users' && req.method === 'POST') {
    const { email, password, name = 'Test user', errands: titles = [] } = await readJson(req);
    const key = String(email).toLowerCase();
    users.set(key, { email: key, password, name });
    for (const title of titles) {
      const id = randomUUID();
      errands.set(id, { id, owner: key, title, done: false });
    }
    return send(res, 201, { email: key, name });
  }
  if (path === '/__test__/users' && req.method === 'DELETE') {
    const { email } = await readJson(req);
    const key = String(email).toLowerCase();
    users.delete(key);
    for (const [id, e] of errands) if (e.owner === key) errands.delete(id);
    for (const [sid, owner] of sessions) if (owner === key) sessions.delete(sid);
    return send(res, 204, '');
  }
  return send(res, 404, { error: 'not_found' });
}

async function staticFile(res, path) {
  const file = normalize(join(PUBLIC_DIR, path === '/' ? 'index.html' : path));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    send(res, 404, 'not found');
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  try {
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (TEST_HOOKS && path.startsWith('/__test__/')) return await testHooks(req, res, path);
    return await staticFile(res, path);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal' });
  }
}).listen(PORT, () => {
  console.log(`Errands demo on http://localhost:${PORT}${TEST_HOOKS ? ' (test hooks on)' : ''}`);
});
