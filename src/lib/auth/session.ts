import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient, getImpersonationClaims } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server-only";

// Server-side session helpers.
//
// When impersonation is active (cb_impersonate cookie is set + verifies),
// these helpers return the **impersonated** user. The admin's normal
// session is untouched in the sb-* cookies, but every server-rendered
// view ("you're acting as Alice") and every server action ("create task
// as Alice") should see Alice as the effective user.
//
// The audit writer uses the same convention (actor = impersonated user;
// impersonator = the admin who initiated). Together, the contract is
// "whatever auth.uid() PostgREST sees is what these helpers return."

export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const impClaims = await getImpersonationClaims();
  if (impClaims) {
    // The impersonation client uses the Authorization header, not the
    // session cookies — supabase.auth.getSession() returns null in that
    // context. Look up the impersonated user via service-role admin API.
    const service = createServiceRoleClient();
    const { data } = await service.auth.admin.getUserById(impClaims.sub);
    return data?.user ?? null;
  }

  const session = await getSession();
  return session?.user ?? null;
}

// requireAuth() 302s to /signin when the caller is not authenticated. Use it
// at the top of server components / server actions that require a session.
// Returns the User on success so callers don't have to fetch again.
export async function requireAuth(redirectTo = "/signin"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}
