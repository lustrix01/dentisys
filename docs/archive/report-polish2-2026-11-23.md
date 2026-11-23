# Report: branch `lighthal9-responsive-polish2` (14.4, 14.9), 2026-11-23

- **Worktree:** `C:\Users\decha\Desktop\Github\dentisys-polish2`
- **Branch:** `lighthal9-responsive-polish2` (started from `9d88448`; no push, no force-push, no hook bypass, no edits outside this worktree)
- **Commits:**
  - `676b03e` — `feat(reports): retention tab lists only retention students (14.4)`
  - `351c0b0` — `feat(notifications): add missing per-role in-app notices (14.9)`
  - Plus this report commit (`docs/archive/report-polish2-2026-11-23.md`).
- **Visible design changes:** None (strictly followed brief rule 3: zero changes to colours, Tailwind class strings, spacing, layout, fonts, icons, columns, or existing screen wording).

---

## 1. Item 14.4 — Reports, Retention & Remedials tab lists only retention students

### What changed (`676b03e`)
- `frontend/src/utils/remedialSummary.ts`:
  - Exported `hasRetentionOrRemedialHistory(record: FacultyRetentionRecord)` to identify enrollments that are or were in retention/remedial (`state` in `remedial` / `irregular_reenrollment` / `cleared`, any recorded `remedialProgression.attempts`, `costRecovery`, `cleared`, non-`none` `stage`, or non-empty legacy `remedial` object).
  - Exported `filterRetentionListStudents(students, retentionRecords, selectedSchoolYear, selectedClassId)` to filter students to those with a matching qualifying retention/remedial record for the selected school year and class.
- `frontend/src/pages/faculty/Reports.tsx`:
  - Kept `facultyStudents` untouched so the Grades & Assessments tab is unaffected.
  - Derived `retentionStudents` (empty while `retentionUnavailable` is true) and `sortedRetentionStudents`.
  - Applied the same `retentionStudents` filter to all four Retention & Remedials consumers:
    1. On-screen Retention & Remedials table (`sortedRetentionStudents`).
    2. PDF `PrintHeader` student row count (`rowCount` when `reportTab === 'retention'`).
    3. PDF print table rows (`byLastName(retentionStudents)`).
    4. Excel "Retention list" export (`handleExportExcel('retention')` -> `Retention_Report.xlsx`).
  - Added empty-state row in the Retention & Remedials `<tbody>` using the page's exact existing table empty-state pattern (`Inbox` icon + `text-sm font-bold` heading, `max-md:block` compatible). No new columns and no visual design changes.

### Tests added (14.4)
- `frontend/src/tests/remedialSummary.test.ts`: unit tests for `hasRetentionOrRemedialHistory` and `filterRetentionListStudents` (active/no-history excluded; `remedial`, `irregular_reenrollment`, `cleared`/passed remedial, cost recovery, and legacy remedial included; `selectedSchoolYear` and `selectedClassId` scoping).
- `e2e/faculty.spec.ts`:
  - `Retention & Remedials tab lists only retention/remedial students on screen, in PDF print, and in Retention_Report.xlsx (14.4)`: proves a student with no retention/remedial history is absent and a student who passed remedial (`state: 'cleared'`, stage `'passed'`) is present with outcome `'Cleared'` across on-screen table, PDF print header count + table, and downloaded `Retention_Report.xlsx`.
  - `Retention & Remedials tab shows empty state when no student has retention or remedial history (14.4)`: proves the empty state renders on screen and print row count is `0`.
- **Fail-before / pass-after proof:** Both new Playwright tests failed on unmodified `Reports.tsx` (row count received `3` instead of `2`; empty state heading not found) and passed after `676b03e` (`2 passed (5.6s)`).

---

## 2. Item 14.9 — Notifications per role (backend only)

