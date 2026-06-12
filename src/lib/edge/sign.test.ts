import { describe, expect, it } from "vitest";
import { signEdgeRequest, freshNonce } from "./sign";

describe("signEdgeRequest", () => {
  const secret = "test-secret-32-characters-long-aaa";

  it("produces a 64-char hex signature", async () => {
    const sig = await signEdgeRequest("{}", "1700000000", "abcd1234abcd1234", secret);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different signatures for different bodies", async () => {
    const a = await signEdgeRequest('{"k":1}', "1700000000", "n", secret);
    const b = await signEdgeRequest('{"k":2}', "1700000000", "n", secret);
    expect(a).not.toEqual(b);
  });

  it("produces different signatures for different timestamps", async () => {
    const a = await signEdgeRequest("{}", "1700000000", "n", secret);
    const b = await signEdgeRequest("{}", "1700000001", "n", secret);
    expect(a).not.toEqual(b);
  });

  it("is deterministic across calls with the same inputs", async () => {
    const a = await signEdgeRequest("{}", "1700000000", "n", secret);
    const b = await signEdgeRequest("{}", "1700000000", "n", secret);
    expect(a).toEqual(b);
  });
});

describe("freshNonce", () => {
  it("returns 16 hex chars", () => {
    expect(freshNonce()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns a different value on each call", () => {
    const a = freshNonce();
    const b = freshNonce();
    expect(a).not.toEqual(b);
  });
});
