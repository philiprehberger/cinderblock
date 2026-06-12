# Changelog

All notable changes to Cinderblock are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Multi-tenant SaaS starter on Supabase + Next.js 16 + App Router.
- 74 pgtap tests across 15 categories covering cross-tenant reads,
  cross-tenant writes, join leakage, search-path hardening, audit
  integrity, service-role positive controls, pool safety, concurrency,
  impersonation visibility, billing (seat-cap + writability +
  idempotency), tasks (write surface), and invitation flow.
- Workspace + member + role + invitation + audit + billing data model
  with RLS on every public-schema table.
- Magic-link auth via `@supabase/ssr`. TOTP MFA enabled in
  `supabase/config.toml`; enforcement gates pending the enrolment UI.
- Admin impersonation with 60-minute server-minted JWT (HS256 signed
  with `SUPABASE_JWT_SECRET`). 6-digit OTP step-up. Doubly-logged
  audit events. End-impersonation banner with countdown.
- Tasks surface — kanban with create / status / assignee / delete.
- Stripe billing — Checkout + Customer Portal server actions, webhook
  Edge Function with insert-first idempotency, seat enforcement
  deferred trigger, `workspace_is_writable` helper for past-due
  grace + canceled read-only modes.
- pg_cron retention sweeps for `processed_stripe_events` (90d) and
  `step_up_codes` (1d).
- Audit log viewer at `/app/[workspace_slug]/audit` with filters +
  cursor pagination.
- Docs site at `/docs` with 18 pages including live policy viewer +
  test-results renderer.
- `/status` runtime checks page. `/about` portfolio framing. `/pricing`.
- Playwright suite (public-routes smoke + cross-tenant scenarios).
- GitHub Actions CI: typecheck + lint + vitest + pgtap + Playwright
  on every push and PR.
- Edge Functions: `invite-create`, `invite-accept`, `stripe-webhook`,
  `cancel-stripe-subscription`.

### Security
- Append-only audit log enforced at the grant level. `cb_audit_writer`
  has INSERT-only on `audit_events`; no SELECT/UPDATE/DELETE anywhere.
- Self-impersonation rejected by DB CHECK constraint
  (`audit_events_no_self_impersonation`).
- Search-path attack denied by `set search_path = ''` on every
  `app_private.*` helper.
- Insert-first Stripe webhook idempotency (no check-then-insert race).
- Closed write policies (`with check (false)`) on
  `workspace_members.INSERT`, `workspace_invitations.*`,
  `subscriptions.WRITE`, `processed_stripe_events.*` —
  service-role-only writes paired with audit logging.
