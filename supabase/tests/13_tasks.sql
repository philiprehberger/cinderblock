-- Cinderblock — Category 13: Task surface (write + delete + writability gates).
--
-- The cross-tenant READ side of tasks is already covered in
-- 02_cross_tenant_read.sql (test 1 + test 10). These tests round out the
-- write surface:
--   - Member can create a task (positive control)
--   - Guest CANNOT create a task (role gate)
--   - Member CANNOT delete a task (admin+ only)
--   - Admin CAN delete (positive control via the policy)
--   - Past-due-beyond-grace workspace refuses INSERT (workspace_is_writable)

begin;

select plan(5);

-- ------------------------------------------------------------------
-- 1) Member can create a task in their own workspace.
--    Carol is acme member; she should be able to insert with
--    created_by=carol into acme.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000003'::uuid);
select lives_ok(
  $$ insert into public.tasks (workspace_id, title, created_by)
     values
       ('bbbb2222-0000-0000-0000-000000000001'::uuid,
        'carol-positive-control',
        'aaaa1111-0000-0000-0000-000000000003'::uuid) $$,
  'member positive control: carol can insert into her own workspace'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 2) Guest CANNOT create a task (role gate).
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000004'::uuid);
select throws_ok(
  $$ insert into public.tasks (workspace_id, title, created_by)
     values
       ('bbbb2222-0000-0000-0000-000000000001'::uuid,
        'dave-guest-block',
        'aaaa1111-0000-0000-0000-000000000004'::uuid) $$,
  '42501',
  null,
  'role gate: guest cannot insert tasks (RLS WITH CHECK denies)'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 3) Member CANNOT delete a task (policy gates DELETE on admin+).
--    Carol's DELETE is a 0-row-affected no-op, not an error — the policy
--    USING clause silently filters rows the caller can't see for DELETE.
--    Verify the task still exists.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000003'::uuid);
delete from public.tasks where id = 'cccc3333-0000-0000-0001-000000000001'::uuid;
select tests.reset_auth();
select is(
  (select count(*)::int from public.tasks
    where id = 'cccc3333-0000-0000-0001-000000000001'::uuid),
  1,
  'role gate: member DELETE is filtered (row survives)'
);

-- ------------------------------------------------------------------
-- 4) Admin CAN delete (positive control).
--    Bob is acme admin. His DELETE on the same task succeeds. Use a
--    fresh test task so the cleanup of test 3 doesn't bleed in.
-- ------------------------------------------------------------------
insert into public.tasks (id, workspace_id, title, created_by, status)
  values (
    'eeee0000-0000-0000-0000-000000000001'::uuid,
    'bbbb2222-0000-0000-0000-000000000001'::uuid,
    'admin-delete-target',
    'aaaa1111-0000-0000-0000-000000000001'::uuid,
    'todo'
  );

select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);
delete from public.tasks where id = 'eeee0000-0000-0000-0000-000000000001'::uuid;
select tests.reset_auth();
select is(
  (select count(*)::int from public.tasks
    where id = 'eeee0000-0000-0000-0000-000000000001'::uuid),
  0,
  'admin positive control: bob can DELETE acme tasks'
);

-- ------------------------------------------------------------------
-- 5) Past-due-beyond-grace workspace refuses task INSERT.
--    Bob is solo-co owner; solo-co was seeded past_due with
--    current_period_end 10 days ago (beyond the 7-day grace).
--    workspace_is_writable returns false → tasks_insert WITH CHECK fails.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);
select throws_ok(
  $$ insert into public.tasks (workspace_id, title, created_by)
     values
       ('bbbb2222-0000-0000-0000-000000000003'::uuid,
        'past-due-block',
        'aaaa1111-0000-0000-0000-000000000002'::uuid) $$,
  '42501',
  null,
  'writability gate: past-due-beyond-grace workspace refuses task INSERT'
);
select tests.reset_auth();

select * from finish();

rollback;
