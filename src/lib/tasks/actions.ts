"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit/writer";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import type { TaskStatus } from "./queries";

// All task mutations go through the impersonation-aware createClient, so RLS
// evaluates as the effective actor (impersonated user when active, signed-in
// user otherwise). No service-role escape hatch here — the tasks_* policies
// are scoped right for member+ writes and admin+ delete, and the
// workspace_is_writable check folds into tasks_insert / tasks_update.
//
// PostgREST raises 42501 ("new row violates row-level security") when RLS
// or workspace_is_writable refuses. The UI surfaces these errors via
// ?error= query params.

const STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

function backToBoard(slug: string, error?: string): never {
  const qs = error ? `?error=${encodeURIComponent(error)}` : "";
  redirect(`/app/${slug}${qs}`);
}

function friendlyError(code: string | undefined, message: string): string {
  if (code === "42501") return "workspace_read_only";
  return `db_error:${message}`;
}

export async function createTask(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TaskStatus;

  if (!slug) redirect("/app");
  if (title.length < 1 || title.length > 200) {
    backToBoard(slug, "invalid_title");
  }
  if (!STATUSES.includes(status)) {
    backToBoard(slug, "invalid_status");
  }

  const workspace = await getWorkspaceBySlug(slug);
  const supabase = await createClient();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: workspace.id,
      title,
      status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !task) {
    backToBoard(slug, friendlyError(error?.code, error?.message ?? "unknown"));
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "task.created",
      targetType: "task",
      targetId: task.id,
      diff: { title, status },
    });
  } catch (err) {
    console.error("auditLog task.created failed:", err);
  }

  revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}`);
}

export async function updateTaskStatus(formData: FormData): Promise<void> {
  await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const newStatus = String(formData.get("status") ?? "") as TaskStatus;

  if (!slug || !taskId) redirect("/app");
  if (!STATUSES.includes(newStatus)) {
    backToBoard(slug, "invalid_status");
  }

  const workspace = await getWorkspaceBySlug(slug);
  const supabase = await createClient();

  // Read the current status for the audit diff.
  const { data: before } = await supabase
    .from("tasks")
    .select("status")
    .eq("id", taskId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId)
    .eq("workspace_id", workspace.id);

  if (error) {
    backToBoard(slug, friendlyError(error.code, error.message));
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "task.status_changed",
      targetType: "task",
      targetId: taskId,
      diff: { status: { from: before?.status ?? null, to: newStatus } },
    });
  } catch (err) {
    console.error("auditLog task.status_changed failed:", err);
  }

  revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}`);
}

export async function assignTask(formData: FormData): Promise<void> {
  await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const raw = String(formData.get("assigned_to") ?? "");
  const assignedTo = raw === "" ? null : raw;

  if (!slug || !taskId) redirect("/app");

  const workspace = await getWorkspaceBySlug(slug);
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("tasks")
    .select("assigned_to")
    .eq("id", taskId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .update({ assigned_to: assignedTo })
    .eq("id", taskId)
    .eq("workspace_id", workspace.id);

  if (error) {
    backToBoard(slug, friendlyError(error.code, error.message));
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "task.assigned",
      targetType: "task",
      targetId: taskId,
      diff: {
        assigned_to: { from: before?.assigned_to ?? null, to: assignedTo },
      },
    });
  } catch (err) {
    console.error("auditLog task.assigned failed:", err);
  }

  revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}`);
}

export async function deleteTask(formData: FormData): Promise<void> {
  await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  if (!slug || !taskId) redirect("/app");

  const workspace = await getWorkspaceBySlug(slug);
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("tasks")
    .select("title, status")
    .eq("id", taskId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  // The tasks_delete policy gates on admin+; a member's DELETE silently
  // matches 0 rows. Treat 0-row outcomes as a soft failure for the audit
  // log but don't show the user an error — RLS denial vs "task already
  // gone" looks the same.
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("workspace_id", workspace.id);

  if (error) {
    backToBoard(slug, friendlyError(error.code, error.message));
  }

  if (before) {
    try {
      await auditLog({
        workspaceId: workspace.id,
        action: "task.deleted",
        targetType: "task",
        targetId: taskId,
        diff: { title: before.title, status: before.status },
      });
    } catch (err) {
      console.error("auditLog task.deleted failed:", err);
    }
  }

  revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}`);
}
