# DentiSys Product Backlog

> **Status:** Living Owner-approved backlog of open work, checked against the code on `lighthal7` on 2026-10-07.

This file lists only work that is **Partial**, **Not started** or **Unclear**. Implemented behaviour is in [spec.md](../spec.md) and [features.md](features.md); the order of work is in the [roadmap](roadmap.md). Who does which kind of work, and how it is validated, is in [AGENTS.md](../AGENTS.md).

The backlog is not exhaustive. The Owner may add, clarify, remove or reprioritise requirements at any time, especially after manual testing. Omissions are not permission to invent behaviour: when uncertain, ask the Owner.

---

# 1. Standing rules

- **Interface:** follow spec UI-001. New screens reuse the shared shell, sidebar/header, Card, table, modal, alert and form patterns; no role-specific shells, second design system or unrelated redesign.
- **Authoritative data:** users, names, courses, sections, enrollments, assignments, invitations, grades, assessments, attendance, remedials, retention, notifications, audit events and operational settings come from the backend and PostgreSQL. Pure UI preferences (open/closed state, theme, collapsed sidebar) may stay in the browser. Mock fixtures stay isolated to automated tests, disposable integration environments and explicit development fixtures.
- **Migrations:** ordered and additive, each tied to an approved requirement; no speculative or generic tables.
- **Definition of done:** database-backed data, role and ownership permissions, approved validation, required audit events and notifications, passing automated and integration tests, desktop and mobile checks, and no change to unrelated behaviour. For data-changing workflows, confirm the database actually changed.

---

# 2. Data and environment

## 2.1 Remove remaining browser and mock business data

**Status: Partial.** The main Faculty, Secretary and Student surfaces use server APIs. Gated prototype paths (`frontend/src/pages/student/studentGates.ts`) and development providers (`frontend/src/services/developmentProviders.ts`) remain.

Convert one feature at a time: find the browser or mock storage, the authoritative tables and the existing API; add the smallest backend contract needed; move the frontend to it; keep deterministic test fixtures. No site-wide rewrite.

## 2.2 Manual-test dataset

**Status: Partial.** The first-Dean bootstrap is implemented. Integration fixtures exist (`tests/fixtures/live-stack.sql`), but there is no maintained PostgreSQL dataset that covers manual browser testing across all roles.

Maintain a realistic development dataset (Faculty, Students, courses, sections, assignments, enrollments, assessments, scores, attendance, invitation and retention states) so manual testing runs on database data and every action can be checked in PostgreSQL.

---

# 3. Profiles and names (all roles)

## 3.1 Read-only profiles with a Change Name action

**Status: Done.** All four roles use the shared Change Name action; self-service rejects identity-critical fields and activated Students own their name changes.

## 3.2 Authenticator confirmation for name changes

**Status: Done.** Authenticator-app MFA requires a rate-limited, single-use TOTP confirmation; recovery codes are rejected.

---

# 4. Dean / Admin

## 4.1 Dean My Activity

**Status: Dropped (Owner, 2026-10-15).** The Dean's Audit Trail already shows the Dean's own actions through its role filter, with better filters than Faculty and Secretary My Activity. No separate page.

## 4.2 Dean Dashboard

**Status: Partial.** Metrics are server-backed; no test checks that the redundant items are gone.

Keep meaningful at-a-glance information; remove Quick Action buttons that only repeat the sidebar.

## 4.3 Faculty invitation row actions

**Status: Partial.** The invitation lifecycle is implemented. No test shows that View/Eye is the primary row action instead of Reissue, or that no token material reaches the browser.

## 4.4 Dean Settings cleanup

**Status: Partial.** No test shows that both settings are gone.

Remove **Course Component Ratios** and **Retention Standard**. Do not add replacement settings; the page may stay sparse.

## 4.5 Dean view of grade and attendance changes (walkthrough D12, spec question P6)

**Status: Unclear.** Waiting on the Owner's group discussion (2026-10-28).

The Dean's Audit Trail hides class work ("Class work (grades, attendance, retention) is not shown here; it stays recorded"). Decide whether the Dean can see or filter grade and attendance changes, for example to check grade tampering. Then add the spec line before building.

## 4.6 Course catalog control (walkthrough F14, spec question P7)

**Status: Unclear.** Waiting on the Owner's group discussion (2026-10-28).

