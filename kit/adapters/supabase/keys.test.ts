import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeys, storageKey } from './keys.ts';

const status = () => ({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service' });
const noStatus = () => {
  throw new Error('should not be called');
};

describe('supabase keys', () => {
  test('falls back to `supabase status` for the local stack', () => {
    assert.deepEqual(resolveKeys({}, status), {
      url: 'http://127.0.0.1:54321',
      anonKey: 'anon',
      serviceRoleKey: 'service',
    });
  });

  test('prefers the E2E_ environment variables when all are set', () => {
    const env = {
      E2E_SUPABASE_URL: 'http://localhost:9999',
      E2E_SUPABASE_ANON_KEY: 'a',
      E2E_SUPABASE_SERVICE_ROLE_KEY: 's',
    };
    assert.equal(resolveKeys(env, noStatus).url, 'http://localhost:9999');
  });

  test('refuses a hosted project', () => {
    const env = {
      E2E_SUPABASE_URL: 'https://abcd.supabase.co',
      E2E_SUPABASE_ANON_KEY: 'a',
      E2E_SUPABASE_SERVICE_ROLE_KEY: 's',
    };
    assert.throws(() => resolveKeys(env, noStatus), /only run against local Supabase.*not abcd\.supabase\.co/);
  });

  test('allows another host only when listed explicitly', () => {
    const env = {
      E2E_SUPABASE_URL: 'http://supabase.test:8000',
      E2E_SUPABASE_ANON_KEY: 'a',
      E2E_SUPABASE_SERVICE_ROLE_KEY: 's',
    };
    assert.throws(() => resolveKeys(env, noStatus));
    assert.equal(resolveKeys(env, noStatus, ['supabase.test']).url, 'http://supabase.test:8000');
  });

  test('derives supabase-js storage keys like supabase-js does', () => {
    assert.equal(storageKey('http://127.0.0.1:54321'), 'sb-127-auth-token');
    assert.equal(storageKey('https://abcd.supabase.co'), 'sb-abcd-auth-token');
  });
});
