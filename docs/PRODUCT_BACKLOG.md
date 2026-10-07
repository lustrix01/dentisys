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

**Status: Not started.** Faculty and Secretary have My Activity endpoints; the Dean has none.

The Dean gets My Activity limited to the Dean's own significant actions, separate from System Audit. Record significant actions only (create, update, revoke, accept, promote/demote, invitations, grade and attendance changes, remedials, name and security changes, 2FA enrolment, Google linking, biometric enrolment), never navigation or page reads, and never sensitive payloads such as biometric templates.

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

**Status: Partial.** The history screen exists, but each Email Management action is not shown to be linked to its outbox/delivery record.

Build Email History from the email outbox/delivery records and relevant audit events, not a separate log.

Owner decisions (2026-10-08): include every email actually sent; each user sees only the emails they sent; one row per action that expands to its recipients with per-recipient delivery status; show only what is needed (action, recipients, status, time, failure reason), never the email body; view-only, no resend; emails sent before the outbox link existed are hidden. Open: whether purely automatic emails (no human sender) appear anywhere — proposed: not shown.

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

**Status: Partial.** Session selection exists; filtering by date, then session on that date, then records is not implemented, and no large-list test exists.

Add filters for attendance status, overridden/original state and Student search, so users never scroll an unbounded list to reach a record.

Owner decisions (2026-10-08): applies to both the Faculty and Secretary override screens; a single date, then a session on that date, then its records; Student search by name/surname or student number; filters for status, overridden/original and how attendance was recorded (biometric, Faculty manual, Secretary manual); revoked sessions are hidden by default, shown labelled Revoked and view-only when included, never overridable (check current behaviour first and ask before changing it); no pagination — a bounded scrolling list with a sticky header.

---

# 8. Login usability

## 8.1 Field validation and password controls

**Status: Partial.** Activation, reset and login have validation, password visibility toggles and requirements that mirror the backend policy. The remaining data-entry fields have not been checked one by one.

## 8.2 2FA settings confirmation hardening

**Status: Not started.** Regenerating recovery codes and turning 2FA off confirm with an authenticator code but have no handler-level attempt limit, and recovery-code regeneration writes no audit event.

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
