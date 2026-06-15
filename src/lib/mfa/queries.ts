import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server-only";
import { requireAuth } from "@/lib/auth/session";

export type TotpFactor = {
  id: string;
  friendly_name: string | null;
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
};

// listTotpFactors — returns the caller's TOTP factors (verified + unverified).
// Reads via the service-role admin API rather than the SSR session's
// supabase.auth.mfa.listFactors(); the SSR variant depends on getUser()
// succeeding against the freshly-mutated session cookie, which can be
// flaky right after a server action redirect. The admin path reads from
// auth.mfa_factors directly using the service-role JWT.
//
// Unverified entries matter because the enrol UI needs to resume an
// in-flight challenge if the user reloaded the page before entering the code.
export async function listTotpFactors(): Promise<TotpFactor[]> {
  const user = await requireAuth();
  const service = createServiceRoleClient();
  const { data, error } = await service.auth.admin.mfa.listFactors({
    userId: user.id,
  });
  if (error) {
    throw new Error(`listTotpFactors failed: ${error.message}`);
  }
  return (data?.factors ?? [])
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name ?? null,
      status: f.status as TotpFactor["status"],
      created_at: f.created_at,
      updated_at: f.updated_at,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

// hasVerifiedTotp — true iff the caller has at least one verified TOTP
// factor. This mirrors what app_private.user_has_mfa returns at the DB
// layer; the duplicate exists so server actions can branch without an
// extra RPC roundtrip when a Supabase client is already in hand.
export async function hasVerifiedTotp(): Promise<boolean> {
  const factors = await listTotpFactors();
  return factors.some((f) => f.status === "verified");
}

// userHoldsAnyOwnerRole — true iff the current user has owner in any
// non-deleted workspace. The MFA gate uses this to decide whether to
// require enrolment.
export async function userHoldsAnyOwnerRole(): Promise<boolean> {
  const user = await requireAuth();
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(deleted_at)")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .is("removed_at", null)
    .is("workspaces.deleted_at", null)
    .limit(1);
  if (error) {
    throw new Error(`userHoldsAnyOwnerRole failed: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}
