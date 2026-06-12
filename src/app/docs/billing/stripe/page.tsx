export default function StripeWiringDocs() {
  return (
    <>
      <h1>Stripe wiring</h1>

      <h2>The three plans</h2>
      <pre>
        <code>{`Free      — 3 members, no team features
Team      — $29/mo, 10 members, 90d audit retention
Business  — $99/mo, unlimited members, forever audit retention`}</code>
      </pre>
      <p>
        Plans are <strong>test-mode only</strong> in the demo. No real
        charges, ever.
      </p>

      <h2>Environment</h2>
      <pre>
        <code>{`STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_TEAM=price_...
STRIPE_PRICE_BUSINESS=price_...`}</code>
      </pre>
      <p>
        Without these, the billing UI runs in &quot;not configured&quot;
        mode — plans are visible, Checkout/Portal buttons return an
        error.
      </p>

      <h2>The webhook (load-bearing)</h2>
      <p>
        <code>supabase/functions/stripe-webhook</code> verifies the
        signature with <code>STRIPE_WEBHOOK_SECRET</code>, then runs
        insert-first idempotency:
      </p>
      <pre>
        <code>{`insert into processed_stripe_events (event_id, event_type)
values ($1, $2)
on conflict (event_id) do nothing
returning event_id`}</code>
      </pre>
      <p>
        If RETURNING is empty, the function returns 200 immediately,
        before any side effect. This is the right pattern under Stripe&apos;s
        at-least-once delivery.
      </p>
      <p>
        <strong>Check-then-insert is racy and is the textbook bug:</strong>{" "}
        two concurrent webhook deliveries both see &quot;not processed,&quot;
        both run the side effect, then one INSERT fails on the unique key —
        but the side effect already ran twice. The pgtap concurrency test
        in <code>tests/10_concurrency.sql</code> asserts the correct shape.
      </p>

      <h2>State transitions</h2>
      <ul>
        <li>
          <code>checkout.session.completed</code> — upserts subscription
          row with metadata-resolved workspace_id
        </li>
        <li>
          <code>customer.subscription.updated</code> — UPDATE in place
        </li>
        <li>
          <code>customer.subscription.deleted</code> — UPDATE status = canceled
        </li>
        <li>
          <code>invoice.payment_failed</code> — audit/telemetry only;
          relies on Stripe&apos;s subsequent updated event for state
        </li>
        <li>
          <code>customer.subscription.trial_will_end</code> — no state
          change; trial banner reads from <code>trial_ends_at</code> live
        </li>
      </ul>

      <h2>Retention</h2>
      <p>
        <code>processed_stripe_events</code> retains 90 days. Stripe&apos;s
        documented redelivery window is ~3 days; 90 is generous. The
        pg_cron job in <code>0110_pg_cron_retention.sql</code> handles
        the daily sweep.
      </p>

      <h2>Hard-delete cascade</h2>
      <p>
        When a workspace is hard-deleted (24h after soft-delete), the
        <code>cancel-stripe-subscription</code> Edge Function cancels the
        Stripe sub with <code>prorate=false</code>. Failure blocks the
        hard-delete — orphan Stripe customers continuing to charge is the
        failure mode this guards against.
      </p>
    </>
  );
}
