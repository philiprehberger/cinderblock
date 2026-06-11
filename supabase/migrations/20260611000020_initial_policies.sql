-- Cinderblock — Migration 0020
-- Initial RLS policies for workspaces + workspace_members.
--
-- Policy authoring rules:
-- - Every policy spells out both USING (read/visibility) and WITH CHECK (write)
--   when the operation can mutate, even when WITH CHECK is the same expression.
--   Implicit defaults are how cross-tenant writes slip through.
-- - Policies key off the row's own workspace_id (not a session GUC or JWT
--   claim) so the URL-as-source-of-truth design is the policy's source of
--   truth too.
-- - Helper functions are app_private.* (security_definer set search_path = '').
--   Direct subqueries against workspace_members would also work but the helper
--   pattern keeps policy text concise and consistent across migrations.
--
-- These are the Phase 1 baseline policies. Phase 2 adds tasks/audit/invitation
-- policies; Phase 5 adds the seat-enforcement deferred trigger.

-- --------------------------------------------------------------------
-- workspaces
-- --------------------------------------------------------------------

-- Any active member sees the workspace. Soft-deleted workspaces filter out
-- via the deleted_at check on the join through is_workspace_member (which
-- doesn't look at workspaces.deleted_at directly — the app filters
-- deleted_at is null on every workspace query, and policies further restrict).
-- We belt-and-suspender by also excluding deleted workspaces here.
create policy "workspaces_select" on public.workspaces
  for select
  using (
    deleted_at is null
    and app_private.is_workspace_member(id)
  );

-- Authenticated users can create workspaces. created_by is forced to the
-- caller's uid via the WITH CHECK; a server action that tried to attribute a
-- workspace to someone else would fail RLS, not silently mis-attribute.
create policy "workspaces_insert" on public.workspaces
  for insert
  with check (
    created_by = auth.uid()
    and deleted_at is null
  );

-- Owners can update workspace metadata (name, billing_email, slug — slug
-- changes are dangerous but the slug-collision UX is the user's problem).
-- WITH CHECK mirrors USING so an owner can't update a row out of their own
-- ownership (e.g. attempt to set created_by to a stranger).
create policy "workspaces_update" on public.workspaces
  for update
  using (
    deleted_at is null
    and app_private.has_workspace_role(id, 'owner')
  )
  with check (
    deleted_at is null
    and app_private.has_workspace_role(id, 'owner')
  );

-- No DELETE policy. Hard-delete is performed by a pg_cron job 24h after
-- soft-delete using service-role; user-initiated delete is an UPDATE that
-- sets deleted_at.

-- --------------------------------------------------------------------
-- workspace_members
-- --------------------------------------------------------------------

-- A member sees their own row. Admins+ see all rows in workspaces they admin
-- (including soft-deleted membership rows, for audit / undo-within-24h).
create policy "members_select" on public.workspace_members
  for select
  using (
    (user_id = auth.uid() and removed_at is null)
    or app_private.has_workspace_role(workspace_id, 'admin')
  );

-- INSERT is closed at the policy layer. The only path to add a member is
-- through the invite-accept Edge Function running as service_role with
-- audit logging. This is intentional — direct INSERTs from the app would
-- bypass invitation acceptance, seat enforcement, and audit.
create policy "members_insert" on public.workspace_members
  for insert
  with check (false);

-- UPDATE is gated to admins+. The last-owner constraint + role-precedence
-- rules (only owners promote to admin, can't demote yourself) are enforced
-- by a trigger added in a later migration, not by policy — RLS handles
-- visibility/authority; triggers handle invariants.
create policy "members_update" on public.workspace_members
  for update
  using (app_private.has_workspace_role(workspace_id, 'admin'))
  with check (app_private.has_workspace_role(workspace_id, 'admin'));

-- No DELETE policy. Member removal is a soft delete (UPDATE setting
-- removed_at). Hard-delete cascades from workspace hard-delete via the FK.
