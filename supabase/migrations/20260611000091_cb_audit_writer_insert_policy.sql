-- Cinderblock — Migration 0091
-- Role-scoped INSERT policy for cb_audit_writer on audit_events.
--
-- Migration 0050 created the audit_events table with RLS enabled, an admin-
-- visibility SELECT policy, and an INSERT grant for cb_audit_writer — but
-- no INSERT policy. With RLS enabled and no matching policy, INSERT is
-- denied by default, so the auditLog() write path was silently failing
-- (wrapped in try/catch in every caller).
--
-- The fix is a permissive INSERT policy scoped to cb_audit_writer only.
-- BYPASSRLS would be an alternative but is broader than necessary; this
-- policy makes the contract explicit: this role can insert, period, no
-- conditions, and nothing else (no SELECT/UPDATE/DELETE grants exist).

create policy "audit_events_insert_cb_audit_writer" on public.audit_events
  for insert
  to cb_audit_writer
  with check (true);
