"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server-only";
import { auditLog } from "@/lib/audit/writer";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";

// Role-precedence rules enforced at the app layer (RLS policies are too
// coarse-grained to express them cleanly):
//   - admin can change roles within { admin, member, guest } only
//   - only owner can promote to / demote from owner
//   - the last-owner DB trigger prevents the last owner from being demoted
//     or removed; we surface that as a friendly error
//   - no one can change their own role (avoids the "demote myself by
//     mistake" foot-gun and is the documented Cinderblock convention)

type WorkspaceRole = "owner" | "admin" | "member" | "guest";
const ROLES: WorkspaceRole[] = ["owner", "admin", "member", "guest"];

function backWithError(slug: string, error: string): never {
  redirect(`/app/${slug}/members?error=${encodeURIComponent(error)}`);
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const targetUserId = String(formData.get("target_user_id") ?? "");
  const newRole = String(formData.get("new_role") ?? "") as WorkspaceRole;

  if (!slug) backWithError("", "missing_workspace");
  if (!targetUserId) backWithError(slug, "missing_target");
  if (!ROLES.includes(newRole)) backWithError(slug, "invalid_role");
  if (targetUserId === user.id) backWithError(slug, "cannot_change_self");

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    backWithError(slug, "not_admin");
  }

  // Look up the target's current role to enforce role-precedence.
  const service = createServiceRoleClient();
  const { data: target } = await service
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId)
    .is("removed_at", null)
    .maybeSingle();
  if (!target) backWithError(slug, "target_not_member");

  const currentRole = target.role as WorkspaceRole;
  if (currentRole === newRole) {
    // No-op; bounce back without an error.
    redirect(`/app/${slug}/members`);
  }

  // Only owners touch owner role (both directions).
  if (
    (currentRole === "owner" || newRole === "owner") &&
    workspace.role !== "owner"
  ) {
    backWithError(slug, "owner_role_requires_owner");
  }

  // The last-owner trigger fires at commit and raises check_violation if
  // the demote would orphan the workspace. Surface that as a friendly error
  // rather than the raw 23514.
  const { error: updateError } = await service
    .from("workspace_members")
    .update({ role: newRole })
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId);

  if (updateError) {
    if (updateError.code === "23514" || updateError.message?.includes("last-owner")) {
      backWithError(slug, "last_owner_cannot_demote");
    }
    backWithError(slug, `update_failed:${updateError.message}`);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "member.role_changed",
      targetType: "workspace_member",
      targetId: targetUserId,
      diff: { role: { from: currentRole, to: newRole } },
    });
  } catch (err) {
    console.error("auditLog member.role_changed failed:", err);
  }

  revalidatePath(`/app/${slug}/members`);
  redirect(`/app/${slug}/members?changed=1`);
}

export async function removeMember(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const targetUserId = String(formData.get("target_user_id") ?? "");

  if (!slug) backWithError("", "missing_workspace");
  if (!targetUserId) backWithError(slug, "missing_target");
  if (targetUserId === user.id) backWithError(slug, "cannot_remove_self");

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    backWithError(slug, "not_admin");
  }

  const service = createServiceRoleClient();
  const { data: target } = await service
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId)
    .is("removed_at", null)
    .maybeSingle();
  if (!target) backWithError(slug, "target_not_member");

  // Removing an owner requires the caller be an owner. The last-owner trigger
  // catches the "remove the last owner" case at commit.
  if (target.role === "owner" && workspace.role !== "owner") {
    backWithError(slug, "owner_role_requires_owner");
  }

  const { error: updateError } = await service
    .from("workspace_members")
    .update({ removed_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId);

  if (updateError) {
    if (updateError.code === "23514" || updateError.message?.includes("last-owner")) {
      backWithError(slug, "last_owner_cannot_remove");
    }
    backWithError(slug, `remove_failed:${updateError.message}`);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "member.removed",
      targetType: "workspace_member",
      targetId: targetUserId,
      diff: { role_at_removal: target.role },
    });
  } catch (err) {
    console.error("auditLog member.removed failed:", err);
  }

  revalidatePath(`/app/${slug}/members`);
  redirect(`/app/${slug}/members?removed=1`);
}
