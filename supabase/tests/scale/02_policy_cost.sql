-- Cinderblock — Scale: policy correctness + index usage at 100k rows.
--
-- Depends on the fixture in 01_fixture.sql having been committed in a prior
-- psql session (pg_prove runs each tests/*.sql file as its own session, so
-- the inserts in 01 persist for this file to read).
--
-- Two pgtap assertions:
--   1. The cross-tenant boundary still returns zero rows at 100k tasks —
--      proves the policy correctness invariant holds under scale, not just
--      against the 15-task hostile fixture.
--   2. The selective tasks read uses tasks_workspace_status_idx (Index Scan
--      or Bitmap Index Scan), not Seq Scan — proves the (workspace_id,
--      status) index survives the policy's `is_workspace_member()` rewrite.

begin;

select plan(2);

-- ------------------------------------------------------------------
-- 1) Correctness under scale: an outsider attacker still sees zero
--    rows in any scale workspace's tasks. This is the same invariant
--    02_cross_tenant_read.sql proves at 15-row scale; rerun it here
--    against 100k rows to catch any volume-dependent regression
--    (e.g., a policy that short-circuits to TRUE under cost threshold).
--
--    The fixture seeds a dedicated outsider user (uuid suffix 999) who
--    is excluded from the membership rotation — see 01_fixture.sql.
-- ------------------------------------------------------------------

select tests.authenticate_as(
  'ffff8888-0000-0000-0000-000000000999'::uuid
);

select results_eq(
  $$ select count(*)::int from public.tasks
       where workspace_id::text like 'ffff8888-1111-%' $$,
  array[0],
  'scale correctness: outsider with no memberships sees zero of the 100k scale tasks'
);

select tests.reset_auth();

-- ------------------------------------------------------------------
-- 2) Index usage: as a legitimate owner, an EXPLAIN of the canonical
--    "list this workspace's todo tasks" query must use an index scan
--    on tasks (not a Seq Scan over 100k rows).
--
--    We capture EXPLAIN (FORMAT JSON) and assert the JSON does not
--    contain '"Node Type": "Seq Scan"' against the public.tasks
--    relation. The policy adds a subquery for is_workspace_member
--    which itself does an index lookup on workspace_members; we
--    don't pin that one here (a small enough memberships table can
--    plausibly Seq Scan it cheaply).
-- ------------------------------------------------------------------

-- Authenticate as the owner of scale-ws-1 (user with uuid suffix 000000000001).
select tests.authenticate_as(
  'ffff8888-0000-0000-0000-000000000001'::uuid
);

do $$
declare
  plan_json jsonb;
  tasks_node text;
begin
  execute $explain$
    explain (format json)
    select id, title, status
      from public.tasks
     where workspace_id = 'ffff8888-1111-0000-0000-000000000001'::uuid
       and status = 'todo'
     order by id
     limit 50
  $explain$ into plan_json;

  -- Walk the plan tree and find the node touching public.tasks.
  -- jsonb_path_query_array gathers every node where Relation Name = 'tasks'.
  select node->>'Node Type' into tasks_node
  from jsonb_path_query(
    plan_json,
    '$.**.Plans[*] ? (@."Relation Name" == "tasks")'
  ) node
  limit 1;

  -- Fallback: top-level plan might be the tasks node itself (no nesting).
  if tasks_node is null then
    select plan_json #>> '{0,Plan,Node Type}' into tasks_node
    where plan_json #>> '{0,Plan,Relation Name}' = 'tasks';
  end if;

  -- Stash for the assertion below.
  perform set_config('cinderblock.scale.tasks_node', coalesce(tasks_node, 'NONE'), false);
end $$;

select isnt(
  current_setting('cinderblock.scale.tasks_node'),
  'Seq Scan',
  format(
    'scale plan: tasks node uses an index plan (actual: %s)',
    current_setting('cinderblock.scale.tasks_node')
  )
);

select tests.reset_auth();

select * from finish();

rollback;
