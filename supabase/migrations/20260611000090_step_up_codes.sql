-- Cinderblock — Migration 0090
-- step_up_codes: short-lived 6-digit OTPs used to gate sensitive actions
-- (impersonation start, billing change, owner role change).
--
-- The Cinderblock server generates a code, HMAC-hashes it, stores the hash
-- here, and sends the raw code to the actor's email (in dev: surfaces it in
-- the UI). The actor enters the code; the server hashes the input the same
-- way and looks up the row. Used codes are marked, not deleted, so a replay
-- attempt against the same code fails distinctly from "no such code."
--
-- Access pattern: service-role only. No data API policies; the writer/reader
-- both run server-side under service-role with explicit code-flow audit.

create table public.step_up_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  initiated_by uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id),
  purpose text not null check (purpose in ('impersonation','billing','owner_role')),
  code_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index step_up_codes_pending_idx
  on public.step_up_codes (initiated_by, expires_at)
  where used_at is null;

create index step_up_codes_lookup_idx
  on public.step_up_codes (code_hash, expires_at)
  where used_at is null;

alter table public.step_up_codes enable row level security;

-- No data-API policies. service_role bypasses RLS. The Cinderblock pattern:
-- the step-up generator + verifier server actions run as service_role; the
-- user role (authenticated, cb_impersonator) has zero access.
create policy "step_up_codes_no_user_access" on public.step_up_codes
  for all using (false) with check (false);

-- service_role has implicit access via BYPASSRLS. Don't grant to any other
-- role; even cb_audit_writer doesn't need step-up code reads.

-- TTL: a future pg_cron job will purge rows older than 1 hour. For now the
-- table grows monotonically; the lookup index is partial-where so the cost
-- per verification is bounded regardless.
