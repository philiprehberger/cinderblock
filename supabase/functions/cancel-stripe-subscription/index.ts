import Stripe from "npm:stripe@22.2.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { verifyInternalCaller } from "../_shared/internal-auth.ts";

// cancel-stripe-subscription — called by the hard-delete cron when a
// workspace's 24-hour soft-delete window expires. Cancels the Stripe
// subscription with prorate=false (the user opted to shut down, not get
// refunded). Failure blocks the hard-delete: the cron checks the response
// and refuses to proceed if Stripe didn't acknowledge the cancel.

type CancelRequest = {
  workspace_id: string;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const auth = await verifyInternalCaller(request);
  if (!auth.ok) return auth.response;

  let payload: CancelRequest;
  try {
    payload = JSON.parse(auth.body);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!payload.workspace_id) {
    return json({ error: "missing_workspace_id" }, 400);
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "env_unconfigured" }, 500);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sub } = await service
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("workspace_id", payload.workspace_id)
    .maybeSingle();

  // No subscription row, or already canceled — return success so the cron
  // proceeds with hard-delete. The "blocking" semantic is for *failed*
  // cancels, not for "nothing to cancel."
  if (!sub?.stripe_subscription_id) {
    return json({ status: "no_subscription", proceed: true }, 200);
  }
  if (sub.status === "canceled") {
    return json({ status: "already_canceled", proceed: true }, 200);
  }

  if (!stripeSecret) {
    // Stripe isn't configured. Surface this as an error so the cron
    // blocks the hard-delete — an unconfigured cancel leaves an orphan
    // Stripe customer that keeps charging.
    return json(
      { error: "stripe_secret_unconfigured", proceed: false },
      500,
    );
  }

  const stripe = new Stripe(stripeSecret, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
      prorate: false,
    });
  } catch (err) {
    return json(
      {
        error: "stripe_cancel_failed",
        detail: String(err),
        proceed: false,
      },
      500,
    );
  }

  await service
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("workspace_id", payload.workspace_id);

  return json({ status: "canceled", proceed: true }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
