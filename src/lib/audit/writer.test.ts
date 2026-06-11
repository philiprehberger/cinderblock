import { describe, expect, it } from "vitest";
import { validateActor } from "./actor-guard";

// The validateActor guard is the load-bearing piece of the audit writer that
// catches developer error. The DB connection itself is exercised in the
// pgtap suite and the integration smoke test; this unit test focuses on the
// pure-function guard so it runs in CI without a live Supabase stack.

describe("validateActor", () => {
  it("accepts a normal authenticated actor with no impersonation", () => {
    const actor = {
      actorId: "00000000-0000-0000-0000-000000000001",
      impersonatorId: null,
      jwtAud: "authenticated",
    };
    expect(validateActor(actor)).toEqual(actor);
  });

  it("accepts an impersonation actor with the right aud claim", () => {
    const actor = {
      actorId: "00000000-0000-0000-0000-000000000001",
      impersonatorId: "00000000-0000-0000-0000-000000000002",
      jwtAud: "impersonation",
    };
    expect(validateActor(actor)).toEqual(actor);
  });

  it("refuses an impersonation actor whose JWT aud is not 'impersonation'", () => {
    const actor = {
      actorId: "00000000-0000-0000-0000-000000000001",
      impersonatorId: "00000000-0000-0000-0000-000000000002",
      jwtAud: "authenticated",
    };
    expect(() => validateActor(actor)).toThrow(/aud is not 'impersonation'/);
  });

  it("refuses an impersonation actor whose JWT aud is null", () => {
    const actor = {
      actorId: "00000000-0000-0000-0000-000000000001",
      impersonatorId: "00000000-0000-0000-0000-000000000002",
      jwtAud: null,
    };
    expect(() => validateActor(actor)).toThrow(/aud is not 'impersonation'/);
  });

  it("refuses an actor impersonating themselves", () => {
    const actor = {
      actorId: "00000000-0000-0000-0000-000000000001",
      impersonatorId: "00000000-0000-0000-0000-000000000001",
      jwtAud: "impersonation",
    };
    expect(() => validateActor(actor)).toThrow(/impersonator_id equals actor_id/);
  });
});
