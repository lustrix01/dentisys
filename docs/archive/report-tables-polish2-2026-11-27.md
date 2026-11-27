# Handoff Report: Table Standard Round 3 (T3)

- **Date:** 2026-11-27
- **Worktree:** `C:\Users\decha\Desktop\Github\dentisys-tables-polish2`
- **Branch state:** detached HEAD (based on `4783c167`, `lighthal9-polish-tables`)
- **Base SHA:** `4783c167` (`chore(workflow): Neon briefs for the Faculty tables rollout (T2, recapture, 640 px preview)`)
- **Item commits:**
  1. `b4388426` — `feat(ui): Secretary requests list follows the table standard (T3)`
  2. `958b0ff5` — `feat(ui): Email history follows the table standard on Faculty and Admin (T3)`
  3. Report commit follows `958b0ff5` (this file).
- **Peer branch overlaps:** none (no parallel Claude work).

## Path chosen per item

| Item | Path | Reason |
|---|---|---|
| T3-a | `swarm` | Changes product code (`FacultyExcusedRequestsPanel.tsx`) together with E2E selectors (`e2e/faculty.spec.ts`); `.agents/rules/dentisys-neon.md` requires separate workers for implementation and tests with disjoint file ownership. |
| T3-b | `swarm` | Changes product code (`EmailHistoryTable.tsx`, `EmailManagement.tsx`) together with unit tests (`emailHistory.test.ts`); split across separate implementation and test workers. |
| T3-c | `one worker` | Preview-only code change (> 150 changed lines across `AuditTrailPage.tsx` and `index.css` plus patch export) with no test edits and no commit. |
| T3-d | `one worker` | Preview-only Stage 1 presentation options (`t3d-A.patch`, `t3d-B.patch`) on `ClassesAndRosters.tsx` (`renderClassCard`) with no test edits and no commit. |
| Demo | `one worker` | Real-app Playwright captures, T3-d computed-style measurement, offline `review.html` build, `check-review.mjs` verification, and PNG inspection isolated to `audit-output/tables-polish2/`. |
| Report | `direct` | Single handoff markdown file (`<= 3` files, no product/test code) authored and committed by coordinator after final gates and visual spot-check. |

## Worker models

| Worker | Model ID | Scope / Owned files |
|---|---|---|
| `t3a-impl` | `gemini-4-neon-medium` | `frontend/src/components/FacultyExcusedRequestsPanel.tsx` |
| `t3a-tests` | `gemini-4-neon-low` | `e2e/faculty.spec.ts` |
| `t3b-impl` | `gemini-4-neon-medium` | `frontend/src/components/email/EmailHistoryTable.tsx`, `frontend/src/pages/faculty/EmailManagement.tsx` |
| `t3b-tests` | `gemini-4-neon-low` | `frontend/src/tests/emailHistory.test.ts` |
| `t3c-audit` | `gemini-4-neon-medium` | `frontend/src/index.css`, `frontend/src/components/AuditTrailPage.tsx`, `audit-output/tables-polish2/t3c-audit.patch` |
| `t3d-cards` | `gemini-4-neon-low` | `frontend/src/pages/faculty/ClassesAndRosters.tsx`, `audit-output/tables-polish2/t3d-A.patch`, `audit-output/tables-polish2/t3d-B.patch` |
| `t3-demo` | `gemini-4-neon-low` | `audit-output/tables-polish2/{capture,build-review,check-review}.mjs`, `audit-output/tables-polish2/review.html` |

All workers were terminated (`swarm kill`) after landing and verifying their outputs.

## Changes per item

