# Brief: tables rollout, Faculty recapture with data (Neon hand-off, emergency mode), 2026-11-27

Follow-up to [brief-tables-faculty-2026-11-27.md](brief-tables-faculty-2026-11-27.md): same conversation,
worktree `C:\Users\decha\Desktop\Github\dentisys-tables-faculty`, branch
`lighthal9-responsive-tables-faculty`. Rules 1–5 of that brief still apply. Every question here is settled.

## Why

Claude compiled your shots into one review page for the Owner
(`audit-output/tables-faculty/review-before-after.html`, built by `build-review.mjs`). Five changed tables
have no proof on screen: in S.Y. 2026–2027 they have no rows, so Before and After are byte-identical empty
screens. The Owner asked for a recapture with data.

## Item T2-R: recapture the five empty views with S.Y. 2025–2026

- **Views:** Retention Monitoring (`/retention`) tabs Retention Status, Remedials, At-Risk Students (files
  `watchlist-*`, `remedials-*`, `midterm-*`); Email Management (`/email`) tabs Midterm advisory and Scheduled
  remedial notices (files `midterm_advisory-*`, `remedial-*`).
- **How:** the same `audit-output/tables-faculty/capture.mjs` flow, with the page's school-year filter set to
  **S.Y. 2025–2026** before each shot (pick a class with rows if "All classes" is still empty). Before shots
  from the base `f791ef59` code, After from the branch head, the same five devices (iPhone 393 light/dark,
  iPad 820 light, Desktop 1920 light/dark), same file names, overwriting the old empty shots in `before/` and
  `after/`. Capture only these five views; leave every other shot as it is.
- **Check each new pair:** rows visible on both sides, Before and After files differ, the phone shots show the
  new card on After. If a tab still has no rows in any school year, say so in the report and stop for that
  tab; never fake data.
- **Any defect the shots reveal** on these tabs (overflow, split codes, unreadable dark mode, a card that
  differs from Course Catalog's): fix it with width-scoped classes in the page file, rerun
  `node frontend/node_modules/typescript/bin/tsc -b frontend` and
  `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`, and commit as
  `fix(ui): Faculty <page> table <defect> (T2)` with `Test: none - visual fix, checked on the recaptured shots`
  and `Demo: none - offline HTML audit-output/tables-faculty/review-before-after.html`. No defect = no code
  change and no gate run.
- **Rebuild:** `node audit-output/tables-faculty/build-review.mjs`, then update its Retention and Email `gap`
  notes to say what the new shots show (school year used), and run
  `node audit-output/tables-faculty/check-review.mjs <absolute path of review-before-after.html> <scratch dir>`:
  no console errors, no broken images. Also rebuild your `retention.html` and `email.html`.
- **Report:** append a "T2-R" section to `docs/archive/report-tables-faculty-2026-11-27.md`: school year and
  class used per tab, which pairs now differ, any defect and its commit; commit it.
