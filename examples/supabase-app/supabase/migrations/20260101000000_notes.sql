-- The example app: people choose a username once, then keep private notes.
-- Small, but with the parts real Supabase apps have and tests should prove:
-- an onboarding function, row-level security, and checks enforced by the database.

-- Profiles: created only through complete_profile(), one per account.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_key unique (username),
  constraint profiles_username_shape check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Onboarding. Usernames are stored lowercase, whatever the person typed.
-- Refusals use P0001 (HTTP 400), not no_data_found, which PostgREST reports as a 500.
create function public.complete_profile(chosen_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  handle text := lower(btrim(coalesce(chosen_username, '')));
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3 to 20 characters: a-z, 0-9 and underscore' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, username) values (me, handle);
exception
  when unique_violation then
    raise exception 'That username is taken' using errcode = 'P0001';
end;
$$;

revoke all on function public.complete_profile(text) from public, anon;
grant execute on function public.complete_profile(text) to authenticated;

-- Notes: private to their owner, never blank.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint notes_body_not_blank check (char_length(btrim(body)) between 1 and 500)
);

create index notes_owner_idx on public.notes (owner, created_at);

alter table public.notes enable row level security;

create policy "read own notes" on public.notes
  for select to authenticated using (owner = (select auth.uid()));
create policy "add own notes" on public.notes
  for insert to authenticated with check (owner = (select auth.uid()));
create policy "delete own notes" on public.notes
  for delete to authenticated using (owner = (select auth.uid()));
