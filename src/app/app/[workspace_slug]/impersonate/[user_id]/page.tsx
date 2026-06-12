import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { getUserEmails } from "@/lib/users/queries";
import { verifyStepUpAndImpersonate } from "@/lib/impersonation/actions";

const ERROR_LABELS: Record<string, string> = {
  cannot_impersonate_self: "You can't impersonate yourself.",
  not_admin: "Only admins and owners can impersonate.",
  target_not_member: "That user isn't an active member of this workspace.",
  owner_target_requires_owner: "Only owners can impersonate other owners.",
  jwt_secret_unset: "Server config error: SUPABASE_JWT_SECRET is not set.",
  invalid_otp_format: "Code must be 6 digits.",
  invalid_or_used_otp: "Code is invalid or has already been used.",
  expired_otp: "Code expired. Restart the flow.",
  missing_field: "Submit the form with both target + code.",
};

export default async function ImpersonateConfirmPage(props: {
  params: Promise<{ workspace_slug: string; user_id: string }>;
  searchParams: Promise<{ error?: string; sent?: string; __dev_otp?: string }>;
}) {
  const { workspace_slug, user_id } = await props.params;
  const { error, sent, __dev_otp } = await props.searchParams;

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    notFound();
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.id === user_id) {
    notFound();
  }

  const emails = await getUserEmails([user_id]);
  const targetEmail = emails.get(user_id);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Impersonate</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        You're about to view this workspace as{" "}
        <strong className="text-zinc-900 dark:text-zinc-100">
          {targetEmail ?? user_id}
        </strong>
        . The session lasts 60 minutes and every action is logged twice — once
        under their name and once under yours.
      </p>

      {error ? (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {ERROR_LABELS[error] ?? error}
        </div>
      ) : null}

      {sent ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          A 6-digit code was generated.
          {__dev_otp ? (
            <div className="mt-1 font-mono text-base text-emerald-900 dark:text-emerald-100">
              Dev mode: <strong>{__dev_otp}</strong>
              <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
                (In production this would arrive by email — see{" "}
                <code>/docs/security/mfa</code>.)
              </span>
            </div>
          ) : (
            <div className="mt-1 text-xs">Check your email for the code.</div>
          )}
        </div>
      ) : null}

      <form action={verifyStepUpAndImpersonate} className="mt-6 space-y-4">
        <input type="hidden" name="workspace_slug" value={workspace_slug} />
        <input type="hidden" name="target_user_id" value={user_id} />

        <div>
          <label
            htmlFor="otp"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Enter 6-digit code
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-lg tracking-widest focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="000000"
          />
        </div>

        <div className="flex items-center justify-between">
          <Link
            href={`/app/${workspace_slug}/members`}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Confirm + impersonate
          </button>
        </div>
      </form>
    </div>
  );
}