### T3-a: Secretary requests (Faculty) — committed (`b4388426`)
- **`frontend/src/components/FacultyExcusedRequestsPanel.tsx`** (`+169 / -47`):
  - Imported `useIsPhone` so only one responsive branch mounts at a time (`>= 640 px` table vs `< 640 px` phone cards).
  - Kept each session group container (`div.rounded-xl`) and its group header bar (group checkbox, label, count, `Approve selected/all`, `Reject selected/all`).
  - From 640 px up (`!isPhone`): one standard Faculty green ruled table (`table-pin table-pin-first data-table-ruled data-table-ruled-clinical hidden sm:block`) per session group directly below its header bar, with 4 Title Case columns (`Student`, `Requested Change`, `Reason`, `Actions`). Kept `id="secretary-request-${request.id}"` and `tabIndex={-1}` on each `<tr>`; optional reject note `<input>` renders inside the same `<tr>`'s `Reason` cell.
  - Below 640 px (`isPhone`): standard Faculty green left-spine `<article>` cards (`border-l-[3px] border-l-clinical-500/80`) with `id` and `tabIndex={-1}`, top-right status chip (`Pending` amber / `Approved` emerald / `Rejected` rose), shaded value box (`Requested Change`, `Reason`, conditional `Decision`), inline note `<input>`, and bottom-right `Note` / `Approve` / `Reject` actions.
  - Preserved all filters, dialogs, wording, handlers, `PendingRequestsBadge`, and `aria-*` attributes.
- **`e2e/faculty.spec.ts`** (`+5 / -5`):
  - Updated 5 desktop Secretary-request row locators from `panel.getByRole('listitem')` to `panel.getByRole('row')` (no assertions deleted or weakened):
    - Line 1564: `panel.getByRole('listitem').filter({ hasText: 'Alice Green' })` -> `panel.getByRole('row').filter({ hasText: 'Alice Green' })`
    - Line 1565: `panel.getByRole('listitem').filter({ hasText: 'Bob White' })` -> `panel.getByRole('row').filter({ hasText: 'Bob White' })`
    - Line 1611: `panel.getByRole('listitem').filter({ hasText: 'Alice Green' })` -> `panel.getByRole('row').filter({ hasText: 'Alice Green' })`
    - Line 1616: `panel.getByRole('listitem').filter({ hasText: 'Bob White' })` -> `panel.getByRole('row').filter({ hasText: 'Bob White' })`
    - Line 1619: `panel.getByRole('listitem').filter({ hasText: 'Cara Gray' })` -> `panel.getByRole('row').filter({ hasText: 'Cara Gray' })`
  - Lines 1659–1660 (`panel.locator('div.rounded-xl').filter(...)`) remained valid and unchanged.

### T3-b: Email history (shared) — committed (`958b0ff5`)
- **`frontend/src/components/email/EmailHistoryTable.tsx`** (`+176 / -76`):
  - Added optional `color?: 'accent' | 'clinical'` prop defaulting to `'accent'` (no role logic inside the component). Themes only the table modifier (`data-table-ruled-clinical` when `'clinical'`, purple base `.data-table-ruled` when `'accent'`), phone-card spine, and bold action-type code text; search/select focus rings and Clear filters button remain unchanged.
  - Imported `useIsPhone`; moved `visible.length === 0` empty state outside the responsive branches.
  - From 640 px up (`!isPhone`): `table-pin table-pin-first data-table-ruled` (+ `data-table-ruled-clinical` on Faculty) with `min-w-[650px]`, small-capitals `<thead>`, columns `Action`, `Recipients`, `Status`, `Date Sent`, `aria-expanded={expanded}`, and expandable recipient sub-rows.
  - Below 640 px (`isPhone`): `<div className="space-y-2.5 sm:hidden">` with role-colored spine `<article>` cards, top-row expand toggle + status chips, shaded `Recipients` / `Date Sent` `<dl>`, and expandable recipient list with `break-all` emails.
- **`frontend/src/pages/faculty/EmailManagement.tsx`** (`+1 / -1`):
  - Passed `color="clinical"` to `<EmailHistoryTable />` on line 1577. `frontend/src/pages/admin/FacultyInvitation.tsx` was left untouched (uses default `'accent'`).
