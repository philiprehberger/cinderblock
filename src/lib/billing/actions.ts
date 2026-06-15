"use server";

import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server-only";
import { getStripe } from "@/lib/stripe/client";
import { stripePriceForPlan, type PlanId } from "@/lib/stripe/catalog";
import { auditLog } from "@/lib/audit/writer";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { requireOwnerMfa } from "@/lib/mfa/gate";

// startCheckout — creates a Stripe Checkout Session for the chosen paid plan
// and redirects the owner to Stripe's hosted page. The webhook updates the
// subscriptions row when the session completes.
//
// Owner-only by policy. When STRIPE_SECRET_KEY is unset, redirects back to
// the billing page with ?error=stripe_not_configured rather than crashing.

function backToBilling(slug: string, error?: string): never {
  const qs = error ? `?error=${encodeURIComponent(error)}` : "";
  redirect(`/app/${slug}/billing${qs}`);
}

export async function startCheckout(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  const plan = String(formData.get("plan") ?? "") as PlanId;

  if (!slug) redirect("/app");
  if (plan !== "team" && plan !== "business") {
    backToBilling(slug, "invalid_plan");
  }

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner") {
    backToBilling(slug, "owner_only");
  }

  await requireOwnerMfa(user.id, "billing", `/app/${slug}/billing`);

  const stripe = getStripe();
  if (!stripe) {
    backToBilling(slug, "stripe_not_configured");
  }

  const priceId = stripePriceForPlan(plan);
  if (!priceId) {
    backToBilling(slug, `price_not_configured:${plan}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Reuse an existing Stripe customer when the workspace already has one
  // from a prior subscription; otherwise let Stripe create one with the
  // workspace's billing email pre-filled.
  const service = createServiceRoleClient();
  const { data: existingSub } = await service
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/app/${slug}/billing?checkout=success`,
      cancel_url: `${siteUrl}/app/${slug}/billing?checkout=cancel`,
      ...(existingSub?.stripe_customer_id
        ? { customer: existingSub.stripe_customer_id }
        : {}),
      // Embed workspace_id + invoking user in metadata so the webhook can
      // attribute the subscription back to the right workspace without a
      // lookup by customer email.
      metadata: {
        workspace_id: workspace.id,
        plan,
        initiated_by_user_id: user.id,
      },
      subscription_data: {
        metadata: {
          workspace_id: workspace.id,
          plan,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    backToBilling(slug, `stripe_error:${msg}`);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "billing.checkout_started",
      targetType: "subscription",
      targetId: workspace.id,
      diff: { plan, session_id: session.id },
    });
  } catch (err) {
    console.error("auditLog billing.checkout_started failed:", err);
  }

  if (!session.url) {
    backToBilling(slug, "stripe_no_url");
  }
  redirect(session.url);
}

export async function openCustomerPortal(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const slug = String(formData.get("workspace_slug") ?? "");
  if (!slug) redirect("/app");

  const workspace = await getWorkspaceBySlug(slug);
  if (workspace.role !== "owner") {
    backToBilling(slug, "owner_only");
  }

  await requireOwnerMfa(user.id, "billing", `/app/${slug}/billing`);

  const stripe = getStripe();
  if (!stripe) {
    backToBilling(slug, "stripe_not_configured");
  }

  const service = createServiceRoleClient();
  const { data: sub } = await service
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    backToBilling(slug, "no_customer");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let portal;
  try {
    portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${siteUrl}/app/${slug}/billing`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    backToBilling(slug, `stripe_error:${msg}`);
  }

  try {
    await auditLog({
      workspaceId: workspace.id,
      action: "billing.portal_opened",
      targetType: "subscription",
      targetId: workspace.id,
    });
  } catch (err) {
    console.error("auditLog billing.portal_opened failed:", err);
  }

  redirect(portal.url);
}
