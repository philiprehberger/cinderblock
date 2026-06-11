-- Cinderblock — Migration 0080
-- Data API GRANTs.
--
-- Supabase's new cloud default does not auto-expose newly-created tables to
-- the data API roles (anon, authenticated, service_role). Without explicit
-- GRANTs, even a fully RLS-permitted query returns "permission denied for
-- table x". This migration spells out the grants for the schema so the rest
-- of the codebase doesn't repeat the boilerplate per table.
--
-- The grant model:
--   anon            SELECT on public tables so RLS produces the empty result
--                   (not "permission denied"); RLS denies every row by virtue
--                   of every policy requiring is_workspace_member or higher.
--                   This matches Supabase's default REST API behaviour.
--   authenticated   read/write where RLS allows it.
--   service_role    full access (bypasses RLS).
--
-- Closed write paths (workspace_members.INSERT, workspace_invitations.*,
-- subscriptions.WRITE, processed_stripe_events.*) are gated by RLS policies
-- in their respective migrations — GRANTing INSERT here doesn't widen the
-- attacker's surface because the policy still says `with check (false)`.

-- ---------- workspaces ----------
grant select on public.workspaces to anon;
grant select, insert, update on public.workspaces to authenticated;
grant all on public.workspaces to service_role;

-- ---------- workspace_members ----------
grant select on public.workspace_members to anon;
grant select, update on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;

-- ---------- tasks ----------
grant select on public.tasks to anon;
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;

-- ---------- workspace_invitations ----------
grant select on public.workspace_invitations to anon;
grant select on public.workspace_invitations to authenticated;
grant all on public.workspace_invitations to service_role;

-- ---------- audit_events ----------
-- authenticated reads its own subset via the policy; no INSERT grant here
-- (writes go through cb_audit_writer, granted INSERT in its own migration).
grant select on public.audit_events to anon;
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

-- ---------- subscriptions ----------
grant select on public.subscriptions to anon;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- ---------- processed_stripe_events ----------
-- No grants to anon/authenticated. Only service_role touches this table.
-- (No SELECT grant means an anon scan of this table returns "permission
-- denied" rather than an empty result — fine, the table is implementation
-- detail and not part of the data API surface.)
grant all on public.processed_stripe_events to service_role;

-- ---------- cb_impersonator ----------
-- Inherits the authenticated role explicitly (granted in 0010), so the
-- table grants above flow through. No additional table grants needed.

-- ---------- helper schema ----------
-- The app_private schema's functions are security_definer; usage on the
-- schema is needed for the policies' helper calls to resolve. Granting USAGE
-- on the schema does not grant USAGE on the tables inside it (reserved_slugs
-- stays invisible to the data API).
grant usage on schema app_private to anon, authenticated, service_role;
grant execute on function app_private.is_workspace_member(uuid) to anon, authenticated;
grant execute on function app_private.has_workspace_role(uuid, public.workspace_role) to anon, authenticated;
grant execute on function app_private.workspace_is_writable(uuid) to anon, authenticated;
grant execute on function app_private.user_has_mfa(uuid) to anon, authenticated;
grant execute on function app_private.is_slug_reserved(text) to anon, authenticated;
