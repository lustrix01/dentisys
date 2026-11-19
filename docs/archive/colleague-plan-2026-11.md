# Colleague plan — November 2026

Work plan for the colleague's lane, written 2026-11-20 for the Owner to read before handing it over. The order and the Owner's lane are in [the roadmap](../roadmap.md); what each item must do is in [the product backlog](../PRODUCT_BACKLOG.md), item by item. This file is a dated record and is not edited afterwards; changes go to the backlog item.

## How to work

1. **Set up once.** Pull `lighthal9-responsive`, run `npm ci` at the repository root (this also turns on the commit hooks), and make your own branch from it, for example `colleague-<item>`. Never push to `lighthal9-responsive`; push your branch and tell the Owner.
2. **One item at a time, in order.** Finish an item, tell the Owner, and wait until the Owner has merged it before starting the next. The Owner merges after each item, not at the end, so conflicts stay small.
3. **Stay in your files.** Each item below lists the files it touches. If an item needs a file outside its list (especially anything under `backend/`, `database/` or the sign-in pages), stop and ask the Owner. The Owner is changing the sign-in code (`auth_runtime.php`, `mfa_runtime.php`, `GoogleAuthController.php`, `security.php`, `SsoLogin.tsx`, `MfaVerify.tsx`, `MfaSettingsCard.tsx`, `AuthContext.tsx`) at the same time.
4. **Do not edit** `docs/PRODUCT_BACKLOG.md`, `docs/roadmap.md` or `spec.md`. Report progress to the Owner; spec changes need the Owner's approval and are made by the Owner.
5. **Visible changes need the Owner's approval before commit.** Build parts from the existing page parts named in `docs/frontend.md` "Page patterns"; no new look, colour or layout of your own. Send the Owner before and after screenshots of the real app at phone (390 px) and desktop (1280 px) width, in light and dark (the app's own theme toggle). Commit only after the Owner says yes.
6. **Done means tested.** For every item:
   - add or update the test named under the item and run it on its own first;
   - run `npx tsc -b` in `frontend/`;
   - run `./scripts/check.ps1` (PowerShell 7) before telling the Owner it is done; it must pass.
7. **Commit messages** (the hooks refuse a commit that breaks these):
   - no AI trailers (`Co-Authored-By: Claude`, "Generated with …");
   - a `fix:` commit includes a test file, or a `Test: none - <reason>` line;
   - a `feat:` commit has the backlog id in the subject, for example `feat(retention): grades first and batch send (13.5)`;
   - a commit that changes `frontend/src` `.tsx`/`.css` files has a `Demo:` line: `Demo: none - screenshots approved by Owner <date>`.
8. **Encoding.** Write files as UTF-8 without BOM. Do not use Windows PowerShell 5.1 (`powershell.exe`) to write files; use `pwsh` or your editor.

Useful commands:

```powershell
npm run test:e2e -- e2e/faculty.spec.ts -g "part of the test name"
```

```powershell
node --experimental-strip-types --test frontend/src/tests/retentionMonitoringContract.test.ts
```

## The items

### 1. Secretary change-request reason minimum (9.25)

- **Goal:** the Secretary sees the 8-character minimum before typing, and pressing the button with a short reason explains why it did not send.
- **Change:** the label reads "Reason (at least 8 characters)"; "Send for approval" stays clickable and a short reason shows the existing error "Provide a reason of 8–500 characters.", as People & Accounts already does. Then check the other 8-character reason fields named in the backlog item and report any with the same gap.
- **Files:** `frontend/src/pages/secretary/AttendanceList.tsx` (the request-change dialog).
- **Test:** `e2e/secretary.spec.ts`: a 3-character reason shows the error and sends no request; an 8-character reason sends it.
- **Done when:** the Owner approved the screenshots, the test passes, `check.ps1` passes.
- **Size:** about 1 hour.

### 2. Retention Monitoring grades first and batch send (13.5)

