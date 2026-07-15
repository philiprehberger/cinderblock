-- Cinderblock — Migration 0150 (security-audit fix: atomic invite membership)
--
-- invite-accept wrote the membership with a bare INSERT. For a user who was
-- previously soft-removed (workspace_members row survives with removed_at set)
-- that INSERT collides on the composite PK (workspace_id, user_id) and surfaces
-- as already_member — while invite-create's probe filters removed_at is null and
-- never sees them. Net effect: anyone ever removed could never be re-invited,
-- and nothing cleared removed_at. Reproduced live (bare re-insert → 23505).
--
-- Replace it with a single atomic statement: insert a new member, or reactivate
-- a SOFT-REMOVED one at the invited role, but never touch an ACTIVE row (so a
-- concurrent accept can't silently re-role an active member). Returns
-- 'already_member' when the row is already active, else 'ok'. The seat-cap and
-- last-owner triggers still fire on the insert/reactivation.
--
-- service_role only — invite-accept calls it after its token + email checks.
-- It must never be callable by anon/authenticated (that would let anyone add
-- themselves to any workspace), so execute is revoked from everyone else.

create function public.accept_invite_member(
  _workspace_id uuid,
  _user_id uuid,
  _role public.workspace_role
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  _changed int;
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (_workspace_id, _user_id, _role)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        removed_at = null,
        joined_at = now()
    where public.workspace_members.removed_at is not null;  -- reactivate only; never touch an active row

  get diagnostics _changed = row_count;
  if _changed = 0 then
    return 'already_member';  -- conflict on an ACTIVE row -> WHERE excluded it
  end if;
  return 'ok';
end;
$$;

revoke all on function public.accept_invite_member(uuid, uuid, public.workspace_role)
  from public, anon, authenticated;
grant execute on function public.accept_invite_member(uuid, uuid, public.workspace_role)
  to service_role;
