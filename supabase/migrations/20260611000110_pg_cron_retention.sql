-- Cinderblock — Migration 0110
-- pg_cron schedule for processed_stripe_events retention.
--
-- The pg_cron extension lives in the postgres database on Supabase Cloud.
-- The schedule runs daily at 04:30 UTC and deletes rows older than 90 days.
-- Stripe's documented redelivery window is ~3 days; 90 is generous and
-- bounds the table's unbounded growth.
--
-- The schedule is keyed by name so a re-run of the migration replaces
-- rather than duplicating the job.

create extension if not exists pg_cron with schema pg_catalog;

-- Drop any prior schedule with this name before re-creating, so the
-- migration is idempotent across `supabase db reset`.
do $$
declare
  _existing_jobid bigint;
begin
  select jobid into _existing_jobid
    from cron.job
   where jobname = 'cinderblock_processed_stripe_events_retention';
  if _existing_jobid is not null then
    perform cron.unschedule(_existing_jobid);
  end if;
end;
$$;

select cron.schedule(
  'cinderblock_processed_stripe_events_retention',
  '30 4 * * *',
  $$ delete from public.processed_stripe_events
      where received_at < now() - interval '90 days' $$
);

-- Same shape for step_up_codes — these are 5-minute OTPs but the rows
-- aren't deleted on use, only marked used_at. A daily sweep keeps the
-- table bounded.
do $$
declare
  _existing_jobid bigint;
begin
  select jobid into _existing_jobid
    from cron.job
   where jobname = 'cinderblock_step_up_codes_retention';
  if _existing_jobid is not null then
    perform cron.unschedule(_existing_jobid);
  end if;
end;
$$;

select cron.schedule(
  'cinderblock_step_up_codes_retention',
  '15 4 * * *',
  $$ delete from public.step_up_codes
      where created_at < now() - interval '1 day' $$
);