- **Goal:** Faculty see each student's grade first, and can send advisories or remedial notices to several students at once, with the existing preview as the review step.
- **Change:** on the three Retention Monitoring tabs the grade column moves to right after Student; At-Risk Students gets row checkboxes and a "Send advisory" button; Remedials gets the same for remedial notices. Both open Email Management with those students preselected; extend the existing deep link (`?tab=remedial&enrollment=<id>`) to a list of ids. No new send screen.
- **Files:** `frontend/src/pages/faculty/RetentionMonitoring.tsx`, `frontend/src/pages/faculty/EmailManagement.tsx`.
- **Test:** `frontend/src/tests/retentionMonitoringContract.test.ts` for the column order; `e2e/faculty.spec.ts`: tick two students, press the button, Email Management opens with both selected and the preview lists both.
- **Done when:** approved screenshots of all three tabs and of Email Management with the students preselected, tests pass, `check.ps1` passes.
- **Size:** about 1 day.

### 3. Attendance review and the Start session hint (13.6)

- **Wait for the Owner first.** The Owner picks the look (by session, by student, or both) from a demo the Owner prepares. Do not start the review part before that choice; the hint part may start at once.
- **Goal:** Faculty can easily sort and review attendance records; Start session says the date and time can be changed.
- **Change:** the review view the Owner picked, built from existing table, filter and tab parts; the hint "You can change the date and time." under Start session.
- **Files:** `frontend/src/pages/faculty/AttendanceMonitoring.tsx`, `frontend/src/components/StartSessionModal.tsx`. If the view needs data the frontend does not already load, it may add at most one read-only request; anything more goes back to the Owner.
- **Test:** `e2e/faculty.spec.ts`: the list shows past sessions, sorting and the date and status filters change the rows, a click opens the roll call; the hint is visible.
- **Done when:** approved screenshots, tests pass, `check.ps1` passes. The Owner changes the UI-005 spec line in the same merge.
- **Size:** about 1 day.

### 4. Layout batch (9.22 and 13.3's 320 px column)

- **Goal:** fix five small layout problems: the collapsed sidebar cuts labels on iPad (820 px); the breadcrumb "Home" link is a small tap target; on wide screens the sticky page header and the Audit Trail table header overlap content while scrolling; at 320 px an Audit Trail card's Who line overlaps; at 320 px the Faculty Retention table's last column cannot be read.
- **Files:** the shared layout and sidebar components, `frontend/src/pages/admin/SystemAudit.tsx`, `frontend/src/pages/faculty/RetentionMonitoring.tsx` (after item 2 is merged).
- **Test:** `e2e/tablet-sidebar.spec.ts` for the sidebar; a phone-width check in the spec of each changed page.
- **Done when:** one set of before and after screenshots at 320, 390, 820 and 1280 px, light and dark, approved by the Owner; tests and `check.ps1` pass.
- **Size:** half a day to a day.

### 5. Confirmation pop-ups (13.7)

- **Goal:** five one-click actions ask first. The backlog item lists them with their files: a single Excused or attendance request decision, a single class join request decision, saving grade weights, turning class joining or auto-approve on or off, and restoring a course, room or room category.
- **Change:** use the existing `requestConfirmation` from `frontend/src/components/FeedbackCenter.tsx`; no new dialog. Each message names the item and the effect, in sentence case.
- **Files:** `FacultyExcusedRequestsPanel.tsx`, `ClassJoinPanel.tsx`, `GradeComputation.tsx` (the grade weights save only), `CourseCatalog.tsx`, `Rooms.tsx`.
- **Test:** for each action, in its screen's mocked spec (`e2e/faculty.spec.ts`, `e2e/admin.spec.ts`): Cancel sends no request, Confirm sends it.
- **Done when:** the Owner approved the five messages (one screenshot each), tests and `check.ps1` pass.
- **Size:** about half a day.

### 6. Flaky Email Management test (9.21)

- **Goal:** `e2e/faculty.spec.ts` "Email Management records a successfully delivered Student invitation" passes in the full 8-worker run, not only alone.
- **Change:** find the cause first: run it with `--repeat-each=40 --retries=0 --trace=retain-on-failure` and read the failing trace's page errors. Fix the real cause (app or test); do not add waits or retries to hide it.
- **Files:** `e2e/faculty.spec.ts`, and the app file only if the trace shows an app bug.
- **Done when:** 40 repeats pass and `check.ps1` reports it neither failed nor flaky. Tell the Owner what the cause was.
- **Size:** about 2 hours.
