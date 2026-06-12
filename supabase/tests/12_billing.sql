-- Cinderblock — Category 12: Billing (seat enforcement + writability +
-- Stripe webhook idempotency).
--
-- These tests assert the three load-bearing security stories of Phase 5:
--   1. Seat-cap deferred trigger blocks the (N+1)th member.
--   2. workspace_is_writable degrades correctly across plan states.
--   3. processed_stripe_events idempotency is INSERT-FIRST — a second
--      insert with the same event_id returns 0 rows from RETURNING, so
--      a check-then-insert anti-pattern can't slip past this contract.

begin;

select plan(5);

-- ------------------------------------------------------------------
-- Setup: an extra workspace + member to test seat limits without
-- touching the fixture's seeded workspaces (which already sit at their
-- caps). Use a synthetic uuid prefix `f....` to avoid colliding.
-- ------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, reauthentication_token, email_change
) values
  ('ffff0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat1@example.test', now(), '{}', '{}', now(), now(), '', '', '', '', '', ''),
  ('ffff0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat2@example.test', now(), '{}', '{}', now(), now(), '', '', '', '', '', ''),
  ('ffff0000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat3@example.test', now(), '{}', '{}', now(), now(), '', '', '', '', '', ''),
  ('ffff0000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat4@example.test', now(), '{}', '{}', now(), now(), '', '', '', '', '', '')
on conflict (id) do nothing;

insert into public.workspaces (id, slug, name, created_by) values
  ('ffff1111-0000-0000-0000-000000000001', 'seat-test', 'Seat Test Co',
   'ffff0000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- No subscription row — defaults to free plan (3 seats). Add 3 members
-- (within cap). The fourth must trip the trigger.
insert into public.workspace_members (workspace_id, user_id, role) values
  ('ffff1111-0000-0000-0000-000000000001', 'ffff0000-0000-0000-0000-000000000001', 'owner'),
  ('ffff1111-0000-0000-0000-000000000001', 'ffff0000-0000-0000-0000-000000000002', 'member'),
  ('ffff1111-0000-0000-0000-000000000001', 'ffff0000-0000-0000-0000-000000000003', 'member');

-- ------------------------------------------------------------------
-- 1) Seat-cap trigger raises on the 4th INSERT (free plan caps at 3).
--    The trigger is deferrable initially deferred so atomic add+remove
--    works in production, but inside this pgtap transaction (begin/
--    rollback) deferred triggers never fire — there's no commit.
--    Force the trigger immediate for the assertion.
-- ------------------------------------------------------------------
set constraints workspace_members_seat_cap immediate;
select throws_ok(
  $$ insert into public.workspace_members (workspace_id, user_id, role)
     values
       ('ffff1111-0000-0000-0000-000000000001'::uuid,
        'ffff0000-0000-0000-0000-000000000004'::uuid,
        'member'::public.workspace_role) $$,
  '23514',
  null,
  'seat-cap: free-plan workspace cannot add a 4th active member (trigger raises 23514)'
);
set constraints workspace_members_seat_cap deferred;

-- ------------------------------------------------------------------
-- 2) workspace_is_writable on canceled subscription returns false.
--    holdings is seeded with status='canceled'.
-- ------------------------------------------------------------------
select is(
  app_private.workspace_is_writable('bbbb2222-0000-0000-0000-000000000004'::uuid),
  false,
  'writability: canceled subscription returns workspace_is_writable=false'
);

-- ------------------------------------------------------------------
-- 3) workspace_is_writable on past-due-beyond-grace returns false.
--    solo-co is seeded as past_due with current_period_end 10 days ago
--    (older than the 7-day grace window).
-- ------------------------------------------------------------------
select is(
  app_private.workspace_is_writable('bbbb2222-0000-0000-0000-000000000003'::uuid),
  false,
  'writability: past-due beyond 7d grace returns workspace_is_writable=false'
);

-- ------------------------------------------------------------------
-- 4) workspace_is_writable on active subscription returns true.
-- ------------------------------------------------------------------
select is(
  app_private.workspace_is_writable('bbbb2222-0000-0000-0000-000000000001'::uuid),
  true,
  'writability: active subscription returns workspace_is_writable=true'
);

-- ------------------------------------------------------------------
-- 5) processed_stripe_events insert-first idempotency.
--    First INSERT lands a row; second INSERT with the same event_id
--    returns null from RETURNING. The Stripe webhook gates side effects
--    on RETURNING being non-empty.
-- ------------------------------------------------------------------

-- First insert: should return 'evt_idempotency_test'.
insert into public.processed_stripe_events (event_id, event_type)
  values ('evt_idempotency_test', 'customer.subscription.updated');

-- Second insert: ON CONFLICT DO NOTHING → returns 0 rows from RETURNING.
-- Wrap in a CTE so we can count rows-affected via results_eq.
with attempted as (
  insert into public.processed_stripe_events (event_id, event_type)
    values ('evt_idempotency_test', 'customer.subscription.updated')
    on conflict (event_id) do nothing
    returning event_id
)
select is(
  (select count(*)::int from attempted),
  0,
  'webhook idempotency: insert-first on duplicate event_id returns 0 rows (side effect gated off)'
);

-- Cleanup the test rows so subsequent tests see a clean slate.
delete from public.processed_stripe_events where event_id = 'evt_idempotency_test';
delete from public.workspace_members
  where workspace_id = 'ffff1111-0000-0000-0000-000000000001';
delete from public.workspaces where id = 'ffff1111-0000-0000-0000-000000000001';

select * from finish();

rollback;
