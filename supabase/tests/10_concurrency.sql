-- Cinderblock — Category 10: Concurrency invariants.
--
-- Postgres doesn't expose dblink-style multi-transaction concurrency from
-- inside a single pgtap session, so the "two simultaneous writers" version
-- of these tests would require an external driver. What we CAN verify from
-- inside a single session is the **structural** invariants the concurrency
-- story rests on:
--   - The last-owner trigger raises 23514 on the demote-to-non-owner of the
--     final owner (would also raise under two concurrent demotes — one wins,
--     one fails — but the same exception class).
--   - processed_stripe_events PK uniqueness rejects a duplicate event_id
--     immediately within the same transaction, mirroring how it would
--     reject under two concurrent webhook deliveries.
--
-- The full concurrency suite (two real transactions racing) lives outside
-- pgtap as scripts/smoke-concurrency.mjs (to be added).

begin;

select plan(3);

-- ------------------------------------------------------------------
-- 1) Last-owner: demote the sole owner of a workspace, expect 23514.
--    Use a synthetic workspace to avoid touching the fixture.
-- ------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, reauthentication_token, email_change
) values
  ('ffff2000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lo1@example.test', now(), '{}', '{}', now(), now(), '', '', '', '', '', '');

insert into public.workspaces (id, slug, name, created_by) values
  ('ffff2100-0000-0000-0000-000000000001', 'last-owner', 'Last Owner Co',
   'ffff2000-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('ffff2100-0000-0000-0000-000000000001', 'ffff2000-0000-0000-0000-000000000001', 'owner');

set constraints workspace_members_last_owner immediate;
select throws_ok(
  $$ update public.workspace_members set role = 'admin'
      where workspace_id = 'ffff2100-0000-0000-0000-000000000001'::uuid
        and user_id = 'ffff2000-0000-0000-0000-000000000001'::uuid $$,
  '23514',
  null,
  'last-owner: demoting the only owner of a workspace raises 23514'
);
set constraints workspace_members_last_owner deferred;

-- ------------------------------------------------------------------
-- 2) Soft-removing the last owner is similarly rejected.
-- ------------------------------------------------------------------
set constraints workspace_members_last_owner immediate;
select throws_ok(
  $$ update public.workspace_members set removed_at = now()
      where workspace_id = 'ffff2100-0000-0000-0000-000000000001'::uuid
        and user_id = 'ffff2000-0000-0000-0000-000000000001'::uuid $$,
  '23514',
  null,
  'last-owner: soft-removing the only owner raises 23514'
);
set constraints workspace_members_last_owner deferred;

-- ------------------------------------------------------------------
-- 3) processed_stripe_events PK rejects duplicate event_id within the
--    same transaction — mirrors the two-concurrent-webhooks race.
-- ------------------------------------------------------------------
insert into public.processed_stripe_events (event_id, event_type)
  values ('evt_concurrency_test', 'customer.subscription.updated');

select throws_ok(
  $$ insert into public.processed_stripe_events (event_id, event_type)
       values ('evt_concurrency_test', 'customer.subscription.updated') $$,
  '23505',
  null,
  'idempotency: a second INSERT with the same event_id raises unique-violation (23505) — same shape under concurrent webhooks'
);

-- Cleanup so 12_billing.sql's idempotency assertions don't see a stray row.
delete from public.processed_stripe_events where event_id = 'evt_concurrency_test';

select * from finish();

rollback;