- **`frontend/src/tests/emailHistory.test.ts`** (`+12 / -6`):
  - Left lines 1–73 untouched (including line 57 asserting `<EmailHistoryTable />` on `FacultyInvitation.tsx`).
  - Updated lines 74–87 (the old `<768px` CSS-stacked table assertions) to verify `useIsPhone()`, `table-pin table-pin-first data-table-ruled` + `hidden sm:block`, `data-table-ruled-clinical`, `min-w-[650px]` table, standard small-capitals `<thead>`, `space-y-2.5 sm:hidden` `<article>` spine cards, `aria-expanded={expanded}`, `break-all`, and `color="clinical"` on `EmailManagement.tsx`.

### T3-c: Audit Trail (all roles) — preview patch only (not committed)
- **Patch path:** `audit-output/tables-polish2/t3c-audit.patch` (verified `git apply --check` clean on `958b0ff5`; files restored after capture and gate run).
- **Files in patch:**
  - `frontend/src/index.css` (`+28`): added `.data-table-ruled.data-table-ruled-blue` modifier (light `#3b82f6` / `#eff6ff`, dark `#60a5fa` / `#121c2e`) following `.data-table-ruled-clinical`.
  - `frontend/src/components/AuditTrailPage.tsx` (`+145 / -110`): switched to `useIsPhone()` at 640 px; standard ruled table in role colour (purple for Superadmin/Dean, green for Faculty, blue for Secretary) keeping manual sticky `When` column pinning, full-width day-header rows, same 6 columns (`When`, `Who`, `What`, `Record`, `Change`, `Status` + boxed `Eye` Details button), batch expansion, attention cards, filters, export, print (`print-only` table untouched), and Details modal. Below 640 px: standard spine `<article>` cards under day headers with top-right `StatusBadge`, shaded `What` / `Record` / `Change` box, and bottom-right boxed `Eye` Details button.
- **Note vs `spec.md:434`:** Preview changes the phone breakpoint from 768 px to 640 px and places the status chip top-right in the card header (standard phone card) instead of linear order after `Change`.

### T3-d: `/classes` class cards (Stage 1 options) — preview patches only (not committed)
- **Patch paths:**
  - Option A (recommended): `audit-output/tables-polish2/t3d-A.patch` (`frontend/src/pages/faculty/ClassesAndRosters.tsx`, `+68 / -57`) — replaces `<Card>` on `renderClassCard` with solid white/slate `<article>` (`rounded-2xl border border-slate-200/90 border-l-[3px] border-l-clinical-500/80 bg-white shadow-2xs dark:border-slate-800 dark:border-l-clinical-400/70 dark:bg-slate-900`), top-right status chip (`class-grade-status` or archived status), shaded `Enrolled` / `Term` / venue / join-code box, and bottom action row.
  - Option B: `audit-output/tables-polish2/t3d-B.patch` (`frontend/src/pages/faculty/ClassesAndRosters.tsx`, `+2 / -2`) — replaces `<Card>`'s `.glass` surface on `renderClassCard` only with `rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900` (no green spine, no shaded count box).
  - Neither patch changes `Card.tsx` or `.glass`. Both verified with `git apply --check` and `tsc -b`; working tree restored cleanly.

## T3-d computed-style measurements (Before)

Measured against the running app (`audit-output/tables-polish2/t3d-styles.json`):

