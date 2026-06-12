export default function RlsDocs() {
  return (
    <>
      <h1>Row-Level Security in Cinderblock</h1>

      <p>
        Every table in the <code>public</code> schema has RLS enabled, with
        policies that spell out both <code>USING</code> (read/visibility) and{" "}
        <code>WITH CHECK</code> (write) — no implicit defaults. The
        <code> tests/05_security_definer.sql</code> hardening suite asserts
        the catalog state stays this way:
      </p>
      <ul>
        <li>Every public-schema table has <code>rowsecurity = on</code>.</li>
        <li>
          Every public view is <code>security_invoker = on</code> (a{" "}
          <code>security_definer</code> view bypasses the caller&apos;s RLS).
        </li>
        <li>
          No policy uses <code>using(true)</code> or{" "}
          <code>with check(true)</code> unless it&apos;s scoped to a single
          non-public role.
        </li>
        <li>
          Every <code>app_private.*</code> helper has{" "}
          <code>search_path = &apos;&apos;</code> in <code>proconfig</code>.
        </li>
      </ul>

      <h2>Helper functions (all <code>security_definer</code>, <code>search_path = &apos;&apos;</code>)</h2>
      <pre>
        <code>{`is_workspace_member(_workspace_id uuid)         -> boolean
has_workspace_role(_workspace_id uuid, _min_role workspace_role) -> boolean
workspace_is_writable(_workspace_id uuid)       -> boolean
user_has_mfa(_user_id uuid)                     -> boolean
is_slug_reserved(_slug text)                    -> boolean`}</code>
      </pre>
      <p>
        Every helper has explicit <code>set search_path = &apos;&apos;</code>{" "}
        — without it, a workspace member who creates a function in their own
        schema named <code>auth.uid()</code> could hijack identifier
        resolution. The search-path attack test in{" "}
        <code>tests/05_security_definer.sql</code> simulates this end-to-end
        and asserts the helper still resolves the real <code>auth.uid()</code>.
      </p>

      <h2>Policy patterns by table</h2>

      <h3>workspaces</h3>
      <pre>
        <code>{`select: deleted_at is null and is_workspace_member(id)
insert: created_by = auth.uid() and deleted_at is null
update: has_workspace_role(id, 'owner') (USING + WITH CHECK)
delete: <no policy — hard-delete via service-role cron only>`}</code>
      </pre>

      <h3>workspace_members</h3>
      <pre>
        <code>{`select: (user_id = auth.uid() and removed_at is null)
          or has_workspace_role(workspace_id, 'admin')
insert: with check (false)   -- service-role only via invite-accept
update: has_workspace_role(workspace_id, 'admin')
delete: <no policy — soft-delete sets removed_at>`}</code>
      </pre>

      <h3>audit_events</h3>
      <pre>
        <code>{`select: admin+: all rows
        member: actor_id = auth.uid() only
        guest:  none
insert: only via cb_audit_writer role (separate INSERT-only grant)
update/delete: <no policy, no grant — append-only by design>`}</code>
      </pre>

      <h3>tasks</h3>
      <pre>
        <code>{`select: is_workspace_member(workspace_id)
insert: has_workspace_role(workspace_id, 'member')
        and created_by = auth.uid()
        and workspace_is_writable(workspace_id)
update: has_workspace_role(workspace_id, 'member')
        and workspace_is_writable(workspace_id)
delete: has_workspace_role(workspace_id, 'admin')`}</code>
      </pre>

      <h2>The hostile fixture</h2>
      <p>
        <code>tests/01_fixture.sql</code> seeds 5 workspaces × 8 users with a
        deliberate membership matrix that mixes overlapping memberships
        across workspaces, role variants, and one outsider. Every test
        authenticates as a user with no business reading the target row and
        asserts an empty result.
      </p>
      <p>
        See <a href="/docs/security/policies">the live policy viewer</a> for
        the deployed catalog state, or{" "}
        <a href="/docs/security/test-results">the latest test results</a>{" "}
        for the green run.
      </p>
    </>
  );
}
