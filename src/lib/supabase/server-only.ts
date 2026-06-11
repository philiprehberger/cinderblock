import "server-only";

import { createClient } from "@supabase/supabase-js";

// SERVICE ROLE CLIENT — BYPASSES ROW-LEVEL SECURITY.
//
// This file uses `import "server-only"` so Next.js refuses to bundle it into
// any client component. Importing it from a "use client" file is a build error,
// not a runtime check.
//
// Cinderblock's pgtap suite includes a positive control that proves the
// service-role client CAN read across tenants — this is by design, because
// it proves the tenant boundary is RLS, not application code. Every deliberate
// use of this client should:
//   1. Live in a server module (route handler, server action, RSC).
//   2. Be paired with audit logging that records what was done and by whom.
//   3. Have a comment naming the reason RLS was insufficient for the path.
//
// The vast majority of server code should use createClient() from
// ./server.ts — it goes through PostgREST as the signed-in user, RLS
// evaluates correctly, and there is no audit gap.

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
