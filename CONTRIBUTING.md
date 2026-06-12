# Contributing to Cinderblock

Cinderblock is a portfolio demonstration. External contributions are
welcome but evaluated against the project's voice and the security
contract the test suite encodes.

## Local setup

```bash
git clone https://github.com/philiprehberger/cinderblock.git
cd cinderblock
npm install
npx supabase start                # 10-15 min cold, ~45s warm
./scripts/setup-roles.sh          # generates cb_audit_writer + cb_impersonator passwords
npx supabase test db              # 74 tests should pass
npm run dev
```

## What CI checks

Every push and PR:

- `npx tsc --noEmit` — strict TypeScript
- `npm run lint` — ESLint via `eslint-config-next`
- `npm test` — Vitest (unit + firewall scan)
- `npx supabase test db` — the full pgtap suite (74 tests)
- `npx playwright test e2e/public-routes.spec.ts` — public-routes smoke

The cross-tenant Playwright suite runs locally only — it needs a full
Supabase stack with the hostile fixture seeded.

## Adding a new policy or migration

If you change a policy, you must extend the tests. The hostile fixture in
`supabase/tests/01_fixture.sql` is structured around a deliberate
membership matrix; new tests follow this shape:

```sql
select tests.authenticate_as('<uuid>');
select results_eq(
  $$ select count(*)::int from public.<table> where <attack> $$,
  array[0],
  '<clear description>'
);
select tests.reset_auth();
```

PRs that change a policy without adding the corresponding test will be
held until the test lands.

## Adding a new service-role caller

`tests/firewall/service-role-firewall.test.ts` scans `src/` for any
import of the service-role client. New callers must:

1. Add their file path to the allow-list at the top of the test file.
2. Include a one-line justification comment naming the policy that's
   closed (e.g. `// workspace_invitations.UPDATE is closed at the
   policy layer`).

## Style

Voice across the codebase + docs:

- Lead with diagnosis, not pitch. Name what's actually wrong or unknown
  before describing what you'd do.
- Concrete numbers over adjectives — "74 tests", "60-minute TTL", "5
  minute warm cache" — not "comprehensive" or "robust."
- No emoji, no exclamation points, no AI attribution in commits or code.
- Match the surrounding tone exactly when editing existing prose.

## Reporting issues

Open a GitHub issue using one of the templates in `.github/ISSUE_TEMPLATE/`.
Security issues: please don't open public issues; email the maintainer
listed on `/about`.
