# Implementation plan: user evaluation batch 1 (backlog 13.1–13.4) — November 2026

Written 2026-11-18 at `lighthal9-responsive` e60d3c4 for a separate implementation session at medium effort. Source and analysis: [user-evaluation-2026-11.md](user-evaluation-2026-11.md). Progress is tracked in the [product backlog](../PRODUCT_BACKLOG.md) section 13, not in this file (dated record, not edited afterwards).

## 1. Difficulty and readiness of every item

| Group | Items | Why |
|---|---|---|
| **Ready, easy** (no code) | 13.1 face data security answer (~30 min); 13.4 speed and capacity measurement (~1 h) | Facts are verified; nothing to decide. |
| **Ready, medium** (code) | 13.2 remedial email never automatic (~2–3 h); 13.3 report generation (~1.5–2 days) | Owner decisions taken 2026-11-18 (section 2). |
| **Waiting on an Owner decision** | 13.5 Retention Monitoring (~1 day); 13.10 paper wording | Short answers from the Owner; plan them in a later batch. |
| **Waiting on outside information** | 13.6 Sessions filter; 13.7 confirmation pop-ups; the client's "fix the export" detail inside 13.3 | Faculty steps, screenshot or list; bug rules forbid fixing a guess. |
| **Large, needs spec work and `/grill-me`** | 13.8 grade submission and Dean approval (4–7 days); 13.9 Dean and Superadmin split (3–5 days) | New requirements; 13.9 reverses the Owner's 12.1 ruling. |

This plan covers the two ready groups. Order: **13.1 → 13.4 → 13.2 → 13.3**. 13.4 goes second so the benchmark measures the demo before this batch's deploys.

## 2. Owner decisions (2026-11-18)

- 13.2: the EML-001 wording below is **approved**; the automatic in-app notice to the Student **stays**; the Retention save message **offers "Preview and send notice"**.
- 13.3: **build now** with the recommended layout (section 6); client feedback adjusts it later. The spec and contract wording for 13.3 is not yet approved: show it to the Owner before applying it.

## 3. Rules for the implementing session

- Branch `lighthal9-responsive`. Commit per item when its checks pass; author Light505, no Co-Authored-By or session trailer lines. Push only when the Owner says so.
- Follow `CLAUDE.local.md`: Claude writes trivial one-file edits itself; multi-file work, new logic and tests go to a subagent (`sonnet` for 13.2 and 13.3) with a brief naming the contract, spec rules, files, and focused checks. Review the diff, not the subagent's summary.
- Bugs (13.3 part A): a failing test first, at the layer that broke (`tests/backend` or `tests/database` for server bugs, never the mocked `e2e/*.spec.ts`), then the fix.
- Visible changes get a demo before the Owner approves them (`ui-fix-demo` for looks; a behaviour Artifact for flows). Keep one demo per screen.
- Current-reference docs change in the same commit as the behaviour (`spec.md`, `docs/features.md`, contracts). Run `git diff --check` and the documentation contract after doc edits.
- Gates before a demo publish: `./scripts/check.ps1`; plus `./scripts/check-postgres.ps1` because 13.2 and 13.3 change backend files. Then the demo deploy steps in `CLAUDE.local.md` ("Demo deploy and test"). Never touch production.
- Encoding: write files with the Write/Edit tools or `pwsh`, never `powershell.exe` (see `CLAUDE.md`).

## 4. 13.1 Face data security answer (ready, easy)

**Goal:** a written answer to Facial Recognition 2 for the faculty and the defense.

**Verified facts** (re-check each before writing; cite file and line):
- The stored face reference (SFace embedding) is encrypted with AES-256-GCM: `biometric-sidecar/app.py` `encrypt_model` / decrypt (around lines 407–417), with the reference id as associated data.
- The 32-byte key comes from the server environment `BIOMETRIC_STORAGE_KEY_B64` (`storage_key()`, around line 118); it is not in Git, the database or the browser (spec BIO-004).
- PostgreSQL holds only profile metadata and an opaque reference; raw photos and frames are discarded after processing (spec BIO-003).
- Backups exclude the biometric volume: `scripts/backup-vps.sh` line 48, `docs/vps-deployment.md` around line 558.
- The sidecar has no published port; only the PHP container reaches it (`docs/biometric-attendance-decisions.md`).
- Hashing is not used and cannot be: matching compares two similar but never identical embeddings, while a hash only matches exact copies. Protection is by encryption, access restriction, deletion of raw images and revocation/re-enrolment (BIO-005).

**Steps:**
1. Add a short section "Is face data hashed or encrypted?" to `docs/biometric-attendance-decisions.md` in plain language with the facts above and the ISO/IEC 24745 reference from BIO-004 (no compliance claim).
2. Give the Owner a 5–8 sentence reply text in chat to forward to the faculty.
3. `git diff --check`, documentation contract, commit `docs(biometrics): explain how face data is protected (13.1)`, move 13.1 to Done in the backlog.

## 5. 13.4 Speed and capacity measurement (ready, easy)

