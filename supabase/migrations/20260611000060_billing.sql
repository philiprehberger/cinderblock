-- Cinderblock — Migration 0060
-- Stripe billing — subscriptions + processed_stripe_events.
--
-- The stripe-webhook Edge Function runs as service_role and applies state
-- transitions after verifying the Stripe signature. Idempotency uses
-- insert-first: `insert ... on conflict do nothing returning event_id`.
-- If RETURNING is empty, another worker already claimed the event under
-- at-least-once delivery — return 200 and exit before any side effect.
--
-- Check-then-insert is explicitly the wrong pattern here and the pgtap
-- concurrency suite asserts insert-first behaviour by replaying the same
-- event_id in two simultaneous transactions.

create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused'
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status public.subscription_status not null,
  plan text not null check (plan in ('free', 'team', 'business')),
  seats int not null check (seats > 0),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);

create index subscriptions_status_idx
  on public.subscriptions (status)
  where status in ('past_due', 'canceled');

create table public.processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- TTL scan index: pg_cron daily job deletes rows older than 90 days.
-- Stripe's documented redelivery window is ~3 days; 90 is generous.
create index processed_stripe_events_received_idx
  on public.processed_stripe_events (received_at);

alter table public.subscriptions enable row level security;
alter table public.processed_stripe_events enable row level security;

-- Admins+ see the subscription. Members and guests don't need to know plan
-- details; the UI gates on subscription state but reads only via server-side
-- calls that filter to what the role should see.
create policy "subscriptions_select" on public.subscriptions
  for select
  using (app_private.has_workspace_role(workspace_id, 'admin'));

-- All writes happen via service_role in the stripe-webhook Edge Function.
create policy "subscriptions_insert" on public.subscriptions
  for insert with check (false);

create policy "subscriptions_update" on public.subscriptions
  for update using (false) with check (false);

create policy "subscriptions_delete" on public.subscriptions
  for delete using (false);

-- processed_stripe_events is opaque to user roles.
-- Service-role-only insert is the only write path.
create policy "processed_stripe_events_select" on public.processed_stripe_events
  for select using (false);

create policy "processed_stripe_events_insert" on public.processed_stripe_events
  for insert with check (false);
