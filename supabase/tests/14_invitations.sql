-- Cinderblock — Category 14: Invitation-flow invariants.
--
-- The Edge Function code paths for invite-create and invite-accept enforce
-- "already a member" / "already invited" / "wrong role" checks. These pgtap
-- tests cover the DB-level invariants those flows rest on:
--   1. Partial unique index allows MULTIPLE pending invites for the same
--      email when scoped to DIFFERENT workspaces.
--   2. Partial unique index rejects a SECOND pending invite for the same
--      (workspace, email) pair.
--   3. The role CHECK rejects an 'owner' invite — owners are promoted from
--      existing members, never invited directly.
--   4. workspace_members PK rejects double-acceptance under the same
--      (workspace, user) pair.
--   5. Soft-deleted workspace cascades — invitations to the workspace are
--      gone after the workspace is hard-deleted.

begin;

select plan(5);

-- ------------------------------------------------------------------
-- 1) Multiple pending invites for the same email across DIFFERENT
--    workspaces are allowed.
-- ------------------------------------------------------------------
insert into public.workspace_invitations
  (workspace_id, email, role, invited_by, token_hash, expires_at)
values
  ('bbbb2222-0000-0000-0000-000000000001'::uuid,
   'cross-ws-invite@example.test', 'member',
   'aaaa1111-0000-0000-0000-000000000001'::uuid,
   decode('aa','hex') || gen_random_bytes(31),
   now() + interval '5 days'),
  ('bbbb2222-0000-0000-0000-000000000002'::uuid,
   'cross-ws-invite@example.test', 'guest',
   'aaaa1111-0000-0000-0000-000000000005'::uuid,
   decode('bb','hex') || gen_random_bytes(31),
   now() + interval '5 days');

select is(
  (select count(*)::int from public.workspace_invitations
    where email = 'cross-ws-invite@example.test'
      and accepted_at is null),
  2,
  'cross-workspace: same email can have a pending invite in two different workspaces'
);

-- ------------------------------------------------------------------
-- 2) Second pending invite for the same (workspace, email) is rejected.
-- ------------------------------------------------------------------
select throws_ok(
  $$ insert into public.workspace_invitations
       (workspace_id, email, role, invited_by, token_hash, expires_at)
     values
       ('bbbb2222-0000-0000-0000-000000000001'::uuid,
        'cross-ws-invite@example.test', 'member',
        'aaaa1111-0000-0000-0000-000000000001'::uuid,
        decode('cc','hex') || gen_random_bytes(31),
        now() + interval '5 days') $$,
  '23505',
  null,
  'duplicate-pending: second pending invite for the same (workspace, email) raises unique-violation'
);

-- ------------------------------------------------------------------
-- 3) Inviting someone as 'owner' is rejected — owner is for promotion,
--    not invitation.
-- ------------------------------------------------------------------
select throws_ok(
  $$ insert into public.workspace_invitations
       (workspace_id, email, role, invited_by, token_hash, expires_at)
     values
       ('bbbb2222-0000-0000-0000-000000000001'::uuid,
        'owner-invite-attempt@example.test', 'owner',
        'aaaa1111-0000-0000-0000-000000000001'::uuid,
        decode('dd','hex') || gen_random_bytes(31),
        now() + interval '5 days') $$,
  '23514',
  null,
  'role check: invitations cannot specify role=owner (CHECK constraint)'
);

-- ------------------------------------------------------------------
-- 4) workspace_members PK rejects a double-accept (same workspace, same
--    user inserted twice).
-- ------------------------------------------------------------------
select throws_ok(
  $$ insert into public.workspace_members (workspace_id, user_id, role)
     values
       ('bbbb2222-0000-0000-0000-000000000001'::uuid,
        'aaaa1111-0000-0000-0000-000000000001'::uuid,
        'member'::public.workspace_role) $$,
  '23505',
  null,
  'double-accept: re-inserting an existing (workspace, user) pair raises unique-violation'
);

-- ------------------------------------------------------------------
-- 5) When a workspace is hard-deleted, its invitations cascade away.
-- ------------------------------------------------------------------
insert into public.workspaces (id, slug, name, created_by) values
  ('ffff3000-0000-0000-0000-000000000001', 'inv-cascade', 'Cascade Test',
   'aaaa1111-0000-0000-0000-000000000001');
insert into public.workspace_invitations
  (workspace_id, email, role, invited_by, token_hash, expires_at)
values
  ('ffff3000-0000-0000-0000-000000000001', 'cascade@example.test', 'member',
   'aaaa1111-0000-0000-0000-000000000001'::uuid,
   decode('ee','hex') || gen_random_bytes(31),
   now() + interval '5 days');

delete from public.workspaces where id = 'ffff3000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.workspace_invitations
    where workspace_id = 'ffff3000-0000-0000-0000-000000000001'::uuid),
  0,
  'cascade: workspace_invitations rows are removed when the parent workspace is deleted'
);

select * from finish();

rollback;