| Element (Viewport & Theme) | Background | Top Border | Left Border | Backdrop Filter | Box Shadow | Radius | Weights (Heading / Body / Badge) |
|---|---|---|---|---|---|---|---|
| `/classes` Class Card (`1920 light`) | `rgba(255, 255, 255, 0.65)` | `1px rgba(255, 255, 255, 0.5)` | `1px rgba(255, 255, 255, 0.5)` | `blur(16px)` | `0 1px 2px 0 rgba(0,0,0,0.05)` | `16px` | `700 / 800 / 800` |
| `/classes` `Card.tsx` Panel (`1920 light`) | `rgba(255, 255, 255, 0.65)` | `1px rgba(255, 255, 255, 0.5)` | `1px rgba(255, 255, 255, 0.5)` | `blur(16px)` | `0 1px 2px 0 rgba(0,0,0,0.05)` | `16px` | `600 / 600 / 700` |
| Standard Phone Card (`CourseCatalog`, `393 light`) | `rgb(255, 255, 255)` | `1px rgba(226, 232, 240, 0.9)` | `3px rgba(155, 114, 207, 0.8)` | `none` | `none` | `16px` | `700 / 800 / 700` |
| `/classes` Class Card (`1920 dark`) | `rgba(15, 23, 42, 0.55)` | `1px rgba(30, 41, 59, 0.4)` | `1px rgba(30, 41, 59, 0.4)` | `blur(16px)` | `0 1px 2px 0 rgba(0,0,0,0.05)` | `16px` | `700 / 800 / 800` |
| `/classes` `Card.tsx` Panel (`1920 dark`) | `rgba(15, 23, 42, 0.55)` | `1px rgba(30, 41, 59, 0.4)` | `1px rgba(30, 41, 59, 0.4)` | `blur(16px)` | `0 1px 2px 0 rgba(0,0,0,0.05)` | `16px` | `600 / 600 / 700` |
| Standard Phone Card (`CourseCatalog`, `393 dark`) | `rgb(15, 23, 42)` | `1px rgb(30, 41, 59)` | `3px rgba(170, 141, 211, 0.7)` | `none` | `none` | `16px` | `700 / 800 / 700` |

Root cause of "lighter" look: `renderClassCard` renders `<Card>` (`Card.tsx`), whose unlayered `.glass` class (`index.css:33-45`) sets 65% white translucent fill (`rgba(255, 255, 255, 0.65)`) and translucent white `1px` border (`rgba(255, 255, 255, 0.5)`) overriding Tailwind's `border-slate-200/60`, whereas standard cards and `.data-table-ruled` tables use opaque `rgb(255, 255, 255)` / `rgb(15, 23, 42)` and crisp `slate-200/90` / `slate-800` borders.

## Demo and device checks

- **Offline review page:** `audit-output/tables-polish2/review.html` (8.9 MB, 108 embedded real-app screenshots, 0 missing).
- **Automated check (`check-review.mjs`):** exited 0 — `errs: []`, `broken: { overview: 0, t3a: 0, t3b: 0, t3c: 0, t3d: 0 }`, 3-way zoom Space cycle verified (`Option A -> Option B -> Before`), check screenshots saved to `audit-output/tables-polish2/review-checks/rv-{overview,t3a,t3b,t3c,t3d}.png` and opened directly by coordinator.
- **Populated real data verified (0 page overflows across all 108 captures):**
  - `t3a` (`/attendance` -> Secretary Requests): 3 pending requests (3 table rows at 1920/820/640, 3 `<article>` cards at 393).
  - `t3b-faculty` (`/email-management` -> Email History Log): 2 rows (2 table rows at 1920/820/640, 2 `<article>` cards at 393).
  - `t3b-admin` (`/admin/faculty-invite` -> Email History): 7 email history rows (7 cards at 393, 7 email history table rows at 640+).
  - `t3c-superadmin` (`/superadmin/audit-trail`): 50 entries (58 table rows incl. day headers at 1920/820/640, 50 `<article>` cards at 393).
  - `t3c-dean` (`/admin/audit-trail`): 30 entries (36 table rows at 1920/820/640, 30 `<article>` cards at 393).
  - `t3c-faculty` (`/faculty/audit-trail`): 50 entries (53 table rows at 1920/820/640, 50 `<article>` cards at 393).
  - `t3c-secretary` (`/secretary/audit-trail`): 20 entries (25 table rows at 1920/820/640, 20 `<article>` cards at 393).
  - `t3d-assigned` (`/classes` -> Assigned Classes): 12 class cards (Before / Option A / Option B across 1920 light/dark, 820, 393).
  - `t3d-archived` (`/classes` -> Archived Classes): 6 class cards on default school year (Before / Option A / Option B across 1920 light/dark, 820, 393).
