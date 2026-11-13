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

---

# 8. Login usability

## 8.1 Field validation and password controls

**Status: Partial.** Activation, reset and login have validation, password visibility toggles and requirements that mirror the backend policy. The remaining data-entry fields have not been checked one by one.

## 8.2 Audit event for recovery-code regeneration

**Status: On hold for the Owner.** Regenerating recovery codes writes no audit event. Whether to add one is the Owner's decision.

---

# 9. Known issues

## 9.1 Faculty class counts

**Status: Cause found; needs an Owner decision.** The Dashboard counts current-year classes archived as Finished (`handle_faculty_dashboard_kpis` keeps `archive_reason = 'finished'`), while Classes & Rosters moves them to its Archived tab and counts only classes with no archive reason. The Dashboard also requires status Active, which Classes & Rosters does not (no code path sets another status today). Classes & Rosters has no school-year selector, so its Assigned tab is always the current year. Decide which count is right before aligning them.

## 9.3 Main bundle size

**Status: Needs an Owner decision (non-blocking).** The frontend build warns that the main chunk is about 2.3 MB (565 kB gzipped): every page, recharts and the spreadsheet library ship in it. Splitting it means loading pages on demand (`React.lazy` per route in `App.tsx`), a new pattern for this app.

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

## 10.6 Import wording and fixture

**Status: Not started.** The public landing page advertises "PDF / Excel roster import", but the roster importer accepts PDF, CSV, TSV and TXT; Excel (.xlsx) is the grade sheet import format. Fix the landing copy. The "partially readable grade-sheet workbook" case (found + zero counts) has no crafted official-layout fixture in the test suite; add one when touching this area. Never use real class lists or the Owner's workbook for fixtures.

## 10.7 Phone-width layout pass

**Status: Not started.** Student Profile, Face Registration and the measured retention-row overlap need their own phone-width pass.

## 10.8 Session card states

**Status: Not started (visual verification only).** The three-zone session card ("Sessions", "Start session", "Schedule session") is implemented. Verify the Scheduled and View-only pill variants with seeded states and review the desktop spacing.

---

# 11. Configuration and code defects found by the docs audit

**Status: Needs an Owner decision.** Found while syncing the docs to the code (record: [docs sync changes](archive/docs-sync-changes-2026-11.md)).

- **11.5** `backend/app/attendance_sessions.php` checks "under 24 hours" beside the 12-hour session cap. The 24-hour check is not redundant: it is what rejects a session whose class end equals its opening time (zero length), which the 12-hour check does not catch. Decide whether a zero-length session is rejected by its own rule (then the 24-hour wording can go) or the check stays as it is.

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
- **5.9** Class archiving gaps: Cancelled and Created-by-mistake classes are excluded from Email Management, school-year lists and offering-wide grading; archived-class messages match the server.
- **5.11** Client requests: cost-recovery remedials implemented; the remove-student error was not reproduced.
- **7.1** Secretary Dashboard: no Quick Actions; status, alerts and pending work remain (tested).
- **7.2** Manual Override filtering: date, then session, then records; revoked sessions view-only.
- **8.2 (part)** Recovery-code regeneration and turning 2FA off are limited to 10 attempts per 5 minutes per user.
- **9.2** Grade Computation tab strip on phones: no horizontal scrolling at 320–390 px; the shared section tabs wrap with short names.
- **9.3 (part)** The ineffective dynamic import of `apiClient` is gone.
- **9.6** November 2026 polish-audit UI follow-ups.
- **9.8** Shared tab bar standard (white card bar and grey list switch).
- **9.9 (part)** Full Matrix View loads all scores in one request per class; Show computation at every width.
- **10.1** T1 transmutation: fixed formula, optional per assessment, new assessments start with it on.
- **10.2** T4 Full Matrix View unsaved scores kept in the tab and offered back after a forced sign-out.
- **10.4** T8 + T11 grading clarification: course-level remedial, two attempts at 75%, cost recovery.
- **10.5** GoogleLinkCard confirm-password field has the standard show/hide control and a screen-reader label.
- **10.9** T9 session restored after closing the browser: intended behaviour.
- **11.1–11.4** Docs-audit defects: development show-link flags forwarded, single-server start scripts check every required biometric key, timezone/CA/biometric timeouts settable on single-server and VPS, unused watchlist-unlock route removed.
