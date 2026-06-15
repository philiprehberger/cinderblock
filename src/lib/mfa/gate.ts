import "server-only";

import { redirect } from "next/navigation";

import { createServiceRoleClient } from "@/lib/supabase/server-only";

// requireOwnerMfa — if the user holds owner in any workspace and has no
// verified TOTP factor, redirect to /app/settings/mfa with a message
// explaining the gate.
//
// Call this at the top of any sensitive server action: billing changes,
// role changes, member removal, workspace deletion, impersonation start.
// Non-owner users (no owner role anywhere) bypass the gate by design —
// see docs/security/mfa for the policy.
//
// `nextPath` is the path the user should land on after enrolling.
// `reason` shows up in the settings page banner so the user understands
// why they were redirected. Reasons are short slugs so the banner copy
// can live in the page (and stay translatable).
export async function requireOwnerMfa(
  userId: string,
  reason: string,
  nextPath: string,
): Promise<void> {
  const service = createServiceRoleClient();

  const { data: ownerRow } = await service
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(deleted_at)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .is("removed_at", null)
    .is("workspaces.deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!ownerRow) return; // not an owner anywhere — gate doesn't apply

  // getUserById returns the User object including its factors array;
  // service-role bypasses RLS for this admin endpoint, so we get the full
  // factor list (verified + unverified) without going through PostgREST.
  // The auth schema isn't in the API's exposed schemas list, so this is
  // the only path that doesn't require either a custom RPC or a direct
  // postgres connection.
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    // If we can't read the user we can't prove MFA — fail closed.
    redirect(
      `/app/settings/mfa?${new URLSearchParams({ reason, next: nextPath, error: "mfa_check_failed" })}`,
    );
  }

  const hasVerified = (data.user.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (hasVerified) return;

  const qs = new URLSearchParams({ reason, next: nextPath });
  redirect(`/app/settings/mfa?${qs.toString()}`);
}
