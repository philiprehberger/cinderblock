-- Cinderblock — Migration 0120
-- Public read-only view of pg_policies for the live policy viewer at
-- /docs/security/policies. PostgREST exposes views in the public schema
-- to the data API, so we can read it from a server component without
-- bespoke RPC plumbing.
--
-- The view is security_invoker so the caller's role applies (currently
-- only service_role + postgres can SELECT from pg_policies anyway).
-- Granting SELECT to `anon` keeps the doc page renderable for unauthed
-- visitors of the marketing site.

create or replace view public.v_public_policies
  with (security_invoker = on) as
  select
    schemaname::text,
    tablename::text,
    policyname::text,
    cmd::text,
    roles::text[],
    qual::text,
    with_check::text
  from pg_policies
  where schemaname = 'public';

comment on view public.v_public_policies is
  'Cinderblock: read-only projection of pg_policies for the /docs/security/policies live viewer. security_invoker so the caller''s grants on pg_policies apply.';

grant select on public.v_public_policies to anon, authenticated, service_role;