**Goal:** numbers for Facial Recognition 1, Attendance 3 and General 1, at the current demo sha, before this batch's deploys.

**Steps:**
1. Read `docs/benchmark.md`. Run `./scripts/benchmark.ps1 -Target demo -Compare benchmarks/results/20261104-150832-demo-3ee9ab0.json` in the background (~12 min). If the activity check refuses because someone used the demo in the last 15 minutes, wait; use `-Force` only with the Owner's OK. Never production.
2. Write a one-page plain-language result in the backlog item or for the Owner in chat: page response times at 1/5/10/25/50 users, error rate, sign-in time, face check-in time at 1/2/4 students at once, and the change since 2026-11-04 (the 9.20 face fixes are in between).
3. Ask the Owner to ask the faculty when they tested and which step was slow. Optimisation is a separate, later item; do not optimise in this batch.
4. Commit the new results file if the script stores one under `benchmarks/results/` (`chore(benchmark): demo run after the face fixes (13.4)`).

## 6. 13.2 Remedial email never sent automatically (ready, medium)

**Approved spec change (EML-001):** replace the sentences from "A Remedial notice is sent automatically after …" through "… shown in Email Management for the matching attempt and date. Faculty may still preview and explicitly send a Remedial notice from Email Management as a retry." with:

> A Remedial notice is never sent automatically. Faculty send it from Email Management → Remedial: they select students with a current-school-year pending attempt that has a scheduled date, preview the personalized message and recipient list, then explicitly send. The notice includes the course, attempt number and current scheduled date. Each attempt shows whether a notice was sent for its current date.

Keep the rest of EML-001 (server revalidation, canonical email, delivery modes). Add to its History line: "2026-11-18 Remedial notices sent only from Email Management".

**Today (verified):**
- `backend/controllers/FacultyController.php` `handle_faculty_retention_remedial_save`: `$shouldAutoSendRemedialNotice` (around line 7473) and the call to `faculty_send_remedial_schedule_email` after the commit (around line 7547); the response carries `emailDelivery`.
- `faculty_send_remedial_schedule_email` (around line 6788) has no other caller. `faculty_remedial_email_subject` and `faculty_remedial_email_class_label` are also used by the retention list status lookup (around line 6938) and the explicit send (around line 7813): keep those two.
- The in-app notice (`notification_create_idempotent`, around line 7530) stays as it is.
- The explicit send already exists: Email Management → Remedial Notices tab → preview → `sendFacultyEmailApi({ emailType: 'Remedial Notice' })`, handled around line 7724.
- Per-attempt status already exists: `remedialNoticeStatus` is looked up by email subject, which contains the scheduled date, so a changed date shows "Email not sent" again (`EmailManagement.tsx` around lines 1085–1102). No new status field is needed.
- `frontend/src/pages/faculty/RetentionMonitoring.tsx` (around lines 690–697) and `EmailManagement.tsx` `handleSaveRemedialDate` (around lines 482–495) read `emailDelivery` from the save response.
- Email Management keeps its tab in component state (`useState<Tab>('student_invites')`, line 131); there is no deep link yet.

**Contract:**
- `POST /api/faculty/retention/remedial` never sends email and no longer returns `emailDelivery`. Everything else in the response is unchanged.
- Retention Monitoring, after a successful save of a pending attempt with a scheduled date, shows the success message with a "Preview and send notice" action. It opens Email Management on the Remedial Notices tab with that enrollment ticked, so one more select is not needed; the Faculty still opens the preview and presses Send. A save without a date, or an outcome save, shows no action.
- Deep link: `/email-management?tab=remedial&enrollment=<enrollmentId>`. Unknown or ineligible ids are ignored; the tab still opens. The query is read once on load.
- Email Management's own date save says "Remedial exam date saved. The notice has not been sent; select the student and choose Preview to send it." (formal wording, UI-001: no "Please", no contractions).

**Tests:**
- Backend or database test (where the remedial save is already covered; `tests/database/postgres_integration_test.php` has remedial cases around line 3271): saving a new pending attempt with a date, and changing its date, writes no `email_outbox` row of type `Remedial Notice`, and the in-app notification is still created. Write it first and see it fail.
- Mocked e2e (`e2e/faculty.spec.ts`): the Retention save message shows "Preview and send notice"; following it opens the Remedial Notices tab with the student ticked; nothing is sent until Send in the preview. Add any new mocked GET to `e2e/fixtures.ts`.

**Docs:** `spec.md` EML-001; `docs/features.md` (Email Management and remedial lines); `docs/deploy-from-scratch.md` line 147 stays true.

**Demo:** a behaviour demo per `CLAUDE.local.md` (Before / After switch: save → message → Preview and send notice → preview → Send; "Saved on the server" panel showing no email on save). Owner approves before commit.

**Commit:** `feat(email): remedial notices are sent only from Email Management (13.2)`.

## 7. 13.3 Report generation (ready, medium; three parts)

