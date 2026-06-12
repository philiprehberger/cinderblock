import { describe, expect, it } from "vitest";
import { signHs256, verifyHs256 } from "./hs256";

const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

function future(seconds: number) {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe("signHs256 / verifyHs256", () => {
  it("round-trips a valid token", async () => {
    const payload = {
      sub: "00000000-0000-0000-0000-000000000001",
      exp: future(60),
      aud: "impersonation",
      role: "authenticated",
    };
    const token = await signHs256(payload, SECRET);
    const verified = await verifyHs256(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toEqual(payload.sub);
    expect(verified?.aud).toEqual("impersonation");
  });

  it("returns null on a bad signature", async () => {
    const token = await signHs256({ sub: "a", exp: future(60) }, SECRET);
    const tampered = token.slice(0, -2) + "AA";
    const verified = await verifyHs256(tampered, SECRET);
    expect(verified).toBeNull();
  });

  it("returns null on expired tokens", async () => {
    const token = await signHs256({ sub: "a", exp: future(-1) }, SECRET);
    const verified = await verifyHs256(token, SECRET);
    expect(verified).toBeNull();
  });

  it("returns null when verified with a different secret", async () => {
    const token = await signHs256({ sub: "a", exp: future(60) }, SECRET);
    const verified = await verifyHs256(token, "different-secret-32-characters-long");
    expect(verified).toBeNull();
  });

  it("returns null when the aud gate doesn't match", async () => {
    const token = await signHs256(
      { sub: "a", exp: future(60), aud: "authenticated" },
      SECRET,
    );
    const verified = await verifyHs256(token, SECRET, { aud: "impersonation" });
    expect(verified).toBeNull();
  });

  it("accepts a token whose aud matches the gate", async () => {
    const token = await signHs256(
      { sub: "a", exp: future(60), aud: "impersonation" },
      SECRET,
    );
    const verified = await verifyHs256(token, SECRET, { aud: "impersonation" });
    expect(verified?.aud).toEqual("impersonation");
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyHs256("not.a.jwt", SECRET)).toBeNull();
    expect(await verifyHs256("", SECRET)).toBeNull();
    expect(await verifyHs256("a.b", SECRET)).toBeNull();
  });
});
