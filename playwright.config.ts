import { defineKitConfig } from './kit';

export default defineKitConfig({
  baseURL: 'http://localhost:4173',
  webServer: {
    command: 'node examples/demo-app/server.mjs',
    env: { PORT: '4173', TEST_HOOKS: '1' },
  },
  mobile: true,
});
