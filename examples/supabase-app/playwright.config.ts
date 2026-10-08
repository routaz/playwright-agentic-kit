import { defineKitConfig } from '../../kit';
import { localSupabase } from '../../kit/adapters/supabase/keys.ts';

// The example's own local Supabase (ports 553xx, see supabase/config.toml).
// Run everything from this folder: `npm run example:test` does.
const { url, anonKey } = localSupabase();

// Mutation runs get their own port, so they never reuse a server holding old code.
const PORT = process.env.E2E_FRESH_SERVER ? 4176 : 4175;

export default defineKitConfig({
  baseURL: `http://127.0.0.1:${PORT}`,
  webServer: {
    command: 'node server.mjs',
    env: { PORT: String(PORT), SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey },
  },
  mobile: true,
  overrides: { globalSetup: './e2e/support/global-setup.ts' },
});
