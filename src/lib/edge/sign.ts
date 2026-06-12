// Pure HMAC helper, shared between server actions and Vitest tests. Uses
// Node's WebCrypto (Node 22+) so the same code runs in server-action contexts
// and in unit tests without a polyfill.

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
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

// Signs `${timestamp}.${nonce}.${body}` with EDGE_INTERNAL_SECRET. Edge
// Functions verify with the same construction.
export async function signEdgeRequest(
  body: string,
  timestamp: string,
  nonce: string,
  secret: string,
): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${nonce}.${body}`),
  );
  return toHex(sig);
}

export function freshNonce(): string {
  // 16 random hex chars. crypto.randomUUID is universally available; strip the
  // dashes and slice.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
