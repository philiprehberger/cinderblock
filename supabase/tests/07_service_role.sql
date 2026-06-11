-- Cinderblock — Category 7: Service-role positive controls.
--
-- These tests prove that the tenant boundary is RLS, not application code.
-- If the service-role client could not read across tenants, the boundary
-- would be ambiguous — someone could (wrongly) claim it was enforced at
-- the application layer. The positive control here makes the design
-- explicit: service_role bypasses RLS by design, the firewall is
-- /src/lib/supabase/server-only.ts + audit logging.
--
-- Also asserts the cb_audit_writer role's grant set is exactly what the
-- security story claims — INSERT only, no SELECT/UPDATE/DELETE/TRUNCATE.

begin;

select plan(4);

-- ------------------------------------------------------------------
-- 1) service_role can read every workspace.
--    Switch to service_role explicitly (it has BYPASSRLS) and confirm
--    the count matches the fixture (5 workspaces total — 4 active + 1
--    soft-deleted).
-- ------------------------------------------------------------------
set local role service_role;
select is(
  (select count(*)::int from public.workspaces),
  5,
  'service_role positive control: sees all 5 workspaces (including soft-deleted archived) — confirms RLS, not app code, is the boundary'
);
reset role;

-- ------------------------------------------------------------------
-- 2) service_role can read every task across every workspace.
-- ------------------------------------------------------------------
set local role service_role;
select cmp_ok(
  (select count(*)::int from public.tasks),
  '>=',
  15,
  'service_role positive control: sees at least the seeded 15 tasks across all workspaces'
);
reset role;

-- ------------------------------------------------------------------
-- 3) cb_audit_writer has INSERT and NOTHING ELSE on audit_events.
--    Verify via has_table_privilege() against the catalog.
-- ------------------------------------------------------------------
select is(
  array(
    select privilege
      from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as privilege
     where has_table_privilege('cb_audit_writer', 'public.audit_events', privilege)
  ),
  array['INSERT']::text[],
  'cb_audit_writer grant set on audit_events is exactly {INSERT}'
);

-- ------------------------------------------------------------------
-- 4) cb_audit_writer has no SELECT/UPDATE/DELETE on tasks / workspaces /
--    workspace_members / subscriptions either.
-- ------------------------------------------------------------------
select is(
  array(
    select t || ':' || privilege
      from unnest(array['public.tasks','public.workspaces','public.workspace_members','public.subscriptions','public.workspace_invitations']) as t
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) as privilege
     where has_table_privilege('cb_audit_writer', t, privilege)
  ),
  array[]::text[],
  'cb_audit_writer has no grants on any non-audit public table — the role is single-purpose'
);

select * from finish();

rollback;
