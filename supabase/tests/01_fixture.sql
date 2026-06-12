-- Cinderblock — Hostile test fixture (5 workspaces × 8 users).
--
-- Deterministic UUIDs so test assertions can reference them by name.
-- Workspaces: acme, bigco, solo-co, holdings, archived (soft-deleted).
-- Users: alice, bob, carol, dave, eve, frank, grace, hostile.
-- Membership matrix follows the table in the plan's "Test fixture" section.
--
-- This file is the seed that every later test file (02–07, etc.) relies on.
-- Soft-delete archived workspace last so the membership rows that reference
-- it stick around for the "removed-member sees nothing" tests.

-- ---------- USERS ----------

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, reauthentication_token
) values
  ('aaaa1111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@example.test',   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@example.test',     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@example.test',   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@example.test',    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eve@example.test',     now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank@example.test',   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grace@example.test',   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
  ('aaaa1111-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hostile@example.test', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '')
on conflict (id) do nothing;

-- GoTrue's /admin/users endpoint scans every string column on auth.users and
-- crashes on NULL ("converting NULL to string is unsupported"). Pgtap inserts
-- bypass GoTrue's normalization, so we have to do it ourselves for every
-- string column that defaults to NULL.
update auth.users
   set confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change = coalesce(email_change, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       reauthentication_token = coalesce(reauthentication_token, '')
 where id::text like 'aaaa1111-%';

-- ---------- WORKSPACES ----------
-- created_by uses alice for acme, eve for bigco, etc. — pick any active member.

insert into public.workspaces (id, slug, name, created_by, billing_email) values
  ('bbbb2222-0000-0000-0000-000000000001', 'acme',      'Acme Corp',       'aaaa1111-0000-0000-0000-000000000001', 'billing@acme.test'),
  ('bbbb2222-0000-0000-0000-000000000002', 'bigco',     'BigCo Inc',       'aaaa1111-0000-0000-0000-000000000005', 'billing@bigco.test'),
  ('bbbb2222-0000-0000-0000-000000000003', 'solo-co',   'Solo Co',         'aaaa1111-0000-0000-0000-000000000002', 'billing@solo-co.test'),
  ('bbbb2222-0000-0000-0000-000000000004', 'holdings',  'Holdings Group',  'aaaa1111-0000-0000-0000-000000000003', 'billing@holdings.test'),
  ('bbbb2222-0000-0000-0000-000000000005', 'archived',  'Archived Co',     'aaaa1111-0000-0000-0000-000000000001', 'billing@archived.test')
on conflict (id) do nothing;

-- ---------- MEMBERSHIPS ----------
--             acme    bigco   solo-co  holdings  archived
-- alice@      owner   member  -        -         owner
-- bob@        admin   -       owner    -         -
-- carol@      member  admin   -        owner     -
-- dave@       guest   member  -        admin     -
-- eve@        -       owner   -        -         -
-- frank@      -       -       member   member    -
-- grace@      member  guest   guest    -         -
-- hostile@    -       -       -        -         -  (the outsider)

insert into public.workspace_members (workspace_id, user_id, role) values
  -- acme
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', 'owner'),
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000002', 'admin'),
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000003', 'member'),
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000004', 'guest'),
  ('bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000007', 'member'),
  -- bigco
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000001', 'member'),
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000003', 'admin'),
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000004', 'member'),
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000005', 'owner'),
  ('bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000007', 'guest'),
  -- solo-co
  ('bbbb2222-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000002', 'owner'),
  ('bbbb2222-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000006', 'member'),
  ('bbbb2222-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000007', 'guest'),
  -- holdings
  ('bbbb2222-0000-0000-0000-000000000004', 'aaaa1111-0000-0000-0000-000000000003', 'owner'),
  ('bbbb2222-0000-0000-0000-000000000004', 'aaaa1111-0000-0000-0000-000000000004', 'admin'),
  ('bbbb2222-0000-0000-0000-000000000004', 'aaaa1111-0000-0000-0000-000000000006', 'member'),
  -- archived (will be soft-deleted at end of file)
  ('bbbb2222-0000-0000-0000-000000000005', 'aaaa1111-0000-0000-0000-000000000001', 'owner')
on conflict (workspace_id, user_id) do nothing;

-- ---------- TASKS ----------
-- 5 tasks per active workspace × 4 active workspaces × roughly = ~20.
-- 5 done, 5 doing, ~10 todo. Spread across statuses to exercise the index.
-- Mark archived workspace's tasks too so they exist (archived isn't soft-deleted yet).

insert into public.tasks (id, workspace_id, title, status, assigned_to, created_by) values
  -- acme tasks
  ('cccc3333-0000-0000-0001-000000000001', 'bbbb2222-0000-0000-0000-000000000001', 'Acme — onboarding pass', 'done', 'aaaa1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000001'),
  ('cccc3333-0000-0000-0001-000000000002', 'bbbb2222-0000-0000-0000-000000000001', 'Acme — billing review', 'doing', 'aaaa1111-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000001'),
  ('cccc3333-0000-0000-0001-000000000003', 'bbbb2222-0000-0000-0000-000000000001', 'Acme — Q3 retro notes', 'todo', null, 'aaaa1111-0000-0000-0000-000000000001'),
  ('cccc3333-0000-0000-0001-000000000004', 'bbbb2222-0000-0000-0000-000000000001', 'Acme — vendor audit', 'todo', 'aaaa1111-0000-0000-0000-000000000007', 'aaaa1111-0000-0000-0000-000000000002'),
  ('cccc3333-0000-0000-0001-000000000005', 'bbbb2222-0000-0000-0000-000000000001', 'Acme — security checklist', 'doing', 'aaaa1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000002'),
  -- bigco tasks
  ('cccc3333-0000-0000-0002-000000000001', 'bbbb2222-0000-0000-0000-000000000002', 'BigCo — leak postmortem', 'done', 'aaaa1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000005'),
  ('cccc3333-0000-0000-0002-000000000002', 'bbbb2222-0000-0000-0000-000000000002', 'BigCo — pen-test scope', 'doing', null, 'aaaa1111-0000-0000-0000-000000000005'),
  ('cccc3333-0000-0000-0002-000000000003', 'bbbb2222-0000-0000-0000-000000000002', 'BigCo — DPA rewrite', 'todo', 'aaaa1111-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000005'),
  ('cccc3333-0000-0000-0002-000000000004', 'bbbb2222-0000-0000-0000-000000000002', 'BigCo — Q4 SLA review', 'todo', 'aaaa1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000003'),
  -- solo-co tasks
  ('cccc3333-0000-0000-0003-000000000001', 'bbbb2222-0000-0000-0000-000000000003', 'Solo — billing form', 'done', 'aaaa1111-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000002'),
  ('cccc3333-0000-0000-0003-000000000002', 'bbbb2222-0000-0000-0000-000000000003', 'Solo — homepage refresh', 'doing', 'aaaa1111-0000-0000-0000-000000000006', 'aaaa1111-0000-0000-0000-000000000002'),
  ('cccc3333-0000-0000-0003-000000000003', 'bbbb2222-0000-0000-0000-000000000003', 'Solo — vendor onboarding', 'todo', null, 'aaaa1111-0000-0000-0000-000000000002'),
  -- holdings tasks
  ('cccc3333-0000-0000-0004-000000000001', 'bbbb2222-0000-0000-0000-000000000004', 'Holdings — entity map', 'doing', 'aaaa1111-0000-0000-0000-000000000004', 'aaaa1111-0000-0000-0000-000000000003'),
  ('cccc3333-0000-0000-0004-000000000002', 'bbbb2222-0000-0000-0000-000000000004', 'Holdings — Q3 close', 'todo', 'aaaa1111-0000-0000-0000-000000000006', 'aaaa1111-0000-0000-0000-000000000003'),
  ('cccc3333-0000-0000-0004-000000000003', 'bbbb2222-0000-0000-0000-000000000004', 'Holdings — board prep', 'done', 'aaaa1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- ---------- AUDIT EVENTS ----------
-- Sparse but representative. Real fixture seeds ~200; this is the kernel.
-- Includes one impersonation event (Bob as admin impersonating Carol).

insert into public.audit_events (id, workspace_id, actor_id, impersonator_id, action, target_type, target_id, diff, occurred_at) values
  ('dddd4444-0000-0000-0001-000000000001', 'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', null, 'workspace.created',     'workspace', 'bbbb2222-0000-0000-0000-000000000001', null, now() - interval '60 days'),
  ('dddd4444-0000-0000-0001-000000000002', 'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', null, 'member.invited',        'workspace_member', 'aaaa1111-0000-0000-0000-000000000002', '{"role":"admin"}'::jsonb, now() - interval '50 days'),
  ('dddd4444-0000-0000-0001-000000000003', 'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000002', null, 'task.created',          'task', 'cccc3333-0000-0000-0001-000000000001', null, now() - interval '20 days'),
  ('dddd4444-0000-0000-0001-000000000004', 'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000002', 'task.updated', 'task', 'cccc3333-0000-0000-0001-000000000002', '{"status":{"from":"todo","to":"doing"}}'::jsonb, now() - interval '5 days'),
  ('dddd4444-0000-0000-0001-000000000005', 'bbbb2222-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000002', null, 'member.role_changed',   'workspace_member', 'aaaa1111-0000-0000-0000-000000000003', '{"role":{"from":"guest","to":"member"}}'::jsonb, now() - interval '2 days'),
  ('dddd4444-0000-0000-0002-000000000001', 'bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000005', null, 'workspace.created',     'workspace', 'bbbb2222-0000-0000-0000-000000000002', null, now() - interval '90 days'),
  ('dddd4444-0000-0000-0002-000000000002', 'bbbb2222-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000003', null, 'task.created',          'task', 'cccc3333-0000-0000-0002-000000000001', null, now() - interval '10 days')
on conflict (id) do nothing;

-- ---------- INVITATIONS ----------
-- One expired, two active, one accepted.

insert into public.workspace_invitations (id, workspace_id, email, role, invited_by, token_hash, expires_at, accepted_at, accepted_by) values
  ('eeee5555-0000-0000-0001-000000000001', 'bbbb2222-0000-0000-0000-000000000001', 'expired@example.test',   'member', 'aaaa1111-0000-0000-0000-000000000001', decode('00','hex')::bytea || gen_random_bytes(31), now() - interval '14 days', null, null),
  ('eeee5555-0000-0000-0001-000000000002', 'bbbb2222-0000-0000-0000-000000000001', 'newhire@example.test',   'member', 'aaaa1111-0000-0000-0000-000000000002', decode('00','hex')::bytea || gen_random_bytes(31), now() + interval '5 days', null, null),
  ('eeee5555-0000-0000-0002-000000000001', 'bbbb2222-0000-0000-0000-000000000002', 'contractor@example.test', 'guest',  'aaaa1111-0000-0000-0000-000000000005', decode('00','hex')::bytea || gen_random_bytes(31), now() + interval '7 days', null, null),
  ('eeee5555-0000-0000-0001-000000000003', 'bbbb2222-0000-0000-0000-000000000001', 'accepted@example.test',  'member', 'aaaa1111-0000-0000-0000-000000000001', decode('00','hex')::bytea || gen_random_bytes(31), now() - interval '1 day', now() - interval '2 days', 'aaaa1111-0000-0000-0000-000000000007')
on conflict (id) do nothing;

-- ---------- SUBSCRIPTIONS ----------

insert into public.subscriptions (workspace_id, stripe_customer_id, stripe_subscription_id, status, plan, seats, current_period_end) values
  ('bbbb2222-0000-0000-0000-000000000001', 'cus_acme_test',     'sub_acme_test',     'active',   'team', 10, now() + interval '20 days'),
  ('bbbb2222-0000-0000-0000-000000000002', 'cus_bigco_test',    'sub_bigco_test',    'trialing', 'business', 50, now() + interval '5 days'),
  ('bbbb2222-0000-0000-0000-000000000003', 'cus_solo_test',     'sub_solo_test',     'past_due', 'team', 10, now() - interval '10 days'),
  ('bbbb2222-0000-0000-0000-000000000004', 'cus_holdings_test', 'sub_holdings_test', 'canceled', 'business', 50, now() - interval '30 days')
on conflict (workspace_id) do nothing;

-- ---------- SOFT-DELETE archived workspace LAST ----------
-- (so the membership row for alice still exists for the "removed-from-archived" tests).

update public.workspaces
   set deleted_at = now() - interval '12 hours'
 where id = 'bbbb2222-0000-0000-0000-000000000005';

-- ---------- pgtap framing ----------

select plan(1);
select pass('hostile fixture loaded — 5 workspaces × 8 users × ~15 tasks × ~7 audit events × 4 invitations × 4 subscriptions');
select * from finish();
