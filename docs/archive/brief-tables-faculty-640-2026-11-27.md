# Brief: Faculty tables at 640 px, preview for the Owner (Neon hand-off, emergency mode), 2026-11-27

Follow-up to [brief-tables-faculty-2026-11-27.md](brief-tables-faculty-2026-11-27.md) and the recapture brief:
same conversation, worktree `C:\Users\decha\Desktop\Github\dentisys-tables-faculty`, branch
`lighthal9-responsive-tables-faculty`. Rules 1–5 still apply. Every question here is settled.

## Owner's ruling (2026-11-27, words)

"Table form is always better ... the tables allow easier navigation, also allows proper sorting, sure the
cards look nicer, but it will be bothersome for the user to scroll down and find a person, we will always
resort to tables unless it's really necessary to turn it into cards." And: "If the table would not be able
to fit within the dimensions of the screen, it is possible to allow scrolling horizontally to view other
columns that are not within the screen."

The Owner has NOT approved the `spec.md` change yet and wants to see it first. So this item keeps **no
product commit**: it is a preview, like the T1 options.

## Item T2-640: preview Faculty tables switching at 640 px

- **Change (as a patch only):** start from the branch head. Apply `audit-output/tables-faculty/bp640.patch`;
  it no longer applies cleanly to `RetentionMonitoring.tsx` after `9ee81213`, so port its Retention part by
  hand (only the table/card switch classes `md:` → `sm:` and `useIsPhone` `(max-width: 639px)`). Then, from
  640 px up, every changed Faculty table that does not fit its card scrolls **sideways inside its own box**
  (the standard `table-pin table-pin-first` wrapper; first column pinned, header on top): keep each table's
  `min-w-*` so columns are never squeezed, merged or dropped. Below 640 px the cards stay as they are.
  Save the result as `audit-output/tables-faculty/t640.patch` (`git diff` of product files), then restore
  the files so the branch keeps no product change from this item.
- **Capture (After = the patch applied, Before = the branch head, 768 build):** every changed Faculty view
  (the 15 in `build-review.mjs`), with rows (S.Y. 2025–2026 where the current year is empty), at **744x1133
  light, 700x1000 light, 640x900 light** and **iPhone 393 light** (unchanged cards, as a check). Save to
  `audit-output/tables-faculty/t640/<page>/<view>-<w>.png` and `t768/<page>/<view>-<w>.png`. On each 640+
  shot, record whether the table scrolls sideways (`scrollWidth > clientWidth` of the wrapper), that the
  page itself does not scroll sideways, and that the pinned first column and header stay opaque.
- **Gates with the patch applied:** `node frontend/node_modules/typescript/bin/tsc -b frontend` and
  `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` (an e2e test that asserts the 768 switch
  may fail; list each failing test and what it asserts, do not change tests). Restore afterwards.
- **Review page:** add a section to `audit-output/tables-faculty/build-review.mjs` named
  "Ruling preview: tables from 640 px" (after the Breakpoint section): per view, 768 build vs 640 build side
  by side at 744, 700 and 640, with a one-line note per view ("table scrolls sideways: yes/no"). Rebuild and
  run `check-review.mjs` (no console errors, no broken images).
- **Report:** append a "T2-640" section to `docs/archive/report-tables-faculty-2026-11-27.md`: patch path,
  per-view scroll results, gate results with failing tests listed, and anything that looked wrong; commit
  only the report.
