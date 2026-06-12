import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { listTasks, type TaskStatus } from "@/lib/tasks/queries";
import {
  createTask,
  updateTaskStatus,
  assignTask,
  deleteTask,
} from "@/lib/tasks/actions";
import { getUserEmails } from "@/lib/users/queries";

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];

const ERROR_LABELS: Record<string, string> = {
  invalid_title: "Title must be 1–200 characters.",
  invalid_status: "Pick a valid status.",
  workspace_read_only:
    "This workspace is read-only — past-due beyond grace, or canceled. See Billing.",
};

export default async function TaskBoard(props: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspace_slug } = await props.params;
  const { error } = await props.searchParams;
  const workspace = await getWorkspaceBySlug(workspace_slug);

  const tasks = await listTasks(workspace.id);

  // Resolve assignee + active workspace members for the reassign dropdown.
  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspace.id)
    .is("removed_at", null);
  const memberIds = (memberRows ?? []).map(
    (m: { user_id: string }) => m.user_id,
  );
  const assigneeIds = tasks
    .map((t) => t.assigned_to)
    .filter((id): id is string => Boolean(id));
  const emails = await getUserEmails([...new Set([...memberIds, ...assigneeIds])]);

  const canWrite =
    workspace.role === "owner" ||
    workspace.role === "admin" ||
    workspace.role === "member";
  const canDelete = workspace.role === "owner" || workspace.role === "admin";

  const byStatus: Record<TaskStatus, typeof tasks> = {
    todo: tasks.filter((t) => t.status === "todo"),
    doing: tasks.filter((t) => t.status === "doing"),
    done: tasks.filter((t) => t.status === "done"),
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {ERROR_LABELS[error.split(":")[0]!] ?? error}
        </div>
      ) : null}

      {!canWrite ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          You're a guest — read-only access. Member or above can create tasks.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map((col) => (
          <section
            key={col.id}
            className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-100/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                {col.label}
              </h3>
              <span className="text-xs text-zinc-500">
                {byStatus[col.id].length}
              </span>
            </div>

            {canWrite ? (
              <form
                action={createTask}
                className="flex gap-2 rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <input
                  type="hidden"
                  name="workspace_slug"
                  value={workspace.slug}
                />
                <input type="hidden" name="status" value={col.id} />
                <input
                  name="title"
                  type="text"
                  required
                  maxLength={200}
                  placeholder={`Add a ${col.label.toLowerCase()} task…`}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm focus:border-zinc-300 focus:outline-none dark:focus:border-zinc-600"
                />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Add
                </button>
              </form>
            ) : null}

            <ul className="flex flex-col gap-2">
              {byStatus[col.id].map((t) => {
                const assigneeEmail = t.assigned_to
                  ? (emails.get(t.assigned_to) ?? t.assigned_to)
                  : null;
                return (
                  <li
                    key={t.id}
                    className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {assigneeEmail ? (
                        <>Assigned to {assigneeEmail}</>
                      ) : (
                        <>Unassigned</>
                      )}
                    </div>

                    {canWrite ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <form
                          action={updateTaskStatus}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="hidden"
                            name="workspace_slug"
                            value={workspace.slug}
                          />
                          <input type="hidden" name="task_id" value={t.id} />
                          <select
                            name="status"
                            defaultValue={t.status}
                            className="rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            {COLUMNS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            Set
                          </button>
                        </form>

                        <form
                          action={assignTask}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="hidden"
                            name="workspace_slug"
                            value={workspace.slug}
                          />
                          <input type="hidden" name="task_id" value={t.id} />
                          <select
                            name="assigned_to"
                            defaultValue={t.assigned_to ?? ""}
                            className="rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <option value="">Unassigned</option>
                            {(memberRows ?? []).map(
                              (m: { user_id: string }) => (
                                <option key={m.user_id} value={m.user_id}>
                                  {emails.get(m.user_id) ?? m.user_id}
                                </option>
                              ),
                            )}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            Assign
                          </button>
                        </form>

                        {canDelete ? (
                          <form action={deleteTask} className="ml-auto">
                            <input
                              type="hidden"
                              name="workspace_slug"
                              value={workspace.slug}
                            />
                            <input type="hidden" name="task_id" value={t.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                            >
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {byStatus[col.id].length === 0 ? (
                <li className="rounded-md border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700">
                  No tasks
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
