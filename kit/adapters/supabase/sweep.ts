// Global setup that removes test users left behind by runs that never got to clean up,
// typically an agent session that ended while paused inside a seed.
//
//   // e2e/support/global-setup.ts
//   export default sweepStaleTestUsers();
//
//   // playwright.config.ts, in defineKitConfig({ overrides: { globalSetup: './e2e/support/global-setup.ts' } })

import { localSupabase } from './keys.ts';

export interface SweepOptions {
  /** Only users older than this are removed, so a run or agent still in progress is never touched. */
  olderThanMs?: number;
  /** Test users' emails start with this (see `uniqueEmail`). */
  emailPrefix?: string;
  allowedHosts?: string[];
}

export function sweepStaleTestUsers({
  olderThanMs = 2 * 60 * 60 * 1000,
  emailPrefix = 'e2e-',
  allowedHosts,
}: SweepOptions = {}) {
  return async function sweep(): Promise<void> {
    const { url, serviceRoleKey } = localSupabase(allowedHosts);
    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;
    for (let page = 1; ; page++) {
      const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=500`, { headers });
      if (!res.ok) throw new Error(`Listing users failed: ${res.status} ${await res.text()}`);
      const { users } = (await res.json()) as { users: { id: string; email?: string; created_at: string }[] };
      for (const u of users) {
        if (!u.email?.startsWith(emailPrefix) || Date.parse(u.created_at) > cutoff) continue;
        const del = await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers });
        if (del.ok || del.status === 404) removed++;
      }
      if (users.length < 500) break;
    }
    if (removed) console.log(`Removed ${removed} stale test user(s) from earlier runs.`);
  };
}
