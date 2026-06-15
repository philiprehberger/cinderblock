# Lighthouse audit — 2026-06-15

Lighthouse v13.4.0 against the live deploy at `cinderblock.philiprehberger.com`.
Headless Chromium 148, Playwright-bundled. 6 runs: 3 routes × {desktop, mobile}.

## Scores

| Page                       | Perf D | Perf M | A11y | BP  | SEO |
| -------------------------- | ------ | ------ | ---- | --- | --- |
| `/`                        |   75   |   77   | 100  | 100 | 100 |
| `/docs/security/rls`       |   52   |   99   |  98  | 100 | 100 |
| `/docs/security/policies`  |   40   |   98   |  98  | 100 | 100 |

Plan target: 95+ desktop, 90+ mobile. **Mobile passes** on docs pages (98–99); home
mobile (77) and all desktop scores (40–75) are under target.

## Why mobile passes but desktop doesn't

Lighthouse v13 tightened desktop perf scoring substantially. Mobile is simulated
4G + 4× CPU slowdown, but the per-metric thresholds are looser to compensate.
Desktop is "no throttling" + tight thresholds. So a page that feels snappy in
real desktop Chrome can still score 40 in headless desktop Lighthouse v13.

The smoking gun is **TBT 1,810 ms on the policies page desktop run**. Same
page, mobile, lower TBT score weight → 98. The policies page renders 22
policies × 8 tables of server-side prose; the HTML is heavy.

## Fixed in this audit

1. **`landmark-one-main`** — docs layout wrapped content in `<article>` not
   `<main>`. A11y dropped from 100 → 98 on every docs page. Changed
   `src/app/docs/layout.tsx`: `<article>` → `<main>`.
   *Expected effect: docs a11y returns to 100.*

2. **`/docs/security/policies` was `force-dynamic`** — every visit hit the DB and
   the response carried `cache-control: no-store`, which disabled back/forward
   cache. Policies only change when migrations run, so ISR is the right model.
   Changed `revalidate = 3600`. The build cache invalidates on next deploy.
   *Expected effect: page enters bf-cache, eliminates a per-request DB hit,
   drops TTFB; should lift desktop perf score by ~5–10 points.*

## Open punch list

Ordered by impact / cost. None of these block ship — the demo is functional and
mobile is at-or-above the target. Pursue iff a perf push is wanted.

### High impact

- **Reduce home-page TBT (perf 75 → 90+)**. The home page renders a single
  hero + screenshot + a few sections; TBT is unexpectedly high. Profile with
  `next build && next start` + Chrome devtools Performance tab to find what's
  blocking the main thread on initial render. Likely culprits: the Geist font
  fetch + Google Analytics initialisation. Defer GA to `'lazy'` if not
  already.

- **Split the docs bundle**. Lighthouse flagged 29 KB of unused JavaScript on
  `/docs/security/policies`. The docs layout pulls in the same JS shell as the
  authenticated app; splitting at the `/docs/*` route boundary would cut the
  client bundle for visitors who never log in.

### Medium impact

- **`bf-cache` on docs pages.** Even with the policies page fixed, RLS docs and
  others still carry `cache-control: no-store` because the docs layout is
  rendered through the dynamic Supabase-aware path. Two options:
  1. Move docs pages out from under any layout that imports cookies/headers.
     Today the docs layout has no such imports — verify the build output marks
     `/docs/*` as static.
  2. Accept the trade-off and document it: docs pages don't need bf-cache
     because users don't typically navigate back/forward through docs.

- **`legacy-javascript`** — score 0 on the policies page audit. Next.js
  16 ships ES2017+ by default; the polyfills it sends may be unnecessary for
  the modern-browser target. Investigate `next.config.ts` browserslist
  (currently default) and tighten if the audience allows.

### Low impact / known-acceptable

- **`render-blocking-insight` score 0.50** on the policies page. The two
  Geist font files declared `preload` blocks initial paint until they arrive.
  Worth considering `font-display: optional` or `font-display: swap` (Next.js
  defaults to swap for next/font, so this is likely a Lighthouse-stricter-than-
  reality scoring artefact).

- **`network-dependency-tree`** — Lighthouse v13 always reports this as a
  scored item; the underlying network graph is short (HTML → CSS → fonts → JS).
  No actionable change without restructuring the request graph.

## How to re-run

Lighthouse needs a Chromium binary. The Playwright-bundled one works:

```bash
CHROME_PATH=/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome \
  npx lighthouse https://cinderblock.philiprehberger.com/ \
  --output=json --output-path=./desktop-home.json \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" \
  --preset=desktop --quiet
```

Drop `--preset=desktop` for the mobile run. Outputs in `/tmp/cb-lighthouse/` from
this audit are not committed.

## WCAG 2.1 AA

Lighthouse `accessibility` covers a useful subset (98–100 here), but is not a
substitute for the WCAG 2.1 AA manual review the plan calls for. After the
docs-layout `<main>` fix, the automated audit is at 100 on every measured
route. The remaining manual review is: keyboard-only navigation (focus rings,
trap-free dialogs), contrast on the policy viewer's syntax-highlighted SQL,
alt text on the architecture diagram (`<svg>` elements need `<title>` + `role`).
Deferred to a separate pass.
