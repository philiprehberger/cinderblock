import "server-only";

import postgres from "postgres";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
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

// Resolves the current actor from the Supabase session. The impersonation
// path (60-min JWT with aud='impersonation') will land here once Phase 4
// wires the impersonation cookie middleware.
export async function getCurrentActor(): Promise<AuditActor | null> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user?.id) return null;

  // The Supabase JS client exposes app_metadata via session.user. The
  // impersonator_id and aud come from the JWT's app_metadata claims set
  // by the impersonation server action.
  const user = session.session.user;
  const appMeta = (user.app_metadata ?? {}) as {
    impersonated_by?: string;
    aud?: string;
  };

  // The `aud` JWT claim is also exposed by Supabase as a separate field on
  // the session token. We read it from the decoded session if available;
  // fall back to app_metadata.aud which is the convention Cinderblock's
  // impersonation server action uses.
  const jwtAud = appMeta.aud ?? null;

  return validateActor({
    actorId: user.id,
    impersonatorId: appMeta.impersonated_by ?? null,
    jwtAud,
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
