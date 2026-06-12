// HS256 JWT mint + verify using crypto.subtle (Node 22+ WebCrypto, runs in
// edge runtimes too). Used for the impersonation JWT that PostgREST accepts
// via the Authorization header. No third-party JWT library — the format is
// simple enough that a hand-rolled implementation is auditable in 80 lines.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(input: string | Uint8Array): string {
  let str: string;
  if (typeof input === "string") {
    str = btoa(input);
  } else {
    let bin = "";
    for (let i = 0; i < input.length; i++) bin += String.fromCharCode(input[i]!);
    str = btoa(bin);
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlDecodeToString(input: string): string {
  return decoder.decode(base64UrlDecodeToBytes(input));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type Hs256Payload = Record<string, unknown> & {
  sub: string;
  exp: number; // unix seconds
  aud?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
};

export async function signHs256(
  payload: Hs256Payload,
  secret: string,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerEnc = base64UrlEncode(JSON.stringify(header));
  const payloadEnc = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerEnc}.${payloadEnc}`;

  const key = await importHmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)),
  );
  const sigEnc = base64UrlEncode(sig);
  return `${signingInput}.${sigEnc}`;
}

// Returns the payload on success, null on bad signature / expiry / malformed.
// Optional audValue gate: when supplied, the JWT's aud claim must match.
export async function verifyHs256(
  token: string,
  secret: string,
  opts: { aud?: string } = {},
): Promise<Hs256Payload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerEnc, payloadEnc, sigEnc] = parts;
  if (!headerEnc || !payloadEnc || !sigEnc) return null;

  const signingInput = `${headerEnc}.${payloadEnc}`;
  const key = await importHmacKey(secret);
  const sigBytes = base64UrlDecodeToBytes(sigEnc);

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    encoder.encode(signingInput),
  );
  if (!ok) return null;

  let payload: Hs256Payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadEnc)) as Hs256Payload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number") return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  if (opts.aud && payload.aud !== opts.aud) return null;

  return payload;
}
