import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

// Server-side session helpers. Use these in server components, route handlers,
// and server actions. They wrap the Supabase JS client's session-reading
// methods so the rest of the codebase doesn't repeat the createClient() +
// getSession() boilerplate.

export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
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
