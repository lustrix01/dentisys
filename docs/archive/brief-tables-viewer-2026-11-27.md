# Brief: tables, follow-up (Neon hand-off, emergency mode), 2026-11-27

Follow-up to [brief-tables-2026-11-27.md](brief-tables-2026-11-27.md), same conversation, same worktree and
branch. The Owner cannot view your Stage 1 Options Demo: the markdown carousel does not render outside
Antigravity. Every question here is settled.

## Item T1-view: one HTML page the Owner opens by double-clicking

- **Make** `audit-output/tables-neon/options-demo.html`: a single self-contained file. Embed every
  screenshot as a base64 data URI (JPEG, quality ~82, max 1600 px wide), with no external file, font,
  script or network request, so it opens offline in Chrome or Edge from File Explorer.
- **Content:** only the real screenshots you already captured in `audit-output/tables-neon/` (before, A,
  B). No hand-made imitation of DentiSys screens. Write a small script (e.g. `audit-output/tables-neon/build-html.mjs`,
  Node, no new dependencies) that reads the PNGs and writes the page, so it can be rebuilt.
- **Layout:**
  - Title, one line per option saying what changes for the user (from your report), "A is recommended".
  - A row of screen tabs: Desktop 1920 light, Desktop 1920 dark, iPad 820, iPhone 393 light, iPhone 393 dark.
  - For the chosen screen: Before | Option A | Option B side by side at the same width, each labelled, each
    image clickable to open full size in an overlay (Esc or click closes it).
  - Keys: ← → change screen; 1 / 2 / 3 open Before / A / B full size.
  - Plain readable styling, works at 1366 px and wider; no page-level sideways scroll.
- **Also** add a short note at the top of your Stage 1 Options Demo artifact pointing to the HTML file path.
- **Keep no product code**, as in the first brief.
- **Check:** open the page with Playwright (`file://` URL) at 1920 x 947, confirm no console errors, all 15
  images loaded (`naturalWidth > 0`), tabs and keys switch screens; save one screenshot of the page as
  `audit-output/tables-neon/options-demo-check.png` and open it yourself.
- **Report:** append a "T1-view" section to `docs/archive/report-tables-2026-11-27.md` with the HTML path,
  its size, and the check result; commit it on the batch branch.
