// HMAC-SHA256 utilities for two distinct purposes:
//
//   signInternalRequest / verifyInternalRequest — gate every Edge Function
//   call on EDGE_INTERNAL_SECRET. The Next.js server signs each request;
//   the Edge Function verifies. CORS is the second layer; this is the first.
//   Uses request-body + timestamp + nonce so a leaked signature can't be
//   replayed beyond a 5-minute window.
//
//   signInvitationToken / verifyInvitationToken — INVITE_SIGNING_KEY-based
//   HMAC over the invitation payload. The token Cinderblock sends in the
//   email is `<base64-payload>.<hex-hmac>`; verifying re-derives the HMAC
//   and constant-time compares. The hash gets stored in
//   workspace_invitations.token_hash so even if the row is leaked the raw
//   token isn't recoverable.

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Constant-time equality on two same-length byte strings. Returns false for
// length mismatch immediately (timing leak on length is acceptable — a hash
// signature length is fixed).
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------- Internal request signing ----------

export async function signInternalRequest(
  body: string,
  timestamp: string,
  nonce: string,
  secret: string,
): Promise<string> {
  const key = await importKey(secret);
  const payload = `${timestamp}.${nonce}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(sig);
}

export async function verifyInternalRequest(
  request: Request,
  body: string,
  secret: string,
): Promise<boolean> {
  const signature = request.headers.get("x-cb-signature");
  const timestamp = request.headers.get("x-cb-timestamp");
  const nonce = request.headers.get("x-cb-nonce");
  if (!signature || !timestamp || !nonce) return false;

  // Reject replays older than 5 minutes.
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const expected = await signInternalRequest(body, timestamp, nonce, secret);
  return constantTimeEquals(signature, expected);
}

// ---------- Invitation token signing ----------

export type InvitationPayload = {
  workspace_id: string;
  email: string;
  role: "admin" | "member" | "guest";
  expires_at: string;  // ISO timestamp
  nonce: string;       // 16 random hex chars, prevents two tokens for the same payload colliding
};

export async function signInvitationToken(
  payload: InvitationPayload,
  signingKey: string,
): Promise<{ token: string; tokenHashHex: string }> {
  const key = await importKey(signingKey);
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const sigHex = toHex(sig);

  // The token format is `<base64url-payload>.<hex-hmac>`. The stored hash is
  // the SHA-256 of the full token — even if the workspace_invitations row
  // leaks, the raw token (and therefore the HMAC) can't be reconstructed.
  const tokenBase64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const token = `${tokenBase64}.${sigHex}`;

  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const tokenHashHex = toHex(hash);

  return { token, tokenHashHex };
}

export async function verifyInvitationToken(
  token: string,
  signingKey: string,
): Promise<InvitationPayload | null> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const tokenBase64 = token.slice(0, lastDot);
  const sigHex = token.slice(lastDot + 1);

  let payload: InvitationPayload;
  try {
    const base64 = tokenBase64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(tokenBase64.length / 4) * 4, "=");
    payload = JSON.parse(atob(base64)) as InvitationPayload;
  } catch {
    return null;
  }

  const key = await importKey(signingKey);
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const expected = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const expectedHex = toHex(expected);

  if (!constantTimeEquals(sigHex, expectedHex)) return null;

  if (new Date(payload.expires_at).getTime() < Date.now()) return null;

  return payload;
}

export async function hashToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(hash);
}

// Convert hex to bytea-compatible Uint8Array for postgres-js binding.
export function hexToBytea(hex: string): Uint8Array {
  return fromHex(hex);
}