Any Faculty member can add a course code when creating a class, and no one can retire one; test courses stay visible to the Dean. Decide whether the Dean manages the catalog (Faculty pick from it) or the Dean can retire codes. Then add the spec line before building.

## 4.7 Account deactivation (walkthrough D5, spec question P5)

**Status: Not started.** Backlogged by the Owner (2026-10-28).

The Dean cannot deactivate or reactivate a Faculty or Student account (someone leaves, or an account is misused), and has no list of all students or of each Faculty member's classes. Needs a spec line and a contract before building.

---

# 5. Faculty

## 5.1 Faculty Dashboard

**Status: Partial.** Server-backed; the class-count mismatch in 9.1 is still open.

Remove Quick Actions that repeat the sidebar and duplicate Assigned/Total Classes figures; keep warnings, operational status and at-a-glance information.

## 5.2 Grade Computation confirmations

**Status: Partial.** Save and discard of the grading schema are confirmed and tested. Confirmation on deleting a category, saving scores and recomputing grades, and the absence of confirmations on tabs, modals, course and filter selection and navigation, are not established.

Rule: confirm mutations, not interactions.

## 5.3 Midterm Watchlist cannot assign remedial

**Status: Partial.** The server only allows remedial from final-grade eligibility. No test shows that the Midterm Watchlist itself offers no remedial action.

During Midterm, students may appear as **At Risk**; no remedial can be offered or assigned.

## 5.4 Remedial record details

**Status: Partial.** Attempts and notes are stored. A complete record (Student, Course, Section, original course grade, date, score, pass/fail, status, Faculty notes, completion date) is not shown to be returned or displayed together.

## 5.5 Attendance worksheet date

**Status: Done.** Under ATT-001 (2026-10-01), a future Asia/Manila date may be selected to schedule or view sessions, but attendance cannot be recorded for it. Backend unit, PostgreSQL integration and mocked E2E tests cover this.

## 5.6 Large attendance lists

**Status: Partial.** Search and status filters exist; a sticky table header and a bounded scrolling area are not established.

Use search, filters, a sticky header, bounded scrolling and clear status controls. No virtualisation or pagination unless real data needs it.

## 5.7 Email Management filtering

**Status: Partial.** Search and roster filtering exist; filtering by Course, then Class Section, then Student is not established.

## 5.8 Email History from the outbox

**Status: Done (2026-10-15).** Email History groups each send action from the outbox (migration 047) with per-recipient status and failure reasons; the Dean's Faculty invitations have their own history.

Build Email History from the email outbox/delivery records and relevant audit events, not a separate log.

Owner decisions (2026-10-08): include every email actually sent; each user sees only the emails they sent; one row per action that expands to its recipients with per-recipient delivery status; show only what is needed (action, recipients, status, time, failure reason), never the email body; view-only, no resend; emails sent before the outbox link existed are hidden. Open: whether purely automatic emails (no human sender) appear anywhere — proposed: not shown.

