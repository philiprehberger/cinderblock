-- Cinderblock — security-audit fixes (migrations 0130 soft-delete boundary,
-- 0140 floor/seat advisory lock + reparent guard). Green here = the finding is
-- fixed. Runs after 01_fixture, so the hostile fixture is in scope:
--   archived = bbbb2222-…-005 (soft-deleted); alice = aaaa1111-…-001 owns it.

begin;
select plan(6);

-- ===== 0130: soft-delete boundary closed =====
-- Seed a task into the soft-deleted 'archived' workspace as postgres, then act
-- as alice (its owner). After 0130 she can neither see nor write it, and her own
-- membership row in the dead workspace is hidden.
select tests.reset_auth();
insert into public.tasks (id, workspace_id, title, created_by)
  values ('ffff0000-0000-0000-0000-0000000000b1',
          'bbbb2222-0000-0000-0000-000000000005',
          'ghost-task', 'aaaa1111-0000-0000-0000-000000000001');

select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.tasks
     where workspace_id = 'bbbb2222-0000-0000-0000-000000000005'),
  0, '0130: member of a soft-deleted workspace cannot READ its tasks');

select throws_ok(
  $$ insert into public.tasks (workspace_id, title, created_by)
     values ('bbbb2222-0000-0000-0000-000000000005', 'write-into-dead-ws',
             'aaaa1111-0000-0000-0000-000000000001') $$,
  '42501', null,
  '0130: member cannot WRITE a task into a soft-deleted workspace');

select is(
  (select count(*)::int from public.workspace_members
     where workspace_id = 'bbbb2222-0000-0000-0000-000000000005'
       and user_id = 'aaaa1111-0000-0000-0000-000000000001'),
  0, '0130: member cannot see own membership row in a soft-deleted workspace');
select tests.reset_auth();

-- ===== 0140: advisory-lock serialization present (structural) =====
-- Serial pgtap can't exercise real concurrency; the two-session write-skew is
-- verified out of band. Assert the lock is present so a revert turns this red.
select ok(
  pg_get_functiondef('app_private.enforce_last_owner'::regproc) ilike '%pg_advisory_xact_lock%',
  '0140: enforce_last_owner serializes on an advisory lock (write-skew guard)');
select ok(
  pg_get_functiondef('app_private.enforce_seat_cap'::regproc) ilike '%pg_advisory_xact_lock%',
  '0140: enforce_seat_cap serializes on an advisory lock (write-skew guard)');

-- ===== 0140: workspace_id immutable on a membership row (reparent guard) =====
-- Self-contained: a user who owns two live workspaces cannot move their
-- membership row from one to the other.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values ('aaaa1111-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','reparent@example.test', now(), now());
insert into public.workspaces (id, slug, name, created_by) values
  ('bbbb2222-0000-0000-0000-0000000000a1','reparent-a','A','aaaa1111-0000-0000-0000-0000000000a1'),
  ('bbbb2222-0000-0000-0000-0000000000a2','reparent-b','B','aaaa1111-0000-0000-0000-0000000000a1');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('bbbb2222-0000-0000-0000-0000000000a1','aaaa1111-0000-0000-0000-0000000000a1','owner');
set constraints all immediate;
select throws_ok(
  $$ update public.workspace_members
       set workspace_id = 'bbbb2222-0000-0000-0000-0000000000a2'
     where workspace_id = 'bbbb2222-0000-0000-0000-0000000000a1'
       and user_id = 'aaaa1111-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  '0140: workspace_id is immutable on a membership row (reparent blocked)');

select * from finish();
rollback;
