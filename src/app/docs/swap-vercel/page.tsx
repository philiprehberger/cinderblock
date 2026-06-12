export default function SwapVercelDocs() {
  return (
    <>
      <h1>Swap to Vercel</h1>

      <p>
        Cinderblock ships on EC2 + Apache + PM2 by default. The Next.js +
        Supabase + Stripe stack runs unchanged on Vercel — only the deploy
        plumbing differs.
      </p>

      <h2>What needs to change</h2>

      <h3>1. Deploy</h3>
      <p>
        Replace the <code>npm run deploy</code> + rsync flow with{" "}
        <code>vercel deploy</code>. The standalone Next.js build output
        is irrelevant on Vercel.
      </p>

      <h3>2. Audit writer</h3>
      <p>
        Vercel serverless functions don&apos;t support persistent
        connections. Cinderblock&apos;s direct{" "}
        <code>cb_audit_writer</code> connection via postgres-js would
        either thrash connections or you&apos;d hit the connection cap on
        Supabase&apos;s pooler.
      </p>
      <p>
        Two options:
      </p>
      <ul>
        <li>
          Swap the writer for the{" "}
          <a href="/docs/security/extensions">Edge Function audit</a>{" "}
          extension — one HTTP round-trip per server action instead of a
          DB connection.
        </li>
        <li>
          Use Supabase&apos;s connection pooler at the{" "}
          <strong>session</strong> port (<code>:5432</code>), not the
          transaction pooler — the audit writer needs <code>set local</code>{" "}
          semantics for the impersonation case.
        </li>
      </ul>

      <h3>3. Cookie domain</h3>
      <p>
        If you split marketing and app across two Vercel projects (one
        per subdomain), the parent-domain cookie pattern still works —
        configure <code>NEXT_PUBLIC_COOKIE_DOMAIN</code> on both.
      </p>

      <h3>4. Edge Functions vs. Vercel Edge Functions</h3>
      <p>
        Cinderblock&apos;s Supabase Edge Functions (invitations, Stripe
        webhook, impersonation OTP) run unchanged. They&apos;re hosted by
        Supabase, not by your Next.js host — Vercel doesn&apos;t need to
        know about them.
      </p>

      <h2>What stays the same</h2>
      <ul>
        <li>Every migration</li>
        <li>Every pgtap test</li>
        <li>Every Edge Function</li>
        <li>RLS policies, helpers, the audit pattern</li>
        <li>The hostile fixture</li>
      </ul>

      <p>
        The stack is portable; the deploy plumbing is the only material
        delta.
      </p>
    </>
  );
}
