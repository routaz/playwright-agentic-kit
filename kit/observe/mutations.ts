// Declaring the breaks ("mutations") that prove a project's tests can fail.
// A project lists them in e2e/mutations.ts:
//
//   export default defineMutations([
//     {
//       id: 'privacy-filter-removed',
//       covers: 'errands#private-lists',
//       description: 'The server returns every user's errands',
//       edits: [{ file: 'server.mjs', find: 'e.owner === email', replace: 'true' }],
//     },
//   ]);
//
// `npm run mutate` applies each one, runs only the tests whose covers annotation
// matches, expects at least one to fail, and restores the original.

export interface Edit {
  /** Path relative to the working directory. */
  file: string;
  /** Exact text that must occur once in the file. */
  find: string;
  replace: string;
}

export interface Mutation {
  /** Short, unique slug. */
  id: string;
  /** Context id(s) this break violates. Tests covering any of them are run. */
  covers: string | string[];
  /** What the break does, in plain words: shown in the report. */
  description: string;
  /** Text edits to app files. Restored from a journal even if the run is interrupted. */
  edits?: Edit[];
  /** For breaks outside files (a database, a feature flag): change it here... */
  apply?: () => void | Promise<void>;
  /** ...and put it back here. Called even when the tests fail or crash. */
  undo?: () => void | Promise<void>;
}

export function defineMutations(mutations: Mutation[]): Mutation[] {
  const ids = new Set<string>();
  for (const m of mutations) {
    if (ids.has(m.id)) throw new Error(`Duplicate mutation id "${m.id}"`);
    ids.add(m.id);
    if (!m.edits?.length && !m.apply) throw new Error(`Mutation "${m.id}" has neither edits nor apply()`);
    if (m.apply && !m.undo) throw new Error(`Mutation "${m.id}" has apply() but no undo()`);
  }
  return mutations;
}
