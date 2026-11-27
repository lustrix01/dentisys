# Handoff Report: Faculty Tables Rollout (T2) — 2026-11-27

## Repository State

- **Worktree:** `C:\Users\decha\Desktop\Github\dentisys-tables-faculty`
- **Branch:** `lighthal9-responsive-tables-faculty`
- **Base commit:** `f791ef59bd974bf1ccf123d69b61d25e463dd367` (`chore(workflow): table standard rulings and the Neon follow-up briefs (viewer, Option B)`)
- **Feature commits (oldest to newest):**
  1. `2c9f8978` — `feat(ui): add clinical table standard modifier for Faculty pages (T2)` (`frontend/src/index.css`, `docs/frontend.md`)
  2. `7b73ed41` — `feat(ui): Faculty Classes and Rosters tables follow the table standard (T2)` (`frontend/src/pages/faculty/ClassesAndRosters.tsx`)
  3. `2a88415e` — `feat(ui): Faculty Attendance Monitoring tables follow the table standard (T2)` (`frontend/src/pages/faculty/AttendanceMonitoring.tsx`, `frontend/src/tests/attendanceStickyList.test.ts`)
  4. `d76c6c92` — `feat(ui): Faculty Retention Monitoring tables follow the table standard (T2)` (`frontend/src/pages/faculty/RetentionMonitoring.tsx`)
  5. `f9e6bb04` — `feat(ui): Faculty Email Management tables follow the table standard (T2)` (`frontend/src/pages/faculty/EmailManagement.tsx`)
  6. `ba55eb16` — `feat(ui): Faculty Reports tables follow the table standard (T2)` (`frontend/src/pages/faculty/Reports.tsx`)
  7. `c1b25c9a` — `feat(ui): Faculty Grade Computation tables follow the table standard (T2)` (`frontend/src/pages/faculty/GradeComputation.tsx`)
  8. `0491d4ef` — `fix(ui): mount single responsive branch on Faculty tables for strict-mode E2E (T2)` (`frontend/src/hooks/useIsPhone.ts`, `AttendanceMonitoring.tsx`, `ClassesAndRosters.tsx`, `EmailManagement.tsx`, `GradeComputation.tsx`, `RetentionMonitoring.tsx`, `e2e/faculty.spec.ts`)
- **Verified feature tree:** `aee36f002dd9a8d7762eb21ddce77995d686f30b` (`0491d4ef`) — `.git/dentisys-pass/aee36f002dd9a8d7762eb21ddce77995d686f30b.check` written by `scripts/check.ps1`.
- **Report commit:** follows `0491d4ef` on `lighthal9-responsive-tables-faculty`.
- **File overlaps with peer branches:** None (parallel Claude work: none).

## Path Chosen

- **T2:** `swarm` — Modifies 6 independent Faculty page files (>150 lines each across `.data-table-ruled .data-table-ruled-clinical` desktop tables and `< 768 px` clinical-spine `<article>` phone cards), updates 2 test files (`frontend/src/tests/attendanceStickyList.test.ts` and `e2e/faculty.spec.ts:882-901`, isolated to separate test workers per `.agents/rules/dentisys-neon.md`), adds `.data-table-ruled-clinical` in `frontend/src/index.css` and documents it in `docs/frontend.md` (coordinator-owned), and runs 13-screen `core`-tier Playwright sweeps, Before/After captures, 768-vs-640 (`bp640.patch`) captures, and offline HTML demo builds across all 6 active Faculty pages.

## Worker Models

