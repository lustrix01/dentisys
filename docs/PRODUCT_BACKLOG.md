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

## 5.10 Import Grade Sheets follow-ups

**Status: Not started.** Found while aligning the destination with the saved Grade Weights (2026-10-22); the Owner will decide each one.

- **Class badge:** the card header badge shows the internal class number ("DENT101 · 33") instead of the section name.
- **Dark mode:** the destination box and the upload box use `dark:bg-slate-850`, which is not a defined colour, so both render light grey in dark mode.
- **Lecture/Laboratory check:** the grouped destination list is covered by unit tests only; the seed has no Lecture/Laboratory configuration to check it on screen.

## 5.11 Client requests waiting on information

**Status: Unclear.** Blocked until the client answers.

- **Cost recovery remedials:** deferred by the Owner until the client explains how cost recovery is graded (today a remedial is one 1.00–5.00 grade and a failed final).
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

**Status: Externally blocked.** The provisional roster import (spec IMP-001) is implemented and labelled "Official format not confirmed"; grade-sheet import is not enabled. Needed from the Registrar: file type, headers, Student identifier, course/section columns, grade encoding and output structure. Do not invent the official format.

## 9.5 Live Google verification

**Status: Externally blocked.** Automated (mocked) Google tests pass; live sign-in in a real browser is Owner-controlled. Do not request or store Owner credentials. If live testing finds a defect, scope the fix then.
