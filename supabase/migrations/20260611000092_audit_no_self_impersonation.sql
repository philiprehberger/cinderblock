-- Cinderblock — Migration 0092
-- Self-impersonation CHECK on audit_events.
--
-- The validateActor TypeScript guard in /src/lib/audit/actor-guard.ts refuses
-- to call auditLog when impersonator_id equals actor_id. The DB-level CHECK
-- backstops that: even if a future server action somehow constructed the
-- INSERT manually (bypassing the auditLog helper), the row is rejected at
-- the storage layer.
--
-- "Self-impersonation" is structurally meaningless — a user impersonating
-- themselves has no security boundary, just adds noise to the audit log.
-- Catching it loudly here keeps the audit-trail interpretation simple:
-- impersonator_id is always a *different* user than actor_id.

alter table public.audit_events
  add constraint audit_events_no_self_impersonation
  check (impersonator_id is null or impersonator_id <> actor_id);