- `faculty-classes`: `gemini-4-neon-low` (`frontend/src/pages/faculty/ClassesAndRosters.tsx`; share worktree; killed after landing)
- `faculty-attendance`: `gemini-4-neon-low` (`frontend/src/pages/faculty/AttendanceMonitoring.tsx`; share worktree; killed after landing)
- `faculty-retention`: `gemini-4-neon-medium` (`frontend/src/pages/faculty/RetentionMonitoring.tsx`; share worktree; killed after landing)
- `faculty-email`: `gemini-4-neon-medium` (`frontend/src/pages/faculty/EmailManagement.tsx`; share worktree; killed after landing)
- `faculty-reports`: `gemini-4-neon-low` (`frontend/src/pages/faculty/Reports.tsx`; share worktree; killed after landing)
- `faculty-grades`: `gemini-4-neon-medium` (`frontend/src/pages/faculty/GradeComputation.tsx`; share worktree; killed after landing)
- `faculty-tests`: `gemini-4-neon-low` (`frontend/src/tests/attendanceStickyList.test.ts`; share worktree; killed after landing)
- `fix-e2e-retention`: `gemini-4-neon-low` (`e2e/faculty.spec.ts:882-901`; inherit; killed after landing)
- `demo-sweep`: `gemini-4-neon-low` (read-only on tracked repo files; wrote only inside `audit-output/tables-faculty/`; killed after completion)

## Complete Table Inventory (22 `<table>` Elements in `frontend/src/pages/faculty/`)

| # | File (baseline line) | Table | Status | Reason / Notes |
|---|---|---|---|---|
| 1 | `AttendanceMonitoring.tsx:1786` | Class Roll Call worksheet | **Changed** | `.data-table-ruled .data-table-ruled-clinical` + clinical-spine `<article>` cards (`< 768 px`, `useIsPhone()`). |
| 2 | `ClassAttendanceActivity.tsx:56` | Class Attendance Activity | **Exempt** | Unrouted (not imported or mounted on any route in `frontend/src/`). |
| 3 | `ClassesAndRosters.tsx:1695` | Official List of Enrolled Students | **Exempt** | Print/PDF-only (`print-only print-area`). |
| 4 | `ClassesAndRosters.tsx:2050` | Student Roster | **Changed** | `.data-table-ruled .data-table-ruled-clinical`, unbroken clinical codes (no tinted chip behind section code), boxed `MoreVertical` button + single `createPortal` menu, clinical-spine phone cards (`< 768 px`). |
| 5 | `EmailManagement.tsx:784` | Tab 1: Student Class Roster Invitations | **Changed** | `.data-table-ruled .data-table-ruled-clinical` + clinical-spine phone cards with Select All and row checkboxes preserved. |
| 6 | `EmailManagement.tsx:919` | Tab 2: Class Secretary Appointment Invitations | **Changed** | `.data-table-ruled .data-table-ruled-clinical` + clinical-spine phone cards with row checkboxes and inline `Remove` action. |
| 7 | `EmailManagement.tsx:1103` | Tab 3: Midterm Advisory | **Changed** | `.data-table-ruled .data-table-ruled-clinical`, right-aligned tabular grades/GWA + clinical-spine phone cards. |
| 8 | `EmailManagement.tsx:1164` | Tab 4: Scheduled Remedial Notices | **Changed** | `.data-table-ruled .data-table-ruled-clinical` + clinical-spine phone cards preserving inline date editor (`Edit date` / `Add date` / `Save date` / `Cancel`). |
| 9 | `GradeComputation.tsx:222` | Comprehensive Grade Sheet (`.grade-sheet-table`) | **Exempt** | Print/PDF-only (`print-only`). |
| 10 | `GradeComputation.tsx:4132` | Tab 2: Assessments Manager | **Changed** | `.data-table-ruled .data-table-ruled-clinical` inside `p-3 sm:p-4`, right-aligned `Max Score`, boxed Edit/Archive/Delete icon buttons, clinical-spine phone cards (`< 768 px`). |
| 11 | `GradeComputation.tsx:4367` | Tab 3: First-Save Unmapped Assessment Alert (422) | **Exempt** | Conditional HTTP 422 error-banner sub-table with `<select>` inputs per row (per settled Answer 4). |
| 12 | `GradeComputation.tsx:4424` | Tab 3: Conversion Mapping Error Alert (422) | **Exempt** | Conditional HTTP 422 error-banner sub-table (per settled Answer 4). |
| 13 | `GradeComputation.tsx:5504` | Tab 4: Comprehensive Grade Sheet / Grade Summaries | **Changed** | `.data-table-ruled .data-table-ruled-clinical` inside `p-3 sm:p-4`, right-aligned tabular percentages/grades, dark-mode Remarks contrast, desktop `<thead>` kept visible on empty roster, clinical-spine phone cards (`< 768 px`). |
| 14 | `GradeComputation.tsx:5808` | Class Grade Ledger Report | **Exempt** | Print/PDF-only (`print-only`). |
| 15 | `Reports.tsx:1038` | Tab 1: Grades & Assessment Summary | **Changed** | `.data-table-ruled .data-table-ruled-clinical` inside `p-3 sm:p-4`, replaced old mobile `<ul>` with clinical-spine `<article>` cards, added dark-mode contrast classes to `renderRemark`. |
| 16 | `Reports.tsx:1139` | Tab 2: Retention Status Reports | **Changed** | `.data-table-ruled .data-table-ruled-clinical` inside `p-3 sm:p-4`, right-aligned tabular `Standing Grade` and `Courses in Remedial`, clinical-spine phone cards. |
| 17 | `Reports.tsx:1283` | Tab 3: Authoritative Attendance Register | **Changed** | `.data-table-ruled .data-table-ruled-clinical` inside `p-3 sm:p-4`, added clinical-spine phone cards (`< 768 px`), dark-mode status pill contrast. |
| 18 | `Reports.tsx:1452` | Class Grade Ledger Report (Academic Summary print) | **Exempt** | Print/PDF-only (`print-only`). |
| 19 | `Reports.tsx:1533` | Official Academic & Evaluations Report | **Exempt** | Print/PDF-only (`print-only`). |
| 20 | `RetentionMonitoring.tsx:1108` | Tab 1: At-Risk Students (Midterm Watchlist) | **Changed** | `.data-table-ruled .data-table-ruled-clinical` + clinical-spine phone cards (`< 768 px`). |
| 21 | `RetentionMonitoring.tsx:1207` | Tab 2: Retention Status | **Changed** | `.data-table-ruled .data-table-ruled-clinical`, right-aligned tabular `Course Grade`, clickable policy progression status button + clinical-spine phone cards. |
| 22 | `RetentionMonitoring.tsx:1263` | Tab 3: Remedial Progression | **Changed** | `.data-table-ruled .data-table-ruled-clinical`, dropped `table-fixed`/`min-w-[1080px]`, right-aligned `Original Grade` & `Attempts`, 2026-11-19 wrapping status pill on phones, clinical-spine phone cards. |

