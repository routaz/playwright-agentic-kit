// Notes: sign up or sign in, choose a username once, keep private notes.
// Plain DOM and supabase-js; all rules that matter are enforced by the database
// (see supabase/migrations), the page only mirrors them.

const { url, anonKey } = await (await fetch('/config.json')).json();
const db = window.supabase.createClient(url, anonKey);
const app = document.getElementById('app');

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

const field = (id, label, type = 'text', extra = {}) => [
  h('label', { for: id }, label),
  h('input', { id, name: id, type, required: true, ...extra }),
];
const errorText = (message) => (message ? h('p', { role: 'alert', class: 'error' }, message) : '');

// --- signed out ---------------------------------------------------------------

function renderSignIn(error, mode = 'sign-in') {
  const signingUp = mode === 'sign-up';
  app.replaceChildren(
    h(
      'form',
      { class: 'card', 'aria-labelledby': 'auth-title', onsubmit: (e) => onAuth(e, mode) },
      h('h1', { id: 'auth-title' }, signingUp ? 'Create an account' : 'Sign in'),
      ...field('email', 'Email', 'email', { autocomplete: 'username' }),
      ...field('password', 'Password', 'password', {
        autocomplete: signingUp ? 'new-password' : 'current-password',
      }),
      errorText(error),
      h('button', { type: 'submit' }, signingUp ? 'Create account' : 'Sign in'),
      h(
        'button',
        { type: 'button', class: 'ghost', onclick: () => renderSignIn(null, signingUp ? 'sign-in' : 'sign-up') },
        signingUp ? 'I already have an account' : 'Create an account',
      ),
    ),
  );
}

async function onAuth(event, mode) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const credentials = { email: String(form.get('email')), password: String(form.get('password')) };
  const { error } =
    mode === 'sign-up' ? await db.auth.signUp(credentials) : await db.auth.signInWithPassword(credentials);
  // One message for every failed sign-in, so it never reveals which accounts exist.
  if (error) return renderSignIn(mode === 'sign-up' ? error.message : 'Wrong email or password.', mode);
  route();
}

// --- onboarding -----------------------------------------------------------------

function renderOnboarding(error) {
  app.replaceChildren(
    h(
      'form',
      { class: 'card', 'aria-labelledby': 'onboarding-title', onsubmit: onChooseUsername },
      h('h1', { id: 'onboarding-title' }, 'Choose a username'),
      ...field('username', 'Username', 'text', { autocomplete: 'off' }),
      h('p', { class: 'muted' }, '3 to 20 characters: a–z, 0–9 and underscore.'),
      errorText(error),
      h('button', { type: 'submit' }, 'Continue'),
    ),
  );
}

async function onChooseUsername(event) {
  event.preventDefault();
  const username = String(new FormData(event.currentTarget).get('username'));
  const { error } = await db.rpc('complete_profile', { chosen_username: username });
  if (error) return renderOnboarding(error.message);
  route();
}

// --- notes ------------------------------------------------------------------------

async function renderNotes(profile, error) {
  const { data: notes } = await db.from('notes').select('id, body').order('created_at');
  const items = (notes ?? []).map((note) =>
    h(
      'li',
      {},
      h('span', {}, note.body),
      h(
        'button',
        {
          type: 'button',
          class: 'ghost',
          'aria-label': `Delete ${note.body}`,
          onclick: async () => {
            await db.from('notes').delete().eq('id', note.id);
            renderNotes(profile);
          },
        },
        '✕',
      ),
    ),
  );
  app.replaceChildren(
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'notes-title' },
      h(
        'header',
        {},
        h('h1', { id: 'notes-title' }, 'Your notes'),
        h('button', { type: 'button', class: 'ghost', onclick: onSignOut }, 'Sign out'),
      ),
      h('p', { class: 'muted' }, `Signed in as @${profile.username}`),
      h(
        'form',
        { class: 'row', onsubmit: (e) => onAddNote(e, profile) },
        h('label', { for: 'new-note', class: 'sr-only' }, 'New note'),
        h('input', { id: 'new-note', name: 'body', placeholder: 'Remember the milk' }),
        h('button', { type: 'submit' }, 'Add'),
      ),
      errorText(error),
      items.length ? h('ul', { 'aria-label': 'Notes' }, ...items) : h('p', { class: 'empty' }, 'No notes yet.'),
    ),
  );
}

async function onAddNote(event, profile) {
  event.preventDefault();
  const body = String(new FormData(event.currentTarget).get('body')).trim();
  if (!body) return renderNotes(profile, 'Write something first.');
  const { error } = await db.from('notes').insert({ body });
  renderNotes(profile, error ? 'That note could not be saved.' : undefined);
}

async function onSignOut() {
  await db.auth.signOut();
  route();
}

// --- routing ----------------------------------------------------------------------

async function route() {
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) return renderSignIn();
  const { data: profile } = await db.from('profiles').select('username').eq('id', session.user.id).maybeSingle();
  if (!profile) return renderOnboarding();
  renderNotes(profile);
}

route();
