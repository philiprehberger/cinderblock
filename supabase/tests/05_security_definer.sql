-- Cinderblock — Category 4: Security-definer hardening tests.
--
-- These tests assert the catalog-level properties that protect helper functions
-- and policies from configuration drift. A future migration that adds an
-- unhardened helper, a `using (true)` policy, a security_definer view, or a
-- table with RLS disabled trips one of these tests and CI fails loudly.

begin;

select plan(5);

-- ------------------------------------------------------------------
-- 1) Every app_private.* function has search_path locked to empty.
--    Without this, an attacker who can CREATE functions in their own schema
--    can override auth.uid() by manipulating search_path.
-- ------------------------------------------------------------------
select is_empty(
  $$ select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and not (
          p.proconfig is not null
          and 'search_path=' = any (
            select substring(c from 1 for 12) from unnest(p.proconfig) as c
          )
        ) $$,
  'every app_private function has explicit search_path=, locking identifier resolution'
);

-- ------------------------------------------------------------------
-- 2) No policy on a public-schema table is `using (true)` or
--    `with check (true)` — the most common boundary-failure shape.
--    Role-scoped policies (with a `to <specific_role>` clause that targets
--    a single non-public role) are allowed to use literal-true because the
--    role-scoping itself is the gate. Today that's only cb_audit_writer's
--    INSERT policy.
-- ------------------------------------------------------------------
select is_empty(
  $$ select schemaname || '.' || tablename || '.' || policyname as offender
       from pg_policies
      where schemaname = 'public'
        and (
          qual in ('true', '(true)')
          or with_check in ('true', '(true)')
        )
        -- Allow-list: policies that are role-scoped to a non-public role.
        -- pg_policies.roles is text[]; `public` here means "applies to PUBLIC"
        -- (the everyone-pseudo-role), which is the dangerous shape.
        and not (
          array_length(roles, 1) = 1
          and roles[1] <> 'public'
        ) $$,
  'no policy on a public-schema table uses using(true) or with check(true) without role-scoping'
);

-- ------------------------------------------------------------------
-- 3) Every table in the public schema has row-level security enabled.
--    A new table created without `enable row level security` is invisible
--    to RLS — every query returns every row regardless of policies.
-- ------------------------------------------------------------------
select is_empty(
  $$ select n.nspname || '.' || c.relname as offender
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity $$,
  'rowsecurity is enabled on every table in the public schema'
);

-- ------------------------------------------------------------------
-- 4) Every view in the public schema is created with security_invoker on.
--    Default views run as their owner (security_definer), which bypasses
--    the consumer's RLS. security_invoker keeps the underlying table's
--    policies effective.
-- ------------------------------------------------------------------
select is_empty(
  $$ select n.nspname || '.' || c.relname as offender
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_rewrite r on r.ev_class = c.oid
      where n.nspname = 'public'
        and c.relkind = 'v'
        and not coalesce(
          (c.reloptions @> array['security_invoker=true']
           or c.reloptions @> array['security_invoker=on']), false
        ) $$,
  'every public view is created with security_invoker=on'
);

-- ------------------------------------------------------------------
-- 5) Search-path attack end-to-end.
--    Create attacker_schema.uid() that always returns bob's uid (acme owner).
--    Authenticate as alice (acme owner, NOT in holdings). Prepend
--    attacker_schema to search_path. Query holdings tasks. Assert zero rows.
--    If app_private.* helpers were unhardened, the policy would resolve
--    auth.uid() through search_path and the attacker's function would lie
--    about the caller's identity.
-- ------------------------------------------------------------------
create schema if not exists attacker_schema;
create or replace function attacker_schema.uid() returns uuid
language sql immutable as $$
  select 'aaaa1111-0000-0000-0000-000000000003'::uuid;  -- carol, holdings owner
$$;
grant usage on schema attacker_schema to authenticated;
grant execute on function attacker_schema.uid() to authenticated;

-- Run the attack-shaped query under the manipulated search_path and capture
-- the row count into a temp table; reset search_path/role afterwards so the
-- pgtap assertion can resolve `is()` and its internal helpers normally.
create temp table attack_result (n int);
grant insert on attack_result to authenticated;

select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000001'::uuid);  -- alice
set local search_path = 'attacker_schema, public, extensions, "$user"';
insert into attack_result
  select count(*)::int from public.tasks
   where workspace_id = 'bbbb2222-0000-0000-0000-000000000004'::uuid;  -- holdings
reset search_path;
select tests.reset_auth();

select is(
  (select n from attack_result),
  0,
  'search-path attack: prepending attacker_schema to search_path does not let alice see holdings tasks (helpers are hardened)'
);
drop table attack_result;

-- cleanup
drop function if exists attacker_schema.uid();
drop schema if exists attacker_schema;

select * from finish();

rollback;
