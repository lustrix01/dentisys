# Full comparison: lumbang_final and lighthal7

Date: 2026-10-03 (Asia/Manila).

This report records the comparison snapshot before the transfer's first commit.
The later push-preparation commit preserves that approved implementation and
includes its wording follow-up; historical references to uncommitted work below
describe the state when the comparison was performed.

## Compared state

- Shared baseline: `lighthal6`, `4be93032b49267404d03aae0dec0d244963dd16a`.
- Colleague source: `lumbang_final`, `80e85637fe0150d66efd2d5a6c69e8245ae38777`.
- Destination: `lighthal7` at the baseline commit **plus the current tracked edits and untracked transfer tests/documents**. The implementation is not committed. Comparing branch tips alone would incorrectly show none of the transferred work.
- The source is one direct child commit of the baseline: 14 changed files, 1,532 added lines and 1,142 deleted lines.
- The destination has 21 tracked changed/deleted files relative to the baseline. Before this report, it also had the new colleague-regression test and four transfer documents.
- A normalized-content inventory of all 456 tracked path entries found 19 differences between source and destination and 437 matching entries (including the shared deletion). This confirms the differences are confined to the files below; the untracked new tests/documents are accounted for separately.
- Compared both baseline-to-source and source-to-working-tree diffs. CRLF/LF conversion is not treated as a product difference.
- This is a comparison and documentation pass. No runtime implementation, specification amendment, commit, push, database change or source-branch execution was performed.

## Result

Every one of the source's 14 changed files has an explicit disposition. Ten are adapted, two test files match the source, the standalone Secretary override deletion is shared, and one Student Dashboard file is preserved exactly from the baseline. There is no source-changed file left unaccounted for.

The colleague's principal presentation changes are present: Student class cards and current/archive views, Student retention tabs and historical grouping, Faculty midterm filters and course-grade wording, Faculty Override modal, Secretary consolidated override/history actions, and Secretary access to their own Student academic context. The transfer deliberately changes their semantics where needed to preserve approved server authority, identity, history and attendance behavior.

One presentation defect was identified in this comparison: the Faculty midterm description still described computation, although the action correctly unlocks visibility. The Owner subsequently approved the proposed correction, and the two wording changes are now applied. The finding and approval follow-up are recorded below.

## All source-changed files

Paths below are repository-relative. Source describes what differs from `lighthal6`; destination describes the current `lighthal7` working tree.

