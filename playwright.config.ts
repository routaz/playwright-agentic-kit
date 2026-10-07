import { defineKitConfig } from './kit';

// Mutation runs (E2E_FRESH_SERVER) get their own port, so they never collide with
// a server an agent session or another run is keeping alive on the usual one.
const PORT = process.env.E2E_FRESH_SERVER ? 4174 : 4173;

export default defineKitConfig({
  baseURL: `http://localhost:${PORT}`,
  webServer: {
    command: 'node examples/demo-app/server.mjs',
    env: { PORT: String(PORT), TEST_HOOKS: '1' },
  },
  mobile: true,
});
