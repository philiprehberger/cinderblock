-- Cinderblock — Category 9: Connection-pool safety.
--
-- The plan explicitly rules out a session-scoped GUC for the active
-- workspace (`app.current_workspace_id`) because Supabase's transaction
-- pooler reuses connections across callers — `set` would leak the tenant
-- context, `set local` doesn't survive between supabase-js HTTP requests.
--
-- These tests are defense against future drift:
--   1. No code path has set `app.current_workspace_id` (always null/empty).
--   2. A reused connection that switches identity mid-session sees the
--      new identity, not a stale one.

begin;

select plan(3);

-- ------------------------------------------------------------------
-- 1) No `app.current_workspace_id` GUC is in effect — the URL-as-source-
--    of-truth design says we never set it, anywhere.
-- ------------------------------------------------------------------
select is(
  coalesce(current_setting('app.current_workspace_id', true), ''),
  '',
  'no-GUC: app.current_workspace_id is unset (URL is the only source of truth)'
);

-- ------------------------------------------------------------------
-- 2) Connection-reuse across identities: simulate a pooled connection by
--    switching roles + claims within the same session and verifying each
--    sees only their own data.
-- ------------------------------------------------------------------
-- Authenticate as Alice (acme owner + bigco member); read tasks.
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select cmp_ok(
  (select count(*)::int from public.tasks),
  '>',
  0,
  'pool reuse: alice sees her acme+bigco tasks'
);
select tests.reset_auth();

-- Now reuse the "connection" as hostile@ — must see zero. If a stale
-- claim leaked, this would over-report.
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000008'::uuid);
select is(
  (select count(*)::int from public.tasks),
  0,
  'pool reuse: hostile@ sees zero tasks after alice (no stale claim leak)'
);
select tests.reset_auth();

select * from finish();

rollback;
