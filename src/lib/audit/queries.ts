import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AuditEventRow = {
  id: string;
  workspace_id: string;
  actor_id: string;
  impersonator_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  occurred_at: string;
};

export type AuditFilters = {
  actorId?: string;
  action?: string;
  since?: string;  // ISO datetime
  until?: string;  // ISO datetime
  limit?: number;
  before?: string; // ISO occurred_at for cursor pagination
};

// Lists audit events for a workspace. RLS does the visibility filter:
//   - owner/admin sees every event
//   - member sees only events where actor_id = auth.uid()
//   - guest sees nothing
// The caller doesn't have to repeat that — just pass the workspaceId.
export async function listAuditEvents(
  workspaceId: string,
  filters: AuditFilters = {},
): Promise<AuditEventRow[]> {
  const supabase = await createClient();
  const limit = Math.min(filters.limit ?? 50, 200);

  let query = supabase
    .from("audit_events")
    .select(
      "id, workspace_id, actor_id, impersonator_id, action, target_type, target_id, diff, ip, user_agent, occurred_at",
    )
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.since) query = query.gte("occurred_at", filters.since);
  if (filters.until) query = query.lte("occurred_at", filters.until);
  if (filters.before) query = query.lt("occurred_at", filters.before);

  const { data, error } = await query;
  if (error) {
    throw new Error(`listAuditEvents failed: ${error.message}`);
  }
  return (data ?? []) as AuditEventRow[];
}

// distinctActions returns the set of action types the caller can see in the
// workspace — used to populate the filter dropdown. Limited to recent
// activity so we don't scan the whole table.
export async function listDistinctActions(
  workspaceId: string,
  withinDays = 90,
): Promise<string[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - withinDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("audit_events")
    .select("action")
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", since)
    .limit(500);
  if (error) {
    throw new Error(`listDistinctActions failed: ${error.message}`);
  }
  const set = new Set<string>();
  for (const row of data ?? []) set.add(row.action);
  return Array.from(set).sort();
}
