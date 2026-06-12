// Wraps the EDGE_INTERNAL_SECRET HMAC check so the per-function handler is
// concise. Reads the secret from Deno.env on each call rather than caching
// because Supabase Edge Functions can have envs rotated at runtime.
//
// Returns the request body string on success (the caller will JSON.parse it).
// Returns a Response on failure so the handler can `return await ...`.

import { verifyInternalRequest } from "./hmac.ts";

export async function verifyInternalCaller(
  request: Request,
): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  const secret = Deno.env.get("EDGE_INTERNAL_SECRET");
  if (!secret) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "edge_secret_unconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  const body = await request.text();
  const valid = await verifyInternalRequest(request, body, secret);
  if (!valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "invalid_signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return { ok: true, body };
}
