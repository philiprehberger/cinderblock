import Link from "next/link";

import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { getSubscriptionForWorkspace } from "@/lib/billing/queries";

function fmtDaysLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return "ended";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export default async function WorkspaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await props.params;
  const workspace = await getWorkspaceBySlug(workspace_slug);
  const subscription = await getSubscriptionForWorkspace(workspace.id);

  const trialDaysLeft =
    subscription.status === "trialing"
      ? fmtDaysLeft(subscription.trial_ends_at)
      : null;
  const pastDueGraceDaysLeft =
    subscription.status === "past_due"
      ? fmtDaysLeft(
          subscription.current_period_end
            ? new Date(
                new Date(subscription.current_period_end).getTime() +
                  7 * 24 * 60 * 60 * 1000,
              ).toISOString()
            : null,
        )
      : null;

  return (
    <div>
      {trialDaysLeft ? (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Trial ends in <strong>{trialDaysLeft}</strong>. Upgrade in{" "}
          <Link
            href={`/app/${workspace.slug}/billing`}
            className="underline hover:no-underline"
          >
            Billing
          </Link>{" "}
          to keep access.
        </div>
      ) : null}
      {pastDueGraceDaysLeft && pastDueGraceDaysLeft !== "ended" ? (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Payment past due. Read-only mode in <strong>{pastDueGraceDaysLeft}</strong>{" "}
          if not resolved.{" "}
          {workspace.role === "owner" ? (
            <Link
              href={`/app/${workspace.slug}/billing`}
              className="underline hover:no-underline"
            >
              Fix billing
            </Link>
          ) : null}
        </div>
      ) : null}
      {pastDueGraceDaysLeft === "ended" || subscription.status === "canceled" ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Workspace is <strong>read-only</strong> —{" "}
          {subscription.status === "canceled" ? "subscription canceled" : "past due beyond 7-day grace"}.
          New tasks, invites, and edits are blocked.
        </div>
      ) : null}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {workspace.name}
          </h1>
          <div className="text-sm text-zinc-500">/{workspace.slug}</div>
        </div>
        <Link href="/app" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← All workspaces
        </Link>
      </div>

      <nav className="mb-6 flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800">
        <Link
          href={`/app/${workspace.slug}`}
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Tasks
        </Link>
        <Link
          href={`/app/${workspace.slug}/members`}
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Members
        </Link>
        <Link
          href={`/app/${workspace.slug}/audit`}
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Audit log
        </Link>
        {workspace.role === "owner" ? (
          <Link
            href={`/app/${workspace.slug}/billing`}
            className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Billing
          </Link>
        ) : null}
      </nav>

      {props.children}
    </div>
  );
}
