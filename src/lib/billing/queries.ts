import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PLANS, type PlanId } from "@/lib/stripe/catalog";

export type SubscriptionRow = {
  workspace_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status:
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused";
  plan: PlanId;
  seats: number;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
};

// Returns the subscription for the workspace, or a synthesized "free" row
// when no subscription exists. Lets the UI render uniformly without
// branching on null.
export async function getSubscriptionForWorkspace(
  workspaceId: string,
): Promise<SubscriptionRow> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "workspace_id, stripe_customer_id, stripe_subscription_id, status, plan, seats, current_period_end, trial_ends_at, cancel_at_period_end",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (data) return data as SubscriptionRow;

  return {
    workspace_id: workspaceId,
    stripe_customer_id: "",
    stripe_subscription_id: null,
    status: "active",
    plan: "free",
    seats: PLANS.free.seats,
    current_period_end: null,
    trial_ends_at: null,
    cancel_at_period_end: false,
  };
}

export async function countActiveMembers(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("workspace_members")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("removed_at", null);
  return count ?? 0;
}
