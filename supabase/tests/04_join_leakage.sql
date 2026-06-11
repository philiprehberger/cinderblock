-- Cinderblock — Category 3: Join-leakage tests.
--
-- The subtle category. A policy that passes the simple `where workspace_id = X`
-- check can still leak rows when reached through joins, CTEs, subqueries, or
-- UNIONs. Each test here authenticates as a user with no business reading a
-- target workspace and constructs a query shape that has historically slipped
-- past RLS in other Supabase implementations. Assertions are zero-row.
--
-- The principle: RLS evaluates per-row on each base table. Whatever join /
-- aggregation / set-op the user constructs, RLS keeps the visible row set
-- bounded by the policies on each underlying table.

begin;

select plan(6);

-- ------------------------------------------------------------------
-- 1) Join through workspaces via workspace_id doesn't expose tasks
--    from workspaces the user isn't in.
--    Bob (not in bigco) joins tasks with workspaces on workspace_id. RLS
--    filters BOTH sides — bigco is invisible to bob from the workspaces
--    side, and the tasks side independently filters. Result: 0 rows.
--    (auth.users is locked entirely for non-service roles, so joining
--    through it isn't a useful boundary test — the deny happens at GRANT
--    level, not RLS. The workspaces join is the realistic shape.)
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
select is(
  (select count(distinct t.id)::int
     from public.tasks t
     join public.workspaces w on w.id = t.workspace_id
    where w.slug = 'bigco'),
  0,
  'join leak (workspaces): bob sees zero bigco tasks via workspaces ⋈ tasks'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 2) Join from workspace_members into workspaces doesn't expose
--    bigco's name to bob via a CTE pattern.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
select is(
  (with my_workspaces as (
     select workspace_id from public.workspace_members where user_id = auth.uid()
   )
   select count(*)::int from public.workspaces w
    where w.id = 'bbbb2222-0000-0000-0000-000000000002'::uuid),  -- bigco
  0,
  'CTE leak: bob''s CTE-based query for bigco metadata returns zero rows'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 3) UNION across multiple SELECTs respects RLS on each side.
--    Bob queries `acme tasks UNION ALL bigco tasks`. Only acme tasks come back.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
select is(
  (select count(*)::int from (
     select id from public.tasks where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid  -- acme (allowed)
     union all
     select id from public.tasks where workspace_id = 'bbbb2222-0000-0000-0000-000000000002'::uuid  -- bigco (denied)
   ) u),
  (select count(*)::int from public.tasks where workspace_id = 'bbbb2222-0000-0000-0000-000000000001'::uuid),
  'UNION leak: UNION ALL of acme + bigco tasks returns only the acme half for bob'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 4) Subquery filtering by workspace_id doesn't bypass the membership check.
--    Bob constructs `select tasks where workspace_id IN (
--      select id from workspaces where slug = 'bigco'
--    )` — the inner subquery returns 0 rows for bob (he can't see bigco),
--    so the outer SELECT returns 0.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
select is(
  (select count(*)::int from public.tasks
    where workspace_id in (select id from public.workspaces where slug = 'bigco')),
  0,
  'subquery leak: filter-via-slug-subquery returns zero (bigco invisible to bob)'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 5) Cross join: tasks × workspace_members across workspaces does not
--    expose row combinations from a workspace the caller can't read.
--    Bob attempts to enumerate (task, member) pairs in bigco.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
select is(
  (select count(*)::int
     from public.tasks t
     join public.workspace_members m on m.workspace_id = t.workspace_id
    where t.workspace_id = 'bbbb2222-0000-0000-0000-000000000002'::uuid),  -- bigco
  0,
  'cross-table join leak: tasks ⋈ workspace_members for bigco returns zero pairs for bob'
);
select tests.reset_auth();

-- ------------------------------------------------------------------
-- 6) Aggregate doesn't leak counts of unreadable workspaces.
--    Bob runs `select workspace_id, count(*) from tasks group by workspace_id`.
--    bigco's workspace_id should NOT appear at all.
-- ------------------------------------------------------------------
select tests.authenticate_as('aaaa1111-0000-0000-0000-000000000002'::uuid);  -- bob
select is(
  (select count(*)::int from (
     select workspace_id from public.tasks group by workspace_id
   ) g
   where workspace_id = 'bbbb2222-0000-0000-0000-000000000002'::uuid),  -- bigco
  0,
  'aggregate leak: GROUP BY workspace_id does not expose bigco''s existence to bob'
);
select tests.reset_auth();

select * from finish();

rollback;
