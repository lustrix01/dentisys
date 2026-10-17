# Audit logging contract

Status: **APPROVED by the Owner** (2026-10-17). Before/After demo: [Audit Trail Demo](https://claude.ai/artifact/EBNfxCrXPbdk5GHDZ5rGw2).
Once approved, this contract replaces the audit wording in `spec.md` (SEC-004, BIO-009 audit list, session-edit and term-change audit lines) with one audit section.

## 1. Purpose

The audit trail answers, for any recorded action: **who** did **what** to **which record**, **when**, **from where**, and **what it was before**.

It exists for four uses:
1. Disputes about grades and attendance.
2. Security incidents (a misused or stolen account).
3. Accountability for authority (who invited, appointed, revoked, changed settings).
4. Proof of integrity (records were not quietly altered; biometric consent and deletion can be proven).

It is not usage analytics, debugging output, or a click history. An event that serves none of the four uses is not written.

## 2. Rules

| # | Rule |
|---|---|
| R1 | Audit rows already stored are never changed or deleted. This contract applies to rows written from now on. |
| R2 | Every row is written in the same transaction as the change. If the audit row cannot be written, the change is cancelled. |
| R3 | An update that changes nothing writes no row. |
| R4 | A change records **before → after** for the fields that changed. A deletion keeps the deleted values. |
| R5 | Rows keep today's seal (HMAC chain), append-only guard and redaction. Passwords, tokens, 2FA secrets, recovery codes, biometric data, exact student GPS and similarity scores are never stored. |
| R6 | Every row stores the actor's name, email and role as they were at the time, the IP address and the browser. |
| R7 | Descriptions use readable names (e.g. "Quiz 2 (Midterm) · DENT 101-A"); internal IDs stay in the target fields. |
| R8 | Times are shown in Asia/Manila. |
| R9 | Rows are kept indefinitely for now. A retention period can be set later with the school's records policy. |
| R10 | A read-only chain check runs in `check-postgres` and after each demo deploy. It prints OK or the first broken row. On its first run against an existing database, any break it finds is reported and recorded as the starting point, not treated as a new failure; later runs fail only on a break after that point. |
| R11 | Refused access (permission denied) is not logged. |
| R12 | **One click, one visible row.** When one click or one system job run changes many records (roster import, invite all, Secretary invites, mark all Present, end-of-term face-data deletion), each record still gets its own sealed row, and all of them carry the same batch ID (`operation_uuid`, the same idea as email history's one ID per send). Every screen shows the batch as one expandable row, e.g. "Imported 40 students · DENT 101-A". |
| R13 | **Old rows on the new screens.** The visibility rules in section 3 apply to rows already stored (the Dean no longer sees old class-work rows; old token refreshes stay hidden; old sign-ins sit behind the Sign-ins chip). Old codes get the same readable labels; when an old row has no readable record, Record falls back to the stored target (e.g. "Assessment #42"); the Changes table shows what the old row stored. Old rows have no batch ID and are not grouped. Nothing in an old row is altered. |

## 3. Who sees what

| Viewer | Screen | Sees |
|---|---|---|
| Faculty | My Activity | Only rows their own account did. Sign-in rows behind a **Sign-ins** filter, off by default. |
| Secretary | My Activity | Only rows their own account did. Same Sign-ins filter. |
| Student | none (not now) | If added later: only rows their own account did. |
| Dean | Audit Trail | **Overview**: people and accounts, roles, settings, terms, security events, biometric consent and deletion, plus everything the Dean's own account did. **Not** class work: scores, assessments, grade weights, recompute, attendance records and sessions, Excused requests, retention entries, other people's successful sign-ins. |
| Dean | Dashboard "Latest audit events" | Newest 20 rows of the same overview. |

Rows are written whether or not any screen shows them. Hidden class-work rows stay sealed in the database as evidence.

**O1 — Investigations (decided 2026-10-17).** The Dean has no screen access to class-work rows. For a grade dispute or a suspected stolen Faculty account, the system administrator reads the rows from the database on the Dean's request. Accepted trade-off: within the app, only the Faculty member can see their own class-work history.

**O2 — Class Attendance Activity (decided 2026-10-17).** Stays as a class-records screen, not the personal audit trail: Faculty see attendance changes made by anyone (including Secretaries) in their own classes. It stays **unchanged** (Student, Section, Session, Change, Reason, By; Manila time); it reads attendance records, not audit rows.

## 4. Display standard (every screen)

**Row:** When · Who · What · Record · Change, plus a status badge (Success / Failed / Warning).

| Column | Example |
|---|---|
| When | Oct 17, 2026 · 10:16 AM |
| Who | Dr. Ana Reyes · Faculty |
| What | Changed scores |
| Record | Quiz 2 (Midterm) · DENT 101-A |
| Change | 3 scores changed |

Row wording for special cases: Who = **System** for automatic jobs; **Unknown account (typed: x@…)** for a failed sign-in with no matching account. Change = **—** when nothing changed (e.g. a sign-in). A grouped batch (R12) reads e.g. "Imported 40 students" and expands to its members. The list has day headers (Today, Yesterday, Oct 15).

**Details panel** (same for every role, on rows they may see): When, Who (name, email, role), What, Record, From where (IP · browser/device), Status, Reason, and a **Changes** table (Field | Before | After). A Changes table longer than 10 lines shows 10 with **Show all** and a search box. The Dean also gets a collapsed "Technical details" (action code, module, raw before/after).

**Filters and paging (every audit screen; decided 2026-10-17).** All filtering, sorting and paging happen on the server, 50 rows per page, over all rows the viewer may see (My Activity no longer stops at the newest 100).

| Filter | Dean Audit Trail | My Activity | Notes |
|---|---|---|---|
| Search | yes | yes | Matches who, what, record, and the students/records inside grouped rows. |
| Area | yes | yes | Readable options matching section 5: Sign-in & security, People & accounts, Settings & terms, Grading, Attendance, Retention, Biometrics. A code's Area is the section it is listed in. Each screen lists only areas it can contain. |
| Date | yes | yes | Presets Today, Last 7 days, This term (hidden when no term is current), plus a custom from–to range; Asia/Manila calendar days. |
| Status | yes | yes | Success, Warning, Failed. |
| Role | yes | — | Dean, Faculty, Secretary, Student, System. |
| Class | — | Faculty | Faculty's own classes. |
| Sign-ins | yes (Dean's own) | yes | Chip, off by default; shows the viewer's own sign-in, sign-out and 2FA rows. Other people's successful sign-ins never appear in the Dean view; failures always do. |
| Sort | yes | yes | Newest / oldest first. |
| Clear filters | yes | yes | One button resets all. |

**Summary cards.** Dean: attention cards for the chosen period — failed sign-ins, security alerts (stolen-token block, wrong 2FA codes), 2FA turned off; clicking a card applies that filter. My Activity: no cards.

**Dean overview note.** Under the Audit Trail title: "Class work (grades, attendance, retention) is not shown here; it stays recorded."

**Phones and tablets (decided 2026-10-17; follows the 2026-10-13 rule in spec.md: below 1280 px columns and data formats match desktop, never merged, reordered or dropped, and everything stays inside its box).**

| Part | Phone (~375 px) | Tablet (768–1279 px) | Desktop (≥1280 px) |
|---|---|---|---|
| List table | Same columns, same order. The table scrolls sideways inside its own box; the When column stays pinned; text wraps inside cells. The page itself never scrolls sideways. | Same; usually no scrolling needed. | As designed. |
| Filters | Each control full width, stacked; Clear filters last. | Wrap onto two rows. | One row. |
| Attention cards (Dean) | Stacked, one per row. | Three in a row. | Three in a row. |
| Details panel | Fills the screen and scrolls inside; the Changes table keeps Field / Before / After and scrolls sideways inside its own box. | Centred dialog. | Centred dialog. |
| Export / Print, paging | Under the title; wrap. | Same. | Top right. |

Everywhere: tap targets at least 44 px; long names and emails wrap and are never cut off; the sidebar follows the existing rule (collapsed by default at 768–1023 px). Checked at 375, 768, 1024 and 1280 px wide, in light and dark.

**Export and print.** CSV and print use the same columns, filters and visibility as the screen; a grouped row exports one line per member. The Dashboard's "Latest audit events" uses the same row format and links to the Audit Trail.

## 5. Event catalogue

Legend: **Dean** = shown in the Dean overview. **Own** = shown in the actor's My Activity (Faculty/Secretary). Change: KEEP (as today), CHANGE, NEW, STOP.

### 5.1 Sign-in and account security (actor: anyone)

| What (label) | Code | Stores | Dean | Own | Change |
|---|---|---|---|---|---|
| Signed in | login_success | method (password) | no | Sign-ins filter | KEEP |
| Sign-in failed | login_failed | typed email, reason (no account / wrong password / inactive) | yes | — | KEEP |
| Signed out | logout | session | no | Sign-ins filter | KEEP |
| Signed in with Google | google_login_success | — | no | Sign-ins filter | KEEP |
| Google sign-in refused | google_login_denied | reason | yes | — | KEEP |
| Google account linked | google_link_success | — | yes | yes | KEEP |
| Google link refused | google_link_denied, google_profile_link_denied | reason | yes | yes | KEEP |
| Password changed | password_changed | — | yes | yes | KEEP |
| Password reset requested / completed | password_reset_requested, password_reset_completed | — | yes | yes | KEEP |
| 2FA turned on | mfa_enrollment_completed | — | yes | yes | KEEP |
| 2FA code accepted / recovery code used | mfa_verification_success, mfa_recovery_success | — | no | Sign-ins filter | KEEP |
| Wrong 2FA or recovery code | mfa_verification_failed | which kind; never the code | yes | Sign-ins filter | **NEW** |
| Recovery codes regenerated | mfa_recovery_codes_regenerated | never the codes | yes | yes | **NEW** |
| 2FA turned off | mfa_revoked | reason | yes | yes | KEEP |
| Stolen sign-in token blocked | refresh_reuse_detected | session | yes | Sign-ins filter | KEEP |
| Name changed | profile_updated | name before → after | yes | yes | CHANGE (add before) |
| Token refreshed | refresh_rotation | — | — | — | **STOP** |
| Google link needed (step) | google_link_required | — | — | — | **STOP** |
| 2FA setup started (step) | mfa_enrollment_started | — | — | — | **STOP** |

### 5.2 People, accounts and roles

| What (label) | Code | Actor | Stores | Dean | Own | Change |
|---|---|---|---|---|---|---|
| First Dean invited / invitation failed | first_dean_invited, first_dean_invitation_delivery_failed | system | name, email | yes | — | KEEP |
| Faculty invited / invitation edited / revoked | faculty_invited, faculty_invitation_edited, faculty_invitation_revoked | Dean | name, email; edits before → after | yes | — | KEEP |
| Account activated | faculty_invitation_accepted, secretary_activated, student_activation_completed | the new user | role | yes | yes | KEEP |
| Student activation refused | student_auth_eligibility_denied | anyone | reason | yes | — | KEEP |
| Student added | student_created | Faculty | student number, name, class | yes | yes | KEEP |
| Student details changed | student_update | Faculty | changed fields before → after | yes | yes | KEEP |
| Student enrolled / removed from class | student_enroll, student_unenroll | Faculty | student, class | yes | yes | KEEP |
| Student invited | student_invited | Faculty | student, class | yes | yes | KEEP |
| Secretary invited / invitation revoked | secretary_invited, secretary_invitation_revoked | Faculty | student, class | yes | yes | KEEP |
| Secretary appointed / appointment ended | secretary_appointed, secretary_appointment_ended | Faculty | student, class, role before → after | yes | yes | KEEP |
| Class created / changed | class_create, class_update | Faculty | changed fields before → after | yes | yes | KEEP |

### 5.3 Settings and terms (actor: Dean)

| What | Code | Stores | Dean | Change |
|---|---|---|---|---|
| System settings changed | system_settings_updated | changed fields before → after | yes | KEEP |
| Term added / changed / deleted | academic_term_created, academic_term_updated, academic_term_deleted | term before → after | yes | KEEP |
| Terms copied to next year | academic_terms_copied | year, terms created | yes | KEEP |

### 5.4 Grading (actor: Faculty) — own view only

| What | Code | Stores | Dean | Own | Change |
|---|---|---|---|---|---|
| Grade weights changed | grading_config_update | before → after | no | yes | KEEP |
| Assessment added | assessment_created | title, type, period, max score | no | yes | KEEP |
| Assessment changed | assessment_updated | changed fields before → after; **no row if unchanged** | no | yes | CHANGE |
| Assessment deleted | assessment_deleted | assessment details + **every deleted score** (student, value) | no | yes | CHANGE |
| Scores changed | assessment_scores_saved | **one row per save** (a full-matrix save covering many assessments is still one row); each changed cell: student, assessment, score and remark before → after; cleared scores keep old value; **plus each period/final grade that moved as a result**, before → after; **no row if nothing changed** | no | yes | CHANGE |
| Grades recomputed (Recompute button) | grades_recomputed | counts + **each period/final grade that changed**, before → after; **no row if no grade changed**. The automatic recompute after a score save writes no row of its own (its grade changes are in the score row). | no | yes | CHANGE |

**When scores are saved (decided 2026-10-17).** Auto-save no longer fires on every cell left. It saves after **10 seconds without typing**, and also when the Faculty switches assessment or view, leaves the page, or presses Save. A burst of edits is one save and one audit row. The existing unsaved-scores warning stays, and now also appears when the Faculty tries to leave during the 10-second wait. Auto-save can still be turned off, as today.

**If the automatic recompute fails (decided 2026-10-17).** The scores and their audit row still save, as today. The row lists grade changes only when the recompute succeeded, and the existing "grades could not be computed yet" notice shows.

### 5.5 Attendance — own view only (Faculty also see their classes' changes in Class Attendance Activity, O2)

| What | Code | Actor | Stores | Dean | Own | Change |
|---|---|---|---|---|---|---|
| Attendance session created / changed / ended / revoked | attendance_session_started, _updated, _ended, _revoked | Faculty, Secretary | edits before → after; revoke reason | no | yes | KEEP |
| Session opened / ended automatically | attendance_session_auto_opened, attendance_session_auto_ended | system | students resolved Absent (count) | no | — | KEEP |
| Attendance recorded by face check | biometric_attendance_recorded | Student | session, method, device/IP (the only evidence of who checked a student in); about 14,000 rows per term, shown on no screen | no | — | KEEP |
| Attendance set by Secretary | secretary_attendance_override | Secretary | status before → after, reason | no | yes | KEEP |
| Attendance corrected by Faculty | faculty_attendance_change | Faculty | status before → after, reason, original method | no | yes | KEEP |
| Unrecorded students marked Present (bulk) | faculty_attendance_change (one per student, same batch ID) | Faculty | per student: status → Present; shown as one row per click (R12): "Marked 38 students Present · DENT 101-A · Oct 15" | no | yes | CHANGE (grouped) |
| Excused requested | excused_requested | Secretary | student, date, reason | no | yes | KEEP |
| Excused approved / rejected | excused_approved, excused_rejected | Faculty | status before → after, note | no | yes | KEEP |

### 5.6 Retention (actor: Faculty) — own view only

| What | Code | Stores | Dean | Own | Change |
|---|---|---|---|---|---|
| Remedial attempt recorded | retention_remedial_save | attempt, outcome, notes. Recording a failed Attempt 1 and scheduling Attempt 2 in one Save stays two rows (two separate facts). | no | yes | KEEP |
| Cost recovery result recorded | cost_recovery_recorded | result | no | yes | KEEP |
| Midterm Watchlist unlocked | watchlist_unlock | class | no | yes | KEEP |

### 5.7 Biometrics (sensitive personal data)

| What | Code | Actor | Stores | Dean | Change |
|---|---|---|---|---|---|
| Face-check consent given / withdrawn | biometric_consent_granted, biometric_consent_revoked | Student | consent before → after; **no row if unchanged** | yes | CHANGE |
| Face enrolment started / succeeded / failed | biometric_enrollment_started, _succeeded, _failed | Student | status; failure code | no | KEEP |
| Face enrolment deleted | biometric_enrollment_revoked, _revoked_by_dean, _revoked_inactive, _expired | Student, Dean, system | status before → after; never biometric data | yes | KEEP |
| Face check failed | biometric_verification_failed | Student | error code only, no score | no | KEEP |

**O3 — Dean and biometrics (decided 2026-10-17).** The Dean sees consent changes and enrolment deletions (proof under the Data Privacy Act), not enrolment attempts or failed face checks.

### 5.8 Development only

`development_mock_student_session_created` — written only when development mock sign-in is enabled; never in production. KEEP.

## 6. What changes from today (summary)

- STOP 3 codes (token refresh, two in-between steps).
- NEW 2 codes (wrong 2FA code, recovery codes regenerated).
- CHANGE 6 codes to record real before → after and skip unchanged saves.
- Bulk clicks and system jobs show as one expandable row per click (R12): roster import, invite all, Secretary invites, mark all Present, end-of-term face-data deletion. Each student keeps their own sealed row. Class Attendance Activity is unaffected (it reads attendance records).
- Score entry is the only auto-save in the system. Every other audited save is a deliberate button or dialog submit: one row per decision.
- Score auto-save waits for 10 seconds without typing; the automatic recompute is folded into the score row. Example: fixing 10 cells in a 12-assessment matrix goes from about 130 rows today to 1–3.
- Dean Audit Trail and dashboard become an overview; class work moves to the actor's own view only.
- One display standard on every audit screen.
- New chain check in the gates.

Expected effect on the dev data (2026-09-27 → 10-17, 1,342 rows): about 72% fewer rows written; Faculty My Activity goes from 71% sign-in rows to work actions only (sign-ins one filter away).

## 7. Acceptance checks

Each item is proven by a focused test (backend or frontend) unless marked live.

1. **Stopped codes:** a token refresh, a Google link-required step and a 2FA setup start write no audit row.
2. **New codes:** a wrong 2FA or recovery code writes `mfa_verification_failed` (Failed) without the code; regenerating recovery codes writes `mfa_recovery_codes_regenerated` without the codes.
3. **No-change rule (R3):** re-saving an unchanged assessment, consent or score sheet writes no row.
4. **Score save:** one save changing 3 cells across 2 assessments writes exactly one row, listing each cell old → new (including a remark-only change and a cleared score) and the grades that moved; the automatic recompute writes no row of its own; a failed recompute still saves scores and their row.
5. **Recompute button:** writes one row listing changed grades; no row when no grade changed.
6. **Assessment delete:** the row keeps every deleted score.
7. **Grouping (R12):** a roster import of N students and a "Mark all Present" of N students each write N rows with one shared batch ID, shown as one expandable row on every screen.
8. **Visibility:** Faculty and Secretary see only their own rows; the Dean sees the overview and never class-work rows (old or new); other people's successful sign-ins never reach the Dean view; failures do.
9. **Filters and paging:** each filter works on the server across all visible rows (a row older than the newest 100 is found by My Activity search); Area, date presets and Clear filters behave as in section 4.
10. **Display:** readable labels for every code (old and new); Manila time; details panel Changes table; old rows fall back as in R13.
11. **Auto-save:** 10 seconds idle or leaving the assessment/view saves once; leaving the page during the wait shows the warning.
12. **Chain check:** OK on a clean chain; reports the first broken row on a tampered copy (run on the disposable integration database only).
13. **Layout (live):** Dean Audit Trail and My Activity at 375, 768, 1024 and 1280 px, light and dark: nothing overflows its box, tables scroll inside their own box with When pinned, the page never scrolls sideways.
14. **Gates:** `./scripts/check.ps1` and `./scripts/check-postgres.ps1` pass.

## 8. Out of scope

- Student audit screen.
- Rate limit on recovery-code regeneration and turning 2FA off (backlog 8.2).
- Logging views, prints or exports.
- Removing or rewriting any stored row.
