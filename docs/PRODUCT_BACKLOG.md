# DentiSys Product Backlog

The Owner-approved list of open work, the standing rules every change follows, and a one-line record of finished items. Implemented behaviour is in [spec.md](../spec.md) and [features.md](features.md); the order of work is in the [roadmap](roadmap.md). Who does which kind of work, and how it is validated, is in [AGENTS.md](../AGENTS.md).

The backlog is not exhaustive. The Owner may add, clarify, remove or reprioritise requirements at any time, especially after manual testing. Omissions are not permission to invent behaviour: when uncertain, ask the Owner.

Item numbers are permanent; a finished item moves to [Done](#done) with its number.

---

# 1. Standing rules

- **Interface:** follow spec UI-001. New screens reuse the shared shell, sidebar/header, Card, table, modal, alert and form patterns; no role-specific shells, second design system or unrelated redesign.
- **Authoritative data (2.1, 6.1):** users, names, courses, sections, enrollments, assignments, invitations, grades, assessments, attendance, remedials, retention, notifications, audit events and operational settings come from the backend and PostgreSQL. Pure UI preferences (open/closed state, theme, collapsed sidebar) may stay in the browser. Mock fixtures stay isolated to automated tests, disposable integration environments and explicit development fixtures. Never reintroduce mock classes, grades, attendance or retention data on a Student, Faculty, Secretary or Dean screen. Gated prototype paths (`frontend/src/pages/student/studentGates.ts`) and development providers (`frontend/src/services/developmentProviders.ts`) remain; when a feature touches one, convert that feature only: find the browser or mock storage, the authoritative tables and the existing API, add the smallest backend contract needed, move the frontend to it, and keep deterministic test fixtures. No site-wide rewrite.
- **Manual-test data (2.2):** manual testing runs on database data, and every action can be checked in PostgreSQL. The development seed (`database/seeds/development-demo.sql`, accounts in [demo-accounts.md](demo-accounts.md)) and the integration fixtures (`tests/fixtures/live-stack.sql`) are kept realistic across all roles (Faculty, Students, courses, sections, assignments, enrollments, assessments, scores, attendance, invitation and retention states); a change that adds a data state the seed lacks extends the seed in the same commit.
- **Live Google verification (9.5):** automated Google tests are mocked. Live sign-in in a real browser is Owner-controlled; never request or store Owner credentials. If live testing finds a defect, scope the fix then.
- **iPhone checks (10.3):** every UI change that affects phones runs the Playwright WebKit iPhone sweep as part of its device check, and the Owner does a real-iPhone pass at 320 and 390 px per release. A real-device cloud is used only for a device-only bug.
- **Migrations:** ordered and additive, each tied to an approved requirement; no speculative or generic tables.
- **Definition of done:** database-backed data, role and ownership permissions, approved validation, required audit events and notifications, passing automated and integration tests, desktop and mobile checks, current-reference docs updated, and no change to unrelated behaviour. For data-changing workflows, confirm the database actually changed.
- **Email in tests:** testing must never email real or real-looking addresses: automated tests use mocks or Mailpit only, and manual checks need `EMAIL_PROVIDER=mailpit`, or `custom` with an `EMAIL_TEST_ALLOWLIST` of Owner-controlled addresses.

---

# 4. Dean

## 4.3 Faculty invitation row actions

**Status: Partial.** No token material reaches the browser (tested). The row actions are Edit, Revoke and Reissue; there is no View action, so Reissue is the main non-destructive action. Add a View/Eye action as the primary row action (a visible change: demo first).

## 4.5–4.7 Superadmin mode

**Status: Not started (planned; needs a spec section and a contract).** The Dean will get a Superadmin toggle, like the existing Secretary / Student view toggle, that switches the Dean into superadmin mode. Superadmin features:

- **4.5 Grade and attendance changes:** see and filter grade and attendance changes (for example to check grade tampering). The Dean's Audit Trail today hides class work ("Class work (grades, attendance, retention) is not shown here; it stays recorded").
- **4.6 Course catalog:** manage the course catalog. Today any Faculty member can add a course code when creating a class, no one can retire one, and test courses stay visible to the Dean.
- **4.7 Account deactivation (leaning, not decided):** deactivate or reactivate a Faculty or Student account (someone leaves, or an account is misused), with a list of all students and of each Faculty member's classes.

---

# 5. Faculty

## 5.1 Faculty Dashboard

**Status: Partial.** Server-backed; closes with 9.1.

Remove Quick Actions that repeat the sidebar and duplicate Assigned/Total Classes figures; keep warnings, operational status and at-a-glance information.

## 5.2 Grade Computation confirmations

**Status: Partial.** Save and discard of the grading schema are confirmed and tested. Confirmation on deleting a category, saving scores and recomputing grades, and the absence of confirmations on tabs, modals, course and filter selection and navigation, are not established.

Rule: confirm mutations, not interactions.

## 5.4 Remedial record details

**Status: Partial.** Attempts and notes are stored. A complete record (Student, Course, Section, original course grade, date, score, pass/fail, status, Faculty notes, completion date) is not shown to be returned or displayed together.

## 5.6 Large attendance lists

**Status: Partial.** Search and status filters exist; a sticky table header and a bounded scrolling area are not established.

Use search, filters, a sticky header, bounded scrolling and clear status controls. No virtualisation or pagination unless real data needs it.

## 5.7 Email Management filtering

**Status: Partial.** Search and roster filtering exist; filtering by Course, then Class Section, then Student is not established.

## 5.9 Class archiving follow-ups (CLS-003)

**Status: Not started.** Small gaps left after class archiving shipped:

- **Email Management:** Faculty can still email Students of a Cancelled or Created-by-mistake class.
- **Dean school-year dropdown:** can list a school year whose only classes are hidden (Cancelled or Created by mistake).
- **Grading setup:** the grading-configuration save and the grading snapshot work per course offering (course and school year), not per class, so they still include assessments of a Cancelled or Created-by-mistake class of the same offering.
- **Wording:** four client-side messages in Classes & Rosters (add student, edit class, remove student, edit roster student) still say "Past school-year classes are view-only." for archived classes. Archived cards disable those buttons and the server answers "Archived classes are view-only.", so this is wording only.

---

# 8. Login usability

## 8.1 Field validation and password controls

**Status: Partial.** Activation, reset and login have validation, password visibility toggles and requirements that mirror the backend policy. The remaining data-entry fields have not been checked one by one.

## 8.2 2FA settings confirmation hardening

**Status: Not started.** Regenerating recovery codes and turning 2FA off confirm with an authenticator code but have no handler-level attempt limit, and recovery-code regeneration writes no audit event.

Both actions get the existing per-user limit used for name-change confirmation, 10 attempts per 5 minutes. Whether to audit recovery-code regeneration is on hold for the Owner.

---

# 9. Known issues

## 9.1 Faculty class counts

**Status: Unclear.** Not reproduced. Reported: Classes & Rosters current-school-year count/filter mismatch, and Dashboard versus Classes & Rosters class-count mismatch. Decide by comparing both counts against the database for one Faculty account.

## 9.2 Grade Computation tab strip on phones

**Status: Unclear.** Reported as needing horizontal scrolling; no automated phone-width check exists. Decide with a mobile-width browser check.

## 9.3 Build warnings

**Status: Unclear (non-blocking).** The frontend build warns about an ineffective dynamic import of `frontend/src/services/apiClient.ts` and a chunk larger than 500 kB. The Owner decides whether these need work.

## 9.4 Official grade sheet export in the BU format

**Status: Not started (Owner will scope it).** Official imports (class list PDF, grade sheet workbook) and the official grade sheet export ([contract](contracts/official-exports.md)) exist. The export must be made compatible with the BU format; the Owner defines the format when this work starts.

## 9.7 Wording decisions

**Status: Decided; not built.** The Owner's choices:

- **Product name:** "DentiSYS" in the interface (sidebar, page-title fallback, sign-in pages, email sender "via DentiSYS Portal", About links).
- **Student number:** "Student Number" on desktop; "Student No." only in tight columns. "Student ID" labels for the same field change to match.
- **Student column:** "Student Details" ("Student Info" in `GradebookMatrix.tsx` changes).
- **Top role:** "Dean" ("The Admin invitation" in `FacultyInvitation.tsx` and other "Admin" labels change).
- **Teacher role:** "Faculty" ("Course Instructor" on the About page and "Instructor" on Student class cards change).
- Not decided: only 6 of 41 tables show their column headers in small capitals; the rest use normal text.

## 9.9 Full Matrix View Excel export

**Status: Not started.** The matrix export does not include the Show computation steps (% and Transmuted per assessment, category Average % and Weighted). The export must match what the matrix computes today.

---

# 10. Ticket batch 1 — remaining items

## 10.5 Password reveal control in GoogleLinkCard

**Status: Not started.** `GoogleLinkCard`'s confirm-password field lacks a reveal control and its label. The login fields intentionally have no maximum length so existing passwords keep working.

## 10.6 Import wording and fixture

**Status: Not started.** The public landing page advertises "PDF / Excel roster import", but the roster importer accepts PDF, CSV, TSV and TXT; Excel (.xlsx) is the grade sheet import format. Fix the landing copy. The "partially readable grade-sheet workbook" case (found + zero counts) has no crafted official-layout fixture in the test suite; add one when touching this area. Never use real class lists or the Owner's workbook for fixtures.

## 10.7 Phone-width layout pass

**Status: Not started.** Student Profile, Face Registration and the measured retention-row overlap need their own phone-width pass.

## 10.8 Session card states

**Status: Not started (visual verification only).** The three-zone session card ("Sessions", "Start session", "Schedule session") is implemented. Verify the Scheduled and View-only pill variants with seeded states and review the desktop spacing.

---

# 11. Configuration and code defects found by the docs audit

**Status: Not started.** Found while syncing the docs to the code (record: [docs sync changes](archive/docs-sync-changes-2026-11.md)).

- **11.1** `SHOW_DEV_RESET_LINK` and `SHOW_DEV_INVITATION_LINK` are read by the backend (`backend/app/config.php`) but no Compose file forwards them, so setting them in `.env` does nothing.
- **11.2** `docker-compose.web.yml` requires every biometric value, model path and hash even when biometrics are off; the single-server start scripts check only 8 keys, so placeholders pass the script and fail later in Compose.
- **11.3** `APP_TIMEZONE`, `SMTP_CA_FILE` and the biometric timeout values cannot be set on single-server or VPS (not forwarded by `docker-compose.web.yml`).
- **11.4** The unused route `/api/faculty/retention/watchlist/unlock` and `unlockFacultyWatchlistApi` remain although the screen has no unlock.
- **11.5** `backend/app/attendance_sessions.php` still checks "under 24 hours" beside the 12-hour session cap.

---

# Done

Full text and Owner decisions of these items: [backlog items closed before 2026-11-14](archive/backlog-done-2026-11.md).

- **3.1** Read-only profiles with a Change Name action for every role.
- **3.2** Authenticator confirmation for name changes.
- **4.1** Dean My Activity: dropped; the Audit Trail role filter covers it.
- **4.2** Dean Dashboard: server-backed metrics, no Quick Actions block (tested).
- **4.4** Dean Settings: no Course Component Ratios or Retention Standard setting (tested).
- **5.3** Midterm Watchlist offers no remedial action; the server refuses remedial without a final grade (tested).
- **5.5** Future worksheet dates: sessions can be scheduled or viewed, not recorded.
- **5.8** Email History built from the outbox, one row per send action.
- **5.11** Client requests: cost-recovery remedials implemented; the remove-student error was not reproduced.
- **7.1** Secretary Dashboard: no Quick Actions; status, alerts and pending work remain (tested).
- **7.2** Manual Override filtering: date, then session, then records; revoked sessions view-only.
- **9.6** November 2026 polish-audit UI follow-ups.
- **9.8** Shared tab bar standard (white card bar and grey list switch).
- **9.9 (part)** Full Matrix View loads all scores in one request per class; Show computation at every width.
- **10.1** T1 transmutation: fixed formula, optional per assessment, new assessments start with it on.
- **10.2** T4 Full Matrix View unsaved scores kept in the tab and offered back after a forced sign-out.
- **10.4** T8 + T11 grading clarification: course-level remedial, two attempts at 75%, cost recovery.
- **10.9** T9 session restored after closing the browser: intended behaviour.