- **Shared component out of T2 scope:** `frontend/src/components/email/EmailHistoryTable.tsx` (rendered on Email Management Tab 5) left untouched — shared, for the Admin rollout.
- **Course Catalog:** `frontend/src/pages/admin/CourseCatalog.tsx` and base `.data-table-ruled` purple styles left completely untouched.

## Summary of Shared Standard & Test Updates

- **`frontend/src/index.css` (`2c9f8978`):** Added `.data-table-ruled-clinical` modifier paired with `.data-table-ruled` (top rule and header bottom rule `#43A047` light / `#5fc471` dark, hover bar matching, header tint `#f1faf2` light / `#122217` dark).
- **`docs/frontend.md` (`2c9f8978`):** Documented the role-colour modifier in the "Table bodies" row of "Page patterns" (`Faculty = .data-table-ruled-clinical`, clinical phone spine and code classes).
- **`frontend/src/hooks/useIsPhone.ts` (`0491d4ef`):** Added minimal 17-line `matchMedia('(max-width: 767px)')` hook so desktop and phone layouts mount only the active viewport branch (preventing Playwright strict-mode duplicate matches on hidden DOM twins while preserving identical visual output at every width).
- **`frontend/src/tests/attendanceStickyList.test.ts` (`2a88415e`):** Updated ONLY the `AttendanceMonitoring.tsx` assertion to check `table-pin table-pin-first data-table-ruled data-table-ruled-clinical` and standard small-capitals `<thead>`, leaving `secretary/AttendanceList.tsx` assertions unchanged.
- **`e2e/faculty.spec.ts:882-901` (`0491d4ef`):** Updated `retention status rows become stacked cards on phones and a table again on desktop` from old `max-md:block` (`<tr>`/`div.table-pin`) locators to the new standard `<article>` phone card assertions (keeping every behavioral assertion at full strength: phone card visibility, hidden `Course Grade` columnheader, `Phone Candidate`, `2026-0042`, `Course Grade`, `Schedule remedial exam`, zero document and card overflow at `375×812`, and visible `Course Grade` columnheader at `1280×900`).

