-- Cinderblock — Category 15: Last-owner trigger invariants.
--
-- The trigger in migration 0070 fires after UPDATE or DELETE on
-- workspace_members and refuses to leave a non-soft-deleted workspace
-- with zero active owners. It's deferred so an atomic promote+demote
-- in a single transaction works in production; pgtap forces the
-- constraint immediate so the exception fires inside the test session.
--
-- The fixture (01_fixture.sql) places each active workspace with exactly
-- one owner, so the simple "demote the only owner" assertion works
-- against the seed without any extra setup.

begin;

select plan(6);

-- ------------------------------------------------------------------
-- Setup: force the trigger to fire immediately so throws_ok can catch
-- the raised exception inside this transaction. Pgtap's begin/rollback
-- envelope never commits, so a deferred constraint trigger would never
-- fire without this. The 12_billing.sql tests use the same pattern.
-- ------------------------------------------------------------------
set constraints workspace_members_last_owner immediate;

-- ------------------------------------------------------------------
-- 1) Demoting the last owner raises 23514.
--    acme has exactly one owner (alice). Demoting her to admin would
--    leave acme without any active owners → trigger refuses.
-- ------------------------------------------------------------------
select throws_ok(
  $$ update public.workspace_members
        set role = 'admin'
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
        and user_id      = 'aaaa1111-0000-0000-0000-000000000001'::uuid $$,
  '23514',
  null,
  'last-owner: demoting acme''s only owner (alice) raises check_violation'
);

-- ------------------------------------------------------------------
-- 2) Soft-removing the last owner raises 23514.
--    Same workspace, same owner, but the mutation is `removed_at` rather
--    than `role` — the trigger keys off the active-owner count, so it
--    has to catch this too.
-- ------------------------------------------------------------------
select throws_ok(
  $$ update public.workspace_members
        set removed_at = now()
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
        and user_id      = 'aaaa1111-0000-0000-0000-000000000001'::uuid $$,
  '23514',
  null,
  'last-owner: soft-removing acme''s only owner (alice) raises check_violation'
);

-- ------------------------------------------------------------------
-- 3) Soft-deleted workspaces are exempt — alice owns `archived`, but
--    `archived` was soft-deleted at the end of the fixture
--    (deleted_at IS NOT NULL). Demoting her there must succeed
--    because the trigger short-circuits on soft-deleted workspaces.
-- ------------------------------------------------------------------
select lives_ok(
  $$ update public.workspace_members
        set role = 'admin'
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000005'::uuid
        and user_id      = 'aaaa1111-0000-0000-0000-000000000001'::uuid $$,
  'last-owner: demoting alice in soft-deleted `archived` workspace is allowed'
);

-- ------------------------------------------------------------------
-- 4) Atomic transfer of ownership inside a single statement.
--    Promote bob (acme admin → owner), then demote alice (acme owner →
--    admin). With the constraint immediate, each statement runs the
--    trigger separately; the post-state of statement 1 already has two
--    active owners (alice + bob), so statement 2 sees one remaining.
--    This proves the "always at least one owner" invariant doesn't
--    block legitimate transfers — the order matters but the result is
--    a clean handoff.
-- ------------------------------------------------------------------
select lives_ok(
  $$ update public.workspace_members
        set role = 'owner'
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
        and user_id      = 'aaaa1111-0000-0000-0000-000000000002'::uuid;

     update public.workspace_members
        set role = 'admin'
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
        and user_id      = 'aaaa1111-0000-0000-0000-000000000001'::uuid $$,
  'last-owner: promote-then-demote transfer of ownership succeeds'
);

-- Confirm the post-state is "exactly one active owner" — proves the
-- two statements actually committed their effect, not just that the
-- trigger silently swallowed them.
select is(
  (select count(*)::int from public.workspace_members
    where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
      and role         = 'owner'
      and removed_at is null),
  1,
  'last-owner: transfer leaves acme with exactly one active owner (bob)'
);

-- Roll the transfer back so subsequent assertions see the fixture's
-- original membership. (Pgtap's outer ROLLBACK at end-of-file does the
-- same, but explicit reset makes failures readable when an assertion
-- below this point fires.)
update public.workspace_members
   set role = 'owner'
 where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
   and user_id      = 'aaaa1111-0000-0000-0000-000000000001'::uuid;
update public.workspace_members
   set role = 'admin'
 where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid
   and user_id      = 'aaaa1111-0000-0000-0000-000000000002'::uuid;

-- ------------------------------------------------------------------
-- 5) Bulk demote across all owners of a workspace raises 23514.
--    Wrapping a multi-row UPDATE in the constraint-immediate envelope
--    is the bug-class the trigger has to catch: a developer who writes
--    `update workspace_members set role = 'admin' where workspace_id =
--    X` without thinking about owners gets stopped, not silently
--    obeyed.
-- ------------------------------------------------------------------
select throws_ok(
  $$ update public.workspace_members
        set role = 'admin'
      where workspace_id = 'bbbb2222-0000-0000-0000-000000000003'::uuid
        and role         = 'owner' $$,
  '23514',
  null,
  'last-owner: bulk-demoting every owner of solo-co raises check_violation'
);

set constraints workspace_members_last_owner deferred;

select * from finish();
rollback;
