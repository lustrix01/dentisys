# Brief: tables rollout, Faculty pages (Neon hand-off, emergency mode), 2026-11-27

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Item: T2, the first rollout
of the table standard the Owner approved in T1 ([brief-tables-b-2026-11-27.md](brief-tables-b-2026-11-27.md)).
Every product question in this brief is settled: it is the agreed contract. Claude reviews and merges the
result with the `colleague-merge` skill. Emergency mode (`CLAUDE.local.md`): you also make the demos; the
Owner views your offline HTML pages.

## Setup (done by Claude's driver; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-tables-faculty` on branch
  `lighthal9-responsive-tables-faculty`, from `lighthal9-responsive` at `f791ef59`. `npm ci` has run in the
  root and in `frontend/`. It is your workspace root.
- Docker: up (the dev stack in `C:\Users\decha\Desktop\Github\dentisys`, backend reachable through
  `http://localhost:5173`). The Faculty account is in `.agents/app.json`. Use `AUDIT_SELECT=CLINIC-4A` (or
  pick that class in each page's selects) so tables have rows.
- Parallel Claude work: none.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Choose the path (direct / one worker / swarm) as that rule says. Pages are independent files, so one
   worker per page is allowed; start workers only with `/swarm` and `gemini-4-neon-medium` or
   `gemini-4-neon-low`; never `invoke_subagent`. `frontend/src/index.css` has one owner only (you, the
   lead); a worker that needs a CSS change reports it to you.
3. Every command runs from the workspace root with repo-relative paths. Never `cd` first.
4. Visible changes: only the table bodies on the pages below, copying the standard exactly. Anything else
   that seems needed goes under "Doubts".
5. Never ask mid-run. A doubt during the build: leave that table untouched, list the exact question, go on.

## The standard (copy it; do not redesign it)

- `docs/frontend.md` "Page patterns", rows **"Table bodies"**, **"Pinned table columns"** and **"Table
  header cells"**. Reference file: `frontend/src/pages/admin/CourseCatalog.tsx`; CSS `.data-table-ruled` in
  `frontend/src/index.css`. Copy its exact class strings for the scroll wrapper, `<table>`, cells, codes,
  numbers, column dividers, boxed icon buttons, and the phone card (spine, status chip, 2×2 metric box,
  actions row).
- Owner rulings in `.claude/skills/ui-fix-demo/references/dentisys.md` "Standing Owner rulings (UI)" apply,
  especially the 2026-11-27 table lines. Rejected looks (do not reuse): tinted chips behind codes, icon
  buttons without their grey boxes, tighter rows with centred numbers, phone cards that fold values into one
  wrapped labelled line or drop the status chip, a sideways-scrolling table on phones.
- The Owner's goal: every table and every phone card looks the same from page to page ("spaghetti wiring"
  is the complaint). Consistency with Course Catalog beats a page-specific idea.

## Item T2: Faculty tables follow the table standard

- **Pages and tables (22 `<table>` elements):** `frontend/src/pages/faculty/` `ClassesAndRosters.tsx` (2),
  `AttendanceMonitoring.tsx` (1), `ClassAttendanceActivity.tsx` (1), `RetentionMonitoring.tsx` (3),
  `EmailManagement.tsx` (4), `Reports.tsx` (5), `GradeComputation.tsx` (6). Find them with
  `git grep -n "<table" frontend/src/pages/faculty`.
- **Which tables change:** every on-screen data table (rows of records). **Exempt, unchanged:** printed and
  exported tables (e.g. `.grade-sheet-table`, print/PDF builders), tables that pin more than one column or
  pin by hand (the "Pinned table columns" row names the Full Matrix and the Audit Trail), and grade-entry
  grids where cells are inputs. List every table in the report as changed or exempt, with file:line and
  the reason for each exemption. A table you cannot classify goes under "Doubts" and stays unchanged.
- **Contract for each changed table:**
  - Desktop/tablet (`sm:` and up): the Course Catalog wrapper and table classes. Replace any `max-md:block`
    row-to-block CSS with the standard pair: `hidden sm:block` table plus a `space-y-2.5 sm:hidden` phone
    card list.
  - Phone card: title = the row's main name or code; top-right status chip only when the row already shows a
    status (map existing status colours to the chip; no new colours, never invent a status); the other
    values go in the shaded metric box, two per row, in the table's column order (more than four values =
    more rows in the same grid); the row's actions bottom-right in the actions row.
  - Actions: icon buttons get the boxed icon-button class. Text buttons keep their text and their
    current style. No action, field, sort control, filter, label or wording is added, removed or renamed.
  - Keep every handler, prop, state, API call, test id and `aria-*` exactly as is (presentation-only work,
    `AGENTS.md` "Working together"). If a change seems to need a functional edit, it is a Doubt.
  - Codes and IDs never break; numbers and counts right-aligned with `tabular-nums`; the page never scrolls
    sideways; a status may wrap on phones per the 2026-11-19 Retention ruling.
- **Device sweep, per page:** tier `core` in `audit/devices.json` (320, 360, 375, 393, 480, 744, 820, 1032,
  1366, 1470, 1920) light, plus dark at 393 and 1920, every tab of the page that holds a changed table.
  Check: no page sideways scroll, nothing escapes its card, no split codes or labels, Actions visible or
  reachable, dark-mode contrast, phone cards look the same as Course Catalog's. Fix every defect with
  width-scoped classes.
