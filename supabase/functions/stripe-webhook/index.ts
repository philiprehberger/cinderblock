import Stripe from "npm:stripe@22.2.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

// stripe-webhook — receives Stripe events with the load-bearing
// insert-first idempotency pattern:
//
//   insert into processed_stripe_events (event_id, event_type)
//   values ($1, $2)
//   on conflict (event_id) do nothing
//   returning event_id
//
// If RETURNING is empty, another worker (or a Stripe redelivery) already
// claimed this event. Return 200 before any side effect. Check-then-insert
// is racy under at-least-once delivery and would double-apply state
// transitions; the pgtap suite asserts the insert-first behaviour in
// 12_billing.sql.
//
// CORS is intentionally NOT applied here — Stripe sends from its own IPs,
// not a browser. The signature check (verifyHeader against
// STRIPE_WEBHOOK_SECRET) is the authentication.

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "env_unconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "missing_signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "signature_invalid", detail: String(err) }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // -------- Insert-first idempotency --------
  const { data: claimed, error: claimError } = await service
    .from("processed_stripe_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select("event_id")
    .maybeSingle();

  if (claimError && claimError.code !== "23505") {
    return new Response(
      JSON.stringify({ error: "idempotency_insert_failed", detail: claimError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!claimed) {
    // Another worker already processed this event (or 23505 swallowed by
    // maybeSingle). Return 200; do nothing else.
    return new Response(JSON.stringify({ status: "duplicate" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------- State transitions --------
  let handled = false;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspace_id;
        const plan = session.metadata?.plan as
          | "team"
          | "business"
          | undefined;
        if (!workspaceId || !plan) break;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const sub = subId ? await stripe.subscriptions.retrieve(subId) : null;

        // Guard: never let a checkout with a forged metadata.workspace_id rebind
        // an existing workspace's billing to a different Stripe customer. A
        // first-time checkout (no prior row) proceeds normally.
        const { data: prior } = await service
          .from("subscriptions")
          .select("stripe_customer_id")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        if (prior && customerId && prior.stripe_customer_id !== customerId) break;

        await service.from("subscriptions").upsert(
          {
            workspace_id: workspaceId,
            stripe_customer_id: customerId ?? "",
            stripe_subscription_id: subId ?? null,
            status: (sub?.status ?? "active") as
              | "trialing"
              | "active"
              | "past_due"
              | "canceled"
              | "incomplete"
              | "incomplete_expired"
              | "unpaid"
              | "paused",
            plan,
            seats: plan === "business" ? 50 : 10,
            current_period_end: sub?.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            trial_ends_at: sub?.trial_end
              ? new Date(sub.trial_end * 1000).toISOString()
              : null,
            cancel_at_period_end: sub?.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id" },
        );
        handled = true;
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // Resolve the workspace from the TRUSTED stored stripe_customer_id ->
        // workspace_id mapping, NEVER from attacker-controllable payload
        // metadata. Stripe's signature proves the event is from a Stripe
        // account holding the signing secret; it does NOT prove which tenant
        // the customer belongs to. Trusting sub.metadata.workspace_id let any
        // Stripe-account holder cancel/modify another tenant's subscription.
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (!customerId) break;
        const { data: owning } = await service
          .from("subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!owning) break; // unknown customer — no tenant to update
        await service
          .from("subscriptions")
          .update({
            status: sub.status,
            stripe_subscription_id: sub.id,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", owning.workspace_id);
        handled = true;
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Stripe fires this ~3 days before trial end. Cinderblock doesn't
        // change state here — the trial banner reads trial_ends_at directly
        // from the subscriptions row, which gets refreshed by the next
        // customer.subscription.updated. The branch exists so the event
        // doesn't fall to the default 'ack' path silently.
        handled = true;
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;
        // Trust Stripe's subsequent customer.subscription.updated for the
        // state transition; this branch is for audit/telemetry only.
        handled = true;
        break;
      }

      default:
        handled = true; // ack unknown events; idempotency row prevents replay
    }

    await service
      .from("processed_stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "handler_failed", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ status: "ok", handled }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
