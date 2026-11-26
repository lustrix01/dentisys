# Brief: tables, Option B build (Neon hand-off, emergency mode), 2026-11-27

Follow-up to [brief-tables-2026-11-27.md](brief-tables-2026-11-27.md) and
[brief-tables-viewer-2026-11-27.md](brief-tables-viewer-2026-11-27.md): same conversation, worktree
`C:\Users\decha\Desktop\Github\dentisys-tables`, branch `lighthal9-responsive-tables`. Every question here is
settled. Rules 1–5 of the first brief still apply.

The Owner picked **Option B** (`audit-output/tables-neon/B.patch`, `.data-table-ruled`), in their words:
"Option B looks better, in a way that it's better for the users, option A might look minimalistic, but
it's going to be a hassle for the users to look at." This item makes B real on Course Catalog and writes
it down as the standard. Rolling it out to other tables is a later batch; do not touch other pages.

## Item T1-B: keep Option B on Course Catalog and make it the table standard

- **Apply** `audit-output/tables-neon/B.patch` exactly. No visible change beyond B except a fix for a defect
  the device sweep finds; such a fix uses width-scoped classes and keeps Desktop 1920 and iPhone 393
  pixel-identical to the B shots the Owner approved.
- **Device sweep:** every device in `audit/devices.json` (tier `core`: 320, 360, 375, 393, 480, 744, 820,
  1032, 1366, 1470, 1920), light, plus dark at 393 and 1920, on `/superadmin/course-catalog`, Active and
  Retired tabs. Check: no page sideways scroll, nothing escapes its card, no split codes or split labels,
  Actions visible or reachable, dark-mode contrast. Fix every defect found.
- **Standard:** in `docs/frontend.md` "Page patterns", replace "Not settled yet: table bodies. ..." with a
  "Table bodies" row naming the class(es) and exact class strings for the desktop table and for the phone
  card (spine, status chip, metric box, actions), with Course Catalog as the file to copy. Keep the
  "Table header cells" and "Pinned table columns" rows true; update them if B changed what they say.
- **Stage 2 Final Demo:** rebuild the offline HTML page as `audit-output/tables-neon/final-demo.html` with
  your `build-html.mjs` (Before | After, the core-tier devices plus dark 393 and 1920), checked the same way
  as before (no console errors, every image loaded, one check screenshot you open yourself).
- **Gates, once on the final tree:** `node frontend/node_modules/typescript/bin/tsc -b frontend`, the three
  focused tests from your first run, then `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`.
- **Commit** on the batch branch, one commit:
  `feat(ui): Course Catalog table and phone cards follow the new table standard (T1)` with a body line
  `Contract: docs/archive/brief-tables-b-2026-11-27.md` and
  `Demo: none - offline HTML audit-output/tables-neon/final-demo.html (Stage 2 Final Demo)`.
- **Report:** append a "T1-B" section to `docs/archive/report-tables-2026-11-27.md`: commit sha, devices
  checked with any defect and its fix, gate results, the final-demo path; commit it.
