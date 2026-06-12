import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server-only";

// auth.users is invisible to anon/authenticated/cb_impersonator. The members
// list, audit log, and impersonation banner all need to render an email next
// to a user UUID — getUserEmails batches that resolution via service-role.
//
// The caller is responsible for not leaking emails outside the workspace
// boundary. RLS already limits which workspace_members rows the caller can
// see; this helper takes those UUIDs and resolves them. The danger pattern
// would be calling getUserEmails on a UUID the caller couldn't see via
// workspace_members — that's the responsibility of the call site to avoid.

export async function getUserEmails(
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(userIds.filter((id) => id)));
  if (unique.length === 0) return out;

  const service = createServiceRoleClient();
  // Supabase Auth admin doesn't expose a "users by id list" call; we walk
  // listUsers pages until we've matched everyone. For dozens of members this
  // is one or two pages; for a 100k-member workspace we'd swap in a direct
  // service-role SELECT on auth.users (a follow-on optimization).
  const wanted = new Set(unique);
  let page = 1;
  while (wanted.size > 0 && page <= 20) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (!data || !data.users || data.users.length === 0) break;
    for (const u of data.users) {
      if (u.id && u.email && wanted.has(u.id)) {
        out.set(u.id, u.email);
        wanted.delete(u.id);
      }
    }
    if (data.users.length < 200) break;
    page++;
  }
  return out;
}
