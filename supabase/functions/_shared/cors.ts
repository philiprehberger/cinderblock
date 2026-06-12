// CORS handler scoped to EDGE_ALLOWED_ORIGINS. Edge Functions run under Deno
// on Supabase's edge runtime — env via Deno.env. The allow-list is a
// comma-separated env var so a forker can change it without code changes.

const RAW_ALLOWED = Deno.env.get("EDGE_ALLOWED_ORIGINS") ?? "";
const ALLOWED = new Set(
  RAW_ALLOWED.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED.has(origin)) {
    // No CORS headers — browser blocks the response. Server-side callers
    // (Next.js) don't care about CORS, but the EDGE_INTERNAL_SECRET HMAC is
    // the actual gate for those.
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cb-signature, x-cb-timestamp, x-cb-nonce",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function handlePreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
