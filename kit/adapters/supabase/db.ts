// Database breaks for the mutation runner (e2e/mutations.ts), on a local Supabase
// stack started by the Supabase CLI. Each one reads the object's real definition
// when it applies, and restores exactly that.
//
//   import { dbFunction } from '../kit/adapters/supabase/db.ts';
//   { id: 'no-age-check', covers: 'signup#minimum-age', description: '...',
//     ...dbFunction('complete_signup', "interval '16 years'", "interval '10 years'") }

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inEolOf } from '../../eol.ts';

type Part = { apply: () => void; undo: () => void };

function container(): string {
  const id = /^project_id\s*=\s*["']([^"']+)["']/m.exec(
    readFileSync(process.env.E2E_SUPABASE_CONFIG ?? 'supabase/config.toml', 'utf8'),
  )?.[1];
  if (!id) throw new Error('No project_id in supabase/config.toml');
  return `supabase_db_${id}`;
}

function psql(sql: string): void {
  execFileSync(
    'docker',
    ['exec', '-i', container(), 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: sql, stdio: ['pipe', 'ignore', 'pipe'] },
  );
}

function query(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', container(), 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', sql],
    {
      encoding: 'utf8',
    },
  ).trimEnd();
}

/** Edit a `public` function's source: `find` must occur exactly once. */
export function dbFunction(name: string, find: string, replace: string): Part {
  let original = '';
  return {
    apply() {
      original = query(`select pg_get_functiondef('public.${name}'::regproc)`);
      // Functions created from CRLF migration files keep CRLF in their source.
      const target = inEolOf(original, find);
      const count = original.split(target).length - 1;
      if (count !== 1) throw new Error(`'${find.slice(0, 40)}' occurs ${count} times in ${name}(), expected once`);
      psql(original.replace(target, () => inEolOf(original, replace)) + ';');
    },
    undo() {
      if (original) psql(original + ';');
    },
  };
}

/** Drop an index, and recreate it exactly as it was. */
export function dbDropIndex(name: string): Part {
  let definition = '';
  return {
    apply() {
      definition = query(`select pg_get_indexdef('public.${name}'::regclass)`);
      psql(`drop index public.${name};`);
    },
    undo() {
      if (definition) psql(`${definition};`);
    },
  };
}

/** Drop a check constraint, and restore it. `cleanup` removes rows the break let in, so it can come back. */
export function dbDropConstraint(table: string, name: string, cleanup: string): Part {
  let definition = '';
  return {
    apply() {
      definition = query(`select pg_get_constraintdef(oid) from pg_constraint where conname = '${name}'`);
      psql(`alter table public.${table} drop constraint ${name};`);
    },
    undo() {
      if (definition) psql(`${cleanup}; alter table public.${table} add constraint ${name} ${definition};`);
    },
  };
}

/** A temporary row-level security policy that lets every signed-in user read a table. */
export function dbOpenPolicy(table: string): Part {
  return {
    apply: () => psql(`create policy e2e_mutation on public.${table} for select to authenticated using (true);`),
    undo: () => psql(`drop policy if exists e2e_mutation on public.${table};`),
  };
}

/** Any SQL break with its exact undo, e.g. replacing a policy with a looser one. */
export function dbSql(apply: string, undo: string): Part {
  return { apply: () => psql(apply), undo: () => psql(undo) };
}

/** Several database breaks as one: applied in order, undone in reverse. */
export function db(...parts: Part[]): Part {
  return {
    apply: () => parts.forEach((p) => p.apply()),
    undo: () => [...parts].reverse().forEach((p) => p.undo()),
  };
}