### What changed (`351c0b0`)
- `spec.md`: Added `## NTF-002 - In-app notices per role` (`**Status: APPROVED**`, Owner decision 2026-11-23) verbatim right after `## NTF-001`. No other section of `spec.md` was modified.
- Wired all 6 new in-app notices via `notification_create_idempotent` (`backend/app/notifications.php`) with active-account filtering, per-event deduplication keys, actor exclusion, and short plain-text wording (no emoji); left all existing notices untouched and made zero frontend changes:
  1. **Final grades released** — `backend/controllers/GradeSubmissionController.php` (`grade_submission_faculty_handle`, `$action === 'submit'`): notifies active enrolled Students (and Student-linked Secretaries) via `faculty_class_student_user_ids($pdo, $csId)`, excluding actor. Type: `grades_released`. Dedup key: `final-grades-released:{$csId}:{$uid}` (idempotent across withdraw -> re-submit).
  2. **Grade changed** — `backend/controllers/GradeSubmissionController.php` (`grade_change_admin_handle`, `if ($approve)`): snapshots pre-approval `final_percentage`/`final_gwa` before `faculty_save_computed_grade`, notifies only active linked student/secretary accounts whose `final_gwa` or `final_percentage` actually changed, excluding Dean/Faculty actors; never fires on reject or attendance-only unchanged grades. Type: `grade_changed`. Dedup key: `grade-changed:{$batchId}:{$uid}`.
  3. **Class Faculty changed** — `backend/controllers/SuperadminClassesController.php` (`superadmin_class_change_faculty`): notifies all active enrolled Students' active linked accounts plus the active Class Secretary, deduplicated via `array_unique` (an enrolled Class Secretary receives 1 notice, not 2), skipping previous Faculty, new Faculty, and Superadmin actor. Type: `class_assignment` (reused). Dedup key: `class-faculty-changed:{$key}:{$recipientId}`.
  4. **Join request waiting** — `backend/controllers/ClassJoinController.php` (`handle_class_join_student_join`): when `join_auto_approve` is `false`, notifies the class's active `instructor_user_id` (excluding Student actor); does not fire when `join_auto_approve` is `true`. Type: `class_enrollment` (reused). Dedup key: `class-join-request:{$requestId}:{$facultyUserId}`.
  5. **Face revocation request waiting** — `backend/controllers/StudentBiometricController.php` (`handle_student_biometric_revoke_request_create`): inside the request transaction, notifies every active `superadmin` account (excluding Student actor). Type: `biometric_enrollment` (reused). Dedup key: `face-revoke-requested:{$revokeRequestId}:{$uid}`.
  6. **Face enrolment flagged** — `backend/app/face_flags.php` (`face_flag_raise` and `face_revoke_request_approve`): captures inserted `flag_id` via `RETURNING flag_id` (or reuses existing open `$flagId` on refresh), notifies every active `superadmin` account except optional `?int $actorUserId = null` (passed by `face_revoke_request_approve` so an approving Superadmin is not notified for their own F3 approval). Type: `biometric_enrollment` (reused). Dedup key: `face-flag-raised:{$flagId}:{$uid}`.

### New vs reused notification `type` values
- **Reused:** `class_assignment`, `class_enrollment`, `biometric_enrollment`.
- **Added (new):**
  - `grades_released` — final grades released to active enrolled Students on submission (no existing type matched general grade release).
  - `grade_changed` — individual Student's grade changed after Dean approval (distinct from Faculty's `grade_change_decision`).

### Extra files touched beyond the brief's minimal list (rule 4 justification)
- `tests/database/superadmin_classes_integration.php`: lines 340 and 410–419 previously enforced old decision D14 (`Students get nothing (D14)` and total `+ 3` notices). Updated to enroll `$scStudentAccount` into `$scK1` before `$scKeepBefore` and assert NTF-002 (`$scStudentAccount` receives 1 `Class Faculty changed` notice; total `+ 4`). Without this update, `postgres_integration_test.php` would fail on the superseded D14 assertion.
- `tests/database/notifications_per_role_integration.php`: modular integration test file required from `tests/database/postgres_integration_test.php` (line 8134), matching the existing repo pattern (`grade_release_gates_integration.php`, `face_flags_integration.php`, etc.).

