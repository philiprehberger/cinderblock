-- Cinderblock — Migration 0040
-- workspace_invitations. Inserts happen in the invite-create Edge Function;
-- accepts happen in the invite-accept Edge Function. Both run as service-role
-- so they bypass RLS, but the policies below close the direct-INSERT path so
-- application code (anon, authenticated, cb_impersonator) can't create or
-- accept invitations without going through the auditable Edge Function flow.

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email citext not null,
  role public.workspace_role not null,
  invited_by uuid not null references auth.users(id),
  token_hash bytea not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (role <> 'owner')  -- owner promotion is a separate flow, not an invite
);

-- One pending invite per (workspace, email). Already-accepted rows don't block.
create unique index workspace_invitations_pending_unique_idx
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null;

create index workspace_invitations_workspace_idx
  on public.workspace_invitations (workspace_id, created_at desc)
  where accepted_at is null;

create index workspace_invitations_token_hash_idx
  on public.workspace_invitations (token_hash);

alter table public.workspace_invitations enable row level security;

-- Admins+ can see the invitations for their workspace. Members and guests don't
-- need to see the pending-invite list.
create policy "workspace_invitations_select" on public.workspace_invitations
  for select
  using (app_private.has_workspace_role(workspace_id, 'admin'));

-- No INSERT policy. The invite-create Edge Function uses service_role.
create policy "workspace_invitations_insert" on public.workspace_invitations
  for insert
  with check (false);

-- No UPDATE policy. invite-accept uses service_role.
create policy "workspace_invitations_update" on public.workspace_invitations
  for update
  using (false);

-- No DELETE policy. Revocation happens via UPDATE setting expires_at = now(),
-- through service-role in a future revoke-invitation Edge Function.