## Device Sweep, Defects Found & Fixes

- **Devices checked (all 13 `core`-tier screens + breakpoint widths, `CLINIC-4A`, S.Y. 2026–2027):**
  - Phones (`< 768 px`, clinical-spine `<article>` cards): `Small Android 320` (320×658), `Budget Android 360` (360×640), `iPhone mini 375` (375×629), `iPhone 393` light & dark (393×852), `Android 480` (480×1040), `iPad mini 744` (744×1058), plus `744×1133` and `700×1000` light for the 768-vs-640 comparison.
  - Tablets & Desktops (`>= 768 px`, `.data-table-ruled .data-table-ruled-clinical` table): `iPad 820` (820×1106), `iPad Pro 13 1032` (1032×1302), `Laptop 1366` (1366×633), `MacBook Air 13 1470` (1470×832), `Desktop 1920` light & dark (1920×947).
- **Total sweep checks:** 188 checks across all 6 active pages and 14 table views (`audit-output/tables-faculty/after/sweep-metrics.json`).
- **Defects caught and fixed before final commits:**
  1. **AttendanceMonitoring phone card `<dt>` labels (diff review):** Worker initially used `<p className="... uppercase ...">`. Fixed to Course Catalog `<dl>` / `<dt className="text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">` / `<dd>` (Title Case, no `uppercase`).
  2. **Reports dark-mode `PENDING` remark pill (`reports/academic-iphone-393-dark.png`):** `renderRemark` lacked dark-mode background/text classes, leaving a bright white pill on dark cards. Fixed by adding `dark:bg-slate-800 dark:text-slate-300` (plus dark variants for rose/amber/emerald).
  3. **iPad 820 & iPad Pro 1032 horizontal clipping across 5 pages:** Hardcoded `min-w-[650px]`/`min-w-[680px]` caused 2–186 px horizontal scroll inside padded cards at 820/1032 px (`classes` 648/834, `attendance` 648/650, `email` 648/650, `reports` 616/650, `grades/summaries` 616/680, `grades/assessments` 616/732). Fixed with width-scoped classes (`min-w-[580px]`/`min-w-[600px]`, `max-w-[140px] break-all xl:max-w-none xl:break-normal` email + `flex-wrap xl:flex-nowrap` Actions on `ClassesAndRosters`, `leading-tight xl:whitespace-nowrap` headers + `gap-1 xl:gap-1.5` on `GradeComputation` Assessments).
  4. **Split `CLINIC-4A`/`CLINIC-4B` code badge on `grades/assessments-ipad-820-light.png`:** Section badge wrapped across 2 lines (`CLINIC-` / `4A`) and pushed the 3rd icon button (Delete) 49 px off-edge. Fixed with `flex-wrap` title row + `whitespace-nowrap shrink-0` on the section code span — verified 0 split codes and all 3 Actions buttons 100% visible (`actionsVisible: true`, zero horizontal scroll) at 820 px and 1032 px.
  5. **Playwright E2E strict-mode & empty-table/aria regressions (`scripts/check.ps1` first run — 11 failures in `e2e/faculty.spec.ts`):**
     - 8 strict-mode duplicate locator failures from mounting both desktop and phone DOM branches simultaneously -> fixed via `useIsPhone()`.
     - 1 empty-state `<thead>` failure on `/grades?tab=summary` -> fixed by keeping empty row inside desktop `<tbody>` so `<thead>` stays mounted.
     - 1 accessible-name substring collision on Assessments Edit/Archive/Delete buttons when assessment title contained `"Archive"` -> fixed by removing the extra `aria-label` and restoring original `title="Edit|Archive|Delete"`.
     - 1 old `max-md:block` retention phone-card locator (`e2e/faculty.spec.ts:882`) -> updated by `fix-e2e-retention` to assert the `<article>` phone card.
- **Final sweep result:** **0 defects** (`pageOverflow=false`, `cardEscapesViewport=0`, `splitLabels=0`, `actionsVisible=true` across all 13 core screens + `744×1133` & `700×1000`).
- **Design Review self-audit:** `Verdict: pass` (0 Blocker, 0 High).

