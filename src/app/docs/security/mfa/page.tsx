export default function MfaDocs() {
  return (
    <>
      <h1>MFA + step-up</h1>

      <h2>TOTP for owners</h2>
      <p>
        Any user holding <code>owner</code> in any workspace is required
        to enroll TOTP before their next sensitive action. Enforcement is
        server-side via the <code>app_private.user_has_mfa(user_id)</code>{" "}
        helper, called at the top of the gated server actions.
      </p>
      <p>
        Gated actions (planned set):
      </p>
      <ul>
        <li>Billing change — Stripe Checkout + Customer Portal</li>
        <li>Role change involving owner (promote / demote)</li>
        <li>Member removal</li>
        <li>Workspace deletion</li>
        <li>Impersonation start</li>
      </ul>
      <p>
        The MFA enrolment UI is the remaining piece — until it lands,
        the helper still works but the gates are bypassed in dev with a
        warning. <strong>Don&apos;t deploy to production without
        enrolment wired.</strong>
      </p>

      <h2>Impersonation step-up</h2>
      <p>
        Impersonation specifically uses a 6-digit OTP delivered to the
        admin&apos;s email (or surfaced inline in dev mode). On verify,
        the server mints a 60-minute JWT that becomes the new effective
        session. See{" "}
        <a href="/docs/security/audit-log">Audit log + impersonation</a>{" "}
        for the JWT shape and the doubly-logged audit pattern.
      </p>

      <h2>AAL2</h2>
      <p>
        Supabase Auth&apos;s AAL2 (session-level MFA flag) is checked
        additionally for billing changes. AAL2 alone isn&apos;t
        sufficient — a malicious actor with magic-link access could
        otherwise sidestep MFA without ever enrolling. The server-side
        <code> user_has_mfa</code> check is the load-bearing gate; AAL2
        is the freshness signal.
      </p>
    </>
  );
}
