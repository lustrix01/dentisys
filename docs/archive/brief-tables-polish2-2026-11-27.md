# Brief: table standard, round 3 (Neon hand-off, emergency mode), 2026-11-27

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Item: T3. Every product
question here is settled: it is the agreed contract. Claude reviews and merges. Emergency mode
(`CLAUDE.local.md`): you also make the demo; the Owner views one offline HTML page.

## Setup (done by Claude's driver; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-tables-polish2`, **detached** at `4783c167`
  (`lighthal9-polish-tables`, which the Owner's checkout has open). Commit on the detached HEAD; Claude
  fast-forwards `lighthal9-polish-tables` to your last commit. `npm ci` has run. It is your workspace root.
- Docker: up (dev stack in `C:\Users\decha\Desktop\Github\dentisys`, `http://localhost:5173`). Accounts in
  `.agents/app.json`; Superadmin needs a TOTP from its dev secret, one code per 30 s.
- Reusable scripts, copied by Claude: `audit-output/tables-polish2/{capture,sweep,build-html,build-review,check-review}.mjs`
  from the T2 batch. Adapt them; do not write new ones from scratch.
- Parallel Claude work: none.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Path per item as that rule says; workers only with `/swarm` and `gemini-4-neon-medium` or `-low`.
3. Every command runs from the workspace root with repo-relative paths. Never `cd` first.
4. Visible changes: only what the items name, copying the standard exactly. Anything else goes under "Doubts".
5. Never ask mid-run. A doubt: leave that part untouched, list the exact question, go on.

## The standard (copy it; do not redesign it)

`docs/frontend.md` "Page patterns" rows "Table bodies", "Pinned table columns", "Table header cells" and
"Phone blocks"; reference files `frontend/src/pages/admin/CourseCatalog.tsx` (purple) and
`frontend/src/pages/faculty/ClassesAndRosters.tsx` roster (Faculty green, `.data-table-ruled-clinical`).
Tables from **640 px** up (scroll sideways inside their own box when they do not fit; first column and header
pinned), the standard phone card below 640 px (`useIsPhone()` from `frontend/src/hooks/useIsPhone.ts`, so
only one branch is mounted). Owner rulings: `.claude/skills/ui-fix-demo/references/dentisys.md` "Standing
Owner rulings (UI)", especially the 2026-11-27 lines ("Tables over cards", Option B, rejected looks). Role
colour: Faculty green, Admin/Dean/Superadmin purple (base class), Secretary blue.

## Items

### T3-a Secretary requests (Faculty), build and commit
- **Where:** `frontend/src/components/FacultyExcusedRequestsPanel.tsx` (the "Secretary requests" tab on
  `/attendance`; the same panel shows on the Faculty Dashboard and changes there too).
- **Contract:** its request list becomes a standard green table (from 640 px) and standard phone cards
  (below 640 px). Keep every field, Approve/Reject and its dialogs, badges, filters, wording, handlers and
  `aria-*`. Status chip on the card = the request's existing status.
- **Commit:** `feat(ui): Secretary requests list follows the table standard (T3)`.

### T3-b Email history (shared), build and commit
- **Where:** `frontend/src/components/email/EmailHistoryTable.tsx`, used by Faculty `/email-management`
  (Email history tab) and Admin `FacultyInvitation.tsx`.
- **Contract:** standard table and phone cards, in the page's role colour: green on the Faculty page, purple
  (base class) on the Admin page; pass the colour from the page, no role logic inside the component. Keep
  every column, filter, search, resend/action control and wording. `frontend/src/tests/emailHistory.test.ts:77`
  asserts the old `max-md:block` class string: update only that assertion to the new wrapper, keep the rest.
- **Commit:** `feat(ui): Email history follows the table standard on Faculty and Admin (T3)`.

### T3-c Audit Trail (all roles), PREVIEW ONLY, no commit
- **Where:** `frontend/src/components/AuditTrailPage.tsx` (Admin, Faculty, Secretary pages wrap it).
- **Why preview:** `spec.md` (line ~434, "Display") says below 768 px each entry is a block with day headers;
  the Owner wants to see the 640 px table version before the spec changes.
- **Contract for the preview:** from 640 px up a standard table in the role colour (Secretary blue: add a
  `.data-table-ruled-blue` modifier next to the green one in `index.css`, same pattern), keeping the day
  headers as full-width rows inside the table, the same columns (When, Who, What, Record, Change, status
  badge, Details) and the attention cards. Below 640 px the standard phone card in the spec's field order,
  under the same day headers, with its Details button. Keep every filter, export, print and handler. The
  Audit Trail pins its columns by hand today ("Pinned table columns"): keep pinning working.
- **Deliver:** `audit-output/tables-polish2/t3c-audit.patch` (product files diff), captures, then restore the
  files. Gates once with the patch applied (tsc + `check.ps1`; list failing tests, do not change tests).

### T3-d /classes class cards, Stage 1 options, PREVIEW ONLY, no commit
- **Where:** `frontend/src/pages/faculty/ClassesAndRosters.tsx` "One class card, shared by Assigned Classes and
  Archived Classes" (around line 1508); both tabs.
- **Owner's words:** "It seems off-putting to the rest of the style. The style of these cards are not the
  same as others. They are lighter."
- **First measure** (computed styles at 1920 light and dark): the class card's border colour/width, background,
  shadow, radius and text weights, next to the standard phone card (`CourseCatalog.tsx` / Faculty roster
  card) and the page's other panels (`components/Card.tsx`). Put the numbers in the report.
- **Then two options**, each a patch: **A (recommended)** the class card takes the standard card treatment
  (border `border-slate-200/90`, `shadow-2xs`, `rounded-2xl`, green left spine
  `border-l-[3px] border-l-clinical-500/80 dark:border-l-clinical-400/70`, status chip top-right, shaded
  value box for its counts); **B** the same border, shadow and weights as `Card.tsx` panels, no spine. Keep
  every field, button, menu, tab and wording; no new colour. Save `t3d-A.patch` and `t3d-B.patch`, restore.

## Answers to the readiness doubts (settled; they override anything above)

1. **T3-a e2e selectors:** yes, update `e2e/faculty.spec.ts` 1564–1660 to the new structure
   (`getByRole('listitem')` → `getByRole('row')`, and the group locator to whatever wraps each group). Keep
   every assertion's meaning and strength; never delete an assertion. Name each change in the report.
2. **T3-a groups:** option (a): one standard green table per session group, directly below that group's
   header bar, which keeps its checkbox and bulk Approve/Reject. The panel is only on `/attendance`: fine.
3. **T3-b test:** yes, update all five old-markup assertions in `emailHistory.test.ts` 74–81 to the new
   wrapper and phone-card structure, keeping what each checks (a phone layout exists, actions stay reachable).
4. **T3-b colour:** optional prop `color?: 'accent' | 'clinical'`, default `'accent'`; leave
   `FacultyInvitation.tsx` and test line 57 untouched; `EmailManagement.tsx` passes `color="clinical"`. The
   colour themes only the table (modifier class), the phone-card spine and codes, not focus rings or buttons.
5. **T3-c:** (a) capture both `/superadmin/audit-trail` and the Dean `/admin/audit-trail`, plus Faculty and
   Secretary. (b) Standard card: status chip top-right, then the shaded box with What / Record / Change,
   Details bottom-right. Say in the T3-c justification that this differs from the spec's linear order.
6. **T3-d Option B:** replace `<Card>`'s glass surface on the class card only with
   `rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900`, no
   spine and no shaded count box. Option A uses the same surface plus the spine, chip and count box. Do not
   change `Card.tsx` or `.glass`.

## Demo (one offline page)

`audit-output/tables-polish2/review.html`, built with `build-review.mjs` (adapted), real screenshots:
- T3-a, T3-b: Before | After at iPhone 393 light and dark, 640x900, iPad 820, Desktop 1920 light and dark;
  T3-b on both the Faculty and the Admin page.
- T3-c: Before | After (patch) for Admin, Faculty and Secretary at the same devices.
- T3-d: Before | A | B at Desktop 1920 light and dark, iPad 820, iPhone 393, both tabs.
- A justification box per section (what changed, what stayed, anything that looked wrong). Pick a class or
  school year that has rows; never fake data; say when a view has none.
Check: no console errors, no broken images (`check-review.mjs`), one check screenshot you open yourself.

## Gates (once, on the final tree with T3-a and T3-b committed)

1. `node frontend/node_modules/typescript/bin/tsc -b frontend` and
   `node --experimental-strip-types --test frontend/src/tests/tableHeaderContract.test.ts frontend/src/tests/emailHistory.test.ts`.
2. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` (output to a log file).
3. No `check-postgres.ps1` (no backend, database or `e2e/live` change; if one appears, list it under Doubts).

Commit body lines for T3-a and T3-b: `Contract: docs/archive/brief-tables-polish2-2026-11-27.md` and
`Demo: none - offline HTML audit-output/tables-polish2/review.html`.

## Report

`docs/archive/report-tables-polish2-2026-11-27.md` with the `dentisys-handoff` skill, section 4b: path per
item, commits, the T3-d measurements, device checks, gate results, patch paths, Doubts. Commit it.
