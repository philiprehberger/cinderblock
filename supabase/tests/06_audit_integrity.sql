-- Cinderblock — Category 6: Audit log integrity.
--
-- Audit events are append-only. No role except service_role (via Edge
-- Functions) should be able to UPDATE or DELETE existing rows. The
-- cb_audit_writer role can INSERT but has no UPDATE/DELETE grant.

begin;

select plan(4);

-- ------------------------------------------------------------------
-- 1) Owners cannot UPDATE an existing audit event.
--    Defense-in-depth: authenticated has NO UPDATE grant on audit_events.
--    The GRANT-level deny happens before RLS gets to evaluate, so the
--    UPDATE raises 42501 (permission denied), not 0 rows affected.
--    This is a stronger guarantee than RLS alone would give.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select throws_ok(
  $$ update public.audit_events set action = 'tampered'
      where id = 'dddd4444-0000-0000-0001-000000000001'::uuid $$,
  '42501',
  null,
  'audit append-only: owner UPDATE raises permission denied (no UPDATE grant exists at all)'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 2) Owners cannot DELETE an existing audit event.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select throws_ok(
  $$ delete from public.audit_events
      where id = 'dddd4444-0000-0000-0001-000000000001'::uuid $$,
  '42501',
  null,
  'audit append-only: owner DELETE raises permission denied (no DELETE grant exists at all)'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 3) Admins cannot UPDATE either — same GRANT-level deny.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob is acme admin
select throws_ok(
  $$ update public.audit_events set action = 'bob-tampered'
      where id = 'dddd4444-0000-0000-0001-000000000003'::uuid $$,
  '42501',
  null,
  'audit append-only: admin UPDATE raises permission denied'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 4) Impersonation events surface impersonator_id correctly to admins.
--    The fixture seeds one impersonation event (bob impersonating carol on
--    a task.updated). Verify alice (acme owner) sees BOTH actor_id (carol)
--    and impersonator_id (bob).
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $$ select actor_id::text, impersonator_id::text from public.audit_events
      where id = 'dddd4444-0000-0000-0001-000000000004'::uuid $$,
  $$ values ('aaaa1111-0000-0000-0000-000000000003'::text,
             'aaaa1111-0000-0000-0000-000000000002'::text) $$,
  'impersonation surface: alice (owner) sees both actor_id and impersonator_id on the impersonation event'
);
select tests.reset_auth();

select * from finish();

rollback;
