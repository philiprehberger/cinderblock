import Link from "next/link";

const ERROR_LABELS: Record<string, string> = {
  invalid_or_expired_token: "This invitation link is invalid or has expired.",
  invitation_not_found: "We couldn't find this invitation.",
  already_accepted: "This invitation has already been accepted.",
  expired: "This invitation has expired.",
  email_mismatch:
    "The email on this invitation doesn't match the account you're signed in as.",
  token_email_mismatch: "Invitation payload mismatch.",
  already_member: "You're already a member of this workspace.",
  user_not_found: "Your account couldn't be found.",
};

export default async function AcceptResultPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await props.searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Couldn't accept</h1>
      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
        {ERROR_LABELS[error ?? ""] ?? error ?? "Unknown error."}
      </p>
      <div className="mt-6">
        <Link
          href="/app"
          className="text-sm text-zinc-900 underline hover:no-underline dark:text-zinc-100"
        >
          ← Back to your workspaces
        </Link>
      </div>
    </div>
  );
}
