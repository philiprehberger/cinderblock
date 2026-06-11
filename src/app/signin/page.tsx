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
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      },
    });
    if (linkError) {
      redirect(`/signin?error=${encodeURIComponent(linkError.message)}`);
    }
    redirect(`/signin?sent=${encodeURIComponent(email)}`);
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
          We send a one-time link to your email. No password to leak.
        </p>

        {sent ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Sign-in link sent to <strong>{sent}</strong>. Check your inbox.
            <div className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
              In local dev, all email lands in Mailpit at{" "}
              <a className="underline" href="http://127.0.0.1:54324">
                127.0.0.1:54324
              </a>
              .
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
              Send sign-in link
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
