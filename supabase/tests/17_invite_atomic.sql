-- Cinderblock — atomic invite membership (migration 0150). Green = fixed.
-- Self-contained: a fresh workspace with an owner, a soft-removed member, and a
-- brand-new user. public.accept_invite_member is service_role-only; pgtap runs
-- as postgres (the function owner), so it can call it directly.

begin;
select plan(6);

select tests.reset_auth();
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('aaaa1111-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-c@example.test', now(), now()),
  ('aaaa1111-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','removed-c@example.test', now(), now()),
  ('aaaa1111-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','new-c@example.test', now(), now());
insert into public.workspaces (id, slug, name, created_by) values
  ('bbbb2222-0000-0000-0000-0000000000c1','invite-rc3','InviteRC3','aaaa1111-0000-0000-0000-0000000000c1');
insert into public.workspace_members (workspace_id, user_id, role, removed_at) values
  ('bbbb2222-0000-0000-0000-0000000000c1','aaaa1111-0000-0000-0000-0000000000c1','owner', null),
  ('bbbb2222-0000-0000-0000-0000000000c1','aaaa1111-0000-0000-0000-0000000000c2','member', now());

-- a SOFT-REMOVED member is reactivated (the bare-insert dead-end is gone)
select is(
  public.accept_invite_member(
    'bbbb2222-0000-0000-0000-0000000000c1','aaaa1111-0000-0000-0000-0000000000c2','admin'),
  'ok', 'RC3: reactivates a soft-removed member (insert-or-reactivate)');
select is(
  (select removed_at is null and role = 'admin'::public.workspace_role
     from public.workspace_members
     where workspace_id = 'bbbb2222-0000-0000-0000-0000000000c1'
       and user_id = 'aaaa1111-0000-0000-0000-0000000000c2'),
  true, 'RC3: reactivated member is active with the invited role');

-- an ACTIVE member returns already_member and is NOT re-roled
select is(
  public.accept_invite_member(
    'bbbb2222-0000-0000-0000-0000000000c1','aaaa1111-0000-0000-0000-0000000000c1','member'),
  'already_member', 'RC3: an active member returns already_member');
select is(
  (select role::text from public.workspace_members
     where workspace_id = 'bbbb2222-0000-0000-0000-0000000000c1'
       and user_id = 'aaaa1111-0000-0000-0000-0000000000c1'),
  'owner', 'RC3: an active member''s role is NOT silently changed');

-- a brand-new user is inserted
select is(
  public.accept_invite_member(
    'bbbb2222-0000-0000-0000-0000000000c1','aaaa1111-0000-0000-0000-0000000000c3','member'),
  'ok', 'RC3: inserts a brand-new member');

-- the RPC is service_role-only
select ok(
  not has_function_privilege('authenticated',
    'public.accept_invite_member(uuid,uuid,public.workspace_role)', 'execute'),
  'RC3: accept_invite_member is not callable by authenticated');

select * from finish();
rollback;
