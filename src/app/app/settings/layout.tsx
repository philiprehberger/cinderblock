import Link from "next/link";

import { requireAuth } from "@/lib/auth/session";

// User-scoped settings shell. MFA is the only entry today; the layout
// is set up so future per-user settings (sessions, notification prefs,
// API tokens) drop in alongside without restructuring.

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <div className="text-sm text-zinc-500">Account preferences</div>
        </div>
        <Link
          href="/app"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← All workspaces
        </Link>
      </div>

      <nav className="mb-6 flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800">
        <Link
          href="/app/settings/mfa"
          className="border-b-2 border-transparent px-1 pb-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Two-factor (TOTP)
        </Link>
      </nav>

      {children}
    </div>
  );
}
