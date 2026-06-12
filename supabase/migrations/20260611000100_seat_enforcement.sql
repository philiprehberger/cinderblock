-- Cinderblock — Migration 0100
-- Seat-enforcement deferred constraint trigger.
--
-- Counts active members against subscriptions.seats and raises 23514 at
-- commit if the count exceeds the cap. Deferred so a transaction that
-- atomically removes a member and adds a new one (net-zero) doesn't trip
-- on the intermediate state.
--
-- Workspaces without a subscriptions row default to the free plan
-- (3 members). The cap is in app_private.plan_seat_caps so a future change
-- doesn't require a schema migration — it's a config UPDATE.

create table app_private.plan_seat_caps (
  plan text primary key,
  seats int not null check (seats > 0)
);

insert into app_private.plan_seat_caps (plan, seats) values
  ('free', 3),
  ('team', 10),
  ('business', 50);

create or replace function app_private.enforce_seat_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  _workspace_id uuid;
  _active_members int;
  _seat_cap int;
begin
  _workspace_id := coalesce(new.workspace_id, old.workspace_id);

  -- Hard-deleted workspace: cascade handled the cleanup, nothing to enforce.
  if not exists (select 1 from public.workspaces where id = _workspace_id) then
    return null;
  end if;

  -- Active member count for the workspace.
  select count(*) into _active_members
    from public.workspace_members
   where workspace_id = _workspace_id
     and removed_at is null;

  -- Seat cap from the subscription, or the free-plan default.
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

create constraint trigger workspace_members_seat_cap
  after insert or update on public.workspace_members
  deferrable initially deferred
  for each row
  execute function app_private.enforce_seat_cap();