## Breakpoint Comparison (`768 px` vs `640 px`)

- **Branch keeps:** `768 px` (`md:`, matching `spec.md` UI-001; no `spec.md` edits).
- **Temporary 640 px patch saved:** `audit-output/tables-faculty/bp640.patch` (swaps `useIsPhone.ts` `(max-width: 767px)` -> `(max-width: 639px)` and the 14 table/phone-card `md:` -> `sm:` switch classes across the 6 Faculty pages; verified `git apply --check audit-output/tables-faculty/bp640.patch` exit `0` against final tree `aee36f002dd9`).
- **Comparison shots captured:** All 6 active Faculty pages at `744×1133` light and `700×1000` light in both `bp-768/` (phone cards) and `bp-640/` (desktop tables), embedded side-by-side in the "Breakpoint: 768 vs 640" section of `audit-output/tables-faculty/index.html`.

## Offline HTML Demos (Stage 2 Final Demo)

All 7 offline self-contained HTML pages verified via `node audit-output/tables-faculty/build-html.mjs --check` (`file://` URL, 0 console errors, 0 page errors, 0 external network requests, 100% JPEG data-URI images loaded, 0 overflow at `1920×947` and `1366×768`, check PNGs inspected via `read_file`):

- `audit-output/tables-faculty/index.html` (5,480.1 KB — links all 6 active pages, exempt/shared note, Course Catalog 393 reference card, and Breakpoint 768 vs 640 comparison at 744×1133 & 700×1000; check PNG: `audit-output/tables-faculty/checks/index-check.png`)
- `audit-output/tables-faculty/classes.html` (1,675.2 KB, 10/10 images; check PNG: `checks/classes-check.png`)
- `audit-output/tables-faculty/attendance.html` (1,412.5 KB, 10/10 images; check PNG: `checks/attendance-check.png`)
- `audit-output/tables-faculty/retention.html` (4,377.4 KB, 30/30 images; check PNG: `checks/retention-check.png`)
- `audit-output/tables-faculty/email.html` (5,818.2 KB, 40/40 images; check PNG: `checks/email-check.png`)
- `audit-output/tables-faculty/reports.html` (3,828.3 KB, 30/30 images; check PNG: `checks/reports-check.png`)
- `audit-output/tables-faculty/grades.html` (2,880.5 KB, 20/20 images; check PNG: `checks/grades-check.png`)

## Gates Run (Final Feature Tree `aee36f002dd9` / `0491d4ef`)

