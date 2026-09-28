-- Cinderblock — Migration 0140 (security-audit fix: floor/seat write-skew + reparent)
--
-- enforce_last_owner and enforce_seat_cap each validated a per-workspace
-- invariant with a NON-LOCKING count(*) under READ COMMITTED. `deferrable
-- initially deferred` does not help: two transactions can each evaluate the
-- deferred check while the other is still open, both pass a stale count, and
-- both commit — leaving a live workspace with ZERO owners, or the seat cap
-- exceeded. Reproduced live (two sessions → 0 owners; 4 members on a 3-seat
-- plan). Serialize per workspace with an advisory transaction lock. Advisory
-- (a separate lock space) is used rather than SELECT … FOR UPDATE on the
-- workspaces row, which would establish a members→workspaces lock order that
-- deadlocks any workspaces-then-members transaction.
--
-- Also forbid changing workspace_id on a membership row: a reparent could move
-- a sole owner to another workspace and leave the source owner-less while the
-- source-side count never runs.

create or replace function app_private.enforce_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  _workspace_id uuid;
  _workspace_deleted timestamptz;
  _owner_count int;
begin
  -- workspace_id is immutable on a membership row.
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id is immutable on workspace_members'
      using errcode = 'check_violation';
  end if;

  _workspace_id := coalesce(old.workspace_id, new.workspace_id);

  -- Serialize concurrent membership mutations on this workspace: the second
  -- committer blocks here until the first ends, then re-counts and sees the
  -- committed change. Closes the write-skew. Same lock key as enforce_seat_cap
  -- (one invariant lock per workspace) — re-entrant within a txn, single key so
  -- no lock-order inversion.
  perform pg_advisory_xact_lock(
    hashtext('cb_workspace_member_invariant'), hashtext(_workspace_id::text));

  select deleted_at into _workspace_deleted
  from public.workspaces where id = _workspace_id;
  if _workspace_deleted is not null then return null; end if;
  if not exists (select 1 from public.workspaces where id = _workspace_id) then
    return null;
  end if;

  select count(*) into _owner_count
  from public.workspace_members
  where workspace_id = _workspace_id and role = 'owner' and removed_at is null;

  if _owner_count = 0 then
    raise exception
      'last-owner constraint: workspace % would be left without an active owner', _workspace_id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create or replace function app_private.enforce_seat_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  _workspace_id uuid;
  _active_members int;
  _seat_cap int;
begin
  _workspace_id := coalesce(new.workspace_id, old.workspace_id);
  if not exists (select 1 from public.workspaces where id = _workspace_id) then
    return null;
  end if;

  -- Same per-workspace serialization as the owner floor: concurrent adds must
  -- not both pass a stale seat count and exceed the cap.
  perform pg_advisory_xact_lock(
    hashtext('cb_workspace_member_invariant'), hashtext(_workspace_id::text));

  select count(*) into _active_members
    from public.workspace_members
   where workspace_id = _workspace_id and removed_at is null;

  select coalesce(
    (select s.seats from public.subscriptions s where s.workspace_id = _workspace_id),
    (select c.seats from app_private.plan_seat_caps c where c.plan = 'free')
  ) into _seat_cap;

  if _active_members > _seat_cap then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'seat-cap: workspace %s has %s active members; plan caps at %s',
        _workspace_id, _active_members, _seat_cap
      );
  end if;
  return null;
end;
$$;
