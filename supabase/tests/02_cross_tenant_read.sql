-- Cinderblock — Category 1: Cross-tenant read attacks.
--
-- Every test here authenticates as a user with no business reading a given
-- workspace's data, attempts the read, and asserts an empty result. The
-- *positive* assertion is that zero rows come back — a regression that lets
-- one row through fails the test loudly.
--
-- Note: `supabase test db` runs each file as a separate psql session against
-- a single db. The fixture from 01_fixture.sql persists across files because
-- pg_prove does not transaction-wrap. State leaks across files are a known
-- gotcha; tests should not mutate data they don't own.

begin;

select plan(12);

-- ------------------------------------------------------------------
-- 1) Bob (acme admin + solo-co owner, NOT in bigco) cannot read bigco's tasks.
--    Alice is a bigco member in the fixture, so she's the wrong attacker here —
--    cross-tenant means "user with no membership in target workspace."
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);
select results_eq(
  $$ select count(*)::int from public.tasks where workspace_id = 'bbbb2222-0000-0000-0000-000000000002'::uuid $$,
  array[0],
  'cross-tenant read denied: bob (acme admin, not bigco) cannot count bigco tasks'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 2) Alice cannot read bigco's audit log (she IS a member of bigco,
--    but only as a member — should only see her own actor rows).
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $$ select count(*)::int from public.audit_events
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000002'::uuid
        and actor_id <> 'aaaa1111-0000-0000-0000-000000000001'::uuid $$,
  array[0],
  'partial-tenant audit: alice as bigco member sees zero non-self events'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 3) Hostile@ (no memberships anywhere) sees no workspaces at all.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000008'::uuid);
select results_eq(
  $$ select count(*)::int from public.workspaces $$,
  array[0],
  'outsider read: hostile@ sees zero workspaces'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 4) Hostile@ sees no tasks.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000008'::uuid);
select results_eq(
  $$ select count(*)::int from public.tasks $$,
  array[0],
  'outsider read: hostile@ sees zero tasks'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 5) Hostile@ sees no members.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000008'::uuid);
select results_eq(
  $$ select count(*)::int from public.workspace_members $$,
  array[0],
  'outsider read: hostile@ sees zero members'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 6) Anonymous (unauthenticated) sees nothing.
-- ------------------------------------------------------------------
select tests.authenticate_as_anon();
select results_eq(
  $$ select count(*)::int from public.workspaces $$,
  array[0],
  'anon read: anonymous request sees zero workspaces'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 7) Soft-deleted workspace (archived) is invisible to its own owner.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $$ select count(*)::int from public.workspaces where id = 'bbbb2222-0000-0000-0000-000000000005'::uuid $$,
  array[0],
  'soft-delete: archived workspace is invisible even to its owner'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 8) Guests cannot see audit events at all.
-- ------------------------------------------------------------------
-- Dave is a guest in acme. He should see zero acme audit events.
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000004'::uuid);
select results_eq(
  $$ select count(*)::int from public.audit_events where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid $$,
  array[0],
  'guest read: dave (acme guest) sees zero audit events'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 9) Member sees only their own actor audit events (not others').
-- ------------------------------------------------------------------
-- Carol is a member in acme. She should see only audit_events.actor_id = carol.
-- Bob is admin in acme and authored events too — carol should NOT see those.
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000003'::uuid);
select results_eq(
  $$ select count(*)::int from public.audit_events
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
        and actor_id <> 'aaaa1111-0000-0000-0000-000000000003'::uuid $$,
  array[0],
  'member read: carol (acme member) sees zero non-self audit events'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 10) A no-WHERE-clause SELECT * from tasks returns only own-workspace rows.
--     (catches a regression that adds a `using (true)` policy.)
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
-- Bob is in acme (admin) and solo-co (owner). He should NOT see bigco/holdings tasks.
select results_eq(
  $$ select count(*)::int from public.tasks
      where workspace_id not in (
        'bbbb2222-0000-0000-0000-000000000001'::uuid,  -- acme
        'bbbb2222-0000-0000-0000-000000000003'::uuid   -- solo-co
      ) $$,
  array[0],
  'no-filter scan: bob sees no tasks outside acme + solo-co'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 11) Hostile@ cannot see invitation rows.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000008'::uuid);
select results_eq(
  $$ select count(*)::int from public.workspace_invitations $$,
  array[0],
  'outsider read: hostile@ sees zero invitations'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 12) Hostile@ cannot see subscription rows.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000008'::uuid);
select results_eq(
  $$ select count(*)::int from public.subscriptions $$,
  array[0],
  'outsider read: hostile@ sees zero subscriptions'
);
select tests.reset_auth();

select * from finish();

rollback;