- **Demo:** one offline HTML Before | After page per Faculty page, `audit-output/tables-faculty/<page>.html`,
  plus `audit-output/tables-faculty/index.html` linking all seven, built from real screenshots with a script
  like `audit-output/tables-neon/build-html.mjs` from the T1 worktree (copy it into
  `audit-output/tables-faculty/`). Shots: Desktop 1920 light and dark, iPad 820, iPhone 393 light and dark,
  each with the page toolbar in frame; include the Course Catalog phone card at 393 once on `index.html` as
  the reference. Check each page: no console errors, every image loaded, one check screenshot you open
  yourself. Then your **`Design Review`** self-audit; fix every Blocker/High before the commit.
- **Proof:** `frontend/src/tests/tableHeaderContract.test.ts` passes; existing tests for these pages keep
  passing unchanged (never weaken a test; a failing test that asserts old markup is a Doubt unless it only
  checks a class string the standard replaces, which you update and name in the report).
- **Done when:** every non-exempt Faculty table matches Course Catalog on desktop and phone, the sweep finds
  no defect, the demos exist, and the gates pass.

## Answers to the readiness doubts (settled; they override anything above)

1. **Colour (Owner: Faculty green).** Same shapes as Course Catalog, in the Faculty role colour
   (`clinical`; `docs/frontend.md` "Selected colour"). Add one modifier in `frontend/src/index.css`,
   `.data-table-ruled-clinical`, used together with `.data-table-ruled`, that swaps only the purple values
   for clinical ones (top rule and header bottom rule `#43A047`, dark `#5fc471`; hover bar the same; header
   tint `clinical-50`-ish light / a dark slate-green tint dark, matching the purple tint's strength).
   Phone spine `border-l-clinical-500/80 dark:border-l-clinical-400/70`; codes
   `text-clinical-800 dark:text-clinical-300`. Every other class string stays as in Course Catalog. Course
   Catalog itself does not change. Add the modifier to the "Table bodies" row in `docs/frontend.md` (one
   sentence: role pages use their role colour through a modifier; Faculty = `.data-table-ruled-clinical`).
2. **Breakpoint (Owner wants to see both before choosing).** Build and commit with **768 px**: use `md:`
   where the standard says `sm:` (`hidden md:block` / `space-y-2.5 md:hidden`), because `spec.md` UI-001
   says these Faculty lists use stacked blocks below 768 px. Where a page switches with the JS `isPhone`
   (`AttendanceMonitoring.tsx`), you may replace it with the CSS pair only if `isPhone` drives nothing but
   the table/blocks switch; otherwise keep `isPhone` and render the new card list from it. For the
   comparison: after the pages are done, make a temporary 640 px variant (`md:` → `sm:` on the switch
   classes only), save it as `audit-output/tables-faculty/bp640.patch`, capture every page at **744x1133
   and 700x1000, light**, then restore the 768 px version (the branch keeps 768). `index.html` gets a
   "Breakpoint: 768 vs 640" section: per page, 768 and 640 side by side at both widths. No `spec.md` change.
3. `ClassAttendanceActivity.tsx` is not routed: exempt, untouched; list it as "unrouted".
4. The two 422 error-banner tables in `GradeComputation.tsx` (about lines 4367 and 4424): exempt, untouched.
5. `components/email/EmailHistoryTable.tsx` (shared with Admin): untouched in T2; list it in the report as
   "shared, for the Admin rollout".
6. Keep tables and phone cards inside their existing `<Card>`. On `p-0` cards add inner padding
   `p-3 sm:p-4` around the table/card list so borders do not touch. No other Card change.
7. `.agents/app.json` and `audit-output/tables-faculty/{build-html,capture,sweep}.mjs` are now in the
   worktree (copied by Claude from the T1 worktree). Adapt those scripts; do not write new ones from scratch.
8. Yes: update `frontend/src/tests/attendanceStickyList.test.ts` for `AttendanceMonitoring.tsx` only (accept
   the `.table-pin` + `.data-table-ruled` wrapper and the standard `<thead>`), keep the
   `secretary/AttendanceList.tsx` assertion unchanged. Name it in the report.

## Gates (once, on the final tree: after every worker is merged back `--no-ff`, or after the last direct commit)

1. `node frontend/node_modules/typescript/bin/tsc -b frontend` and
   `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts`.
2. No `check-postgres.ps1`: no backend, database or `e2e/live` files change. If one does, stop and list it
   under "Doubts".
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` (output to a log file; read the exit
   code and the failing lines).

## Commits

One commit per Faculty page on the batch branch:
`feat(ui): Faculty <page> tables follow the table standard (T2)` with body lines
`Contract: docs/archive/brief-tables-faculty-2026-11-27.md` and
`Demo: none - offline HTML audit-output/tables-faculty/<page>.html (Stage 2 Final Demo)`.

## Report (the only handoff)

Write `docs/archive/report-tables-faculty-2026-11-27.md` with the `dentisys-handoff` skill, section 4b, and
commit it on the batch branch. Include: the table list (changed / exempt with reason), commit shas, devices
checked per page with each defect and its fix, gate results, the demo paths, and the Doubts.
