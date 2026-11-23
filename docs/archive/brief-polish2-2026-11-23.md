# Brief: branch lighthal9-responsive-polish2 (Antigravity), 2026-11-23

Written by Claude for the Owner's Antigravity (Gemini) swarm. Claude works on `lighthal9-responsive-polish1` at the same time. Both branches start at `b3d478e` and merge, without squashing, into `lighthal9-responsive-polish`. The Owner approves that branch before it goes into `lighthal9-responsive`. The merge reviews this branch with the `colleague-merge` skill, so every rule below is checked.

## Rules for every worker

1. Read `AGENTS.md` and `CLAUDE.md` first. They apply to you in full.
2. Work only on `lighthal9-responsive-polish2`, or on a worktree branch made from it and merged back into it. Never commit to `lighthal9-responsive`, `lighthal9-responsive-polish1` or `lighthal9-responsive-polish`. Never push, never force-push.
3. **No visible design changes.** Do not change colours, Tailwind class strings, spacing, layout, fonts, icons or wording on any screen. Claude owns everything visible on `polish1`. If an item seems to need a visible change, stop and write it in the report instead of making it.
4. Touch only the files listed for your item. If you need another file, write why in the report.
5. Commit messages follow `.githooks/check-commit-msg.mjs`: no AI trailers; `feat:` subjects carry the item id, e.g. `feat(reports): retention tab lists only retention students (14.4)`; any `frontend/src` .tsx/.css change needs a `Demo: none - <reason>` line (allowed here only because rule 3 forbids visible design changes). Do not bypass hooks (`--no-verify` is refused).
6. Write files as UTF-8 without BOM. Never write files with Windows PowerShell 5.1 (`powershell.exe`); see `CLAUDE.md` "Encoding safety".
7. Every behaviour change has a test that fails before the change and passes after it. Run checks as `AGENTS.md` "Validation" says; `./scripts/check.ps1` before your last commit, and `./scripts/check-postgres.ps1` for backend or database changes (one run with `$env:INTEGRATION_CONTINUE_ON_FAIL = '1'`, fix every failure in one pass, then one confirming run).
8. Stop when your items are done and leave a report at `docs/archive/report-polish2-2026-11-23.md`: what changed per item, tests added, checks run and their results, anything skipped or unsure.

## Items

### 14.4 Reports, Retention & Remedials tab lists only retention students

Today the tab's table, row count, PDF and Excel export use `facultyStudents` (every student), for example `frontend/src/pages/faculty/Reports.tsx` around line 1476.

- Change: list only enrollments that were in retention or remedial in the selected school year (the `retentionRecords` data the page already loads), including those that have since passed. Their outcome shows in the existing status columns ("Standing Status", "Remedials Status"). No new columns.
- Same filter for the on-screen table, the row count, the PDF and the "Retention list" Excel export.
- Empty case: when no student qualifies, use the page's existing empty-state pattern and text style.
- Files: `frontend/src/pages/faculty/Reports.tsx`, its export helpers if they build the retention list, and their tests.
- Tests: a unit or mocked browser test showing a student with no retention record is absent and one who passed remedial is present.

### 14.9 Notifications per role (backend only)

Spec rule, approved by the Owner on 2026-11-23. Add it to `spec.md` right after NTF-001, in the same commit as the code:

> ## NTF-002 - In-app notices per role
>
> **Status: APPROVED**
>
> Owner decision (2026-11-23). DentiSYS sends an in-app notice only when the recipient must act, or when someone else changed something about them; never for the recipient's own action. Each notice is created with the change that causes it, at most once per event, and only for an active linked account. Each role receives these notices:
>
> - **Student:** enrolled in a class; class cancelled; class restored; join request not approved; midterm advisory; midterm advisory cleared; remedial required; remedial no longer required; remedial update; cost recovery result; face revocation request approved; face revocation request rejected; face check-in enrolment revoked; appointed Class Secretary; final grades released; grade changed after an approved grade change; class Faculty changed.
> - **Class Secretary:** the Student notices, plus appointment removed; attendance request approved; attendance request rejected.
> - **Faculty:** attendance change requested by the Class Secretary; room booking overlap; a room their class uses was changed; grade change approved or rejected; class moved to another Faculty member; class assigned to them; join request waiting.
> - **Dean:** grade change awaiting approval.
> - **Superadmin:** face revocation request waiting; face enrolment flagged.

Six of these are new. Every other notice already exists; do not change it.

| New notice | Recipient | Where the event happens (start here) |
|---|---|---|
| Final grades released | each enrolled Student with an active account | the step that makes final grades visible to Students (`backend/controllers/GradeSubmissionController.php`, `grades_submitted_at`); confirm the visibility rule in `spec.md` first |
| Grade changed | each Student whose grade an approved grade change altered | the grade change approval (`GradeSubmissionController.php`, next to the `grade_change_decision` notice) |
| Class Faculty changed | every Student in the class (today only the Class Secretary gets it) | `backend/controllers/SuperadminClassesController.php` around line 237 |
| Join request waiting | the class's Faculty member | `backend/controllers/ClassJoinController.php`, where `class_join_requests` is inserted |
| Face revocation request waiting | every active Superadmin | where a Student's revocation request is created (`backend/app/student_biometrics.php` / `StudentBiometricController.php`) |
| Face enrolment flagged | every active Superadmin | `backend/app/face_flags.php`, where `face_enrolment_flags` is inserted |

- Use `notification_create_idempotent` (`backend/app/notifications.php`) with a deduplication key per event, like the existing calls. Reuse existing notification `type` values where one fits (`class_assignment`, `class_enrollment`, `biometric_enrollment`); add a new one only if none fits, and list it in the report.
- Wording: copy the tone of the existing notices next to each call (short title, one-sentence body, names the class or course). No emoji.
- The notification bell and list already exist for every role. Make no frontend change.
- Tests: `tests/backend` contract tests (see `class_join_code_contract_test.php`, `face_flags_contract_test.php` for the pattern) and `tests/database/postgres_integration_test.php` cases showing each new notice reaches the right recipient once and not the actor.

### 14.5 is not yours

Exports are built in the browser, so 14.5 (Student Attendance Logs export) is frontend work and goes to Claude on `polish1`.
