// Where the Supabase project is, and the guard that keeps tests away from hosted ones.

import { failure, npx } from '../../run.ts';

export interface SupabaseKeys {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/** Hosts tests may create and delete accounts on. Anything else is refused. */
export const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * Resolve the keys from E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY /
 * E2E_SUPABASE_SERVICE_ROLE_KEY, falling back to `supabase status` for the local stack.
 * Throws for a host not in `allowedHosts`: tests create and delete accounts.
 */
export function resolveKeys(
  env: Record<string, string | undefined>,
  status: () => Record<string, string>,
  allowedHosts: string[] = LOCAL_HOSTS,
): SupabaseKeys {
  let { E2E_SUPABASE_URL: url, E2E_SUPABASE_ANON_KEY: anonKey, E2E_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey } = env;
  if (!url || !anonKey || !serviceRoleKey) {
    const s = status();
    url ??= s.API_URL;
    anonKey ??= s.ANON_KEY;
    serviceRoleKey ??= s.SERVICE_ROLE_KEY;
  }
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase URL or keys missing.');
  const host = new URL(url).hostname;
  if (!allowedHosts.includes(host)) {
    throw new Error(
      `E2E tests create and delete accounts, so they only run against local Supabase (${allowedHosts.join(', ')}), not ${host}.`,
    );
  }
  return { url, anonKey, serviceRoleKey };
}

/** `npx supabase status -o json`, with an error that says why it failed. */
export function supabaseStatus(): Record<string, string> {
  const result = npx(['supabase', 'status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let cause = failure(result);
  if (result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (e) {
      cause = `unreadable output: ${(e as Error).message}`;
    }
  }
  throw new Error(
    `Couldn't read the local Supabase keys with \`npx supabase status\` (${cause}).\n` +
      'If the stack is stopped, start it with `npx supabase start`. Or set E2E_SUPABASE_URL, ' +
      'E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_ROLE_KEY.',
    { cause: result.error },
  );
}

let cached: SupabaseKeys | undefined;

/** The local project's keys, resolved once per process. */
export function localSupabase(allowedHosts?: string[]): SupabaseKeys {
  cached ??= resolveKeys(process.env, supabaseStatus, allowedHosts);
  return cached;
}

/** supabase-js's default session storage key: `sb-<first label of the API host>-auth-token`. */
export function storageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}
