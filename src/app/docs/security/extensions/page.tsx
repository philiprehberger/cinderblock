export default function ExtensionsOverview() {
  return (
    <>
      <h1>Extensions</h1>
      <p>
        Four primitives that aren&apos;t in Cinderblock&apos;s v1 hot path
        but are common production needs. Each one is documented as a
        forkable swap with the trade-off named.
      </p>

      <h2>JWT-embedded roles (Auth Hook)</h2>
      <p>
        Embed <code>app_metadata.workspaces[].{`{`}id, role{`}`}</code> in
        the JWT via a <code>custom-access-token-hook</code> Edge Function.
        Policies read the JSON instead of doing a per-row DB lookup.
      </p>
      <p>
        <strong>Trade-off:</strong> faster reads, slower role revocation
        (up to 60min stale until next token refresh). Cinderblock picks
        the DB-lookup default for the &quot;immediate revocation&quot;
        story; this extension is the swap for read-latency-sensitive
        workloads.
      </p>

      <h2>Audit via Edge Function</h2>
      <p>
        For deployments without a persistent DB connection (Vercel
        serverless), the direct <code>cb_audit_writer</code> connection
        isn&apos;t practical. The extension routes audit writes through
        an Edge Function instead.
      </p>
      <p>
        <strong>Trade-off:</strong> one HTTP round-trip per server action.
        For low-frequency mutations the cost is negligible; for high-write
        APIs the direct connection wins.
      </p>

      <h2>Realtime tenant scoping</h2>
      <p>
        Supabase Realtime channels need explicit authorization for
        tenant-scoped subscriptions. The extension walks the channel
        topology and shows how to gate Postgres-CDC and Broadcast
        channels on <code>is_workspace_member()</code>.
      </p>

      <h2>Storage tenant scoping</h2>
      <p>
        Supabase Storage RLS on the <code>storage.objects</code> table
        with a path convention like{" "}
        <code>{`{workspace_id}/...`}</code> + a policy that gates on{" "}
        <code>is_workspace_member(uuid_of_path_root)</code>. Includes a
        worked example for tenant-scoped file uploads.
      </p>

      <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        Full extension pages land as each one is fully tested. The
        forking instructions in <a href="/docs/getting-started">Getting
        started</a> work as-is for all four.
      </p>
    </>
  );
}
