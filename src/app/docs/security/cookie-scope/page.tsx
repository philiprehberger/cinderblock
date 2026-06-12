export default function CookieScopeDocs() {
  return (
    <>
      <h1>Cookie scope</h1>

      <p>
        Cinderblock&apos;s default deployment serves marketing and the
        authenticated app from two subdomains:
      </p>
      <pre>
        <code>{`cinderblock.philiprehberger.com       # marketing + docs
app.cinderblock.philiprehberger.com   # authenticated app`}</code>
      </pre>

      <p>
        Both hostnames resolve to the same Next.js PM2 process; the
        middleware dispatches by <code>request.headers.host</code>. To
        share the session across both surfaces, the auth cookie is set
        with <code>Domain=.cinderblock.philiprehberger.com</code>.
      </p>

      <h2>The trade-off</h2>
      <p>
        A parent-domain cookie is readable by any subdomain of the apex.
        Cinderblock controls both subdomains and doesn&apos;t host
        arbitrary user content there, so the blast radius is bounded.
        But a fork that adds tenant-scoped subdomains
        (e.g. <code>acme.app.cinderblock.com</code>) must EITHER:
      </p>
      <ul>
        <li>Restrict tenant subdomains to first-party content only, OR</li>
        <li>
          Split the cookie scope — set the auth cookie on{" "}
          <code>app.cinderblock.philiprehberger.com</code> only (not the
          parent), and use a separate sign-in flow per host.
        </li>
      </ul>

      <h2>Configuration</h2>
      <p>
        The cookie domain reads from <code>NEXT_PUBLIC_COOKIE_DOMAIN</code>.
        Local dev leaves it unset — cookies scope to the request host
        (<code>localhost:3000</code>). Set it in production:
      </p>
      <pre>
        <code>{`NEXT_PUBLIC_COOKIE_DOMAIN=.cinderblock.philiprehberger.com`}</code>
      </pre>

      <p>
        See <code>/src/proxy.ts</code> + <code>/src/lib/supabase/server.ts</code>{" "}
        for the wiring.
      </p>
    </>
  );
}
