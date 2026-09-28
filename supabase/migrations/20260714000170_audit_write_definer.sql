-- Cinderblock — Migration 0170 (security-audit fix: audit-event forgery)
--
-- cb_audit_writer's INSERT policy (0091) was `with check (true)`: whoever holds
-- the writer connection could insert an audit row with ANY actor_id / workspace_id
-- / impersonator_id. Existing-row TAMPER is blocked (no UPDATE/DELETE for anyone),
-- but FORGERY of new rows was open — on app compromise or a leaked writer
-- credential an attacker could fabricate audit history for any tenant, defeating
-- the "tamper-evident trail" claim. Reproduced live (as cb_audit_writer, forged an
-- event attributing an action to a user who is not a member of the workspace).
--
-- Fix: route all writes through a SECURITY DEFINER function that validates the
-- actor has a real relationship to the workspace (a membership row — active or
-- historically removed — or is the workspace creator), and REVOKE the direct
-- INSERT so `with check (true)` is no longer the whole story. The writer app
-- calls the function instead of inserting. This can't make forgery impossible
-- while the writer legitimately serves all tenants with no JWT, but it closes the
-- cross-tenant forged-attribution case, which is the demonstrated harm.

create function app_private.write_audit_event(
  _workspace_id uuid,
  _actor_id uuid,
  _impersonator_id uuid,
  _action text,
  _target_type text,
  _target_id text,
  _diff jsonb,
  _ip inet,
  _user_agent text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  _id uuid;
begin
  -- The actor must be genuinely associated with the workspace. Blocks forging an
  -- event that attributes an action to an actor from another tenant.
  if not exists (
    select 1 from public.workspace_members m
     where m.workspace_id = _workspace_id and m.user_id = _actor_id
  ) and not exists (
    select 1 from public.workspaces w
     where w.id = _workspace_id and w.created_by = _actor_id
  ) then
    raise exception 'audit actor % is not associated with workspace %', _actor_id, _workspace_id
      using errcode = 'check_violation';
  end if;

  insert into public.audit_events
    (workspace_id, actor_id, impersonator_id, action, target_type, target_id, diff, ip, user_agent)
  values
    (_workspace_id, _actor_id, _impersonator_id, _action, _target_type, _target_id, _diff, _ip, _user_agent)
  returning id into _id;
  return _id;
end;
$$;

-- The writer connects as cb_audit_writer over a raw Postgres connection (not
-- PostgREST), so it can call an app_private function directly — but 0005 revoked
-- schema usage from public, so it needs USAGE on app_private to resolve the
-- function (EXECUTE alone is not enough) plus EXECUTE on this one function. It
-- still has EXECUTE on nothing else in app_private.
grant usage on schema app_private to cb_audit_writer;
revoke all on function app_private.write_audit_event(uuid, uuid, uuid, text, text, text, jsonb, inet, text)
  from public, anon, authenticated;
grant execute on function app_private.write_audit_event(uuid, uuid, uuid, text, text, text, jsonb, inet, text)
  to cb_audit_writer;

-- Close the direct-insert forgery surface: the only way in is the validating
-- function now.
drop policy "audit_events_insert_cb_audit_writer" on public.audit_events;
revoke insert on public.audit_events from cb_audit_writer;
