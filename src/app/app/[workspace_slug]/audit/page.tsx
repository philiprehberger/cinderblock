import { getWorkspaceBySlug } from "@/lib/workspaces/queries";
import { listAuditEvents, listDistinctActions } from "@/lib/audit/queries";
import { getUserEmails } from "@/lib/users/queries";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function renderDiff(diff: Record<string, unknown> | null) {
  if (!diff || Object.keys(diff).length === 0) return null;
  return (
    <pre className="mt-1 max-w-md overflow-auto rounded bg-zinc-100 px-2 py-1 text-xs leading-5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {JSON.stringify(diff, null, 2)}
    </pre>
  );
}

export default async function AuditPage(props: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{
    action?: string;
    actor?: string;
    since?: string;
    until?: string;
    before?: string;
  }>;
}) {
  const { workspace_slug } = await props.params;
  const sp = await props.searchParams;
  const workspace = await getWorkspaceBySlug(workspace_slug);

  const events = await listAuditEvents(workspace.id, {
    actorId: sp.actor || undefined,
    action: sp.action || undefined,
    since: sp.since || undefined,
    until: sp.until || undefined,
    before: sp.before || undefined,
    limit: 50,
  });

  const actions = await listDistinctActions(workspace.id);

  // Resolve every actor + impersonator UUID to an email for the table.
  const ids: string[] = [];
  for (const e of events) {
    ids.push(e.actor_id);
    if (e.impersonator_id) ids.push(e.impersonator_id);
  }
  const emails = await getUserEmails(ids);

  const nextBefore = events.length === 50 ? events[events.length - 1]?.occurred_at : null;
  const isMember = workspace.role === "member";
  const isGuest = workspace.role === "guest";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Audit log</h2>
        {isGuest ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Guests don't see the audit log. Ask an admin if you need a record
            of an action.
          </p>
        ) : isMember ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            You see only events you initiated. Owners and admins see everyone.
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            All events in this workspace. Impersonation events show both the
            apparent actor and the admin who initiated impersonation.
          </p>
        )}
      </div>

      {/* ------------------- filters ------------------- */}
      <form
        action={`/app/${workspace.slug}/audit`}
        method="get"
        className="grid items-end gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <label className="space-y-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Action
          </span>
          <select
            name="action"
            defaultValue={sp.action ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Any</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Since
          </span>
          <input
            name="since"
            type="datetime-local"
            defaultValue={sp.since ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Until
          </span>
          <input
            name="until"
            type="datetime-local"
            defaultValue={sp.until ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Apply
          </button>
          {sp.action || sp.since || sp.until || sp.before ? (
            <a
              href={`/app/${workspace.slug}/audit`}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Reset
            </a>
          ) : null}
        </div>
      </form>

      {/* ------------------- events ------------------- */}
      {events.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No audit events match these filters.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {events.map((e) => {
            const actorEmail = emails.get(e.actor_id) ?? e.actor_id;
            const imp = e.impersonator_id ? emails.get(e.impersonator_id) ?? e.impersonator_id : null;
            return (
              <li key={e.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <code className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {e.action}
                    </code>
                    <span className="ml-3 text-xs text-zinc-500">
                      {actorEmail}
                    </span>
                    {imp ? (
                      <span className="ml-2 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                        impersonated by {imp}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {fmtDateTime(e.occurred_at)}
                  </span>
                </div>
                {e.target_type ? (
                  <div className="mt-1 text-xs text-zinc-500">
                    Target: {e.target_type} · <code>{e.target_id}</code>
                  </div>
                ) : null}
                {renderDiff(e.diff)}
              </li>
            );
          })}
        </ul>
      )}

      {nextBefore ? (
        <div>
          <a
            href={`/app/${workspace.slug}/audit?${new URLSearchParams({
              ...(sp.action ? { action: sp.action } : {}),
              ...(sp.since ? { since: sp.since } : {}),
              ...(sp.until ? { until: sp.until } : {}),
              before: nextBefore,
            }).toString()}`}
            className="text-sm text-zinc-700 underline hover:no-underline dark:text-zinc-300"
          >
            Older events →
          </a>
        </div>
      ) : null}
    </div>
  );
}