Owner decisions (2026-10-15, demo approved: [Email History Demo](https://claude.ai/artifact/BCMUpwpEDC85EjtiWDw3L8)): these replace the "hidden" rule above — emails sent before action grouping exists stay visible, each as its own one-recipient action. Columns are Action, Recipients, Status (per-status counts), Date sent; the Subject column is removed; opening an action lists each recipient with status and, when failed, the failure reason. The tab counter counts actions; the last 100 actions load with all their recipients. The Dean's Faculty invitations (send, reissue, email correction) are recorded in the outbox and listed in an "Email history" card on the Faculty Invitations page, below Invitation status; the Dean's history starts with the first invitation after deploy. Automatic emails (password reset, first-Dean invitation) are not shown anywhere.

Testing must never email real or real-looking addresses (spam risk): automated tests use mocks or Mailpit only, and manual checks need `EMAIL_PROVIDER=mailpit`, or `custom` with an `EMAIL_TEST_ALLOWLIST` of Owner-controlled addresses.

## 5.9 Class archiving follow-ups (CLS-003)

**Status: Not started.** Small gaps left after class archiving shipped (2026-10-22); the Owner will decide each one.

- **Email Management:** Faculty can still email Students of a Cancelled or Created-by-mistake class.
- **Dean school-year dropdown:** can list a school year whose only classes are hidden (Cancelled or Created by mistake).
- **Grading setup:** the grading-configuration save and the grading snapshot work per course offering (course and school year), not per class, so they still include assessments of a Cancelled or Created-by-mistake class of the same offering.
- **Wording:** four client-side messages in Classes & Rosters (add student, edit class, remove student, edit roster student) still say "Past school-year classes are view-only." for archived classes. Archived cards disable those buttons and the server answers "Archived classes are view-only.", so this is wording only.

## 5.11 Client requests waiting on information

**Status: Unclear.** Blocked until the client answers.

- **Cost recovery remedials:** implemented under the 2026-11-13 clarification. The API accepts one-decimal grades; 2.4 passes and 2.5–5.0 fail. The cost-recovery program itself remains outside DentiSys; the app records the status, grade and result.
- **Remove-student error:** not reproduced; the client was asked for the exact message shown.

---

# 6. Student

## 6.1 Student Dashboard data

**Status: Partial.** Dashboard, classes and retention read server data; gated prototype and development paths remain (see 2.1).

Do not reintroduce mock classes, grades, attendance or retention information.

---

# 7. Secretary

## 7.1 Secretary Dashboard

**Status: Partial.** Server-backed status exists; no test checks that the redundant items are gone.

Remove redundant information and Quick Actions that repeat the sidebar; keep operational status, attendance information, alerts and pending work.

## 7.2 Manual Override filtering

**Status: Done (2026-10-15).** Date, then session, then records on both screens; revoked sessions are view-only and hidden by default; Overridden and Recorded by filters added.

Add filters for attendance status, overridden/original state and Student search, so users never scroll an unbounded list to reach a record.

Owner decisions (2026-10-08): applies to both the Faculty and Secretary override screens; a single date, then a session on that date, then its records; Student search by name/surname or student number; filters for status, overridden/original and how attendance was recorded (biometric, Faculty manual, Secretary manual); revoked sessions are hidden by default, shown labelled Revoked and view-only when included, never overridable (check current behaviour first and ask before changing it); no pagination — a bounded scrolling list with a sticky header.

Owner decisions (2026-10-15, demo approved: [Revoked Sessions Demo](https://claude.ai/artifact/VuauttgUzBW7gCd5WFgnnr)): the server refuses every attendance write aimed at a revoked session ("This session was revoked. Its attendance is view-only."). Both session pickers hide revoked sessions behind a "Revoked sessions: Hide / Show (n)" switch in the Pin-switch design (default Hide, not remembered); shown sessions keep the lowercase status "revoked"; switching to Hide closes an open revoked session. An open revoked session is view-only (no Override, no Mark-all) on both screens, and the Secretary also sees its saved records. A date with only revoked sessions says how many are hidden. The Faculty session picker also appears whenever the date has a revoked session. The Secretary "All recorded results" option is removed; the worksheet opens on the live session, otherwise "Choose a session". New filters on both screens: Overridden (All / Overridden / Original) and Recorded by (All / Biometric / Faculty manual / Secretary manual).

---

# 8. Login usability

## 8.1 Field validation and password controls

**Status: Partial.** Activation, reset and login have validation, password visibility toggles and requirements that mirror the backend policy. The remaining data-entry fields have not been checked one by one.

## 8.2 2FA settings confirmation hardening

**Status: Not started.** Regenerating recovery codes and turning 2FA off confirm with an authenticator code but have no handler-level attempt limit, and recovery-code regeneration writes no audit event.

Owner decisions (2026-10-15): both actions get the existing per-user limit used for name-change confirmation, 10 attempts per 5 minutes. Whether to audit recovery-code regeneration is on hold for the Owner.

---

# 9. Known issues and external blockers

## 9.1 Faculty class counts

**Status: Unclear.** Not reproduced in the audit. Reported: Classes & Rosters current-school-year count/filter mismatch, and Dashboard versus Classes & Rosters class-count mismatch. Decide by comparing both counts against the database for one Faculty account.

## 9.2 Grade Computation tab strip on phones

**Status: Unclear.** Reported as needing horizontal scrolling; no automated phone-width check exists. Decide with a mobile-width browser check.

## 9.3 Build warnings

**Status: Unclear (non-blocking).** The 2026-10-07 frontend build still warns about an ineffective dynamic import of `src/services/apiClient.ts` and a chunk larger than 500 kB. No Tailwind warning appeared. The Owner decides whether these need work.

## 9.4 Official Registrar import/export format

**Status: Not started.** Imports are done: the official class list PDF and grade sheet workbook (IMP-001, 2026-10-26; see docs/official-imports-2026-10.md). Exporting grades in the official grade sheet layout is the next feature; its contract is still to be agreed.

## 9.5 Live Google verification

**Status: Externally blocked.** Automated (mocked) Google tests pass; live sign-in in a real browser is Owner-controlled. Do not request or store Owner credentials. If live testing finds a defect, scope the fix then.

## 9.6 UI follow-ups from the November 2026 polish audit

**Status: Done (2026-11-06, see docs/casing-2026-11.md).** The 2026-11-06 device audit found these. They predate the polish pass (see docs/ui-polish-2026-11.md):
- Academic Terms: a semester without dates ("2nd Semester", "Summer") has its name dimmed to about 2.6:1 contrast, which is hard to read. Use the standard small grey text.
- Classes, Archived Classes tab: the "Edit" button pokes out of its card on 320 px phones and at desktop 1280.
- The audit flags controls under the sticky header ("under-bar") because it scrolls while capturing. Check whether any are real before fixing.

## 9.7 Wording follow-ups from the November 2026 casing pass

**Status: Not started (needs Owner wording decisions).** Found while applying the casing rule; these are word choices, not casing, so they were left as they are:
- "DentiSYS" (capital SYS) in the page-title fallback in `Layout.tsx` and the "View about DentiSYS" landing links, where the product name is DentiSys.
- "Student Info" (`GradebookMatrix.tsx`) and "Student Details" (other tables) name the same column.
- "The Admin invitation" (`FacultyInvitation.tsx`) where the role is called Dean.
- "Course Instructor", "Instructor" and "Faculty" are used for the same role.
- "Student No." and "Student Number" are used for the same field.
- Only 6 of 41 tables show their column headers in small capitals by style; the rest use normal text.

## 9.8 Tab bar UX follow-ups

**Status: Done — all items below implemented and approved by the Owner on 2026-11-06.** The 2026-11-10 follow-up keeps the full accessible name on phones and the warning count tone on the selected tab. (Standard E: white card bar for page sections, grey bar with outline for list switches; per-role colour; one shared `Tabs` component; Student My Classes moves to the grey bar, Student Retention and Faculty Attendance Monitoring to the white card bar.) The 2026-11-06 tab bar review measured all 12 tab bars on the running app; Before / After previews and the numbers are in the Owner's private Tab Bar Standard demo (https://claude.ai/artifact/EBfuzdD5bdrWAdxVw3S1fL). The standards are in [frontend.md](frontend.md) "Page patterns".
- U1: in the grey list switch the selected tab stands out only 1.1:1 from the others (target 3:1). Mark it with an outline, fill or underline (outline recommended). Rooms, Dean Class Sections, Classes, Score Entry view, Attendance Monitoring.
- U2: tab text below 4.5:1 becomes one shade darker: green selected text on Classes and Attendance (3.8:1), grey text on Dean Class Sections and Score Entry view (3.1–4.3:1).
- U3: no tab bar tells screen readers that it is a set of tabs or which tab is selected. Best done with one shared tab component that replaces the 12 copies.
- U4: on phones the section tabs of Grades, Reports and Email take 3 rows and Retention 2. Short phone names, as Dean Reports already uses, bring them to 2, 2, 1 and 1 rows (a wording change).
- U5: on phones the Student My Classes tab names split onto two lines. Moving the year out of the tab and tightening the padding keeps both tabs on one line, side by side; not yet measured below 390 px.
- Student My Classes and Student Retention use two tab looks found nowhere else, so a student sees two different tab bars.

## 9.9 Full Matrix follow-ups (GRA-03, 2026-11-14)

- **Show computation on phones and tablets.** It is desktop-only (1280 px and wider) by the Owner's choice and comes next, after its own demo and approval. See `docs/proposals/gra-03-matrix-computation.md`.
- **Slow score loading.** Full Matrix View requests scores one assessment at a time: about 100 requests for the seeded Faculty account, so the score boxes fill in over several seconds. One request per class would fix it. This is pre-existing and not caused by GRA-03.
- **Excel export.** The matrix export does not include the new % / Transmuted steps. Add them only if Faculty ask.

---

# 10. Ticket batch 1 (2026-11-11) — remaining backlog

The Owner reviewed the first ticket batch on 2026-11-11. Delivered in that batch: T2 (32-character password policy with the show-password control fix), T4-D1 (silent refresh on a non-auth 401), T10 (assessment-dialog inline validation using the existing field-error pattern), T3 (import feedback: persistent per-cause errors, headerless CSV kept with an amber warning), T6 (roster-header wrap + Dean SystemAudit and Academic Terms header fixes) and T7 (three-zone session card separating status from actions). T9 (session after browser close) was closed as intended behaviour. The items below are the rest, kept for a later batch; effort and detail are in `audit-output/tickets-2026-11-15/` (gitignored evidence).

## 10.1 T1 — transmutation defaults and the attendance link

**Status: Implemented (2026-11-13).** Transmutation remains optional per assessment and uses the fixed `(score ÷ maximum score) × 50 + 50` formula. Admin and Faculty bound controls were removed; legacy bound columns remain for compatibility and are ignored. Attendance behavior and incomplete-score handling remain unchanged. The Reports bundle spreadsheet and print view show effective percentages. New assessments still default to transmutation OFF.

## 10.2 T4 — Full-Matrix sign-out proof and unsaved-edit protection

**Status: Not started (needs Owner environment).** The matrix path alone cannot expire the session on the current build (auto-save and heartbeat are activity-flagged). Ranked causes and the demo-DB fingerprint queries are in `t4-matrix-scenario.md`; the Owner needs to provide the date/time, browser and whether the tab predated the 2026-11-11 14:56 deploy. Separately, a forced sign-out silently loses matrix edits pending in the 10-second debounce or invalid cells; a sessionStorage draft + restore was proposed and is not implemented.

## 10.3 T5 — iOS Safari verification process

**Status: Not started (process work).** Playwright WebKit with iPhone descriptors now exists (26 frames; 0 px page overflow on the converted Student/Secretary pages) but is not yet part of a release gate. Add the WebKit sweep to the device audit, keep the Owner's real-iPhone pass at 320/390 per release, and use a real-device cloud only for device-only bugs. If the original T5 report was about a Faculty/Dean table (Full Matrix, Reports), that is a separate look decision.

## 10.4 T8 + T11 — grading system clarification

**Status: Implemented (2026-11-13).** Remedial is course-level and applies to completed final grades 2.5–4.9 across course types. A 5.0 follows the in-person irregular reenrollment path outside DentiSys. Each of at most two attempts passes at 75%; failing attempt one permits attempt two, and failing attempt two moves to cost recovery. Cost recovery accepts one-decimal grades from 1.0 to 5.0; 1.0–2.4 passes and 2.5–5.0 fails. These outcomes do not replace the original course grade. The implementation adds a read-only report for potentially affected historical rows; saved records are not backfilled. The in-person irregular reenrollment process remains outside DentiSys.

## 10.5 T2 — hashing and remaining password-form polish

**Status: Password hashing implemented (2026-11-13); reveal-control polish remains.** New and reset passwords use NFC normalization and Argon2id, avoiding bcrypt's 72-byte truncation. Existing bcrypt hashes remain verifiable and are not silently rehashed; an account moves to Argon2id when its password is next set or reset. `GoogleLinkCard`'s confirm-password field still lacks a reveal control/label; address it with the next auth polish. The login/sign-in fields intentionally have no maximum so existing passwords keep working.

## 10.6 T3 — remaining import polish

**Status: Not started.** The public landing page still advertises "PDF / Excel roster import" although the roster importer accepts no Excel file (copy change needs Owner approval). The "partially readable grade-sheet workbook" case (found + zero counts) has persistent errors after this batch but no crafted official-layout fixture in the test suite; add one when touching this area. Never use real class lists or the Owner's workbook for fixtures.

## 10.7 T6 — other header/layout defects

**Status: Backlog.** Student Profile, Face Registration and the measured retention-row overlap still need their own phone-width pass; they are separate from the class roster header fixed in this batch. Dean SystemAudit and Academic Terms header fixes are in this batch.

## 10.8 T7 — session-card follow-ups

**Status: Backlog (visual verification only).** The three-zone card with status vs actions is implemented with the settled labels ("Sessions", "Start session", "Schedule session"). The earlier mock used "View sessions"/"Schedule next session"; the implementation keeps the spec wording. The Scheduled and View-only pill variants were not captured in the design mock; verify them on the implemented card with seeded states, and review the desktop spacing in the next UI pass.

## 10.9 T9 — no action

**Status: Closed (2026-11-11).** The Owner confirmed that a logged-in site should restore the session after closing/restarting the computer; the persistent session (30-minute idle, 7-day absolute) stays unchanged.