| File | lumbang_final | Current lighthal7 | Disposition |
| --- | --- | --- | --- |
| `backend/controllers/FacultyController.php` | Adds persisted class-enrollment notices on Student creation/enrollment/reactivation; identifies recipients by account links or email equality without active-role restrictions. | Keeps the notice creation and deduplication. Recipients must be active canonical Student/Secretary accounts. Enrollment, audit and notice remain transactional. Already-active enrollment is a no-op; later reactivation cannot repeat the class/account notice. No activation replay. | Adapted; identity/recipient repairs. |
| `backend/controllers/StudentAcademicController.php` | Adds instructor/room/block/year metadata and Student midterm evaluation; swallows calculation errors, falls back to stored breakdowns, and uses a separate 80% rule. Retention totals include historical records. | Reads canonical lecture/laboratory meetings; instructor can be null. Uses existing live Faculty midterm calculation and risk projection with no swallowed error/stale fallback. Adds nullable risk and current school year. Advisory, pending-grade and attention counts are current-year scoped. | Adapted; authoritative calculations and schedule repair. |
| `frontend/src/types/index.ts` | Adds optional metadata, year flags and midterm response fields. | Keeps those fields; adds nullable instructor, canonical meetings/recorded flag, nullable server risk and retention current school year. | Adapted to the actual API contract. |
| `frontend/src/App.tsx` | Opens Student academic routes to Secretary, redirects every Student profile to Secretary profile, and redirects the old override route without query context. | Keeps shared academic routes under existing identity/runtime guards. Ordinary Students retain Student profile; Secretary profile remains Secretary profile. Override redirect preserves the query string. | Adapted; profile and legacy-route repair. |
| `frontend/src/components/Layout.tsx` | Adds linked-Student Dashboard navigation and shared academic entries; ordinary Student profile links incorrectly go to Secretary profile and some Student context paths still go to Attendance. | Keeps the navigation changes with provenance/identity visibility checks. Student/Secretary profile destinations are correct. Sidebar, desktop shortcut and desktop/phone profile switches enter Dashboard. Phone context actions close the drawer. | Adapted; consistent destinations and guards. |
| `frontend/src/pages/faculty/AttendanceMonitoring.tsx` | Replaces row status buttons with Override modal; preloads the old reason and requires a reason for initial entry. | Keeps the modal. Initial reason is optional; corrections start with a blank fresh reason; unchanged status performs no write. Preserves exact worksheet/session selection, write guards, refresh/polling coordination and historical read-only behavior. | Adapted; baseline interaction rules preserved. |
| `frontend/src/pages/faculty/RetentionMonitoring.tsx` | Adds midterm summary/filter/table and compute controls, course-grade labels and class display. Risk filters add a client `<80` rule; All Classes can unlock multiple classes; unlock is presented as computation/readiness. | Keeps summary/filter/table and course-grade labels. Counts/filter use server High/At Risk projection only. Unlock applies to one class; All Classes cannot invoke the aggregate action. Completion and unlocked-incomplete states are distinct. Original course grade/percentage and historical restrictions remain. Misleading computation description and incomplete-row wording corrected after Owner approval. | Adapted; wording follow-up complete. |
| `frontend/src/pages/secretary/AttendanceList.tsx` | Adds consolidated override modal and History roll-call action; loses explicit roster-session selection, matches missing rows by Student/date, preloads old reasons and uses nonempty-only validation. | Keeps consolidation with exact session picker and full roster, including Not recorded rows. History chooses the precise same-day session. Ordinary reasons are 8–240 characters, Excused requests 8–500; corrections require fresh reasons and reject no-ops. Failed writes retain the draft for retry; stale/refresh races are guarded. Existing verification method is preserved. Only Faculty finalizes Excused. | Adapted; full replacement workflow and provenance repair. |
| `frontend/src/pages/secretary/ManualAttendanceOverride.tsx` | Removes the standalone component. | Component also removed after consolidation and legacy deep-link verification. Old route remains as a context-preserving redirect. | Same deletion; replacement was verified. |
| `frontend/src/pages/student/Classes.tsx` | Replaces the page with class/schedule cards and current/archive tabs, but parses legacy room text, supplies a fake Student number/year, archives every non-current enrollment, and omits prior academic details/prototype behavior. | Keeps cards/tabs and metadata. Uses canonical meetings, including Sunday and distinct per-day rooms/times. No invented identity/year. Separates current, past and other/unclassified years. Retains grade, percentage, clinical hours, retention guidance and guarded development prototype. Retry refreshes both classes and year. | Adapted; truthful data and baseline detail preservation. |
| `frontend/src/pages/student/RealStudentSurfaces.tsx` | Removes Overall GWA and course Score %, changes View Full Grades to View Classes. | Exactly baseline content: retains authoritative GWA and Score %, original label and five-card layout. | Source changes intentionally omitted. |
| `frontend/src/pages/student/RetentionMonitoring.tsx` | Replaces presentation with Active Courses, Remedial Exams, Midterm Advisory and Past Records. Falls back from empty current courses to all history; can display Cleared with pending grades; mixes completed/historical remediation with active work and passed cost recovery with required work. | Keeps four tabs and historical grouping. Standing is current-only with pending/empty states. Original grades remain unchanged. Active, completed/historical and unassigned review are distinct. Manual Warning/Critical without an assigned attempt implies no exam. Passed/failed/required cost recovery and attempt dates/outcomes remain distinct. Advisory uses the shared server risk and explicitly shows unavailable assessment data. Development mock data remains gated and labelled. | Adapted; retention-state and historical repairs. |
| `e2e/dfd_verification.spec.ts` | Updates Secretary navigation to consolidated Attendance Monitoring. | Matches the source. This navigation assertion is supplemented by actual mutation, legacy route, session identity and reason tests elsewhere. | Same source content. |
| `e2e/secretary.spec.ts` | Updates override/Excused selectors for consolidated page. | Matches the source; exact Excused payload/Faculty-approval assertions remain. Additional targeted coverage is in the new regression suite. | Same source content. |

