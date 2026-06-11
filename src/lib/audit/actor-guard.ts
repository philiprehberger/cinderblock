// Pure-function actor-validation guard. Extracted from writer.ts so vitest
// can unit-test it without tripping `import "server-only"`. The DB-touching
// code in writer.ts stays server-only; this file is safely shared.

export type AuditActor = {
  actorId: string;
  impersonatorId: string | null;
  jwtAud: string | null;
};

// If impersonator_id is present, the active JWT must have `aud = 'impersonation'`.
// Catches developer error where impersonation state was set in the cookie but
// the JWT mint missed the aud claim, and the self-impersonation cycle.
export function validateActor(actor: AuditActor): AuditActor {
  if (actor.impersonatorId !== null && actor.jwtAud !== "impersonation") {
    throw new Error(
      "auditLog refused: impersonator_id set but JWT aud is not 'impersonation'",
    );
  }
  if (actor.impersonatorId !== null && actor.impersonatorId === actor.actorId) {
    throw new Error("auditLog refused: impersonator_id equals actor_id");
  }
  return actor;
}
