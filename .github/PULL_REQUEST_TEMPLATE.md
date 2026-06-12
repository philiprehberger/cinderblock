## Summary

<!-- One or two sentences. What changed and why. -->

## Tests

<!-- What pgtap / vitest / Playwright tests cover this. If the change
touches a policy or helper, name the specific test file. -->

- [ ] pgtap suite (npx supabase test db) green
- [ ] vitest (npm test) green
- [ ] Lint + typecheck (npm run lint && npx tsc --noEmit) green
- [ ] If a policy or helper changed, the corresponding test was extended

## Checklist

- [ ] No AI attribution in commit messages or code
- [ ] Voice matches the existing prose (lead with diagnosis, concrete
  numbers, no emoji)
- [ ] If a new service-role caller was added, the firewall allow-list
  was updated with a one-line justification
- [ ] CHANGELOG.md updated if user-facing
