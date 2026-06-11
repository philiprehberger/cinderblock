-- Cinderblock — Migration 0050
-- audit_events. Append-only by RLS design: there is no UPDATE or DELETE policy,
-- and grants to cb_audit_writer are INSERT-only.
--
-- The Next.js server opens a postgres-js connection as cb_audit_writer (via
-- PG_AUDIT_WRITER_URL) and INSERTs directly. No Edge Function in the audit
-- hot path — that would add an HTTP round-trip per server action with no
-- offsetting benefit, since IP/UA/request context are all available in the
-- Next.js server already.
--
-- The auditLog() helper in /src/lib/audit/writer.ts is the only call site
-- that opens this connection. A guard in that helper refuses to insert a row
-- where impersonator_id is present but the active JWT's `aud` claim is not
-- 'impersonation' (catches dev error using the wrong JWT).

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  impersonator_id uuid references auth.users(id),
  action text not null check (length(action) between 1 and 100),
  target_type text check (target_type is null or length(target_type) between 1 and 100),
  target_id text check (target_id is null or length(target_id) between 1 and 100),
  diff jsonb,
  ip inet,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create index audit_events_workspace_occurred_idx
  on public.audit_events (workspace_id, occurred_at desc);

create index audit_events_actor_occurred_idx
  on public.audit_events (actor_id, occurred_at desc);

-- Per-action-type stats for the admin filter UI.
create index audit_events_workspace_action_idx
  on public.audit_events (workspace_id, action);

-- Impersonation events filtered fast.
create index audit_events_workspace_impersonator_idx
  on public.audit_events (workspace_id, impersonator_id, occurred_at desc)
  where impersonator_id is not null;

alter table public.audit_events enable row level security;

-- Owners and admins see every event in their workspace.
-- Members see only events where they are the actor.
-- Guests see nothing.
create policy "audit_events_select" on public.audit_events
  for select
  using (
    case
      when app_private.has_workspace_role(workspace_id, 'admin') then true
      when app_private.has_workspace_role(workspace_id, 'member')
        then actor_id = auth.uid()
      else false
    end
  );

-- No INSERT/UPDATE/DELETE policy for any user role.
-- Writes only via cb_audit_writer (granted explicitly below) or service_role.
-- The lack of UPDATE/DELETE policies means even the cb_audit_writer role
-- can't mutate existing rows (policies gate all roles except BYPASSRLS).

-- cb_audit_writer can only INSERT. No SELECT, no UPDATE, no DELETE.
-- This is the database-level guarantee that even if the Next.js process is
-- compromised, the attacker cannot retroactively rewrite the audit trail.
grant insert on public.audit_events to cb_audit_writer;
-- Sequence usage is not needed because the PK uses gen_random_uuid().

-- Defensive: revoke any default grants that might have come in via the
-- supabase postgres role's table-creation defaults.
revoke select, update, delete on public.audit_events from cb_audit_writer;
