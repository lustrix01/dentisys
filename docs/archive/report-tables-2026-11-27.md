# Handoff Report: Table Style Pilot (T1) — 2026-11-27

## Repository State

- **Worktree:** `C:\Users\decha\Desktop\Github\dentisys-tables`
- **Branch:** `lighthal9-responsive-tables`
- **Base commit:** `adb8d637064e06a12b6fb2a440fdd9fda42cdd01` (`chore(workflow): Neon brief for the table style pilot; Owner rejected the first table proposal`)
- **Item commits:** None (no product code kept; `frontend/src/pages/admin/CourseCatalog.tsx` and `frontend/src/index.css` were restored to `HEAD` after saving patches, and only this report is committed on the branch).
- **Publish stamps (`.git/dentisys-pass/`):** Not written — per the brief, no product code is kept in this batch so `scripts/check.ps1` and `scripts/check-postgres.ps1` were not run.
- **File overlaps with peer branches:** None (parallel Claude work: none).

## Path Chosen

- **T1:** `one worker` — Single code-only item modifying 2 product files (`frontend/src/pages/admin/CourseCatalog.tsx` and `frontend/src/index.css`, <= 150 changed lines per option, no test edits, and no kept product changes). Coordinator authored Option A and Option B sequentially, ran both gates, exported both patches, restored both tracked files, inspected 6 key PNGs, authored the two Antigravity artifacts, and wrote this report. One read-only `/swarm` worker (`demo-capture`, `gemini-4-neon-low`) ran Playwright against a local Vite server (`127.0.0.1:15181`, proxying `/api` to `http://localhost:5173`) to capture and visually inspect all 15 real-app screenshots (`before`, `A`, `B`).

## Worker Models

- `demo-capture`: `gemini-4-neon-low` (read-only on tracked repo files; wrote only to `audit-output/tables-neon/` and copied final PNGs to the Antigravity artifact `screenshots/` folder; killed after completion).

## Artifacts & Patches

- **Stage 1 Options Demo artifact:** `C:\Users\decha\.gemini\antigravity-cli\brain\fd5390e0-1d94-4f67-b3e5-b45c3630c34f\stage-1-options-demo.md`
- **Design Review artifact:** `C:\Users\decha\.gemini\antigravity-cli\brain\fd5390e0-1d94-4f67-b3e5-b45c3630c34f\design-review.md` (`Verdict: pass` — 0 Blocker, 0 High for both options)
- **Screenshots directory (15 PNGs):** `C:\Users\decha\.gemini\antigravity-cli\brain\fd5390e0-1d94-4f67-b3e5-b45c3630c34f\screenshots\` (`before-*`, `A-*`, `B-*` for `desktop-1920-light`, `desktop-1920-dark`, `ipad-820-light`, `iphone-393-light`, `iphone-393-dark`)
- **Option A patch (Recommended):** `audit-output/tables-neon/A.patch` — shared CSS class `.data-table` in `frontend/src/index.css`; edits only `frontend/src/index.css` and `frontend/src/pages/admin/CourseCatalog.tsx`.
  - **What changes for the user (Option A):** Course Catalog gains a structured ledger table (shaded header, subtle zebra rows, lavender hover tint, monospace codes, right-aligned tabular numbers, `45 px` rows), fits all 7 columns including Actions on iPad 820 with zero wrapping or clipping, and switches iPhone 393 cards to a compact layout (`145.4 px`, `2.23` cards visible) with an inline Active/Retired chip, top-right boxed action buttons, and a 3-column Units strip above the Classes row.
- **Option B patch:** `audit-output/tables-neon/B.patch` — shared CSS class `.data-table-ruled` in `frontend/src/index.css`; edits only `frontend/src/index.css` and `frontend/src/pages/admin/CourseCatalog.tsx`.
  - **What changes for the user (Option B):** Course Catalog gains an editorial accent-ruled table (2 px purple top edge, soft lavender-tinted header, clean unstriped rows with vertical column dividers, 3 px left purple hover indicator, purple-ink codes, right-aligned tabular numbers, `49 px` rows), fits all 7 columns including Actions on iPad 820 with zero wrapping or clipping, and tightens iPhone 393 cards (`197.4 px`, `1.69` cards visible) with a 3 px purple left spine, top-right Active/Retired chip, shaded 2×2 metric well, and bottom-right boxed action buttons.

## Measured Results (Real App, `/superadmin/course-catalog`, 23 Active Courses)

| Viewport / Metric | Before | Option A (Recommended, `.data-table`) | Option B (`.data-table-ruled`) |
|---|---|---|---|
| Desktop 1920 (`1920×947`) page overflow | `1920 / 1920` (none) | `1920 / 1920` (none) | `1920 / 1920` (none) |
| Desktop 1920 row height / visible rows | `65 px` / `10` | `45 px` / `14` | `49 px` / `13` |
| iPad 820 (`820×1180`) table wrapper (`client / scroll`) | `698 / 781 px` (+83 px) | `698 / 698 px` (0 px) | `698 / 698 px` (0 px) |
| iPad 820 Actions visible | `false` (clipped) | `true` | `true` |
| iPad 820 wrapped course codes / Classes height | Hyphenated codes wrap / `31 px` | `0` wrapped / `15 px` | `0` wrapped / `15 px` |
| iPhone 393 (`393×852`, 2×) card height / visible cards | `253 px` / `1.31` | `145.4 px` / `2.23` (`3` in view) | `197.4 px` / `1.69` (`2` in view) |
| iPhone 393 status chip & boxed action buttons | Present | Present (`Active` pill + grey boxed buttons) | Present (`Active` pill + grey boxed buttons) |

## Gates & Checks Run

- **Option A (applied before capture):**
  - `node frontend/node_modules/typescript/bin/tsc -b frontend` — exit `0`
  - `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts frontend/src/tests/peopleAccountActions.test.ts frontend/src/tests/superadminPagesContract.test.ts` — exit `0` (`17/17` passed)
- **Option B (applied before capture):**
  - `node frontend/node_modules/typescript/bin/tsc -b frontend` — exit `0`
  - `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts frontend/src/tests/peopleAccountActions.test.ts frontend/src/tests/superadminPagesContract.test.ts` — exit `0` (`17/17` passed)
- **Post-restore patch verification:**
  - `git apply --check audit-output/tables-neon/A.patch` — exit `0`
  - `git apply --check audit-output/tables-neon/B.patch` — exit `0`
  - `frontend/src/pages/admin/CourseCatalog.tsx` and `frontend/src/index.css` restored cleanly with zero tracked diff.

## Known Gaps & Notes

- `.agents/app.json` named in the brief Setup was not present in this worktree; Playwright capture used the identical seeded dev Superadmin credentials from `audit/common.ts` (matching `.claude/skills/ui-fix-demo/references/dentisys.app.json`).
- No product code, `docs/frontend.md`, or other table pages were changed in this batch; rollout of the chosen standard and updating `docs/frontend.md` "Page patterns" wait for the Owner's selection.

## Doubts (not acted on)

None.
