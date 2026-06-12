export default function DisclaimerDocs() {
  return (
    <>
      <h1>Disclaimer</h1>

      <p>
        <strong>
          The pgtap suite proves the patterns shipped in this template.
          It does not prove your fork is secure if you modified the
          policies.
        </strong>
      </p>

      <p>
        Cinderblock&apos;s test suite asserts a specific surface: every
        policy under the public schema honors the tenant boundary, every{" "}
        <code>app_private.*</code> helper is hardened, every audit
        invariant holds, the seat trigger fires when expected. If you
        change any of those — even &quot;just renaming a column&quot; — the
        guarantee is your fork&apos;s responsibility, not the template&apos;s.
      </p>

      <h2>What the tests prove</h2>
      <ul>
        <li>
          A user with no membership in workspace X cannot read, create,
          update, or delete rows belonging to X — under SELECT, joins,
          UNION, CTEs, subqueries, and aggregate queries.
        </li>
        <li>
          Append-only audit (no UPDATE or DELETE grant exists for
          <code> authenticated</code>).
        </li>
        <li>
          Search-path attack denied (helpers have{" "}
          <code>set search_path = &apos;&apos;</code>).
        </li>
        <li>
          Past-due-beyond-grace and canceled workspaces are read-only
          (<code>workspace_is_writable</code> gates inserts/updates).
        </li>
        <li>
          Insert-first Stripe webhook idempotency (duplicate event_id
          returns 0 rows from RETURNING).
        </li>
      </ul>

      <h2>What the tests do NOT prove</h2>
      <ul>
        <li>
          Your fork&apos;s policies are correct after modification.
          <strong> Extend the tests when you modify a policy.</strong>
        </li>
        <li>
          Anything about your hosting environment (TLS termination, DDoS
          mitigation, secret leakage via logging, etc).
        </li>
        <li>
          Cinderblock is not a substitute for a third-party security
          audit. Use the pgtap suite as a structural floor; layer audits,
          penetration tests, and ongoing reviews on top for production.
        </li>
      </ul>

      <h2>Compliance</h2>
      <p>
        See <a href="/docs/compliance">Compliance posture</a> for SOC2 /
        GDPR framing. Short version: Cinderblock ships the technical
        controls (audit log, impersonation tracing, MFA enforcement,
        retention) that make a compliance posture defensible, not the
        attestation itself.
      </p>
    </>
  );
}