Paper objective 1.2: comprehensive grading sheets (covered by Grade Computation's official workbook and the Faculty Reports five-sheet bundle), attendance sheets, and summaries of students that require remedial action.

### Part A — check the current exports (first, ~2 h)

1. Export every current report from the development seed (Faculty: Grade Computation workbook, Reports Grades & Assessments bundle and PDF, Retention, Attendance; Dean: Students, Retention, Attendance; Classes & Rosters class list) and list what looks wrong. Bring the list to the Owner; the client's "fix the export" answer may match one of them.
2. **Suspected bug 1, Dean remedial data source:** `handle_admin_reports_summary` (`backend/controllers/AdminController.php` around lines 683–780) builds `remedialExams` from the legacy `remedial_state_json` and `enrollment_remedial_states`, while current remedial attempts are saved in `enrollment_remedial_attempts`. Write a database test: save an attempt through the current remedial save, then the Dean summary should show it. If it fails, it is a real bug: fix the summary to read the attempts (reuse `remedial_attempts_*` helpers from `backend/app/remedial_attempts.php`).
3. **Suspected bug 2, Dean export grade:** `frontend/src/pages/admin/SystemAudit.tsx` `gradeOf` (around line 297) falls back to the student's first subject or overall GWA when no class is selected, under one "Grade" column. Reproduce with a unit or mocked test first; agree the fix with the Owner (likely: one row per enrollment with its own course grade).
4. Each proven bug: its own commit, `fix(reports): …`.

### Part B — attendance sheet (~1 day)

**Recommended layout (approved to build; show the exact spec/contract text to the Owner before applying):**
- One class for its whole term. Rows: students, `LAST, First Middle`, sorted by last name, numbered. Columns: every non-revoked session in date order; header = date (`Nov 15`), plus the opening time when a date has more than one session. Cell: `P`, `L`, `A`, `E`, or blank while unresolved.
- Totals per student: Present, Late, Absent, Excused, and Attendance rate = (Present + Late + Excused) ÷ resolved sessions (ATT-006 rates; revoked sessions never count, ATT-001).
- iBU look like every export (`buildReportSheet` and `utils/xlsxDownload`; title rows like X3), and a print/PDF view like the other report sections (`components/PrintSheet`).
- Faculty Reports → Attendance tab: "Export attendance sheet" (Excel) and print/PDF, for the selected class. Dean Reports → Attendance tab: the same, enabled when one class is selected. Existing per-date exports stay.
- File: `<Course>_<Section>_Attendance_Sheet_<School year>_<Semester>.xlsx`.

**Data:** today Faculty attendance loads one date per request (`getFacultyAttendanceWorksheetApi`; `Reports.tsx` `loadReportAttendance`), and the Dean summary returns records without a session id. Add one read-only endpoint per role that returns the class's sessions (id, date, opening time, status) and its attendance records (enrollment, session id, status) for the term, authorised like the existing class attendance reads: Faculty for their classes, the Dean for any class. One shared PHP function, two routes. Revoked sessions excluded. Test both authorisation and the data (`tests/backend` or `tests/database`).

**Spec and docs:** add the attendance sheet to the export paragraph of GRD-002 and a new rule in `docs/contracts/official-exports.md` (after X28); `docs/features.md` line 44.

### Part C — remedial summary (~½ day)

**Recommended layout:**
- Only enrollments that need remedial action: completed final course grade 2.5–4.9 (Remedial) and 5.0 (shown as "Irregular reenrollment", UI-003), current school year by default with the page's school-year filter.
- Columns: Student No., Student Name (`LAST, First Middle`), Course Code, Class Section, Final Grade, Attempt 1 (date, %, Pass/Fail or Pending), Attempt 2 (same), Cost Recovery (grade, result), Status (current stage, e.g. "Attempt 1 pending", "Passed", "Cost recovery required", "Irregular reenrollment").
- Faculty Reports → Retention tab: "Export remedial summary" (Excel + print/PDF) for the Faculty's classes, built from `getFacultyRetentionApi` (`remedialProgression`, `gwa`, `subjectCode`, `className`); no new endpoint. Dean Reports → Retention tab: the same for all classes, after part A's data-source fix. The existing Retention exports stay.
- File: `Remedial_Summary_<School year>.xlsx`.

**Spec and docs:** same places as part B.

### Demo, tests, commits

- New buttons and sheets are visible: `ui-fix-demo` stage 1 for the button placement, plus sample files from the seed for the Owner to open. Owner approves before commit.
- Unit tests for the sheet builders (row order, P/L/A/E, totals, rate, blanks for unresolved, no revoked sessions; remedial columns and filtering), mocked e2e for the buttons, backend tests for the new endpoint and its authorisation.
- Commits: `feat(reports): attendance sheet per class for the term (13.3)`, `feat(reports): remedial summary export (13.3)`.

## 8. After the batch

- Gates, demo publish, demo test, report to the Owner with the tested sha and `.\scripts\promote-prod.ps1 -Sha <sha>` (`CLAUDE.local.md`).
- Move finished items to Done in the backlog; update the roadmap; rewrite the `dentisys-current-state` memory note.
- Next batch candidates: 13.5 and 13.10 once the Owner decides; 13.6, 13.7 and the client's export detail once the information arrives.