- **Visual QA catch resolved during capture:** initial 393 px captures for `t3a`, `t3b-faculty`, and `t3c-*` sat at `scrollY=0` (pushing cards below filters/attention cards), and `build-review.mjs` displayed literal backticks. Recaptured all 12 affected 393 px pairs scrolled to the section heading/group header, updated `build-review.mjs` to format inline `<code>`, rebuilt `review.html`, and re-verified with `check-review.mjs` and visual inspection.

## Gate results

1. **T3-c preview patch applied (not committed):**
   - `node frontend/node_modules/typescript/bin/tsc -b frontend` — PASS (exit 0).
   - `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` — PASS (exit 0; 390/390 frontend unit tests, 4/4 hook tests, all backend PHP lint/contract tests, documentation contract, 381/381 mocked Playwright E2E, 0 failing tests).
2. **T3-d preview patches applied (not committed):**
   - `t3d-A.patch`: `tsc -b` PASS (exit 0).
   - `t3d-B.patch`: `tsc -b` PASS (exit 0).
3. **Final committed tree (`958b0ff5`, clean working tree with T3-a + T3-b committed):**
   - `node frontend/node_modules/typescript/bin/tsc -b frontend` — PASS (exit 0).
   - `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts frontend/src/tests/emailHistory.test.ts` — PASS (7/7).
   - `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` — PASS (exit 0; 390/390 frontend unit tests, 4/4 hook tests, all backend PHP lint/contract tests, documentation contract, 381/381 mocked Playwright E2E — 379 passed first attempt + 2 passed on retry #1: `e2e/faculty.spec.ts:2026` and `e2e/superadmin-split.spec.ts:9`).
   - Recorded `.git/dentisys-pass/` check stamp: `0c9c01300ca2` for `HEAD 958b0ff5798f` (note: committing this archive report advances `HEAD` past `958b0ff5` without changing product code).
4. **`scripts/check-postgres.ps1`:** not run (no backend, database, sidecar, Docker, or `e2e/live` changes).

## Known gaps

- `shadow-2xs` is a Tailwind v4 utility class not defined in Tailwind 3.4 (`frontend/package.json` uses `tailwindcss ^3.4.19`), so both the existing standard phone cards (`CourseCatalog.tsx`, `ClassesAndRosters.tsx`) and T3-d Options A/B compute `box-shadow: none` at rest; preserved verbatim to match the established page pattern.
- In `t3d-styles.json`, the secondary `classesRosterPhoneArticle_393_*` probe returned `null` while `courseCatalogPhoneArticle_393_*` captured the standard phone card tokens at 393 px light and dark.

## Doubts (not acted on)

None. All 6 readiness doubts were settled in the brief before the build pass, and no new ambiguity arose during execution.

---

## T3-a rework (2026-11-28)

- **Date:** 2026-11-28
- **Base SHA:** `1eb8d39e` (detached HEAD on `dentisys-tables-polish2`, preserving T3-b `958b0ff5`, `c62a51b9`, T3-c `d7aa2ce8`, and T3-d `1eb8d39e` untouched)
- **Commit:** `d4bb3e84` — `feat(ui): Secretary requests: one card per session, flat rows inside (T3)` (tree `d7d8dbf89390`, matches recorded `.check` pass stamp)

### Path chosen per item

| Item | Path | Reason |
|---|---|---|
| T3-a rework | `swarm` | Changes product code (`frontend/src/index.css`, `frontend/src/components/FacultyExcusedRequestsPanel.tsx`) together with E2E group locators (`e2e/faculty.spec.ts`); `.agents/rules/dentisys-neon.md` requires separate implementation and test workers with disjoint file ownership. |
| T3-a demo | `one worker` | Single screenshot/demo job isolated to `audit-output/tables-polish2/`: Before (`1eb8d39e`) and After captures, `review.html` update, `check-review.mjs` check, and PNG inspection. |
| T3-a report | `direct` | Single archive markdown update (`<= 3` files, `<= 150` lines, docs-only) appended and committed directly by coordinator after gates pass. |

### Worker models

| Worker | Model ID | Scope / Owned files |
|---|---|---|
| `t3a-impl` | `gemini-4-neon-low` | `frontend/src/index.css`, `frontend/src/components/FacultyExcusedRequestsPanel.tsx` |
| `t3a-tests` | `gemini-4-neon-low` | `e2e/faculty.spec.ts` |
| `t3a-demo` | `gemini-4-neon-low` | `audit-output/tables-polish2/capture.mjs`, `audit-output/tables-polish2/build-review.mjs`, `audit-output/tables-polish2/review.html` |

All three workers were terminated (`swarm kill`) before running `scripts/check.ps1`.

### Changes and `.data-table-ruled-flush`

- **`.data-table-ruled-flush` was needed (`frontend/src/index.css`, `+8`):**
  - `.data-table-ruled` and `.data-table-ruled.data-table-ruled-clinical` apply outer `border`, `border-top` (2 px green rule), `border-radius: 1rem`, and `box-shadow` directly on the table's scroll wrapper while also styling `> table` children (header tint, bottom rule, hairline row dividers, hover left bar, pinned column).
  - Added `.data-table-ruled.data-table-ruled-flush` and `.dark .data-table-ruled.data-table-ruled-flush` immediately after `.data-table-ruled-blue` setting `border: 0; border-radius: 0; box-shadow: none;` so the desktop/tablet table sits flush edge-to-edge inside the session card without a second frame.
- **`frontend/src/components/FacultyExcusedRequestsPanel.tsx` (`groups.map` only, `+5 / -7`):**
  - Outer session group container changed from `overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700` to `overflow-hidden data-table-ruled data-table-ruled-clinical` (single Faculty green ruled frame: `1rem` radius, `1px` slate border `#e2e8f0`/`#1e293b`, `2px` green top line `#43A047`/`#5fc471`, solid white/`#0f172a` fill, same small shadow).
  - Kept header band (`bg-slate-50 dark:bg-slate-800/60`, checkbox, label, count, `Approve selected/all`, `Reject selected/all`) unchanged.
  - Removed the inner `p-2.5 sm:p-3` padding wrapper.
  - Desktop/tablet (`!isPhone`): added `data-table-ruled-flush` to the `table-pin table-pin-first data-table-ruled data-table-ruled-clinical` wrapper; kept table headers, columns, padding, rules, row hover, sticky first column, `id`, `tabIndex={-1}`, and focus tint untouched.
  - Phone (`isPhone`, `< 640 px`): replaced `space-y-2.5 sm:hidden` with `divide-y divide-slate-100 dark:divide-slate-800 sm:hidden`, and stripped row card chrome from `<article>` to `px-3 py-3 outline-none focus:bg-sky-50 dark:focus:bg-sky-950/30` (no border, left spine, own background, radius, or shadow; all row content, `id`, `tabIndex={-1}`, handlers, and wording preserved).

### Test changes

- **`e2e/faculty.spec.ts` (`+2 / -2`):**
  - Line 1659: `panel.locator('div.rounded-xl').filter(...)` -> `panel.locator('div.overflow-hidden.data-table-ruled-clinical').filter(...)`
  - Line 1660: `panel.locator('div.rounded-xl').filter(...)` -> `panel.locator('div.overflow-hidden.data-table-ruled-clinical').filter(...)`
  - All desktop `getByRole('row')` locators, `#secretary-request-31` focus assertions, and all other assertions remained untouched.

### Device checks and offline demo

- **Offline review page:** `audit-output/tables-polish2/review.html` (9.1 MB, 110 embedded real-app screenshots, 0 missing).
  - T3-a section replaced with **Before (T3-a v1 at `1eb8d39e`)** vs **After (one card per session)** across 6 devices (`iPhone 393 light/dark`, `640 × 900 light`, `iPad 820 light`, `Desktop 1920 light/dark`), plus a second T3-a view with the two extra After states (`desktop-1920-light-note.png` with inline Note input open; `desktop-1920-light-approved.png` showing `Approved (2)` with 2 decided rows in `CLIN401 CLINIC-4B · Oct 28, 2026`).
  - T3-b (`958b0ff5`), T3-c (`d7aa2ce8`), and T3-d (`1eb8d39e`) marked `Approved, committed` with their existing shots preserved.
- **Automated review check (`check-review.mjs`):** exit 0, `errs: []`, `broken: { overview: 0, t3a: 0, t3b: 0, t3c: 0, t3d: 0 }`, 3-way zoom cycle verified.
- **Per-shot layout metrics (`after-t3a-rework/metrics.json`, 0 overflows across all 8 After captures and all 6 Before captures):**
  - `desktop-1920-light` / `desktop-1920-dark`: `scrollWidth=1920 <= 1920`, `tableRows=3`, `cards=0`.
  - `ipad-820-light`: `scrollWidth=820 <= 820`, `tableRows=3`, `cards=0`.
  - `bp-640-light`: `scrollWidth=640 <= 640`, `tableRows=3`, `cards=0`.
  - `iphone-393-light` / `iphone-393-dark`: `scrollWidth=393 <= 393`, `tableRows=0`, `cards=3` (flat `divide-y` `<article>` rows inside the session card).
  - `desktop-1920-light-note`: `scrollWidth=1920 <= 1920`, `tableRows=3`, inline `Optional note (for reject)` input visible.
  - `desktop-1920-light-approved`: `scrollWidth=1920 <= 1920`, `tableRows=2` (`approvedTotal=2`).
- **Coordinator visual inspection:** opened `review-checks/rv-t3a.png` and After PNGs (`iphone-393-light`, `iphone-393-dark`, `desktop-1920-light`, `desktop-1920-dark`, `desktop-1920-light-note`, `desktop-1920-light-approved`) directly; single session frame, flush table, flat phone rows, Note input, and Approved decided rows all confirmed clean.

### Gate results

1. **`node frontend/node_modules/typescript/bin/tsc -b frontend`:** PASS (exit 0).
2. **Secretary requests E2E (`pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test-e2e.ps1 e2e/faculty.spec.ts -g "Secretary"`):** PASS — 7/7 passed in 11.0s (first attempt, 0 retries). Running bare `npx playwright test` without Vite on `127.0.0.1:15174` fails with `ERR_CONNECTION_REFUSED`, so `scripts/test-e2e.ps1` was used to start/stop the Vite dev server for the focused run.
3. **`pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`:** PASS (exit 0) on the final uncommitted tree (`d7d8dbf89390`, matching commit `d4bb3e84`):
   - Production Vite build + `tsc -b`: PASS.
   - Frontend unit tests: 390/390 PASS.
   - Git hook tests: 4/4 PASS.
   - Backend PHP lint & contract tests + documentation contract: PASS.
   - Mocked Playwright E2E: 381/381 PASS on first attempt in 4.7m (0 failures, 0 retries; covers T3-a rework, T3-c `d7aa2ce8`, and T3-d `1eb8d39e`).
4. **`scripts/check-postgres.ps1`:** not run (no backend, database, sidecar, Docker, or `e2e/live` changes).

### Doubts (not acted on)

None.

