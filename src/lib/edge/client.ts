import "server-only";

import { signEdgeRequest, freshNonce } from "./sign";

// Server-side caller for Cinderblock's Edge Functions. Signs every request
// with EDGE_INTERNAL_SECRET so functions can reject anything not from the
// trusted Next.js server even if CORS is misconfigured.

export type EdgeError = { error: string; status: number; detail?: unknown };

export async function callEdgeFunction<TResponse>(
  name: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.EDGE_INTERNAL_SECRET;
  if (!supabaseUrl || !secret) {
    throw new Error(
      "callEdgeFunction: NEXT_PUBLIC_SUPABASE_URL or EDGE_INTERNAL_SECRET unset",
    );
  }

  const url = `${supabaseUrl}/functions/v1/${name}`;
  const bodyString = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = freshNonce();
  const signature = await signEdgeRequest(bodyString, timestamp, nonce, secret);

  // Supabase Edge Functions also require the anon key in the Authorization
  // header for the function runtime to accept the request — even when the
  // function itself bypasses that check via the EDGE_INTERNAL_SECRET HMAC.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("callEdgeFunction: NEXT_PUBLIC_SUPABASE_ANON_KEY unset");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
      "apikey": anonKey,
      "x-cb-signature": signature,
      "x-cb-timestamp": timestamp,
      "x-cb-nonce": nonce,
    },
    body: bodyString,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`callEdgeFunction ${name}: non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const error: EdgeError = {
      error: (parsed as { error?: string })?.error ?? "edge_error",
      status: res.status,
      detail: parsed,
    };
    throw error;
  }

  return parsed as TResponse;
}
