import "server-only";

import postgres from "postgres";
import { headers } from "next/headers";

import { createClient, getImpersonationClaims } from "@/lib/supabase/server";
import { validateActor, type AuditActor } from "./actor-guard";

export { validateActor, type AuditActor };

// Direct postgres-js connection authenticated as cb_audit_writer. The role
// has INSERT-only grants on public.audit_events and zero grants on any
// other table — even a compromised Next.js process can't UPDATE or DELETE
// an audit row through this connection.
//
// The connection is lazily initialized so importing this module from a
// build-time context (no env) doesn't crash. Production deployments should
// ensure the connection is warm by hitting the audit-write path during the
// deploy smoke test.

let _sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (_sql) return _sql;
  const url = process.env.PG_AUDIT_WRITER_URL;
  if (!url) {
    throw new Error(
      "PG_AUDIT_WRITER_URL not set. Run `./scripts/setup-roles.sh` after `npx supabase start`.",
    );
  }
  _sql = postgres(url, {
    max: 4,
    idle_timeout: 30,
    connect_timeout: 5,
    onnotice: () => {}, // suppress NOTICE noise
  });
  return _sql;
}

export type AuditLogInput = {
  workspaceId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  diff?: Record<string, unknown> | null;
};

// Resolves the current actor. The impersonation path is the *first* check:
// when cb_impersonate is set, the JWT's sub is the apparent actor and
// app_metadata.impersonated_by is the admin who initiated it. This makes
// audit_events rows show both IDs without any per-call-site plumbing.
//
// When no impersonation is active, fall back to the normal session.
export async function getCurrentActor(): Promise<AuditActor | null> {
  const impClaims = await getImpersonationClaims();
  if (impClaims) {
    return validateActor({
      actorId: impClaims.sub,
      impersonatorId: impClaims.impersonatedBy,
      jwtAud: "impersonation",
    });
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user?.id) return null;

  return validateActor({
    actorId: session.session.user.id,
    impersonatorId: null,
    jwtAud: "authenticated",
  });
}

// The main entry point. Resolves the actor from the session, captures IP +
// UA from the request, and INSERTs the row via the cb_audit_writer
// connection. Returns the inserted row's id.
export async function auditLog(input: AuditLogInput): Promise<string> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new Error("auditLog called without an authenticated session");
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = requestHeaders.get("user-agent") ?? null;

  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into public.audit_events
      (workspace_id, actor_id, impersonator_id, action, target_type, target_id, diff, ip, user_agent)
    values
      (${input.workspaceId}, ${actor.actorId}, ${actor.impersonatorId},
       ${input.action}, ${input.targetType ?? null}, ${input.targetId ?? null},
       ${input.diff ? sql.json(input.diff as Parameters<typeof sql.json>[0]) : null},
       ${ip}::inet, ${userAgent})
    returning id
  `;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("auditLog: insert returned no row");
  }
  return id;
}
