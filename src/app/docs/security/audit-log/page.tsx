export default function AuditLogDocs() {
  return (
    <>
      <h1>Audit log + impersonation</h1>

      <h2>Append-only by grant + RLS</h2>
      <p>
        <code>audit_events</code> has RLS enabled with a SELECT policy that
        gates on role (admin+ sees all, member sees own actor rows, guest
        sees none). For writes, only the dedicated{" "}
        <code>cb_audit_writer</code> Postgres role has an INSERT grant; no
        role anywhere has UPDATE or DELETE on the table.
      </p>
      <p>
        The Next.js app opens a separate <code>postgres-js</code>
        connection via <code>PG_AUDIT_WRITER_URL</code> for audit writes.
        Compromise of the service-role key doesn&apos;t let an attacker
        rewrite history.
      </p>

      <h2>Doubly-logged impersonation</h2>
      <p>
        Every <code>audit_events</code> row has an{" "}
        <code>actor_id</code> (the apparent user) and an optional{" "}
        <code>impersonator_id</code> (the admin who initiated impersonation,
        when relevant). The <code>auditLog</code> writer reads both from
        the active JWT claims via <code>getCurrentActor</code>:
      </p>
      <ul>
        <li>
          When the <code>cb_impersonate</code> cookie is set,
          <code> actor_id = sub</code> and{" "}
          <code>impersonator_id = app_metadata.impersonated_by</code>.
        </li>
        <li>
          Otherwise, <code>actor_id</code> is the session user and{" "}
          <code>impersonator_id</code> is null.
        </li>
      </ul>
      <p>
        A pure-function guard refuses any insert where{" "}
        <code>impersonator_id</code> is set but the JWT&apos;s{" "}
        <code>aud</code> claim isn&apos;t <code>impersonation</code>, or
        where <code>impersonator_id == actor_id</code>. A DB-level CHECK
        (<code>audit_events_no_self_impersonation</code>) backstops the
        latter regardless of role.
      </p>

      <h2>Banner is UI, audit log is truth</h2>
      <p>
        During impersonation, every authenticated page renders a
        persistent red banner driven by the presence of the{" "}
        <code>cb_impersonate</code> cookie. If a user clears the cookie
        via DevTools, the banner disappears — but the audit log still
        records every action taken under that session. The banner is a
        UI nicety; the audit log is the source of truth.
      </p>

      <h2>Hard expiry at 60 minutes</h2>
      <p>
        The impersonation JWT has a fixed 60-minute TTL signed with{" "}
        <code>SUPABASE_JWT_SECRET</code>. No refresh path exists. On
        expiry the verify returns null, the cookie is silently cleared,
        and the admin&apos;s normal session resumes immediately (their
        <code> sb-*</code> cookies were preserved untouched).
      </p>

      <p>
        See <a href="/docs/security/test-results">Test results</a> for the
        green run of <code>tests/06_audit_integrity.sql</code> and{" "}
        <code>tests/11_impersonation_visibility.sql</code>.
      </p>
    </>
  );
}
