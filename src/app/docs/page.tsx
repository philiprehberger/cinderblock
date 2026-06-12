import Link from "next/link";

export default function DocsHome() {
  return (
    <>
      <h1>Cinderblock docs</h1>
      <p>
        The forkable multi-tenant SaaS starter on Supabase whose load-bearing
        differentiator is a pgtap-tested Row-Level-Security suite that
        survives hostile multi-tenant fixtures.
      </p>
      <p>
        Most Supabase multi-tenant deliveries trust the client to send the
        right tenant ID, use the service-role key to bypass RLS "for
        performance," or write policies that pass against the owner's own
        data and silently leak under joins. Cinderblock doesn't.
      </p>

      <h2>Start here</h2>
      <ul>
        <li>
          <Link href="/docs/getting-started">Getting started</Link> — fork
          the template, set env vars, get a green pgtap suite locally in
          under 5 minutes (warm cache).
        </li>
        <li>
          <Link href="/docs/concepts/multi-tenancy">Multi-tenancy concepts</Link>{" "}
          — the workspace / member / role / invite / audit model in
          5 minutes.
        </li>
      </ul>

      <h2>Security (the load-bearing pages)</h2>
      <ul>
        <li>
          <Link href="/docs/security/rls">How RLS works in Cinderblock</Link>{" "}
          — every policy in plain English plus the SQL.
        </li>
        <li>
          <Link href="/docs/security/policies">Live policy viewer</Link> —
          reads <code>pg_policies</code> on the deployed database.
        </li>
        <li>
          <Link href="/docs/security/test-results">Test results</Link> —
          latest pgtap CI output.
        </li>
        <li>
          <Link href="/docs/security/disclaimer">Disclaimer</Link> — what
          the test suite proves and what it doesn't.
        </li>
      </ul>
    </>
  );
}
