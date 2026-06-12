import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Magic-link callback. Supabase's GoTrue redirects here after the user clicks
// the email link; we exchange the code for a session and bounce to /app.
//
// The `next` param lets the original sign-in flow redirect somewhere specific
// after auth (e.g. an invitation accept link). Defaults to /app.
//
// Redirects are anchored to NEXT_PUBLIC_SITE_URL — not request.url — because
// behind the Apache reverse proxy `request.url` resolves to the standalone
// server's bind address (0.0.0.0:3015) instead of the public hostname.
// Apache sets X-Forwarded-Host but Next.js doesn't trust it by default.

function publicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv;
  // Fall back to the X-Forwarded-Host / Host header when the env isn't set
  // (e.g. local dev). Last resort is request.url.
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";
  const origin = publicOrigin(request);

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=missing_code", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(error.message)}`, origin),
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
