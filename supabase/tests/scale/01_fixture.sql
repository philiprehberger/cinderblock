-- Cinderblock — Scale fixture.
--
-- Opt-in: `supabase test db` only globs `supabase/tests/*.sql` (no recursion),
-- so the scale suite never runs in the default per-PR pgtap job. The nightly
-- workflow invokes it explicitly:
--
--   npx supabase test db supabase/tests/scale/01_fixture.sql \
--                        supabase/tests/scale/02_policy_cost.sql
--
-- Sizes ~100k tasks across 50 workspaces × ~20 members each. Uses the
-- ffff8888-* UUID prefix so it cannot collide with the hostile fixture in
-- supabase/tests/01_fixture.sql (which uses aaaa1111-* / bbbb2222-* / ...).
-- INSERTs are committed (no BEGIN/ROLLBACK) so the policy_cost file in the
-- next psql session can read them.

-- ---------- USERS (200 in the membership pool + 1 dedicated outsider) ----------
-- The "outsider" (uuid suffix = 999) is deliberately not in the membership
-- matrix and is referenced by the policy_cost test as the attacker. Keeping
-- them in the fixture (not the test) avoids drift between the user count
-- and the rotation formula below.

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, reauthentication_token
)
select
  ('ffff8888-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'scale-user-' || gs || '@example.test',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', '', ''
from (select generate_series(1, 200) as gs union all select 999) u(gs)
on conflict (id) do nothing;

-- Empty every nullable string column GoTrue's admin endpoint scans (same
-- gotcha as the hostile fixture).
update auth.users
   set confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change = coalesce(email_change, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       reauthentication_token = coalesce(reauthentication_token, '')
 where id::text like 'ffff8888-%';

-- ---------- WORKSPACES (50) ----------
-- creator = user 1..50 (one each).

insert into public.workspaces (id, slug, name, created_by, billing_email)
select
  ('ffff8888-1111-0000-0000-' || lpad(gs::text, 12, '0'))::uuid,
  'scale-ws-' || gs,
  'Scale Workspace ' || gs,
  ('ffff8888-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid,
  'billing@scale-ws-' || gs || '.test'
from generate_series(1, 50) gs
on conflict (id) do nothing;

-- ---------- SUBSCRIPTIONS (50, business plan = 50 seats so memberships fit) ----------

insert into public.subscriptions (
  workspace_id, stripe_customer_id, stripe_subscription_id,
  status, plan, seats, current_period_end
)
select
  ('ffff8888-1111-0000-0000-' || lpad(gs::text, 12, '0'))::uuid,
  'cus_scale_' || gs,
  'sub_scale_' || gs,
  'active', 'business', 50, now() + interval '20 days'
from generate_series(1, 50) gs
on conflict (workspace_id) do nothing;

-- ---------- MEMBERSHIPS (~1000) ----------
-- Each workspace gets 20 members:
--   1 owner (the creator)         — slot 1
--   3 admins                      — slots 2-4
--   12 members                    — slots 5-16
--   4 guests                      — slots 17-20
-- Member slots draw from a rotating window over the 200-user pool so the
-- membership matrix is not trivially diagonal — users 1..50 are owners of
-- one workspace each AND members of several others, exercising the
-- "user has memberships in many workspaces" path the helper functions hit.

with slots as (
  select
    ws_idx,
    slot_idx,
    -- Rotate user assignment across workspaces so adjacent workspaces don't
    -- share the exact same member set. user_idx in [1, 200].
    (((ws_idx - 1) * 13 + slot_idx - 1) % 200) + 1 as user_idx,
    case
      when slot_idx = 1 then 'owner'::public.workspace_role
      when slot_idx <= 4 then 'admin'::public.workspace_role
      when slot_idx <= 16 then 'member'::public.workspace_role
      else 'guest'::public.workspace_role
    end as role
  from generate_series(1, 50) ws_idx
  cross join generate_series(1, 20) slot_idx
),
seeded as (
  select
    ('ffff8888-1111-0000-0000-' || lpad(ws_idx::text, 12, '0'))::uuid as workspace_id,
    ('ffff8888-0000-0000-0000-' || lpad(
      case
        -- Slot 1 is always the workspace creator (uuid suffix = ws_idx).
        when slot_idx = 1 then ws_idx
        else user_idx
      end::text, 12, '0'))::uuid as user_id,
    role
  from slots
)
insert into public.workspace_members (workspace_id, user_id, role)
select workspace_id, user_id, role from seeded
on conflict (workspace_id, user_id) do nothing;

-- ---------- TASKS (~100k) ----------
-- 2000 tasks per workspace × 50 workspaces. Statuses spread 1:1:1
-- so the (workspace_id, status) index has meaningful selectivity.

insert into public.tasks (id, workspace_id, title, status, created_by)
select
  gen_random_uuid(),
  ws.id,
  'Scale task ' || gs,
  case (gs % 3) when 0 then 'todo'::public.task_status
                when 1 then 'doing'::public.task_status
                else 'done'::public.task_status end,
  ws.created_by
from public.workspaces ws
cross join generate_series(1, 2000) gs
where ws.slug like 'scale-ws-%';

-- ---------- ANALYZE ----------
-- The planner needs fresh stats — without ANALYZE, the policy_cost test's
-- EXPLAIN plan defaults to pg_class.reltuples (often ~0 right after bulk
-- insert) and the planner picks Seq Scan even when the index would win.

analyze public.workspaces;
analyze public.workspace_members;
analyze public.tasks;
analyze public.subscriptions;

-- ---------- pgtap framing ----------

select plan(4);

select results_eq(
  $$ select count(*)::int from public.workspaces where slug like 'scale-ws-%' $$,
  array[50],
  'scale fixture: 50 workspaces seeded'
);

select results_eq(
  $$ select count(*)::int from auth.users where id::text like 'ffff8888-%' $$,
  array[201],
  'scale fixture: 200 pool users + 1 dedicated outsider seeded'
);

select cmp_ok(
  (select count(*)::int from public.workspace_members
    where workspace_id::text like 'ffff8888-1111-%'),
  '>=', 900,
  'scale fixture: ~1000 memberships seeded (>= 900 after dedupe on rotation collision)'
);

select results_eq(
  $$ select count(*)::int from public.tasks
       where workspace_id::text like 'ffff8888-1111-%' $$,
  array[100000],
  'scale fixture: 100,000 tasks seeded'
);

select * from finish();
