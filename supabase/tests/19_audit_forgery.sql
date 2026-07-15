-- Cinderblock — audit-event forgery guard (migration 0170). Green = fixed.
-- Tests the validating definer function directly (pgtap runs as postgres, the
-- function owner). The cb_audit_writer grant changes are covered in 07.
--   acme = bbbb2222-…-001; alice = aaaa1111-…-001 is a member; hostile = …-008 is not.

begin;
select plan(3);

-- a legit member actor writes fine
select isnt(
  app_private.write_audit_event(
    'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001',
    null, 'test.legit', null, null, null, null, null),
  null, '0170: a member actor can write an audit event for their workspace');

-- a cross-tenant forged actor is rejected (hostile is not a member of acme)
select throws_ok(
  $$ select app_private.write_audit_event(
       'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000008',
       null, 'test.forge', null, null, null, null, null) $$,
  '23514', null,
  '0170: an actor not associated with the workspace is rejected (forgery blocked)');

-- the workspace creator (even if not a member row yet) is allowed — covers the
-- workspace-creation event so the guard doesn't break legit writes.
select tests.reset_auth();
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values ('aaaa1111-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','creator-e@example.test', now(), now());
insert into public.workspaces (id, slug, name, created_by)
  values ('bbbb2222-0000-0000-0000-0000000000e1','audit-e','AuditE','aaaa1111-0000-0000-0000-0000000000e1');
select isnt(
  app_private.write_audit_event(
    'bbbb2222-0000-0000-0000-0000000000e1', 'aaaa1111-0000-0000-0000-0000000000e1',
    null, 'workspace.created', null, null, null, null, null),
  null, '0170: the workspace creator can write even without a membership row');

select * from finish();
rollback;
