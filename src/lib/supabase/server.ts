import { cookies } from "next/headers";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

import { verifyHs256 } from "@/lib/jwt/hs256";

// Server-side Supabase client. Reads the cb_impersonate cookie FIRST:
//   - If valid (signature, aud='impersonation', not expired) → return a
//     client whose Authorization header carries the impersonation JWT.
//     PostgREST validates the JWT against SUPABASE_JWT_SECRET, sets
//     auth.uid() to the JWT's sub (the impersonated user), and RLS evaluates
//     as that user.
//   - If invalid or expired → silently clear the cookie and fall through
//     to the normal SSR client path.
//
// The normal SSR path reads/writes the session cookie via the Next.js
// cookies() API; cookie domain comes from NEXT_PUBLIC_COOKIE_DOMAIN so the
// session is shared across the marketing + app subdomains in production.

export const IMPERSONATION_COOKIE = "cb_impersonate";

async function impersonationClient(jwt: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("impersonationClient: NEXT_PUBLIC_SUPABASE_* env missing");
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  // Impersonation path: check cb_impersonate first.
  const impJwt = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (impJwt) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret) {
      const verified = await verifyHs256(impJwt, secret, { aud: "impersonation" });
      if (verified) {
        return await impersonationClient(impJwt);
      }
      // Invalid / expired — clear the cookie so subsequent requests stop
      // trying. Cookies set inside server components may fail; that's fine
      // here (the cookie is at most stale, never wrong, because the JWT
      // signature didn't verify).
      try {
        cookieStore.set(IMPERSONATION_COOKIE, "", {
          path: "/",
          expires: new Date(0),
        });
      } catch {
        // ignore
      }
    }
  }

  // Normal SSR path.
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

// Reads + returns the decoded impersonation JWT payload, or null when no
// active impersonation. Used by the audit writer (to pull impersonator_id
// from claims) and the app layout (to render the red banner).
export async function getImpersonationClaims(): Promise<{
  sub: string;
  impersonatedBy: string;
  exp: number;
} | null> {
  const cookieStore = await cookies();
  const impJwt = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!impJwt) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  const verified = await verifyHs256(impJwt, secret, { aud: "impersonation" });
  if (!verified) return null;
  const impersonatedBy = (
    verified.app_metadata as { impersonated_by?: string } | undefined
  )?.impersonated_by;
  if (!impersonatedBy) return null;
  return {
    sub: verified.sub,
    impersonatedBy,
    exp: verified.exp,
  };
}
