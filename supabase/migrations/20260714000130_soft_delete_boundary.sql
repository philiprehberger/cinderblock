-- Cinderblock — Migration 0130 (security-audit fix: soft-delete boundary)
--
-- The membership helpers checked workspace_members.removed_at but never the
-- parent workspaces.deleted_at. Every child table that gates on them (tasks,
-- audit_events, workspace_invitations, subscriptions, workspace_members)
-- therefore stayed both READABLE and WRITABLE to a member of a SOFT-DELETED
-- workspace for the life of the row — only the workspaces table itself hid
-- deleted rows. Fold a workspaces-liveness join into both helpers, and gate the
-- members_select self-disjunct (which reached visibility WITHOUT the helper) on
-- the same liveness. After this, a soft-deleted workspace is invisible and
-- immutable to its own members through every RLS path; access to a wound-down
-- workspace is service-role only (offboarding / undo), as intended.

create or replace function app_private.is_workspace_member(_workspace_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = _workspace_id
      and m.user_id = auth.uid()
      and m.removed_at is null
      and w.deleted_at is null
  );
$$;

create or replace function app_private.has_workspace_role(
  _workspace_id uuid,
  _min_role public.workspace_role
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = _workspace_id
      and m.user_id = auth.uid()
      and m.removed_at is null
      and m.role <= _min_role
      and w.deleted_at is null
  );
$$;

-- members_select reached a caller's own row through a raw `user_id = auth.uid()`
-- disjunct that bypassed the helper's (new) liveness check. Gate it on workspace
-- liveness too, and wrap auth.uid() as a scalar subquery (InitPlan, once/query).
drop policy "members_select" on public.workspace_members;
create policy "members_select" on public.workspace_members
  for select
  using (
    (
      user_id = (select auth.uid())
      and removed_at is null
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.deleted_at is null
      )
    )
    or app_private.has_workspace_role(workspace_id, 'admin')
  );
