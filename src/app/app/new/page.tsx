import Link from "next/link";

import { createWorkspace } from "@/lib/workspaces/actions";

export default function NewWorkspacePage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">New workspace</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        You'll be the workspace owner. Invitations come later.
      </p>

      <form action={createWorkspace} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={1}
            maxLength={80}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Acme Corp"
          />
        </div>

        <div>
          <label
            htmlFor="slug"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            minLength={2}
            maxLength={32}
            pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="acme"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Lowercase letters, numbers, and hyphens. Used in URLs.
          </p>
        </div>

        <div>
          <label
            htmlFor="billing_email"
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Billing email{" "}
            <span className="text-zinc-500">(optional)</span>
          </label>
          <input
            id="billing_email"
            name="billing_email"
            type="email"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="billing@example.com"
          />
        </div>

        <div className="flex items-center justify-between">
          <Link
            href="/app"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create workspace
          </button>
        </div>
      </form>
    </div>
  );
}
