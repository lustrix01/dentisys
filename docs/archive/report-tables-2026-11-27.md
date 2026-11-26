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

## T1-view — Standalone Offline HTML Options Demo

- **Path chosen:** `direct` (1 gitignored generator script `audit-output/tables-neon/build-html.mjs`, 1 artifact note update, and this report section; no product code or tests changed; no swarm workers spawned).
- **HTML path:** `C:\Users\decha\Desktop\Github\dentisys-tables\audit-output\tables-neon\options-demo.html` (`audit-output/tables-neon/options-demo.html`)
- **Rebuild script:** `audit-output/tables-neon/build-html.mjs` (Node + existing `@playwright/test` canvas encoder; zero new dependencies; run `node audit-output/tables-neon/build-html.mjs` to rebuild or with `--check` to rebuild and verify).
- **File size:** `1,690,161` bytes (`1,650.5 KB` / `1.61 MiB`) — all 15 real screenshots embedded as base64 `image/jpeg` data URIs (quality `0.82`, max `1600 px` wide), zero external files/fonts/scripts/network requests.
- **Artifact updated:** Added a top note in `C:\Users\decha\.gemini\antigravity-cli\brain\fd5390e0-1d94-4f67-b3e5-b45c3630c34f\stage-1-options-demo.md` pointing to the HTML file path.
- **Playwright verification (`file://` URL via `node audit-output/tables-neon/build-html.mjs --check`):**
  - Console errors: `0`; page errors: `0`; external network requests: `0`.
  - Images: `15/15` loaded (`naturalWidth > 0`, `maxNaturalWidth = 1600`, all `data:image/jpeg;base64,`).
  - Layout overflow: `1920 / 1920` at `1920×947` and `1366 / 1366` at `1366×768` (no horizontal scroll).
  - Interactions: clicking `iPad 820` tab switched to `ipad-820-light`; `ArrowRight` switched to `iphone-393-light`; `ArrowLeft` returned to `ipad-820-light`; `2` opened Option A full-size overlay; `3` switched overlay to Option B; `Escape` closed overlay.
  - Visual check screenshot: `audit-output/tables-neon/options-demo-check.png` (inspected directly via `read_file`; layout, tabs, keyboard hints, and side-by-side Before | Option A | Option B cards verified clean).
- **Tracked product files:** Unchanged (`git status` shows only `docs/archive/report-tables-2026-11-27.md`).

## T1-B — Option B Adopted on Course Catalog & Table Standard

- **Path chosen:** `one worker` — Single item modifying 3 tracked files (`frontend/src/index.css`, `frontend/src/pages/admin/CourseCatalog.tsx`, `docs/frontend.md`) with <= 150 changed lines and no test edits, plus a 13-screen Before/After device sweep across all `core`-tier devices in `audit/devices.json` (Active and Retired tabs). Coordinator applied `B.patch`, fixed the one sweep defect, documented the standard in `docs/frontend.md`, built and verified `final-demo.html`, ran all gates, and committed. One read-only `/swarm` worker (`device-sweep`, `gemini-4-neon-low`, killed after completion) captured and visually verified all 26 PNGs and ran the Active + Retired sweep metrics.
- **Feature commit:** `f635297` — `feat(ui): Course Catalog table and phone cards follow the new table standard (T1)` (tree `9413e47bdec8`, matching `.git/dentisys-pass/` `.check` stamp).
- **Files changed in `f635297`:**
  - `frontend/src/index.css` — added shared `.data-table-ruled` table standard class (2 px purple top rule, soft lavender header with 2 px bottom border, unstriped rows with hairline dividers, 3 px left purple hover indicator, opaque sticky header and `[data-pinned-x]` pinned first column in light & dark mode).
  - `frontend/src/pages/admin/CourseCatalog.tsx` — applied `audit-output/tables-neon/B.patch` exactly, plus one width-scoped fix below.
  - `docs/frontend.md` — replaced "Not settled yet: table bodies." in "Page patterns" with the new `"Table bodies"` row (exact classes for desktop/tablet table `.data-table-ruled` and phone card spine/status chip/metric box/actions, copying `pages/admin/CourseCatalog.tsx`) and kept `"Table header cells"` and `"Pinned table columns"` accurate.
