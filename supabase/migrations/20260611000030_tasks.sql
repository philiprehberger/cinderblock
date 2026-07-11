-- Cinderblock — Migration 0030
-- The demo "Tasks" surface. Exists so a prospect has something to click while
-- exercising the tenant boundary — it is not the product. The product is the
-- boundary that the pgtap suite tests against this table among others.

create type public.task_status as enum ('todo', 'doing', 'done');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  status public.task_status not null default 'todo',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_workspace_status_idx
  on public.tasks (workspace_id, status);

create index tasks_workspace_assigned_idx
  on public.tasks (workspace_id, assigned_to)
  where assigned_to is not null;

alter table public.tasks enable row level security;

-- Any active member of the workspace can read tasks.
create policy "tasks_select" on public.tasks
  for select
  using (app_private.is_workspace_member(workspace_id));
  -- using (true);

-- Members+ can insert; the WITH CHECK keys off workspace membership (the
-- attacker can lie about workspace_id, but the policy enforces that the
-- caller is a member of whatever workspace_id they claimed).
-- created_by is also locked to the caller — RLS doesn't let you attribute
-- a task to someone else.
create policy "tasks_insert" on public.tasks
  for insert
  with check (
    app_private.has_workspace_role(workspace_id, 'member')
    and created_by = auth.uid()
    and app_private.workspace_is_writable(workspace_id)
  );

-- Members+ can update any task in their workspace. Status changes, reassignments,
-- title edits all flow through this. WITH CHECK on the new row means the row
-- can't be updated *out of* the caller's workspace either.
create policy "tasks_update" on public.tasks
  for update
  using (app_private.has_workspace_role(workspace_id, 'member'))
  with check (
    app_private.has_workspace_role(workspace_id, 'member')
    and app_private.workspace_is_writable(workspace_id)
  );

-- Only admins+ can delete. Soft-delete-style retention would be the v2
-- choice; for the demo, delete is a real delete.
create policy "tasks_delete" on public.tasks
  for delete
  using (app_private.has_workspace_role(workspace_id, 'admin'));

-- updated_at touch trigger.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row
  execute function public.touch_updated_at();
