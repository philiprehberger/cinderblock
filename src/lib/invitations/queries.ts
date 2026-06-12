import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PendingInvitation = {
  id: string;
  email: string;
  role: "admin" | "member" | "guest";
  invited_by: string;
  expires_at: string;
  created_at: string;
};

// Lists pending (unaccepted, unexpired) invitations for a workspace.
// RLS: workspace_invitations.SELECT is gated to admin+, so a member or
// guest calling this gets an empty array — no need to recheck at this layer.
export async function listPendingInvitations(
  workspaceId: string,
): Promise<PendingInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("id, email, role, invited_by, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listPendingInvitations failed: ${error.message}`);
  }
  return (data ?? []) as PendingInvitation[];
}
