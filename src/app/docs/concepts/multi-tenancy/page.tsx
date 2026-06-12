export default function MultiTenancyConcepts() {
  return (
    <>
      <h1>Multi-tenancy concepts</h1>
      <p>
        Cinderblock's tenant model is workspace-scoped. Every row in every
        public-schema table belongs to a workspace, and RLS evaluates
        membership on every read and write.
      </p>

      <h2>Workspace</h2>
      <p>
        The tenant boundary. A workspace has a slug, a name, a billing
        email, and a soft-delete window. Slugs are globally unique
        (mirrors GitHub / Slack) and live in URL paths
        (<code>/app/[workspace_slug]/...</code>). Reserved slugs
        (<code>app, api, www, admin</code>, …) live in{" "}
        <code>app_private.reserved_slugs</code>.
      </p>

      <h2>Roles (highest-privilege-first)</h2>
      <ul>
        <li>
          <strong>owner</strong> — billing, role changes, workspace deletion,
          impersonation start
        </li>
        <li>
          <strong>admin</strong> — invite + role changes within{" "}
          {`{admin, member, guest}`}, impersonation
        </li>
        <li>
          <strong>member</strong> — create / edit tasks; sees own actor
          audit events only
        </li>
        <li>
          <strong>guest</strong> — read-only; no audit log access
        </li>
      </ul>
      <p>
        The <code>workspace_role</code> enum is declared highest-first so
        native Postgres enum comparison (<code>role &lt;= &apos;admin&apos;</code>)
        reads as &quot;at-least-this-role&quot; with no ordinal gymnastics.
      </p>

      <h2>URL is the source of truth</h2>
      <p>
        Workspace context lives in the URL path, not in a session GUC or a
        JWT claim. Every server-rendered route resolves slug → UUID,
        verifies membership via <code>is_workspace_member(workspace_id)</code>,
        and 404s on miss. Queries pass <code>workspace_id</code> explicitly;
        policies key off the row&apos;s own column.
      </p>
      <p>
        This sidesteps a common Supabase pitfall: a session-scoped
        <code> app.current_workspace_id</code> GUC leaks between pooled
        connections (transaction-mode pgbouncer reuses connections across
        callers; <code>set local</code> doesn&apos;t survive between
        supabase-js HTTP requests). The connection-pool safety tests in{" "}
        <code>tests/09_pool_safety.sql</code> assert the GUC stays unset.
      </p>

      <h2>Invitations</h2>
      <p>
        <code>workspace_invitations.INSERT</code> is closed at the policy
        layer (<code>with check (false)</code>). The only path is the
        <code> invite-create</code> Edge Function under service-role, with
        HMAC-signed tokens whose hash lives in <code>token_hash</code>.
        Even a row leak doesn&apos;t reveal the raw token.
      </p>

      <h2>Audit log</h2>
      <p>
        Append-only via grant model: <code>cb_audit_writer</code> has
        INSERT-only on <code>audit_events</code>, no SELECT/UPDATE/DELETE
        grants anywhere. Even a compromised Next.js process can&apos;t
        rewrite or read history.
      </p>
    </>
  );
}
