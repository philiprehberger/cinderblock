import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvitation } from "@/lib/invitations/actions";

// /app/accept/[token] — the recipient lands here after clicking the email link.
// If they're not signed in, the auth callback that GoTrue redirected through
// already created the session (Supabase Auth invites create the user the
// first time). If for some reason no session exists, send them to /signin
// with ?next= so the callback returns here.
//
// The token is opaque to this page — we don't decode it client-side; the
// invite-accept Edge Function does the verification.

export default async function AcceptPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const user = await getCurrentUser();

  if (!user) {
    const next = encodeURIComponent(`/app/accept/${encodeURIComponent(token)}`);
    redirect(`/signin?next=${next}`);
  }

  // Decode just the payload to preview the workspace/role (the Edge Function
  // re-verifies; this decode is for UI only and trusts nothing).
  let payloadPreview: { email?: string; role?: string } = {};
  try {
    const dot = token.lastIndexOf(".");
    if (dot > 0) {
      const base64 = token.slice(0, dot).replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const decoded = Buffer.from(padded, "base64").toString("utf-8");
      payloadPreview = JSON.parse(decoded);
    }
  } catch {
    // Bad token; show the page anyway and let the user submit — the Edge
    // Function will give a real error.
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Accept invitation</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        You've been invited to join a workspace as{" "}
        <span className="font-medium uppercase tracking-wide text-zinc-900 dark:text-zinc-100">
          {payloadPreview.role ?? "member"}
        </span>
        .
      </p>
      {payloadPreview.email && payloadPreview.email !== user.email ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This invitation was sent to {payloadPreview.email}, but you're signed
          in as {user.email}. Accepting will fail — sign out, then sign in with{" "}
          {payloadPreview.email}.
        </div>
      ) : null}

      <form action={acceptInvitation} className="mt-6 flex items-center gap-3">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Accept
        </button>
        <Link
          href="/app"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          Decline (just navigate away)
        </Link>
      </form>
    </div>
  );
}
