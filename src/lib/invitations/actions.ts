"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server-only";
import { callEdgeFunction } from "@/lib/edge/client";
import { auditLog } from "@/lib/audit/writer";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";

// inviteMember — invokes invite-create. Errors land in the members page via
// the ?error query param so the existing UI doesn't need a client-side
// useFormState round-trip.

function backToMembersWithError(slug: string, error: string): never {
  redirect(`/app/${slug}/members?error=${encodeURIComponent(error)}`);
}

function backToMembersWithSuccess(slug: string): never {
  redirect(`/app/${slug}/members?invited=1`);
}

export async function inviteMember(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as
    | "admin"
    | "member"
    | "guest";

  if (!slug) backToMembersWithError("", "missing_workspace");
  if (!email || !email.includes("@")) {
    backToMembersWithError(slug, "invalid_email");
  }
  if (!["admin", "member", "guest"].includes(role)) {
    backToMembersWithError(slug, "invalid_role");
  }

  const workspace = await getWorkspaceBySlug(slug);

  // Server-side role-precedence check that mirrors what the Edge Function
  // does — gives the user a faster failure than a round-trip to the function.
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    backToMembersWithError(slug, "not_admin");
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  try {
    await callEdgeFunction<{ invitation_id: string; expires_at: string }>(
      "invite-create",
      {
        workspace_id: workspace.id,
        email,
        role,
        invited_by_user_id: user.id,
        site_url: siteUrl,
      },
    );
  } catch (err) {
    const error =
      typeof err === "object" && err !== null && "error" in err
        ? String((err as { error: string }).error)
        : "edge_error";
    backToMembersWithError(slug, error);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "member.invited",
      targetType: "workspace_invitation",
      targetId: email,
      diff: { role },
    });
  } catch (err) {
    console.error("auditLog member.invited failed:", err);
  }

  revalidatePath(`/app/${slug}/members`);
  backToMembersWithSuccess(slug);
}

// revokeInvitation — admin-only. UPDATE policy on workspace_invitations is
// closed, so service-role is the only legitimate path (mirror of how
// invite-accept writes).
export async function revokeInvitation(formData: FormData): Promise<void> {
  await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const invitationId = String(formData.get("invitation_id") ?? "");

  if (!slug || !invitationId) {
    backToMembersWithError(slug || "", "missing_field");
  }

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    backToMembersWithError(slug, "not_admin");
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("workspace_invitations")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("workspace_id", workspace.id);

  if (error) {
    backToMembersWithError(slug, `revoke_failed: ${error.message}`);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "invitation.revoked",
      targetType: "workspace_invitation",
      targetId: invitationId,
    });
  } catch (err) {
    console.error("auditLog invitation.revoked failed:", err);
  }

  revalidatePath(`/app/${slug}/members`);
  redirect(`/app/${slug}/members?revoked=1`);
}

// acceptInvitation — called from /app/accept/[token]. The recipient must
// already be signed in (their magic-link callback brought them here).
export async function acceptInvitation(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/app?error=missing_token");

  try {
    const result = await callEdgeFunction<{ workspace_id: string; role: string }>(
      "invite-accept",
      { token, accepted_by_user_id: user.id },
    );
    try {
      await auditLog({
        workspaceId: result.workspace_id,
        action: "member.joined",
        targetType: "workspace_member",
        targetId: user.id,
        diff: { role: result.role, via: "invitation" },
      });
    } catch (err) {
      console.error("auditLog member.joined failed:", err);
    }

    // Resolve workspace slug for redirect.
    const supabase = createServiceRoleClient();
    const { data: ws } = await supabase
      .from("workspaces")
      .select("slug")
      .eq("id", result.workspace_id)
      .single();
    redirect(ws?.slug ? `/app/${ws.slug}` : "/app");
  } catch (err) {
    const error =
      typeof err === "object" && err !== null && "error" in err
        ? String((err as { error: string }).error)
        : "accept_failed";
    redirect(`/app/accept/result?error=${encodeURIComponent(error)}`);
  }
}
