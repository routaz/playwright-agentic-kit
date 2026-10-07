// Errands front end: plain DOM, hash routes (#/login, #/errands).
const app = document.getElementById('app');

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  return { ok: res.ok, status: res.status, data };
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...children);
  return el;
}

function renderLogin(error) {
  const form = h(
    'form',
    { class: 'card', 'aria-labelledby': 'login-title', onsubmit: onLogin },
    h('h1', { id: 'login-title' }, 'Sign in'),
    h('label', { for: 'email' }, 'Email'),
    h('input', { id: 'email', name: 'email', type: 'email', autocomplete: 'username', required: true }),
    h('label', { for: 'password' }, 'Password'),
    h('input', { id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true }),
    error ? h('p', { role: 'alert', class: 'error' }, error) : '',
    h('button', { type: 'submit' }, 'Sign in'),
  );
  app.replaceChildren(form);
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const res = await call('POST', '/api/session', { email: form.get('email'), password: form.get('password') });
  if (!res.ok) return renderLogin('Wrong email or password.');
  location.hash = '#/errands';
}

async function renderErrands() {
  const [me, list] = await Promise.all([call('GET', '/api/me'), call('GET', '/api/errands')]);
  if (!me.ok) return void (location.hash = '#/login');

  const left = list.data.filter((e) => !e.done).length;
  const items = list.data.map((e) =>
    h(
      'li',
      { class: e.done ? 'done' : '' },
      h('input', {
        type: 'checkbox',
        id: `e-${e.id}`,
        checked: e.done,
        onchange: async (ev) => {
          await call('PATCH', `/api/errands/${e.id}`, { done: ev.target.checked });
          renderErrands();
        },
      }),
      h('label', { for: `e-${e.id}` }, e.title),
      h(
        'button',
        {
          type: 'button',
          class: 'ghost',
          'aria-label': `Delete ${e.title}`,
          onclick: async () => {
            await call('DELETE', `/api/errands/${e.id}`);
            renderErrands();
          },
        },
        '✕',
      ),
    ),
  );

  app.replaceChildren(
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'errands-title' },
      h(
        'header',
        {},
        h('h1', { id: 'errands-title' }, 'Your errands'),
        h('button', { type: 'button', class: 'ghost', onclick: onLogout }, 'Sign out'),
      ),
      h('p', { class: 'muted' }, `Signed in as ${me.data.name}`),
      h(
        'form',
        { class: 'row', onsubmit: onAdd },
        h('label', { for: 'new-errand', class: 'sr-only' }, 'New errand'),
        h('input', { id: 'new-errand', name: 'title', placeholder: 'Buy milk' }),
        h('button', { type: 'submit' }, 'Add'),
      ),
      items.length ? h('ul', { 'aria-label': 'Errands' }, ...items) : h('p', { class: 'empty' }, 'Nothing to do. Nice.'),
      h('p', { role: 'status' }, left === 1 ? '1 errand left' : `${left} errands left`),
    ),
  );
}

async function onAdd(event) {
  event.preventDefault();
  const input = event.currentTarget.elements.title;
  const res = await call('POST', '/api/errands', { title: input.value });
  if (res.ok) renderErrands();
}

async function onLogout() {
  await call('DELETE', '/api/session');
  location.hash = '#/login';
}

function route() {
  if (location.hash === '#/errands') renderErrands();
  else renderLogin();
}

window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/errands';
else route();
