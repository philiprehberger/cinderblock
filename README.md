# Cinderblock

The forkable multi-tenant SaaS starter on Supabase whose load-bearing differentiator is a pgtap-tested Row-Level-Security suite that survives hostile multi-tenant fixtures.

Most Supabase multi-tenant deliveries trust the client to send the right tenant ID, use the service-role key to bypass RLS "for performance," or write policies that pass against the owner's own data and silently leak under joins. Cinderblock doesn't.

## What you get

- Workspace + member + role + invite + audit + billing data model on Postgres.
- 74 pgtap policy tests against a hostile fixture (5 workspaces × 8 users × every role × every table). Cross-tenant attempts return 0 rows; the tests fail loudly if a single row leaks through.
- Magic-link + Google OAuth + TOTP MFA on owners.
- Admin impersonation with a 60-minute server-minted HS256 JWT, step-up auth on entry, and double-logged audit events.
- Stripe Checkout + Customer Portal wired in test mode with insert-first webhook idempotency. Seat enforcement deferred trigger. Past-due grace + canceled read-only modes.
- A direct `cb_audit_writer` Postgres connection for append-only audit writes (no Edge Function round-trip per server action).
- `/docs/security/policies` — a live RLS policy viewer that reads `pg_policies` on the deployed database.
- `/docs/security/test-results` — the latest captured pgtap output.

The pgtap suite is the load-bearing artifact: `npx supabase test db` produces a green run a prospect can reproduce in their own fork in under a minute (warm cache).

## Quick start

```bash
git clone https://github.com/philiprehberger/cinderblock.git
cd cinderblock
npm install
./scripts/postclone.sh    # or `npm run postclone`
npm run dev
```

`postclone.sh` is idempotent — it boots Supabase, applies migrations, generates passwords for `cb_audit_writer` + `cb_impersonator`, generates Edge Function HMAC secrets, runs the pgtap suite, and exits non-zero if anything is red.

First run is 10–15 minutes (Docker image pull for `supabase start`). Subsequent runs are under a minute.

## Docs

- [Overview](https://cinderblock.philiprehberger.com/docs)
- [Getting started](https://cinderblock.philiprehberger.com/docs/getting-started)
- [How RLS works](https://cinderblock.philiprehberger.com/docs/security/rls)
- [Live policy viewer](https://cinderblock.philiprehberger.com/docs/security/policies)
- [Test results](https://cinderblock.philiprehberger.com/docs/security/test-results)
- [Audit log + impersonation](https://cinderblock.philiprehberger.com/docs/security/audit-log)
- [Policy evaluation cost](https://cinderblock.philiprehberger.com/docs/security/policy-cost)
- [Disclaimer](https://cinderblock.philiprehberger.com/docs/security/disclaimer)
- [Stripe wiring](https://cinderblock.philiprehberger.com/docs/billing/stripe)
- [Swap to Vercel](https://cinderblock.philiprehberger.com/docs/swap-vercel)

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4 + TypeScript strict
- Supabase Cloud (Postgres 17, Auth, Edge Functions, Storage, Realtime)
- Stripe (Checkout + Customer Portal + webhook idempotency)
- pgtap for the security suite, Vitest for TypeScript units, Playwright for E2E

## License

MIT. See [LICENSE](./LICENSE).