## Behavioral comparison and examples

| Scenario | lumbang_final | Current lighthal7 |
| --- | --- | --- |
| Student midterm score is below 80%, but the Faculty server projection is Low. | Additional percentage rule can flag risk. | Low causes no advisory. High/At Risk are the only advisory levels; this does not assign remediation. |
| Watchlist is manually unlocked while assessments remain incomplete. | Can display Computed / Ready and report computation. | Displays Unlocked / Assessments incomplete. Unlock does not calculate missing assessment data. |
| Faculty has All Classes selected. | Compute action can send unlock requests for multiple classes. | Aggregate unlock is disabled; choose one class. |
| Student has only historical enrollments. | Empty current partition falls back to all records. | No current courses; historical work stays historical. |
| Current final grades are pending and no retention flag exists. | Standing can be Cleared. | Standing Pending. |
| Faculty manually marks Warning for a passing or pending course, with no remedial attempt assigned. | Can imply deficiency/remedial work. | Warning / Review required and Retention Review / Unassigned; no exam is invented or counted. |
| Cost recovery has passed. | Can still warn that cost recovery is required. | Passed / Course cleared; stored original grade remains intact. |
| A class meets Sunday and different times/rooms on other days. | Legacy text parsing cannot faithfully display atomic meetings. | Canonical meeting data preserves each weekday, time and room. |
| Student number or current year is missing. | Supplies a fixed Student number or school year. | Unavailable; no fabricated official value. |
| Ordinary Student opens My Profile. | Redirects to Secretary-only profile. | Opens their Student profile. |
| Linked Secretary switches to Student on phone or desktop. | Destinations differ between controls. | Dashboard, same account/role/canonical Student identity. |
| Secretary selects the afternoon History entry for the same course/date as a morning entry. | Course/date filtering is ambiguous. | Exact afternoon session ID and roster. |
| Secretary records attendance for a missing row. | No full session-selection workflow; Student/date matching is ambiguous. | Explicit session roster and Student/session identity. |
| Existing biometric/manual attendance is corrected. | Optimistic state marks it manual_secretary regardless of original method. | Existing original method preserved; new manual rows use manual_secretary. Server provenance policy remains unchanged. |
| A Secretary save fails. | No added regression proof for preserved draft/exact retry; refresh coordination is weak. | No optimistic success; reason remains for retry with identical target/payload; refresh is blocked during save. |
| New roster Student has no linked active account. | Email matching can select an unrelated account. | No notice; account identity is never inferred from email. |

## Source policy deliberately excluded

- The independent 80% risk rule and grade approximation fallback.
- Swallowing midterm calculation errors or returning stale stored breakdowns as live results.
- Unlocking multiple classes through an All Classes action or describing unlock as completed calculation.
- Profile redirects that send an ordinary Student to Secretary-only functionality.
- Fabricated Student identity/year and loss of existing Dashboard/class academic information.
- Treating historical enrollments as current, pending standing as cleared, or completed cost recovery as outstanding work.
- Student/date matching in place of exact attendance-session targeting, reuse of previous correction reasons, and discarded legacy query context.

These exclusions are repairs against existing approved rules or exact previously approved amendments, not newly inferred product policy.

## Destination additions outside the source's 14 files

