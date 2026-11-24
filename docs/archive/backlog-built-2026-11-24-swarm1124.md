# Backlog items built 2026-11-24 (Gemini swarm, swarm1124)

Full backlog text of the items merged from `lighthal9-responsive-swarm1124`, as it read before they were built. Merge record: [swarm1124-merge-2026-11.md](swarm1124-merge-2026-11.md).

- **9.27** Breadcrumb navigation (Owner, 2026-11-20): every part of the trail above the page title takes you to that page, e.g. Home goes to the Dashboard. Owner ruling (2026-11-24): the page you are on is plain text, not a link (the Owhie merge made it a link to itself). Check every crumb for every role goes where its name says.
- **9.31** Grade Computation leaving the page (found 2026-11-24 in the real app; there before 14.10): after Faculty switch class in Grade Computation, a sidebar link click stays on `/grades`, and a "leave page?" (beforeunload) prompt appears when leaving. Bug routine: reproduce with a failing test first.
- **9.21** (part) Flaky mocked browser tests: `e2e/grade-release-gates.spec.ts:120`, `e2e/roster-import.spec.ts:58` and `:157` fixed; `e2e/dfd_verification.spec.ts:43` and `e2e/faculty.spec.ts:2754` stay open in the backlog.