### Tests added (14.9)
- `tests/backend/notifications_per_role_contract_test.php`: DB-free contract test verifying `spec.md` `NTF-002` placement/roles/notices (when `spec.md` is mounted on host, matching `face_flags_contract_test.php`'s container guard) and all 6 backend wiring points.
- `tests/database/notifications_per_role_integration.php` (required by `tests/database/postgres_integration_test.php`): real PostgreSQL + HTTP + mock sidecar tests covering all 6 notices, recipient counts, actor exclusion, inactive/unlinked/archived filtering, withdraw -> re-submit idempotency, rejected & attendance-only grade changes, enrolled-secretary dedup, join auto-approve true/false, F2 open-flag refresh dedup, and F3 actor exclusion.
- **Fail-before / pass-after proof:** `php tests/backend/notifications_per_role_contract_test.php` exited `1` before `351c0b0` (`FAIL: spec.md defines ## NTF-002 - In-app notices per role right after NTF-001`) and exited `0` after `351c0b0`.

---

## 3. Checks run and results

| Check | Result | Notes |
|---|---|---|
| `npx tsc -b` (`frontend/`) | PASS | Exit 0 |
| `npm test` (`frontend/`) | PASS | 364/364 unit tests passed |
| `scripts/test-e2e.ps1 e2e/faculty.spec.ts -g "14\.4"` | PASS | 2/2 passed (failed before `676b03e`, passed after) |
| `php tests/backend/notifications_per_role_contract_test.php` (host) | PASS | Exit 0 (all 27 assertions including `spec.md`) |
| `php tests/backend/undefined_function_test.php` | PASS | All 1030 called backend functions/handlers defined |
| `php tests/documentation/doc_contract_test.php` | PASS | Exit 0 |
| UTF-8 no-BOM + CRLF check on all 14 changed files + report | PASS | `BOM=false`, `LF_ONLY=false`, `git diff --check` clean |
| `scripts/check.ps1` | **PASS** | Exit 0: Compose configs, prod validator, frontend build + 364 unit tests, git hook tests, PHP lint, all backend PHP tests, doc contract, **366/366 mocked Playwright E2E**. Recorded `.check` stamp for tree `d4d25a96c2a7` (exact match to `351c0b0^{tree}`). |
| `scripts/check-postgres.ps1` (`INTEGRATION_CONTINUE_ON_FAIL=1`, run at 23:56) | Partial (pre-existing fixture time bug) | Every new 14.9 assertion and updated `superadmin_classes_integration.php` passed; 3 failures in untouched `tests/database/face_flags_integration.php:603` (`late_cutoff_time = '23:55:00'` when executed at 23:56 Asia/Manila). |
| `scripts/check-postgres.ps1 -ComposeProject dentisys-integration-polish2 -BackendHttpPort 28080 -FrontendHttpPort 25173 -MailpitUiPort 28025` (confirming run at 00:13) | `postgres_integration_test.php` **PASS** (100%), backup/restore **PASS**, live Playwright 28/29 PASS (1 pre-existing flake) | All PostgreSQL integration tests (including all 6 new 14.9 notices) and backup/restore passed with 0 failures. Single live Playwright failure in untouched `e2e/live/grade-submission.spec.ts:273` (details below); therefore `.pg` stamp was NOT written. |

---

## 4. Skipped, unsure, and follow-up findings for `colleague-merge` / Owner

1. **Pre-existing live Playwright race (not touched per rule 4):** `e2e/live/grade-submission.spec.ts:271-273` (introduced by commit `c0468c3`) clicks `advisory.click()` immediately after clicking `Publish Midterm advisory` without waiting for the publish dialog to close / badge to clear (unlike line 305, which waits `await expect(advisory.getByLabel('Scores changed since published')).toHaveCount(0)` before `advisory.click()`). Because of this race, the live Playwright phase of `check-postgres.ps1` failed at line 273–274 on two consecutive runs (28/29 passed), preventing `check-postgres.ps1` from writing a `.pg` stamp even though `postgres_integration_test.php` and backup/restore passed 100%.
2. **Pre-existing midnight fixture window (not touched per rule 4):** `tests/database/face_flags_integration.php:603` hardcodes `opening_time = '00:00:00', present_cutoff_time = '23:50:00', late_cutoff_time = '23:55:00', class_end_time = '23:59:00'`, causing those 3 assertions to fail if run between `23:55` and `23:59` Asia/Manila.
3. **Superseded wording in untouched docs (not touched per brief rules / `AGENTS.md`):**
   - `spec.md` `GRD-004` (line 572) still states: *"Students are notified in-app on approval only when the change moves them into or out of Remedial (2.5–4.9)."* — now superseded by `NTF-002` (*"grade changed after an approved grade change"*).
   - `docs/contracts/superadmin-classes.md` (lines 62 and 119, `D14`) still states: *"Students: nothing (D14)."* — now superseded by `NTF-002` (*"class Faculty changed"* to every Student in the class).
4. **DB constraint note (`uq_user_accounts_one_superadmin`):** Migration `068_superadmin_role.sql` enforces at most one `role = 'superadmin'` row in PostgreSQL, so `notifications_per_role_integration.php` verifies active Superadmin delivery, disabled Superadmin suppression (toggling status in a `try/finally`), F3 actor exclusion when `$superUserId` approves, and non-actor `face_flag_raise` delivery against the single allowed Superadmin row.
5. **No frontend visual changes made:** If any future UI polish is desired for Retention & Remedials empty state wording or badge styling on new notification types (`grades_released`, `grade_changed`), that belongs on `polish1` / Owner review.