- **Core device sweep (11 `core`-tier devices from `audit/devices.json` light + dark at 393 & 1920 = 13 screens, Active & Retired tabs):**
  - **Defect found (1 screen):** `iPad Pro 13 1032` (`1032×1302`, open 256 px sidebar leaves `702 px` for `tableWrapper`): `B.patch`'s `lg:` (`>= 1024 px`) wide padding and `lg:whitespace-nowrap` expanded `tableWrapper.scrollWidth` to `859 px` (`+157 px`), clipping `Classes` and pushing `Actions` off-screen (`actionsVisible: false`).
  - **Fix applied:** Changed the wide-table cell expansion breakpoint on `CourseCatalog.tsx` `<th>`/`<td>` from `lg:` (`1024 px`) to `xl:` (`1280 px`). Re-verified on all 13 screens: `iPad Pro 13 1032` now fits `702/702 px` (`horizontalScroll: false`, `actionsVisible: true`, `0` wrapped codes/Classes, `17` rows visible); Desktop 1920 (`>= 1280 px`) and iPhone 393 (`< 640 px`) are pixel-identical to the Owner-approved Option B shots.
  - **Devices checked (all 13 passed with 0 defects on Active & Retired tabs):**
    - `Desktop 1920` (`1920×947`, light & dark): `1278/1278`, `49 px` rows (`13` visible), `actionsVisible: true`, crisp dark contrast.
    - `MacBook Air 13 1470` (`1470×832`, light): `1116/1116`, `49 px` rows (`11` visible), `actionsVisible: true`.
    - `Laptop 1366` (`1366×633`, light): `1012/1012`, `49 px` rows (`6` visible), `actionsVisible: true`.
    - `iPad Pro 13 1032` (`1032×1302`, light): `702/702`, `0` wrapped codes/Classes, `actionsVisible: true`, `17` rows visible (fixed from `702/859`).
    - `iPad 820` (`820×1106`, light): `698/698`, `0` wrapped codes/Classes, `actionsVisible: true`, `13` rows visible.
    - `iPad mini 744` (`744×1058`, light): `702/702`, `0` wrapped codes/Classes, `actionsVisible: true`, `12` rows visible.
    - `Android 480` (`480×1040`, light): `197.4 px` cards (`2.59` visible), `0` escapes/splits.
    - `iPhone 393` (`393×852`, light & dark): `197.4 px` cards (`1.69` visible), `0` escapes/splits, crisp dark contrast.
    - `iPhone mini 375` (`375×629`, light): `197.4 px` cards (`0.41` visible), `0` escapes/splits.
    - `Budget Android 360` (`360×640`, light): `197.4 px` cards (`0.47` visible), `0` escapes/splits.
    - `Small Android 320` (`320×658`, light): `197.4 px` cards (`0.56` visible), `0` escapes/splits.
    - Retired tab: `retiredPageOverflow: false`, `retiredCardEscape: []`, `retiredEmptyOrRowsVisible: true` (`Nothing is retired`) on all 13 screens.
- **Stage 2 Final Demo:**
  - **HTML path:** `C:\Users\decha\Desktop\Github\dentisys-tables\audit-output\tables-neon\final-demo.html` (`audit-output/tables-neon/final-demo.html`, `3,513,510` bytes / `3.35 MiB`), rebuilt with `node audit-output/tables-neon/build-html.mjs --final --check`.
  - **Verification (`file://` URL):** `26/26` embedded JPEG data URIs loaded (`maxNaturalWidth = 1600`), `0` console/page errors, `0` external network requests, `0` horizontal overflow at `1920×947` and `1366×768`, tabs + `←`/`→` + `1`/`2` + `Esc` passed; visual check screenshot `audit-output/tables-neon/final-demo-check.png` inspected via `read_file`.
- **Gates run once on the final tree (`9413e47bdec8`):**
  - `node frontend/node_modules/typescript/bin/tsc -b frontend` — exit `0`.
  - `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts frontend/src/tests/peopleAccountActions.test.ts frontend/src/tests/superadminPagesContract.test.ts` — exit `0` (`17/17` passed).
  - `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` — exit `0` (`390` frontend unit tests, `4` git hook tests, PHP lint, all backend tests, doc contract test, `381` mocked Playwright E2E tests passed; `.check` stamp recorded for tree `9413e47bdec8`).
  - `scripts/check-postgres.ps1` not run (frontend CSS/JSX and docs only; no backend/database/sidecar/Docker/`e2e/live` changes).


