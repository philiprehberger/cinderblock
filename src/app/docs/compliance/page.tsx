export default function ComplianceDocs() {
  return (
    <>
      <h1>Compliance posture</h1>

      <p>
        <strong>Cinderblock is not SOC2-attested.</strong> The demo is a
        portfolio piece — attestation is engagement-level work, not
        template-level work.
      </p>

      <p>
        What the template <em>does</em> provide is the technical surface
        a SOC2 or GDPR posture needs:
      </p>

      <h2>Technical controls already shipped</h2>
      <ul>
        <li>
          <strong>Append-only audit log</strong> at the grant level. Even
          a compromised application server can&apos;t rewrite history.
        </li>
        <li>
          <strong>Doubly-logged impersonation.</strong> Every action
          taken by an admin while impersonating a member is logged with
          both identities. Privilege escalation is traceable.
        </li>
        <li>
          <strong>Role-based access control</strong> with policy tests.
          The hostile fixture asserts cross-tenant isolation under joins,
          subqueries, aggregates, and UNIONs.
        </li>
        <li>
          <strong>MFA enforcement</strong> for owners on sensitive
          actions. TOTP enrolment is the production gate.
        </li>
        <li>
          <strong>Retention policies</strong> per plan (30d Free / 90d
          Team / forever Business). Daily pg_cron sweeps.
        </li>
        <li>
          <strong>Secret hygiene.</strong> Signing keys (invitation HMAC,
          impersonation JWT) live in Supabase Vault / EC2 .env only;
          never in committed code.
        </li>
      </ul>

      <h2>What an engagement-level deliverable would add</h2>
      <ul>
        <li>
          DPA review against your customers&apos; contracts (data
          residency, sub-processor disclosures).
        </li>
        <li>
          SOC2 controls mapping — taking the technical surface above and
          matching it against the trust services criteria.
        </li>
        <li>
          Penetration test or third-party review of the deployed
          environment.
        </li>
        <li>
          Backup + disaster-recovery drills with restore-time
          measurements.
        </li>
      </ul>

      <p>
        See <a href="/docs/security/disclaimer">Disclaimer</a> for the
        framing the test suite makes, and the boundary between
        &quot;structurally correct&quot; and &quot;audited.&quot;
      </p>
    </>
  );
}
