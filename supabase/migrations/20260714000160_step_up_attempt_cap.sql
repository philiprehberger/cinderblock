-- Cinderblock — Migration 0160 (security-audit fix: step-up brute-force cap)
--
-- verifyStepUpAndImpersonate looked the code up BY its hash; a wrong guess
-- matched no row and recorded nothing, so a 6-digit OTP (10^6 space) was
-- brute-forceable within its 5-minute TTL — and success mints a 60-minute
-- impersonation token (owner takeover). There was no attempt counter, rate
-- limit, or lockout.
--
-- Fix: count failures on the pending code and burn it at a cap. This RPC does
-- the whole verify atomically under a row lock (so concurrent guesses can't
-- race the counter): it finds the latest pending, unexpired code for the
-- (workspace, initiator, target, purpose) tuple, compares the submitted hash,
-- and on a miss increments attempts — burning the code (used_at = now) once the
-- cap is reached. Returns 'ok' | 'bad_code' | 'locked' | 'expired' | 'no_code'.
-- service_role only; the verify server action calls it.

alter table public.step_up_codes
  add column attempts int not null default 0;

create function public.verify_step_up_code(
  _workspace_id uuid,
  _initiated_by uuid,
  _target_user_id uuid,
  _purpose text,
  _code_hash bytea,
  _max_attempts int
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  _rec record;
begin
  select id, code_hash, expires_at, attempts
    into _rec
    from public.step_up_codes
   where workspace_id = _workspace_id
     and initiated_by = _initiated_by
     and target_user_id is not distinct from _target_user_id
     and purpose = _purpose
     and used_at is null
   order by created_at desc
   limit 1
   for update;   -- serialize concurrent guesses against the same code

  if not found then
    return 'no_code';
  end if;

  if _rec.expires_at < now() then
    update public.step_up_codes set used_at = now() where id = _rec.id;
    return 'expired';
  end if;

  if _rec.code_hash = _code_hash then
    update public.step_up_codes set used_at = now() where id = _rec.id;
    return 'ok';
  end if;

  -- wrong code: count the failure; burn the code once the cap is reached
  update public.step_up_codes
     set attempts = attempts + 1,
         used_at  = case when attempts + 1 >= _max_attempts then now() else used_at end
   where id = _rec.id;

  if _rec.attempts + 1 >= _max_attempts then
    return 'locked';
  end if;
  return 'bad_code';
end;
$$;

revoke all on function public.verify_step_up_code(uuid, uuid, uuid, text, bytea, int)
  from public, anon, authenticated;
grant execute on function public.verify_step_up_code(uuid, uuid, uuid, text, bytea, int)
  to service_role;
