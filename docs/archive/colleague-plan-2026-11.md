# Colleague plan — November 2026

Work plan for the colleague's lane, written 2026-11-20. The colleague works while the Owner is away and does not use Claude; the Owner reviews and merges everything in one go afterwards. The order and the Owner's lane are in [the roadmap](../roadmap.md); what each item must do is in [the product backlog](../PRODUCT_BACKLOG.md), item by item. This file is a dated record and is not edited afterwards; changes go to the backlog item. If you use an AI assistant, give it this file and `AGENTS.md`.

## How to work

1. **Start by bringing `owhie-responsive` up to `lighthal9-responsive`.** Everything on `owhie-responsive` is already in `lighthal9-responsive`, so this only moves it forward:

   ```powershell
   git fetch origin
   ```

   ```powershell
   git checkout owhie-responsive
   ```

   ```powershell
   git merge --ff-only origin/lighthal9-responsive
   ```

   ```powershell
   git push origin owhie-responsive
   ```

   Then run `npm ci` at the repository root (it installs packages and turns on the commit hooks). If the `--ff-only` merge refuses, your local `owhie-responsive` has commits that were never pushed: run `git merge origin/lighthal9-responsive` instead, keep both sides when resolving, and say so in your report.
2. **Work only on `owhie-responsive`.** Never push to `lighthal9-responsive` or any other branch. Do the items in order, commit each item separately (one or more commits per item, never two items in one commit), and push `owhie-responsive` after each item so the work is saved.
3. **Stay in your files.** Each item lists the files it touches. If an item needs a file outside its list, especially anything under `backend/`, `database/` or the sign-in pages, skip that part and write it in your report. The Owner is changing the sign-in code at the same time: `auth_runtime.php`, `mfa_runtime.php`, `GoogleAuthController.php`, `security.php`, `SsoLogin.tsx`, `MfaVerify.tsx`, `MfaSettingsCard.tsx`, `AuthContext.tsx`.
4. **Do not edit** `docs/PRODUCT_BACKLOG.md`, `docs/roadmap.md` or `spec.md`. The Owner updates them when merging.
5. **Looks.** Build every part from the existing page parts named in `docs/frontend.md` "Page patterns"; no new look, colour or layout of your own. Where an item leaves a look choice open, do not choose: skip it and write it in your report. For each visible change, take before and after screenshots of the real app at phone (390 px) and desktop (1280 px) width, in light and dark (the app's own theme toggle). Keep them outside the repository and send them to the Owner with your report; the Owner reviews them at merge and may ask for changes.
6. **Done means tested.** For every item:
   - add or update the test named under the item and run it on its own first;
   - run `npx tsc -b` in `frontend/`;
   - run `./scripts/check.ps1` (PowerShell 7) before pushing the item; it must pass. If it fails on something your item did not touch, write it in your report instead of fixing it.
7. **Commit hooks.** After `npm ci` the hooks check every commit. Do not bypass them (`--no-verify`); when one refuses, read its message and fix the commit message or the file. They refuse:
   - AI trailers (`Co-Authored-By: …`, "Generated with …");
   - a `fix:` commit with no test file and no `Test: none - <reason>` line;
   - a `feat:` commit without the backlog id in the subject, for example `feat(retention): grades first and batch send (13.5)`;
   - a commit that changes `frontend/src` `.tsx`/`.css` files without a `Demo:` line: use `Demo: none - screenshots sent to Owner for review`;
   - files with a BOM, UTF-16 or broken characters.
8. **Encoding.** Write files as UTF-8 without BOM. Do not use Windows PowerShell 5.1 (`powershell.exe`) to write files; use `pwsh` or your editor.
9. **Report when done.** One message to the Owner: per item, what changed, the commit(s), the screenshots, and anything skipped or not working.

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
- **Done when:** screenshots taken, the test passes, `check.ps1` passes.
- **Size:** about 1 hour.

### 2. Retention Monitoring grades first and batch send (13.5)

- **Goal:** Faculty see each student's grade first, and can send advisories or remedial notices to several students at once, with the existing preview as the review step.
- **Change:** on the three Retention Monitoring tabs the grade column moves to right after Student; At-Risk Students gets row checkboxes and a "Send advisory" button; Remedials gets the same for remedial notices. Both open Email Management with those students preselected; extend the existing deep link (`?tab=remedial&enrollment=<id>`) to a list of ids. No new send screen.
- **Files:** `frontend/src/pages/faculty/RetentionMonitoring.tsx`, `frontend/src/pages/faculty/EmailManagement.tsx`.
- **Test:** `frontend/src/tests/retentionMonitoringContract.test.ts` for the column order; `e2e/faculty.spec.ts`: tick two students, press the button, Email Management opens with both selected and the preview lists both.
- **Done when:** screenshots of all three tabs and of Email Management with the students preselected, tests pass, `check.ps1` passes.
- **Size:** about 1 day.

### 3. Start session hint (part of 13.6)

- **Only the hint.** The attendance review screen in 13.6 waits for the Owner to pick its look, and needs a spec change, so it is not part of this plan.
- **Goal:** Faculty see that a session's date and time can be changed.
- **Change:** the hint "You can change the date and time." under the date and time fields in Start session, in the existing hint text style of that dialog.
- **Files:** `frontend/src/components/StartSessionModal.tsx`.
- **Test:** `e2e/faculty.spec.ts`: opening Start session shows the hint.
- **Done when:** screenshots taken, the test passes, `check.ps1` passes.
- **Size:** under 1 hour.

### 4. Layout batch (9.22 and 13.3's 320 px column)

- **Goal:** fix five small layout problems: the collapsed sidebar cuts labels on iPad (820 px); the breadcrumb "Home" link is a small tap target; on wide screens the sticky page header and the Audit Trail table header overlap content while scrolling; at 320 px an Audit Trail card's Who line overlaps; at 320 px the Faculty Retention table's last column cannot be read.
- **Files:** the shared layout and sidebar components, `frontend/src/pages/admin/SystemAudit.tsx`, `frontend/src/pages/faculty/RetentionMonitoring.tsx` (on top of item 2's changes).
- **Test:** `e2e/tablet-sidebar.spec.ts` for the sidebar; a phone-width check in the spec of each changed page.
- **Done when:** one set of before and after screenshots at 320, 390, 820 and 1280 px, light and dark, taken; tests and `check.ps1` pass. If a fix needs a new look (not just spacing or sizing), skip it and write it in your report.
- **Size:** half a day to a day.

### 5. Confirmation pop-ups (13.7)

- **Goal:** five one-click actions ask first. The backlog item lists them with their files: a single Excused or attendance request decision, a single class join request decision, saving grade weights, turning class joining or auto-approve on or off, and restoring a course, room or room category.
- **Change:** use the existing `requestConfirmation` from `frontend/src/components/FeedbackCenter.tsx`; no new dialog. Each message names the item and the effect, in sentence case.
- **Files:** `FacultyExcusedRequestsPanel.tsx`, `ClassJoinPanel.tsx`, `GradeComputation.tsx` (the grade weights save only), `CourseCatalog.tsx`, `Rooms.tsx`.
- **Test:** for each action, in its screen's mocked spec (`e2e/faculty.spec.ts`, `e2e/admin.spec.ts`): Cancel sends no request, Confirm sends it.
- **Done when:** one screenshot of each of the five messages, tests and `check.ps1` pass.
- **Size:** about half a day.

### 6. Flaky Email Management test (9.21)

- **Goal:** `e2e/faculty.spec.ts` "Email Management records a successfully delivered Student invitation" passes in the full 8-worker run, not only alone.
- **Change:** find the cause first: run it with `--repeat-each=40 --retries=0 --trace=retain-on-failure` and read the failing trace's page errors. Fix the real cause (app or test); do not add waits or retries to hide it.
- **Files:** `e2e/faculty.spec.ts`, and the app file only if the trace shows an app bug.
- **Done when:** 40 repeats pass and `check.ps1` reports it neither failed nor flaky. Write the cause in your report.
- **Size:** about 2 hours.
