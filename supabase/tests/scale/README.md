# Scale pgtap suite

The default `supabase test db` glob is `supabase/tests/*.sql` — non-recursive,
so the scale suite never runs in the per-PR pgtap job. It runs nightly on
`main` via `.github/workflows/scale.yml`, and can be invoked manually:

```bash
npx supabase start
npx supabase test db \
  supabase/tests/00_setup.sql \
  supabase/tests/scale/01_fixture.sql \
  supabase/tests/scale/02_policy_cost.sql
```

`00_setup.sql` defines the `tests.authenticate_as(...)` harness that
`02_policy_cost.sql` calls. The default per-PR job picks it up via the
`supabase/tests/*.sql` glob, but the scale invocation lists files
explicitly and would otherwise fail with `schema "tests" does not exist`.

## What it proves

- **Cross-tenant boundary holds at 100k rows.** The hostile fixture in
  `supabase/tests/01_fixture.sql` exercises the policies against 15 tasks.
  This suite re-runs the outsider-sees-zero invariant against 100,000 tasks
  across 50 workspaces — proving the boundary isn't an artifact of small
  fixture size.
- **Index plans survive the RLS rewrite.** PostgREST queries pass through
  the policy's `is_workspace_member(workspace_id)` subquery before hitting
  `tasks`. `02_policy_cost.sql` runs `EXPLAIN (FORMAT JSON)` against the
  canonical `workspace_id = $1 AND status = 'todo' LIMIT 50` shape and
  asserts the tasks node is not a Seq Scan.

## Fixture sizing

| Object               | Count    |
|---------------------|---------:|
| Scale users          | 200      |
| Scale workspaces     | 50       |
| Scale memberships    | ~1,000   |
| Scale tasks          | 100,000  |
| Scale subscriptions  | 50       |

All scale-fixture identifiers use the `ffff8888-…` UUID prefix so they
cannot collide with the hostile fixture (`aaaa1111-…` / `bbbb2222-…` /
`cccc3333-…`). The two suites can run back-to-back in the same database
without interference.

## Why it's not in the per-PR job

The fixture seed is ~30s on a cold Postgres and the assertions are
timing-sensitive in spirit (even though the only hard assertion is the
plan shape). Punishing unrelated PRs with that noise is the wrong
trade-off — the headline correctness suite is the ~74-test default that
runs in seconds.
