import Link from "next/link";

import { requireAuth } from "@/lib/auth/session";
import { listTotpFactors, userHoldsAnyOwnerRole } from "@/lib/mfa/queries";
import {
  enrollTotp,
  verifyTotp,
  cancelEnroll,
  unenrollTotp,
  readEnrolCookie,
} from "@/lib/mfa/actions";

// /app/settings/mfa — TOTP enrolment + factor management.
//
// Render branches:
//   1. Verified factor present → show "MFA active" + unenrol button
//      (the unenrol action refuses if removing leaves an owner with zero
//      factors, so the button never silently demotes a still-owner user).
//   2. Unverified factor + matching enrol cookie → show QR + secret + the
//      6-digit verify form. Cancel button calls cancelEnroll.
//   3. No factor → show "Enrol TOTP" button.
//
// `?reason=` is set by requireOwnerMfa() to explain why the user landed
// here (billing change, role change, impersonation, etc.). `?next=`
// carries the path to redirect to after enrolment. The next-link redirect
// is informational only — the user clicks it after verifying — because
// auto-redirecting from a server action mid-page would feel jumpy.

type ReasonKey =
  | "billing"
  | "role_change"
  | "impersonation"
  | "member_removal"
  | "workspace_delete";

const REASON_COPY: Record<ReasonKey, string> = {
  billing: "Billing changes require two-factor authentication.",
  role_change: "Changing roles requires two-factor authentication.",
  impersonation: "Starting impersonation requires two-factor authentication.",
  member_removal: "Removing members requires two-factor authentication.",
  workspace_delete: "Deleting a workspace requires two-factor authentication.",
};

const ERROR_COPY: Record<string, string> = {
  already_enrolled: "You already have an active TOTP factor.",
  wrong_code: "That code didn't match. Try again.",
  invalid_code_format: "Codes are 6 digits with no spaces.",
  missing_factor: "Could not identify the factor. Start over.",
  factor_not_found: "Factor not found.",
  owner_must_keep_mfa:
    "You hold owner in at least one workspace — remove your owner role first, or enrol a replacement factor before removing this one.",
};

const OK_COPY: Record<string, string> = {
  enrolled: "Two-factor authentication is now active.",
  unenrolled: "Factor removed.",
};

function formatError(value: string | undefined): string | null {
  if (!value) return null;
  return ERROR_COPY[value] ?? value;
}

export default async function MfaSettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();
  const params = await props.searchParams;
  const reason = typeof params.reason === "string" ? params.reason : null;
  const next = typeof params.next === "string" ? params.next : null;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;

  const factors = await listTotpFactors();
  const verified = factors.find((f) => f.status === "verified");
  const unverified = factors.find((f) => f.status === "unverified");
  const enrolCookie = unverified ? await readEnrolCookie() : null;
  const isOwnerSomewhere = await userHoldsAnyOwnerRole();

  return (
    <div className="max-w-2xl space-y-6">
      {reason && REASON_COPY[reason as ReasonKey] ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {REASON_COPY[reason as ReasonKey]} Enrol below, then return to your
          action.
        </div>
      ) : null}

      {ok ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {OK_COPY[ok] ?? ok}
          {next ? (
            <>
              {" "}
              <Link href={next} className="font-medium underline">
                Continue
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {formatError(error)}
        </div>
      ) : null}

      <section className="rounded-md border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">TOTP authenticator app</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Use 1Password, Authy, Google Authenticator, or any other RFC-6238
          authenticator. Required for workspace owners; recommended for
          everyone else.
        </p>

        {verified ? (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950">
            <div className="text-sm">
              <div className="font-medium text-emerald-900 dark:text-emerald-200">
                Two-factor authentication is active
              </div>
              <div className="text-emerald-700 dark:text-emerald-300">
                Enrolled{" "}
                {new Date(verified.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <form action={unenrollTotp}>
              <input type="hidden" name="factor_id" value={verified.id} />
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                Remove
              </button>
            </form>
          </div>
        ) : unverified && enrolCookie ? (
          <div className="mt-4 space-y-4">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              <strong>Step 1.</strong> Scan the QR code below with your
              authenticator app, or paste the secret manually.
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div
                className="h-40 w-40 shrink-0 rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-50"
                dangerouslySetInnerHTML={{ __html: enrolCookie.qrCode }}
              />
              <div className="space-y-2 text-sm">
                <div>
                  <div className="font-medium text-zinc-700 dark:text-zinc-300">
                    Secret
                  </div>
                  <code className="block break-all rounded bg-zinc-100 px-2 py-1 font-mono text-xs dark:bg-zinc-800">
                    {enrolCookie.secret}
                  </code>
                </div>
                <p className="text-xs text-zinc-500">
                  The secret is shown only once. If you lose it before
                  verifying, cancel and start over.
                </p>
              </div>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              <strong>Step 2.</strong> Enter the 6-digit code from your app.
            </div>
            <form action={verifyTotp} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="factor_id" value={enrolCookie.factorId} />
              <input
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
                placeholder="123456"
                className="w-32 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-center font-mono text-base tracking-widest dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Verify and enable
              </button>
              <form action={cancelEnroll}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </form>
            </form>
          </div>
        ) : unverified && !enrolCookie ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              An enrolment was started but the QR is no longer available
              (likely a page refresh past the 15-minute window). Cancel it
              and start over.
            </div>
            <form action={cancelEnroll}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Reset and start over
              </button>
            </form>
          </div>
        ) : (
          <form action={enrollTotp} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Enrol TOTP
            </button>
            {isOwnerSomewhere ? (
              <p className="mt-2 text-xs text-zinc-500">
                You hold owner in at least one workspace — enrolment is
                required for billing changes, role changes, member removal,
                and impersonation.
              </p>
            ) : null}
          </form>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        See{" "}
        <Link href="/docs/security/mfa" className="underline">
          /docs/security/mfa
        </Link>{" "}
        for the full enforcement policy.
      </p>
    </div>
  );
}
