-- Cinderblock — Category 11: Impersonation audit-event visibility.
--
-- The fixture (01_fixture.sql) seeds one impersonation event in acme:
--   id          = dddd4444-0000-0000-0001-000000000004
--   action      = task.updated
--   actor_id    = carol  (aaaa1111-...-000000000003) — acme member
--   impersonator_id = bob  (aaaa1111-...-000000000002) — acme admin
--
-- These tests cover:
--   1. Admin (alice/owner) sees the event with BOTH ids populated.
--   2. Carol (the actor) sees the event via the member's own-actor rule.
--   3. Bob (the impersonator) sees it because he's also acme admin.
--   4. A different acme member (grace) does NOT see it — RLS gates on
--      actor_id, not impersonator_id.
--   5. cb_audit_writer cannot insert a row where impersonator_id = actor_id
--      (the DB-level CHECK from migration 0092 backstops the TS guard).

begin;

select plan(5);

-- ------------------------------------------------------------------
-- 1) Alice (acme owner) sees the impersonation event with both ids.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $$ select actor_id::text, impersonator_id::text
       from public.audit_events
      where id = 'dddd4444-0000-0000-0001-000000000004'::uuid $$,
  $$ values ('aaaa1111-0000-0000-0000-000000000003'::text,
             'aaaa1111-0000-0000-0000-000000000002'::text) $$,
  'admin view: owner sees both actor_id (carol) and impersonator_id (bob)'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 2) Carol (the actor) sees the event because the member policy lets a
--    member see rows where actor_id = auth.uid().
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000003'::uuid);
select is(
  (select count(*)::int from public.audit_events
    where id = 'dddd4444-0000-0000-0001-000000000004'::uuid),
  1,
  'actor view: carol (member, the actor) sees the impersonation event'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 3) Bob (the impersonator) sees the event via his acme admin role —
--    NOT via any impersonator-specific visibility rule. The current
--    policy gates only on actor_id and role; an impersonator who is NOT
--    admin would not see their own impersonation activity (by design).
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);
select is(
  (select count(*)::int from public.audit_events
    where id = 'dddd4444-0000-0000-0001-000000000004'::uuid),
  1,
  'admin-impersonator view: bob (acme admin) sees the row via admin role'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 4) Grace (acme member, uninvolved) does NOT see the row. Confirms
--    that RLS gates on actor_id, not impersonator_id — impersonator_id
--    is for visibility ENRICHMENT, not for granting access.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000007'::uuid);
select is(
  (select count(*)::int from public.audit_events
    where id = 'dddd4444-0000-0000-0001-000000000004'::uuid),
  0,
  'uninvolved member view: grace (acme member, not the actor) does NOT see the row'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 5) Self-impersonation rows are blocked at the DB layer by the CHECK
--    constraint from migration 0092 — regardless of the inserting role.
--    Run as the default (postgres / superuser) so the test isn't gated on
--    role-membership setup. The constraint check applies to all roles
--    including BYPASSRLS, so this proves the guarantee for cb_audit_writer
--    too (cb_audit_writer has fewer powers than postgres, not more).
-- ------------------------------------------------------------------
select throws_ok(
  $$ insert into public.audit_events
       (workspace_id, actor_id, impersonator_id, action)
     values
       ('bbbb2222-0000-0000-0000-000000000001'::uuid,
        'aaaa1111-0000-0000-0000-000000000002'::uuid,
        'aaaa1111-0000-0000-0000-000000000002'::uuid,
        'smoke.self_imp') $$,
  '23514',
  null,
  'DB guard: self-impersonation row (impersonator_id = actor_id) is rejected by CHECK constraint'
);

select * from finish();

rollback;
