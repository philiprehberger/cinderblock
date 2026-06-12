import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

export default async function SignInPage(props: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  // Already signed in? Skip the form.
  const user = await getCurrentUser();
  if (user) redirect("/app");

  const { sent, error } = await props.searchParams;

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      redirect("/signin?error=invalid_email");
    }
    const supabase = await createClient();
    const { error: linkError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After clicking the email link, GoTrue redirects to /auth/callback,
        // which exchanges the code for a session and forwards to /app.
        // The home page also forwards `?code=` to /auth/callback in case
        // Supabase strips the path during redirect-URL allowlist matching.
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      },
    });
    if (linkError) {
      redirect(`/signin?error=${encodeURIComponent(linkError.message)}`);
    }
    redirect(`/signin?sent=${encodeURIComponent(email)}`);
  }

  async function verifyCode(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const token = String(formData.get("token") ?? "").trim();
    if (!email || !token) {
      redirect(`/signin?sent=${encodeURIComponent(email)}&error=missing_field`);
    }
    if (!/^\d{6}$/.test(token)) {
      redirect(`/signin?sent=${encodeURIComponent(email)}&error=invalid_code_format`);
    }
    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (verifyError) {
      redirect(
        `/signin?sent=${encodeURIComponent(email)}&error=${encodeURIComponent(verifyError.message)}`,
      );
    }
    redirect("/app");
  }

  async function verifyEmailLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const raw = String(formData.get("link") ?? "").trim();
    if (!raw) {
      redirect(
        `/signin?sent=${encodeURIComponent(email)}&error=missing_link`,
      );
    }

    // The Supabase verify URL is `…/auth/v1/verify?token=<hash>&type=<kind>&redirect_to=…`.
    // The `token` param is the hashed verification token; verifyOtp via
    // `token_hash` accepts it directly without needing the original email
    // or the redirect URL. This sidesteps any URL-allowlist quirks.
    let tokenHash: string | null = null;
    let type: "magiclink" | "signup" | "recovery" | "invite" | "email_change" = "magiclink";
    try {
      const url = new URL(raw);
      tokenHash = url.searchParams.get("token");
      const t = url.searchParams.get("type");
      if (t === "magiclink" || t === "signup" || t === "recovery" || t === "invite" || t === "email_change") {
        type = t;
      }
    } catch {
      // Not a URL — maybe they pasted just the token. Accept hex-looking values.
      if (/^[a-f0-9]{20,}$/i.test(raw)) {
        tokenHash = raw;
      }
    }

    if (!tokenHash) {
      redirect(
        `/signin?sent=${encodeURIComponent(email)}&error=could_not_parse_link`,
      );
    }

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (verifyError) {
      redirect(
        `/signin?sent=${encodeURIComponent(email)}&error=${encodeURIComponent(verifyError.message)}`,
      );
    }
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Cinderblock
        </Link>
      </header>

      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          We send a one-time code to your email. No password to leak.
        </p>

        {sent ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Sign-in code sent to <strong>{sent}</strong>. Click the link in
              the email <em>or</em> enter the 6-digit code below.
            </div>

            <form action={verifyCode} className="space-y-4">
              <input type="hidden" name="email" value={sent} />
              <div>
                <label
                  htmlFor="token"
                  className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  6-digit code
                </label>
                <input
                  id="token"
                  name="token"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-lg tracking-widest focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="000000"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  In the email body, look for &quot;Alternatively, enter the
                  code: NNNNNN&quot;.
                </p>
              </div>
              {error ? (
                <div className="text-sm text-red-700 dark:text-red-400">
                  {error === "missing_field"
                    ? "Enter the code."
                    : error === "invalid_code_format"
                      ? "Code must be 6 digits."
                      : error}
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <Link
                  href="/signin"
                  className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
                >
                  Use a different email
                </Link>
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Sign in
                </button>
              </div>
            </form>

            <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Email doesn&apos;t show a code? Paste the link instead.
                </summary>
                <form action={verifyEmailLink} className="mt-4 space-y-3">
                  <input type="hidden" name="email" value={sent} />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Copy the entire URL from the &quot;Confirm your email&quot;
                    or &quot;Sign in&quot; button in your inbox and paste it
                    below. I&apos;ll extract the token and verify it directly,
                    bypassing any redirect-URL issues.
                  </p>
                  <textarea
                    name="link"
                    rows={3}
                    required
                    className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                    placeholder="https://mabbfeogzbxzqkutzril.supabase.co/auth/v1/verify?token=…"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Verify from link
                    </button>
                  </div>
                </form>
              </details>
            </div>
          </div>
        ) : (
          <form action={sendMagicLink} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="you@example.com"
              />
            </div>
            {error ? (
              <div className="text-sm text-red-700 dark:text-red-400">
                {error === "invalid_email" ? "Enter a valid email." : error}
              </div>
            ) : null}
            <button
              type="submit"
              className="inline-flex w-full justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Send sign-in code
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
