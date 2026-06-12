export default function GettingStarted() {
  return (
    <>
      <h1>Getting started</h1>

      <p>
        Cinderblock is a forkable template. The fork-to-green flow takes
        under 5 minutes on a warm Docker cache; first run is 10–15 minutes
        while <code>supabase start</code> pulls images.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node 22 + npm</li>
        <li>Docker (for the local Supabase stack)</li>
        <li>
          A Supabase Cloud project on the Pro plan (the demo deployment
          uses one; forkers create their own)
        </li>
      </ul>

      <h2>1 — Fork the template</h2>
      <p>
        Click <strong>Use this template</strong> on{" "}
        <a href="https://github.com/philiprehberger/cinderblock">
          github.com/philiprehberger/cinderblock
        </a>{" "}
        and clone your fork.
      </p>

      <h2>2 — Run the post-clone setup</h2>
      <pre>
        <code>{`cd cinderblock
npm install
npx supabase start          # ~10-15min cold cache, ~45s warm
./scripts/setup-roles.sh    # generates cb_audit_writer + cb_impersonator passwords
npx supabase test db        # 74 tests should pass
npm run dev                 # http://localhost:3000`}</code>
      </pre>

      <h2>3 — Wire Stripe (optional)</h2>
      <p>
        The billing UI works in &quot;not configured&quot; mode without keys.
        To exercise Checkout / Customer Portal end-to-end:
      </p>
      <pre>
        <code>{`STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_TEAM=price_...
STRIPE_PRICE_BUSINESS=price_...`}</code>
      </pre>
      <p>
        See <a href="/docs/billing/stripe">Stripe wiring</a> for the full
        setup, including the webhook endpoint.
      </p>

      <h2>4 — Deploy to your own Supabase project</h2>
      <p>
        <code>supabase link</code> to your Cloud project, then{" "}
        <code>supabase db push</code> applies the migrations. The Cinderblock
        deployment uses EC2 + Apache + PM2; see{" "}
        <a href="/docs/swap-vercel">Swap to Vercel</a> if you prefer the
        Vercel path — the stack is portable.
      </p>
    </>
  );
}
