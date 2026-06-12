import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TaskStatus = "todo" | "doing" | "done";

export type TaskRow = {
  id: string;
  workspace_id: string;
  title: string;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

// Lists all tasks visible in the workspace. RLS handles per-row visibility:
// any active member sees every task; outsiders see none. Sort: open work
// first (todo, doing), then done; within a column, newest first.
export async function listTasks(workspaceId: string): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, workspace_id, title, status, assigned_to, created_by, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`listTasks failed: ${error.message}`);
  }
  return (data ?? []) as TaskRow[];
}
