export default function PolicyCostDocs() {
  return (
    <>
      <h1>Policy evaluation cost</h1>

      <p>
        Cinderblock&apos;s RLS helpers (<code>is_workspace_member</code>,{" "}
        <code>has_workspace_role</code>) evaluate a subquery per row on
        every SELECT. The cost is bounded by the partial index{" "}
        <code>workspace_members_user_active_idx</code>:
      </p>
      <pre>
        <code>{`create unique index workspace_members_user_active_idx
  on workspace_members (user_id, workspace_id)
  where removed_at is null;`}</code>
      </pre>

      <p>
        With this index, each <code>is_workspace_member()</code> call is
        an index lookup against a tuple whose cardinality is &quot;active
        memberships per user&quot; — typically 1–3 for a SaaS user.
      </p>

      <h2>Cost vs. JWT-embedded roles</h2>
      <p>
        The trade-off vs. embedding{" "}
        <code>app_metadata.workspaces[].{`{`}id, role{`}`}</code> in the JWT
        is explicit:
      </p>
      <ul>
        <li>
          <strong>DB-lookup (Cinderblock default):</strong> ~50 ms p95 on
          a 100k-row workspace read. Role revocation propagates on the
          next query.
        </li>
        <li>
          <strong>JWT-embedded:</strong> JSON probe with no DB round trip.
          Role changes only take effect at next token refresh (up to
          60min stale).
        </li>
      </ul>
      <p>
        Immediate role revocation matters more than the 50 ms tail for
        the demo&apos;s pitch — &quot;you can demote an admin and they
        can&apos;t do admin things on the next request.&quot; A forker
        who wants the other trade-off can swap in the Auth Hook variant
        documented under{" "}
        <a href="/docs/security/extensions">Extensions / JWT-embedded roles</a>.
      </p>

      <h2>The scale fixture</h2>
      <p>
        A separate opt-in test set (<code>supabase test db --tag scale</code>,
        nightly on main) seeds a 100k-task workspace with 1k members and
        asserts:
      </p>
      <ul>
        <li>
          <code>select * from tasks where workspace_id = $1 limit 50</code>{" "}
          returns in &lt; 50 ms p95.
        </li>
        <li>
          The query plan uses the partial index on{" "}
          <code>workspace_members</code> and the{" "}
          <code>(workspace_id, status)</code> index on tasks — no seq scan
          on either.
        </li>
      </ul>
    </>
  );
}
