# Cinderblock

The forkable multi-tenant SaaS starter on Supabase whose load-bearing differentiator is a pgtap-tested Row-Level-Security suite that survives hostile multi-tenant fixtures.

Most Supabase multi-tenant deliveries trust the client to send the right tenant ID, use the service-role key to bypass RLS "for performance," or write policies that pass against the owner's own data and silently leak under joins. Cinderblock doesn't.

## What you get

- Workspace + member + role + invite + audit + billing data model on Postgres.
- ~45 pgtap policy tests against a hostile fixture (5 workspaces × 8 users × every role × every table) that fail when a cross-tenant read returns a single row.
- Magic-link + Google OAuth + TOTP MFA on owners.
- Admin impersonation with a 60-minute server-minted JWT, step-up auth on entry, and double-logged audit events.
- Stripe Checkout + Customer Portal wired in test mode with insert-first webhook idempotency.
- A direct `pg_audit_writer` Postgres connection for append-only audit writes (no Edge Function round-trip per server action).
- A live RLS policy viewer page that reads `pg_policies` on the deployed database.

The pgtap suite is the load-bearing artifact: `npm run supabase:test` produces a green run a prospect can reproduce in their own fork in under a minute.

## Quick start

```bash
git clone https://github.com/philiprehberger/cinderblock.git
cd cinderblock
./scripts/postclone.sh    # or `npm run postclone`
npm run dev
```

`postclone.sh` prompts for the Supabase project URL, generates passwords for the `pg_audit_writer` and `pg_impersonator` roles, applies the migrations, seeds the demo workspaces, and runs `supabase test db`. It exits non-zero if pgtap doesn't go green — you don't get to ship a misconfigured fork without noticing.

First run is 10–15 minutes (Docker image pull for `supabase start`). Subsequent runs are under 5 minutes with the cache warm.

## Docs

- `/docs/security/rls` — every policy in plain English plus the SQL.
- `/docs/security/policies` — live RLS policy viewer.
- `/docs/security/test-results` — latest pgtap CI run output.
- `/docs/security/policy-cost` — annotated `explain (analyze, buffers)` showing per-row policy cost.
- `/docs/security/disclaimer` — what the test suite proves and what it doesn't.

## License

MIT. See [LICENSE](./LICENSE).