| Destination file | Reason for difference |
| --- | --- |
| `e2e/faculty.spec.ts` | Adapts modal workflow; preserves mutation/polling assertions; adds initial-entry, fresh reason/cancellation, failed-write retry and exact same-day session coverage. |
| `e2e/live/live.spec.ts` | Uses consolidated Secretary workflow and Faculty modal while retaining authoritative live checks. |
| `e2e/p03_student_auth.spec.ts` | Adjusts the expected real Student class-page heading. |
| `frontend/src/tests/retentionMonitoringContract.test.ts` | Adjusts the test selector to retained development sample-grade wording. |
| `spec.md` | Only the two exact Owner-approved additions: UI-003 shared Student projection and NTF-001 enrollment notices. |
| `tests/backend/faculty_class_contract_test.php` | Contract assertions for canonical active notice recipients and creation behavior. |
| `tests/backend/schedule_session_contract_test.php` | Regression assertion that clearing a mixed legacy schedule displays rooms without removed meeting times. |
| `tests/database/postgres_integration_test.php` | Persists and checks notice recipients, identity exclusions, no-op/reactivation deduplication, transaction rollback, canonical meetings, Student risk/year response and Secretary canonical/legacy links. |
| `e2e/colleague-regressions.spec.ts` (new) | Focused coverage for the repaired source regressions: Student data/state/navigation, Faculty risk/unlock, Secretary targeting/reasons/retry, desktop/phone context paths and development provenance. |
| Four transfer documents (new before this comparison) | Handoff, source/disposition review, stable contract and exact approved-spec amendment record. |

## Areas identical between implementations

Outside the inventoried runtime files, the active implementations retain the same authentication/MFA, account/invitation lifecycle, API clients and route definitions in the backend router, attendance timing/geofence/biometric machinery, grading formulas/transmutation, remediation assignment/attempt APIs, database schema/migrations, Docker/Compose runtime, dependency manifests/locks, assets and stylesheets. The JSX presentation differs in the listed pages; this is not a claim of pixel-for-pixel equivalence.

No source change rewrites the authoritative retention threshold or remediation engine. The source commit title mentions fixing Student creation; the changed code adds enrollment notification behavior to that handler, not a separate Student-name/validation/schema redesign. The colleague PDF's claims do not enlarge the actual 14-file source change set or authorize implementation.

## Finding record: Faculty midterm explanatory wording (subsequently corrected)

- File: `frontend/src/pages/faculty/RetentionMonitoring.tsx`, line 944.
- At comparison time both source and destination said: `Compute tentative midterm grades to evaluate at-risk students before final examinations.`
- Destination action at line 978 is `Unlock Midterm Watchlist`; the handler only calls the existing unlock API and refreshes data. The description can mislead Faculty into believing the button computes grades.
- The incomplete row at line 1006 also retains `Not computed yet`; `Assessments incomplete` would align it with the saved-data contract. These are presentation changes, not a new calculation policy.
- Proposed targeted plan at comparison time: replace the description with `Review server-calculated risk. Unlocking the selected class changes watchlist visibility only; missing assessment data remains incomplete.` Replace the incomplete row text with `Assessments incomplete`. Keep the existing action, API, risk calculation, completion/readiness and tests intact; run focused validation for the wording change.
- Owner explicitly approved this proposed correction on 2026-10-03. Both exact wording changes are applied. `scripts/check.ps1` exited 0, including production build/type checking, PHP/backend/documentation contracts and all 194 mocked browser tests. No new spec amendment or functional behavior change was introduced. The original comparison changed only documentation; this later follow-up changes the two approved labels.

## Validation and limits

- Current destination's carried-forward validation: 194 mocked browser tests, 68 frontend unit tests, frontend type checking and production build, PHP/backend/documentation contracts, nine styled Secretary focused checks, full PostgreSQL integration/migration/seed/backup-restore/health/log validation, nine live browser tests, and clean prior structured Codex autoreviews.
- Final integration used a guarded new isolated Compose project with existing images and no volume deletion; existing development/integration data was preserved. Full command/log evidence is recorded in the [handoff](HANDOFF_2026-10-03.md).
- This comparison did not run the source branch. Source failures above are static code findings; no source pass/fail runtime result or fresh dual-branch visual walkthrough is claimed.
- Runtime checks were not repeated for this documentation-only pass. Current implementation is unchanged from the tested tree. The reported wording defect is not disproved by passing behavioral tests or prior autoreview.
- Comparison report checked with whitespace and targeted path/reference checks. No new authoritative spec decision was added.

## Review references

- [Detailed transfer and approval history](lumbang-final-transfer-review.md)
- [Approved stable transfer contract](lumbang-transfer-contract-2026-10-03.md)
- [Exact approved specification amendments](spec-amendments-2026-10-03.md)
- [Final validation and working-tree handoff](HANDOFF_2026-10-03.md)