1. `node frontend/node_modules/typescript/bin/tsc -b frontend` — **exit `0`**
2. `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts` — **exit `0`** (`1/1` passed)
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` — **exit `0`** (`390` frontend unit tests, `4` git hook tests, PHP lint, all backend unit/contract tests, documentation contract test, `381/381` mocked Playwright E2E tests passed; `.check` stamp written at `.git/dentisys-pass/aee36f002dd9a8d7762eb21ddce77995d686f30b.check`)
4. `scripts/check-postgres.ps1` — **not run** (frontend/CSS/docs/mocked-E2E only; zero backend, database, sidecar, Docker, or `e2e/live` changes).

## Known Gaps & Notes

- Seeded `S.Y. 2026–2027 (Current)` dev data has `0` rows on Retention Monitoring tabs and on Email Management Midterm Advisory / Remedial tabs (populated rows exist in `S.Y. 2025–2026`); Before/After demo pairs use consistent `S.Y. 2026–2027` (`CLINIC-4A`) across every page, and Retention phone-card layout/overflow is also verified with populated mocked records in `e2e/faculty.spec.ts:882`.
- Committing this archive report changes `HEAD^{tree}` from the stamped feature tree `aee36f002dd9` (`0491d4ef`); no product files changed after the `.check` stamp.

## Doubts (not acted on)

None.

---

## T2-R: Recapture of Five Empty Views with S.Y. 2025–2026

- **Path chosen:**
  - Screenshot recapture & visual sweep: **one worker** (`demo-recapture`, `gemini-4-neon-low`, `workspace: "inherit"`) — single read-only/untracked screenshot-set job per `.agents/rules/dentisys-neon.md`.
  - Revealed visual defect fix (`frontend/src/pages/faculty/RetentionMonitoring.tsx`): **direct** (`1` file, `38+`/`38-` lines, code-only visual fix, no test changes).
- **Worker models:** `demo-recapture` -> `gemini-4-neon-low`.
- **Per-tab school year, class, rows, and Before/After comparison (`audit-output/tables-faculty/recapture-selection.json`):**

| View (files) | School year | Class / Course filter | Rows / Phone cards | Before vs After (5 devices) |
| --- | --- | --- | --- | --- |
| Retention Status (`retention/watchlist-*`) | `S.Y. 2025–2026` | `All classes` | `2` rows / `2` cards | **5/5 differ** (populated table & green phone cards) |
| Remedials (`retention/remedials-*`) | `S.Y. 2025–2026` | `All classes` | `2` rows / `2` cards | **5/5 differ** (populated table & green phone cards; old unframed stack replaced) |
| At-Risk Students (`retention/midterm-*`) | `S.Y. 2025–2026` (probed all S.Y.s & classes) | — (`empty_all_years: true`) | `0` rows / `0` cards | Empty across every school year/class in dev DB (server rule requires complete midterm ≤ 2.5 with no final grade or remedial record); no data faked |
| Midterm Advisory (`email/midterm_advisory-*`) | `S.Y. 2025–2026` (probed all S.Y.s & classes) | — (`empty_all_years: true`) | `0` rows / `0` cards | **5/5 identical** empty screen across every school year/class in dev DB; no data faked |
| Scheduled Remedial Notices (`email/remedial-*`) | `S.Y. 2025–2026` | `All courses` | `2` rows / `2` cards | **5/5 differ** (populated table & green phone cards) |

- **Phone scroll framing:** For populated `iphone-393-light` and `iphone-393-dark` views (`retention/watchlist`, `retention/remedials`, `email/remedial`), both Before (`f791ef59`) and After (`9ee8121`) scroll the section `<h2>` to `y = 76 px` so both student rows/cards stay completely inside the `393 × 852` frame below the archived-year banner.
- **Defects revealed & fixed (`9ee8121`, `fix(ui): Faculty Retention Monitoring table iPad fit, class code wrap and dark disabled button (T2)`):**
  1. `DMAT-2B` wrapped across two lines (`DMAT-` / `2B`) on iPad 820 in Retention Status -> added `whitespace-nowrap` on Class cells across Retention tables.
  2. `ACTIONS` column clipped horizontally at iPad 820 on Retention Status (`min-w-[700px]`) and Remedial Progression (`min-w-[820px]`, `flex-nowrap`) -> width-scoped `lg:min-w-*`, tightened `md` padding/font (`lg:` unchanged), and `flex-wrap lg:flex-nowrap` on remedial actions.
  3. Disabled `+ Remedial` (and disabled remedial action) buttons rendered bright light-gray with faint white text in dark mode (exposed by archived `S.Y. 2025–2026` view-only state) -> added `disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-400`.
- **Gates rerun on `9ee8121` (`9e8b57a57eda`):**
  - `node frontend/node_modules/typescript/bin/tsc -b frontend` — **exit `0`**
  - `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` — **exit `0`** (`390` frontend unit tests, `381/381` mocked E2E tests passed; `.check` stamp written for `9e8b57a57eda`; initial run hit one transient CPU-contention timeout in unrelated Grade Weights test `e2e/faculty.spec.ts:2596`, confirmed via `error-context.md`, passed cleanly on rerun).
- **Review HTML rebuilt & checked:**
  - `audit-output/tables-faculty/build-review.mjs` updated (`retention` & `email` `gap` notes + Overview `Known gaps`) and rebuilt `audit-output/tables-faculty/review-before-after.html`.
  - `audit-output/tables-faculty/check-review.mjs` passed (0 console errors, 0 broken images; `rv-retention-phone.png` visually verified).
  - `audit-output/tables-faculty/build-html.mjs --check` rebuilt the per-page demos (`retention.html`, `email.html`, `index.html`) from the updated shots.
- **T2-R Doubts (not acted on):** None.
