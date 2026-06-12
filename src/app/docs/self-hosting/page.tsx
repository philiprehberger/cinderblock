export default function SelfHostingDocs() {
  return (
    <>
      <h1>Self-hosting</h1>

      <p>
        Cinderblock targets Supabase Cloud by default. Self-hosting is
        possible but out of scope for the demo deployment — the
        Docker Compose / Kubernetes operational burden is genuinely
        different and would distract from the security pitch.
      </p>

      <h2>What changes</h2>
      <p>
        The migrations + policies + Edge Functions are portable. To swap
        Cloud for a self-hosted Supabase stack you change:
      </p>
      <ul>
        <li>
          <strong>Connection URLs.</strong> <code>NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          + <code>PG_AUDIT_WRITER_URL</code> + <code>PG_IMPERSONATOR_URL</code>{" "}
          point at your self-hosted endpoints.
        </li>
        <li>
          <strong>JWT secret.</strong> Same shape, different rotation
          mechanism (you manage GoTrue&apos;s signing key directly).
        </li>
        <li>
          <strong>pg_cron extension.</strong> Self-hosted Postgres ships
          pg_cron the same way; the schedule migrations apply unchanged.
        </li>
      </ul>

      <h2>What doesn&apos;t work out of the box</h2>
      <ul>
        <li>
          Supabase Branching. The CI &quot;ephemeral preview database per
          PR&quot; story doesn&apos;t apply — substitute with a
          test-database-per-branch convention or a single shared test
          stack.
        </li>
        <li>
          Supabase Management API. The <code>/status</code> page and
          quota-alert <code>pg_cron</code> job use the Management API
          — those become no-ops or you wire equivalent telemetry from
          your own observability stack.
        </li>
      </ul>

      <h2>Why we stayed on Cloud</h2>
      <p>
        The buyer pool for Cinderblock-style work is on Supabase Cloud.
        Showing a demo that runs on Cloud is faithful to what the prospect
        will receive. The self-hosted path is a fork-it-yourself swap, not
        a feature.
      </p>
    </>
  );
}
