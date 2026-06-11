-- Cinderblock — Migration 0005
-- app_private schema, security-definer helpers, reserved_slugs table.
--
-- Every helper is `security_definer set search_path = ''`. The empty search_path
-- locks identifiers to their schema-qualified form (`auth.uid()`, `public.x`),
-- so a workspace member who creates `attacker_schema.uid()` and prepends their
-- schema to search_path cannot hijack identifier resolution inside the helper.
--
-- The pgtap suite (Category 4) enumerates pg_proc and fails CI if any
-- app_private.* function is missing `search_path=` in proconfig.

create schema if not exists app_private;
revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;
-- service_role keeps default; this schema is for definer-only helpers.

create or replace function app_private.current_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select auth.uid();
$$;

create or replace function app_private.is_workspace_member(_workspace_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace_id
      and user_id = auth.uid()
      and removed_at is null
  );
$$;

-- Uses native enum comparison: the workspace_role enum is declared
-- owner < admin < member < guest, so `role <= _min_role` reads as
-- "has at least this role." Catalog-level O(1).
create or replace function app_private.has_workspace_role(
  _workspace_id uuid,
  _min_role public.workspace_role
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace_id
      and user_id = auth.uid()
      and removed_at is null
      and role <= _min_role
  );
$$;

-- Reads auth.mfa_factors to confirm a TOTP factor is verified. Gated server
-- actions (billing change, role change, impersonation start) call this before
-- proceeding when the actor holds `owner` in any workspace.
create or replace function app_private.user_has_mfa(_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = _user_id
      and factor_type = 'totp'
      and status = 'verified'
  );
$$;

-- Subscription writability check. Past-due grace is read from Postgres `now()`
-- (not the Next.js JS clock) so EC2/Stripe clock skew doesn't move the cutoff.
-- Returns true for workspaces with no subscription row (free plan default).
-- The subscriptions table is created in a later migration; this function
-- references it via lateral lookup that no-ops until the table exists.
create or replace function app_private.workspace_is_writable(_workspace_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  _status text;
  _period_end timestamptz;
begin
  -- The subscriptions table is added in migration 0040. Until then every
  -- workspace is writable. Once added the query below resolves normally.
  begin
    execute 'select status::text, current_period_end from public.subscriptions where workspace_id = $1'
      into _status, _period_end using _workspace_id;
  exception when undefined_table then
    return true;
  end;

  if _status is null then
    return true;  -- no row = free plan
  end if;

  if _status = 'canceled' then
    return false;
  end if;

  if _status = 'past_due' and _period_end < now() - interval '7 days' then
    return false;
  end if;

  return true;
end;
$$;

-- Reserved slugs the user is not allowed to claim as a workspace slug.
-- Lives as a table (not a check constraint) so the list is updatable without
-- a migration. The /docs/security/reserved-slugs page renders this verbatim.
create table app_private.reserved_slugs (
  slug text primary key,
  reason text not null
);

insert into app_private.reserved_slugs (slug, reason) values
  ('app', 'subdomain conflict'),
  ('api', 'subdomain conflict'),
  ('www', 'subdomain conflict'),
  ('admin', 'admin surface'),
  ('docs', 'docs site'),
  ('status', 'health page'),
  ('auth', 'supabase auth'),
  ('_next', 'next.js internal'),
  ('assets', 'static asset path'),
  ('static', 'static asset path'),
  ('public', 'static asset path'),
  ('signin', 'auth route'),
  ('signup', 'auth route'),
  ('login', 'auth route'),
  ('logout', 'auth route'),
  ('onboarding', 'auth route'),
  ('billing', 'app route'),
  ('settings', 'app route'),
  ('help', 'marketing route'),
  ('support', 'marketing route'),
  ('pricing', 'marketing route'),
  ('about', 'marketing route'),
  ('blog', 'marketing route'),
  ('changelog', 'marketing route'),
  ('cdn', 'reserved'),
  ('mail', 'reserved'),
  ('smtp', 'reserved'),
  ('imap', 'reserved'),
  ('ftp', 'reserved'),
  ('security', 'reserved'),
  ('privacy', 'reserved'),
  ('terms', 'reserved'),
  ('contact', 'marketing route'),
  ('cinderblock', 'product name'),
  ('root', 'reserved'),
  ('system', 'reserved');

-- A helper the workspace-create server action calls before insert.
create or replace function app_private.is_slug_reserved(_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.reserved_slugs where slug = _slug);
$$;
