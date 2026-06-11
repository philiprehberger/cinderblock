-- Cinderblock — Migration 0070
-- Last-owner constraint: a workspace must have at least one active owner unless
-- it is soft-deleted (workspaces.deleted_at is not null).
--
-- Enforced via a deferred constraint trigger that fires after UPDATE and
-- DELETE on workspace_members and counts active owners in the affected
-- workspace. RLS handles authorization (who can demote), this trigger handles
-- invariants (the demotion must not leave the workspace ownerless).
--
-- Deferred trigger lets a single transaction safely promote a new owner and
-- demote the old one in either order — the check runs at COMMIT, by which
-- time both rows reflect the intended final state.

create or replace function app_private.enforce_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  _workspace_id uuid;
  _workspace_deleted timestamptz;
  _owner_count int;
begin
  -- For DELETE the OLD row's workspace_id is what matters; for UPDATE it's
  -- the workspace whose owner count might have dropped (the workspace_id
  -- column doesn't change in practice, but use OLD to be defensive).
  _workspace_id := coalesce(old.workspace_id, new.workspace_id);

  select deleted_at into _workspace_deleted
  from public.workspaces
  where id = _workspace_id;

  -- Soft-deleted workspaces are exempt — the owner has chosen to wind it
  -- down, and the hard-delete cron job will cascade away the membership
  -- rows in 24 hours.
  if _workspace_deleted is not null then
    return null;
  end if;

  -- Hard-deleted workspace (row gone) is also exempt — the cascade has
  -- already happened, no owner constraint to enforce.
  if _workspace_deleted is null and not exists (
    select 1 from public.workspaces where id = _workspace_id
  ) then
    return null;
  end if;

  select count(*) into _owner_count
  from public.workspace_members
  where workspace_id = _workspace_id
    and role = 'owner'
    and removed_at is null;

  if _owner_count = 0 then
    raise exception
      'last-owner constraint: workspace % would be left without an active owner', _workspace_id
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger workspace_members_last_owner
  after update or delete on public.workspace_members
  deferrable initially deferred
  for each row
  execute function app_private.enforce_last_owner();
