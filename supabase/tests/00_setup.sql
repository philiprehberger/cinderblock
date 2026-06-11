-- Cinderblock — pgtap test harness.
--
-- supabase test db runs every file in supabase/tests/ in alphabetical order
-- against a freshly-migrated database. This file defines the harness used by
-- every subsequent test:
--   tests.authenticate_as(_user_id)  — switch to `authenticated` role + set JWT claims
--   tests.authenticate_as_anon()     — switch to `anon` role + clear claims
--   tests.reset_auth()               — switch back to postgres (bypass RLS)
--
-- Why this matters: pgtap by default runs as `postgres`, which has BYPASSRLS.
-- Setting request.jwt.claims without ALSO switching the role does nothing —
-- every "cross-tenant attack denied" test passes trivially and proves nothing.
-- The harness sets both, and 08_harness_meta.sql proves it.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to postgres, anon, authenticated, service_role;

-- Switch to the `authenticated` role and embed the JWT claims PostgREST sets
-- on every request. We set both `request.jwt.claims` (the new JSON form
-- consumed by current Supabase Auth) and `request.jwt.claim.sub` (the older
-- per-claim form some auth.uid() implementations still read) so the suite
-- isn't tied to a single auth.uid() version.
create or replace function tests.authenticate_as(_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', _user_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', _user_id::text, true);
end;
$$;

create or replace function tests.authenticate_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function tests.reset_auth() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Test fixture user. The minimum auth.users insert needed to satisfy FK
-- references from workspaces.created_by etc. Real fixtures (5 workspaces × 8
-- users) land in Phase 2; this is the bare minimum the meta-test needs.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'meta@example.test',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
) on conflict (id) do nothing;

-- pg_prove (the runner behind `supabase test db`) treats every file in
-- tests/ as a TAP-producing test, and pgtap's finish() raises when zero
-- assertions ran. Emit a single trivial pass so this setup file registers
-- as 1/1 and the suite total isn't muddied.
select plan(1);
select pass('cinderblock test harness loaded');
select * from finish();
