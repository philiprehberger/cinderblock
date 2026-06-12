import { notFound } from "next/navigation";

import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import {
  getSubscriptionForWorkspace,
  countActiveMembers,
} from "@/lib/billing/queries";
import { startCheckout, openCustomerPortal } from "@/lib/billing/actions";
import { PLANS, PAID_PLANS } from "@/lib/stripe/catalog";
import { isStripeConfigured } from "@/lib/stripe/client";

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  paused: "Paused",
};

const ERROR_LABELS: Record<string, string> = {
  invalid_plan: "Pick Team or Business.",
  owner_only: "Only the workspace owner can change billing.",
  stripe_not_configured:
    "Stripe is not configured on this deployment. Set STRIPE_SECRET_KEY + STRIPE_PRICE_TEAM + STRIPE_PRICE_BUSINESS to enable checkout.",
  no_customer:
    "No Stripe customer is associated with this workspace yet. Start a subscription first.",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default async function BillingPage(props: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{
    error?: string;
    checkout?: string;
  }>;
}) {
  const { workspace_slug } = await props.params;
  const { error, checkout } = await props.searchParams;
  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (workspace.role !== "owner") {
    notFound();
  }

  const sub = await getSubscriptionForWorkspace(workspace.id);
  const activeMembers = await countActiveMembers(workspace.id);
  const stripeConfigured = isStripeConfigured();
  const currentPlan = PLANS[sub.plan];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold">Billing</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Plan changes route through Stripe Checkout. Past-due workspaces
          retain full access for 7 days, then degrade to read-only — see{" "}
          <code className="text-xs">app_private.workspace_is_writable</code>.
        </p>
      </div>

      {!stripeConfigured ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Stripe isn't configured on this deployment. Plans are visible for
          preview but Checkout / Customer Portal buttons return an error.
          Wire <code>STRIPE_SECRET_KEY</code> +{" "}
          <code>STRIPE_PRICE_TEAM</code> +{" "}
          <code>STRIPE_PRICE_BUSINESS</code> to enable.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {ERROR_LABELS[error.split(":")[0]!] ?? error}
        </div>
      ) : null}

      {checkout === "success" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Checkout completed. The webhook will update your subscription
          state shortly — refresh if you don't see the new plan yet.
        </div>
      ) : null}
      {checkout === "cancel" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Checkout canceled.
        </div>
      ) : null}

      {/* ---------- current plan ---------- */}
      <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Current plan
            </div>
            <div className="text-xl font-semibold">{currentPlan.name}</div>
          </div>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
              sub.status === "active"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : sub.status === "trialing"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  : sub.status === "past_due"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : sub.status === "canceled"
                      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {STATUS_LABELS[sub.status] ?? sub.status}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">Members</dt>
            <dd>
              {activeMembers}{" "}
              <span className="text-zinc-500">/ {currentPlan.seats}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Renews</dt>
            <dd>{fmtDate(sub.current_period_end)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Trial ends</dt>
            <dd>{fmtDate(sub.trial_ends_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Cancels at end</dt>
            <dd>{sub.cancel_at_period_end ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {sub.stripe_customer_id ? (
          <form action={openCustomerPortal} className="mt-4">
            <input type="hidden" name="workspace_slug" value={workspace.slug} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Manage billing in Stripe
            </button>
          </form>
        ) : null}
      </section>

      {/* ---------- plan picker ---------- */}
      <section>
        <h3 className="mb-3 text-base font-semibold">Plans</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["free", ...PAID_PLANS] as const).map((id) => {
            const plan = PLANS[id];
            const isCurrent = id === sub.plan;
            return (
              <div
                key={id}
                className={`rounded-md border p-4 ${
                  isCurrent
                    ? "border-zinc-900 bg-white dark:border-white dark:bg-zinc-900"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{plan.name}</div>
                  {isCurrent ? (
                    <span className="text-xs text-zinc-500">Current</span>
                  ) : null}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  ${plan.monthlyPriceUsd}
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                  {plan.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                {!isCurrent && (id === "team" || id === "business") ? (
                  <form action={startCheckout} className="mt-4">
                    <input
                      type="hidden"
                      name="workspace_slug"
                      value={workspace.slug}
                    />
                    <input type="hidden" name="plan" value={id} />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {sub.plan === "free" ? "Upgrade" : "Switch"} to {plan.name}
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
