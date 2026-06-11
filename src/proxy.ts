import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase session cookie on every server-side request. Without
// this, the session expires silently and reads after the refresh window fail
// in confusing ways. The cookie domain comes from NEXT_PUBLIC_COOKIE_DOMAIN
// so the same session covers `cinderblock.philiprehberger.com` and
// `app.cinderblock.philiprehberger.com` in production.
//
// See https://supabase.com/docs/guides/auth/server-side/nextjs for the
// canonical pattern.

// Next.js 16 renamed `middleware` → `proxy`; the file lives at /src/proxy.ts
// and the function export uses the new name.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

  if (!url || !key) {
    // Env not configured — let the request through; pages that need a session
    // will fail loudly when they try to read it.
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, {
            ...options,
            domain: cookieDomain || options.domain,
            sameSite: "lax",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
          });
        }
      },
    },
  });

  // getUser refreshes the access token if needed and updates the cookie via
  // the setAll callback above. This is the canonical Supabase pattern.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets + Next internals to avoid running middleware on
    // every image / font / chunk request.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
