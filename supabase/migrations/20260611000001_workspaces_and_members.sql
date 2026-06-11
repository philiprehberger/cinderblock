-- Cinderblock — Migration 0001
-- workspace_role enum, workspaces, workspace_members, partial indexes,
-- baseline RLS enablement (policies live in a later migration).
--
-- The enum is declared highest-privilege-first so Postgres's native enum
-- comparison (`role <= 'admin'`) reads as "has at least this role." See
-- `app_private.has_workspace_role` in 20260611000005_helpers_and_reserved_slugs.sql.

create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');

create extension if not exists citext with schema extensions;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  name text not null check (length(name) between 1 and 80),
  created_by uuid not null references auth.users(id),
  billing_email text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.workspaces is
  'Tenant root. Soft-delete via deleted_at; hard-delete is a pg_cron job 24h later.';

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (workspace_id, user_id)
);

comment on table public.workspace_members is
  'Active membership when removed_at is null. Last-owner invariant enforced by deferred trigger in a later migration.';

-- RLS hot-path index: every is_workspace_member / has_workspace_role call
-- looks up by (user_id, workspace_id) filtered to active rows.
create unique index workspace_members_user_active_idx
  on public.workspace_members (user_id, workspace_id)
  where removed_at is null;

-- Covering index lets has_workspace_role satisfy from index alone.
create index workspace_members_user_role_active_idx
  on public.workspace_members (user_id, workspace_id, role)
  where removed_at is null;

-- Per-workspace member listing for the admin UI.
create index workspace_members_workspace_active_idx
  on public.workspace_members (workspace_id, role)
  where removed_at is null;

-- Active workspaces only — RLS filters everywhere else with `deleted_at is null`.
create index workspaces_active_idx
  on public.workspaces (id)
  where deleted_at is null;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- No policies yet — added in 20260611000020_initial_policies.sql so the helper
-- functions (created in the next migration) are available when policies reference them.
