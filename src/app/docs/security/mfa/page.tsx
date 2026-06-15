export default function MfaDocs() {
  return (
    <>
      <h1>MFA + step-up</h1>

      <h2>TOTP for owners</h2>
      <p>
        Any user holding <code>owner</code> in any workspace is required
        to enrol TOTP before performing a sensitive action. Enforcement
        happens at two layers:
      </p>
      <ul>
        <li>
          <strong>App-layer gate.</strong>{" "}
          <code>requireOwnerMfa(userId, reason, next)</code> in{" "}
          <code>/src/lib/mfa/gate.ts</code> runs at the top of the gated
          server action. If the caller is owner anywhere and has no
          verified TOTP factor, the action 302s to{" "}
          <code>/app/settings/mfa?reason=…&amp;next=…</code> instead of
          executing. The gate uses{" "}
          <code>supabase.auth.admin.getUserById</code> to read{" "}
          <code>user.factors[]</code> via the service-role client — the{" "}
          <code>auth</code> schema isn&apos;t exposed via PostgREST, so the
          admin API is the only path that doesn&apos;t require a custom RPC.
        </li>
        <li>
          <strong>DB-side helper.</strong>{" "}
          <code>app_private.user_has_mfa(uuid)</code> is the same check
          expressed in SQL — used by future policies that need to gate
          row visibility on MFA posture. Today, no policy uses it; it&apos;s
          available for forks that want to push gating down to RLS.
        </li>
      </ul>

      <h2>Gated actions</h2>
      <p>
        Every action below calls <code>requireOwnerMfa</code> after the
        ownership/role check and before any state mutation:
      </p>
      <ul>
        <li>
          <strong>Billing changes</strong> — <code>startCheckout</code>{" "}
          and <code>openCustomerPortal</code> in{" "}
          <code>/src/lib/billing/actions.ts</code>.
        </li>
        <li>
          <strong>Role changes</strong> — <code>changeMemberRole</code>{" "}
          in <code>/src/lib/members/actions.ts</code>.
        </li>
        <li>
          <strong>Member removal</strong> — <code>removeMember</code> in
          the same file.
        </li>
        <li>
          <strong>Impersonation start</strong> —{" "}
          <code>startImpersonation</code> in{" "}
          <code>/src/lib/impersonation/actions.ts</code>. (Impersonation
          additionally requires a 6-digit OTP step-up, see below.)
        </li>
        <li>
          <strong>Workspace deletion</strong> — wired the same way once
          the soft-delete action ships.
        </li>
      </ul>

      <h2>The enrolment UI</h2>
      <p>
        Live at <code>/app/settings/mfa</code>. The flow:
      </p>
      <ol>
        <li>
          Click <strong>Enrol TOTP</strong>. The server calls{" "}
          <code>supabase.auth.mfa.enroll</code> and stores the returned
          QR + base32 secret in an HttpOnly cookie scoped to the settings
          path with a 15-minute TTL. Supabase returns the secret exactly
          once, so the cookie is the only place it can be re-shown across
          a page refresh.
        </li>
        <li>
          Scan the QR or paste the secret into 1Password, Authy,
          Google Authenticator, or any RFC-6238 app.
        </li>
        <li>
          Enter the 6-digit code; the server calls{" "}
          <code>mfa.challenge</code> + <code>mfa.verify</code>. On success
          the factor flips to <code>verified</code> and{" "}
          <code>user_has_mfa(auth.uid())</code> returns true. The cookie
          is cleared; an audit event <code>mfa.enrolled</code> fires
          against every workspace the user owns.
        </li>
        <li>
          Cancelling unenrols the pending factor (Supabase&apos;s
          <code> mfa.unenroll</code>) and clears the cookie so a clean
          re-enrol is possible.
        </li>
      </ol>
      <p>
        Removing a verified factor refuses with{" "}
        <code>owner_must_keep_mfa</code> if it would leave an owner with
        zero verified factors — the same invariant the runtime gate
        enforces, surfaced earlier so the user doesn&apos;t lock
        themselves out of their own billing change.
      </p>

      <h2>Impersonation step-up</h2>
      <p>
        Impersonation has a second factor on top of the MFA gate: a
        6-digit OTP delivered to the admin&apos;s email (surfaced inline
        in dev mode). On verify, the server mints a 60-minute JWT signed
        with <code>SUPABASE_JWT_SECRET</code> that becomes the new
        effective session. See{" "}
        <a href="/docs/security/audit-log">Audit log + impersonation</a>{" "}
        for the JWT shape and the doubly-logged audit pattern.
      </p>

      <h2>AAL2</h2>
      <p>
        Supabase Auth&apos;s AAL2 (session-level MFA flag) is the
        freshness signal — a recently-verified session can be expected
        to retain a higher trust level. The load-bearing gate is the
        server-side <code>requireOwnerMfa</code> check, because AAL2
        alone is sidestepped by any path that lets a magic-link user
        act without ever enrolling. The two work together: enrolment
        proves possession, AAL2 proves recency.
      </p>

      <h2>Non-owners</h2>
      <p>
        TOTP enrolment is available to every user at{" "}
        <code>/app/settings/mfa</code>, but the gate only triggers for
        users who hold <code>owner</code> in at least one workspace.
        Admins, members, and guests can enrol if they want defence in
        depth; the demo doesn&apos;t require it.
      </p>
    </>
  );
}
