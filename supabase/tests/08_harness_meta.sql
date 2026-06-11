-- Cinderblock — Harness meta-tests.
--
-- These tests don't exercise application policies — they prove the harness
-- itself works. Without these, every other test in the suite could silently
-- pass and prove nothing (e.g. if tests.authenticate_as forgot to set the
-- role, every "RLS denied this read" assertion would pass because postgres
-- has BYPASSRLS).
--
-- If these tests fail, do not trust the rest of the suite until they pass.

begin;

select plan(7);

-- 1) The harness functions exist.
select has_function(
  'tests'::name, 'authenticate_as'::name, array['uuid']::name[],
  'tests.authenticate_as(uuid) exists'
);

select has_function(
  'tests'::name, 'authenticate_as_anon'::name, array[]::name[],
  'tests.authenticate_as_anon() exists'
);

select has_function(
  'tests'::name, 'reset_auth'::name, array[]::name[],
  'tests.reset_auth() exists'
);

-- 2) Authenticating sets auth.uid() to the given UUID.
select tests.authenticate_as('00000000-0000-0000-0000-000000000001'::uuid);

select is(
  auth.uid(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'authenticate_as sets auth.uid() to the supplied id'
);

-- 3) Authenticating switches the current_role to `authenticated`.
select is(
  current_setting('role'),
  'authenticated',
  'authenticate_as switches role to authenticated (so RLS actually applies)'
);

select tests.reset_auth();

-- 4) Anonymous auth: auth.uid() is null + role is anon.
select tests.authenticate_as_anon();

select is(
  auth.uid(),
  null::uuid,
  'authenticate_as_anon makes auth.uid() return null'
);

select is(
  current_setting('role'),
  'anon',
  'authenticate_as_anon switches role to anon'
);

select tests.reset_auth();

-- Roll back so the auth.users insert from 00_setup.sql doesn't leak into
-- subsequent test files. Supabase's `supabase test db` wraps each file in a
-- transaction by convention, but the explicit rollback makes the contract
-- visible.
select * from finish();

rollback;
