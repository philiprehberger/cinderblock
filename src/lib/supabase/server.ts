import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Server-side anon-key client. Reads/writes the session cookie via the Next.js
// cookies() API; PostgREST validates the JWT from that cookie on every call,
// so RLS evaluates as the signed-in user.
//
// The cookie domain is read from NEXT_PUBLIC_COOKIE_DOMAIN to support the
// parent-domain pattern (`.cinderblock.philiprehberger.com`) that lets the
// marketing and app subdomains share the session. In dev the env var is
// unset and cookies scope to the request host.
export async function createClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...options,
              domain: cookieDomain || options.domain,
              sameSite: "lax",
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
            });
          }
        } catch {
          // setAll throws when called from a Server Component. The middleware
          // refreshes the session cookie, so Server Components only need to
          // read — silently swallow rather than fail the render.
        }
      },
    },
  });
}
