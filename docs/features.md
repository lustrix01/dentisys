# Implemented Features

What DentiSys does today. Behaviour is defined by [spec.md](../spec.md); open and partial work is in the [product backlog](PRODUCT_BACKLOG.md).

- **implemented, tests passing**: the code exists and `scripts/check.ps1` and `scripts/check-postgres.ps1` ran tests covering it, and they passed.
- **implemented in code**: the code exists, but the gates do not run a test that proves it.

## Accounts and sign-in

- First Dean/Admin account created by a controlled bootstrap script — REG-010 — implemented, tests passing.
- Password sign-in with optional authenticator-app 2FA and recovery codes — AUTH-005, AUTH-006 — implemented, tests passing.
- Password policy: 8–32 characters with the existing composition rules, shown in every set-password form; the show/hide control stays aligned to the input row — AUTH-005 — implemented, tests passing.
- A 401 on a non-auth request attempts one silent session refresh; the server remains authoritative for the 30-minute idle limit and the activity header only marks genuinely active requests — AUTH-007 — implemented, tests passing.
- Google Sign-In for existing accounts, linked only after password and 2FA confirmation, bound to a stable Google ID — AUTH-003, AUTH-010 — implemented, tests passing.
- Five-part structured names (Prefix, First, Middle, Last, Suffix) for every person and invitation, with Unicode-aware validation — ID-002 — implemented, tests passing.
- One canonical name source; a name change shows everywhere without rewriting business tables — ID-002 — implemented, tests passing.
- Dean, Faculty, Secretary and Student can change only their own five-part name from a shared profile dialog; authenticator-app MFA requires a fresh TOTP code, while recovery codes are rejected. Profiles reject identity-critical fields, and Faculty cannot rename an activated Student — ID-002 — implemented, tests passing.

## Invitations and roles

- Faculty invitations with structured names and institutional email (only `@bicol-u.edu.ph`) checked while typing — REG-005, UI-004, AUTH-003 — implemented, tests passing.
- Faculty and Student invitations last 7 days — REG-001 — implemented, tests passing.
- Faculty who are active but have no invitation record show "Active" in the Dean's list, not "Not invited" — REG-005 — implemented in code.
- Pending Faculty invitations can be edited, revoked and reissued; editing the email revokes the old token; an invitation counts as accepted only after the account is activated — REG-005 — implemented, tests passing.
- The roster shows a status chip per student (Registered, Invite sent, Delivery failed, Not invited), and Make or Remove Class Secretary is in the roster ⋮ menu — REG-006 — implemented in code.
- Class Secretary on the Student's own account: Faculty invites, the Student accepts, at most one pending or active Secretary per section, removal restores normal Student access — REG-006, BIO-010 — implemented, tests passing.
- Email Management shows whether each Student is an ordinary Student, has a pending Secretary invitation or is the active Secretary — REG-006 — implemented, tests passing.
- Email Management filters recipients by Course, then Class Section (only that course's sections), then Student (one student of that section), alongside school year and search, on the Students, Secretary, Midterm and Remedial tabs — backlog 5.7 — implemented, tests passing.
- The Email History table (Faculty Email Management History tab, Dean Faculty Invitations card and Invitation Details dialog) stacks into one card per action below 768 px so Date Sent never splits across lines; desktop is unchanged — backlog 9.11 — implemented, tests passing. The Invitation Details dialog matches history by invitation id (falling back to email for rows without one) — backlog 4.8 — implemented: each Dean invitation email stores the invitation id (migration 059) and Email History returns it as `invitationId`; older rows have none and fall back to email.
- Faculty send At-Risk and Privacy Consent notices to selected Students from Email Management; in custom email mode, non-allowlisted recipients are recorded as "Suppressed (test mode)" — EML-001 — implemented, tests passing.
- With `EMAIL_PROVIDER=mailpit`, all mail goes to Mailpit with no login and `SMTP_*` settings are ignored — EML-001 — implemented in code.
- A Secretary keeps their own Student context and switches between Secretary and Student views with the sidebar toggle only — BIO-010, UI-005 — implemented, tests passing.

## Grading and retention

- Faculty edit grading categories and weights; weights must total exactly 100% and grades stay computed — GRD-002, GRD-003 — implemented, tests passing.
- Grades follow the official BUCDM grade sheet: plain category averages, whole-percent rounding (.5 up), the official conversion table with below 75% = 5.0, and a hover showing the steps (e.g. "83.77% → 84% → 2.5"); server and screen produce the same value — UI-003 — implemented, tests passing.
- Assessment categories say Lecture or Laboratory; a new max score starts empty and asks for confirmation above 500 points; a cell shows "Incomplete" with a note naming categories that have no assessments; students without a final grade show "No Grade Yet" in Dean reports, exports and the Dashboard — GRD-002 — implemented in code.
- A new assessment starts with transmutation on, except in a category named "Attendance", where it starts off; Faculty can switch it on — GRD-001 — implemented, tests passing.
- The assessment dialog shows inline field errors for a blank title or non-positive maximum score using the existing Create Class field-error pattern, and keeps Confirm enabled — UI-002/GRD-002 — implemented, tests passing.
- Students see grades only; exports are .xlsx in the official layouts — GRD-002 — implemented in code.
- Score entry (single assessment and full matrix) saves when Faculty leave a cell while Auto-save is on, keeps a visible Saving / Saved / Failed – Retry bar, asks before a Save that deletes stored scores ("Remove Saved Scores"), asks once before a grade-sheet import, warns before an in-app link or closing the tab would discard unsaved scores or grade weights, and saves the matrix all-or-nothing; the matrix pins Student No. and name columns — UI-002 — implemented, tests passing.
- Grade ledgers, retention lists, attendance registers and class lists export as .xlsx or as a printable PDF of the open section — GRD-002 — implemented, tests passing for the exports and print content; the open-section-only PDF was checked manually.
- Faculty Reports → Grades & Assessments: the Assessment Scores sheet and its PDF print follow Full Matrix View with Show computation on. Each categorised assessment has Score, % (raw) and Transmuted (the value used in the grade, or "Absent (0)"); each category ends with Average % and Weighted, all from the server's results — GRD-002 — implemented, tests passing.
- Midterm Watchlist shows server risk once a student's midterm is complete; the screen has no lock or manual unlock — UI-003 — implemented, tests passing.
- The Faculty Dashboard counts the current school year's classes, students and At Risk (midterm) students from classes with no archive reason, like the Assigned tab of Classes & Rosters; a Finished class counts only in a past school-year view — CLS-003 — implemented, tests passing.
- Retention Monitoring uses the Faculty's real classes, enrollments and scores, the "Midterm Grade" wording and the single At Risk flag (no risk levels) — UI-003, ACA-001 — implemented, tests passing.
- Remedial is a row action after Finals with Student, Course and Section locked; no separate "Schedule a Remedial" action — UI-003 — implemented, tests passing.
- Two remedial attempts, each passing at 75% or more; the second only after a failed first; the original course grade never changes — UI-003 — implemented, tests passing.
- Faculty Remedial Record dialog shows Student Number, each attempt's notes, cost recovery and a completion date set once when the result is recorded (older attempts show Last updated) — UI-003 — implemented, tests passing.
- Students get a stored in-app notification when a remedial is assigned — UI-003, NTF-001 — implemented, tests passing.
- Student roster import into existing classes from the official class list PDF (or the CSV template; no "Official format not confirmed" label), with total-count and wrong-class checks — IMP-001 — implemented, tests passing.
- Roster import shows persistent per-cause errors for an unsupported file, a non-class-list PDF, a scanned PDF or an unusable CSV; headerless/positional CSV still parses with an amber warning, and the same file can be retried. Grade Sheet Import shows a persistent error when a workbook has no grade-sheet records — IMP-001 — implemented, tests passing.
- Official grade sheet workbook (.xlsx) import of raw scores, name matching, ticked create/link/remove and one all-or-nothing save — IMP-001 — implemented, tests passing.

## Attendance

- Attendance Monitoring offers only the Faculty's assigned courses, and only sections of the chosen course — ATT-001 — implemented, tests passing.
- The attendance worksheet header separates a read-only "Session status" panel (Live session + code + start time / Scheduled session / No session running / View only / Checking) from an actions row (Start session when idle; Schedule session while live; Sessions), keeping the hide-while-live rule — UI-005 — implemented in code.
- Every Secretary manual change (first mark, change, Excused) is a request the section's Faculty approves, with bulk approve, reject with a note and history. Approved records read "Secretary (approved by Faculty)". Requests close on a direct Faculty mark, a session revoke or a face check-in. Notices are in-app only — ATT-006 — implemented, tests passing.
- Every Secretary or Faculty override records actor, Student, class, session, old and new status, reason and time — ATT-006 — implemented, tests passing.
- Faculty Class Attendance Activity, a tab in Attendance Monitoring, shows their own and their Secretary's attendance changes with that full context — ATT-006 — implemented, tests passing.
- Dean Attendance Reports and the all-classes attendance export count every record, with no cap — ATT-001 — implemented in code.
- A session whose class end equals its opening time is refused with "Class end must be after the opening time."; the 12-hour limit stays — ATT-001 — implemented, tests passing.

## Audit and notifications

- Dean-defined academic terms in Settings, Faculty current-year term selection, and an in-app next-term reminder; biometric expiry follows audited term-date edits — ACA-002, CLS-002, BIO-005 — implemented.
- Dean/Admin System Audit, separate from personal activity views — SEC-004 — implemented, tests passing.
- Faculty and Secretary My Activity, read from the database and limited to the signed-in account — SEC-004 — implemented, tests passing.
- Audit records keep the actor ID and the name at the time of the event, and strip passwords, tokens, secrets and recovery codes — SEC-004 — implemented, tests passing.
- Stored notifications (recipient, type, message, reference, time, read state) drive the notification bell — NTF-001 — implemented, tests passing.

## Student surfaces and data

- The Student dashboard shows a "Register your face to check in" card until the face is enrolled, and "No grade yet" before a final grade — BIO-001 — implemented in code.
- Student dashboard, classes and retention pages read server data; prototype paths that have no server data yet stay switched off — ACA-001 — implemented, tests passing.
- Schema changes are ordered, additive migrations — DATA-001 — implemented, tests passing.

## Superadmin mode

- Every Dean account has a Dean / Superadmin switch in the sidebar (same markup as the Secretary / Student switch). The mode is the route (`/superadmin/...`), so a refresh keeps it; the server does not know the mode and the Dean role authorises every call — ADM-001 (spec text proposed) — implemented, tests passing.
- Superadmin Audit Trail: an Activity / Class work switch; Class work lists grades, attendance and retention rows read-only with Faculty, class, Student, area and date filters and before/after values; the normal Dean overview and the Dashboard never show them — ADM-001, SEC-005 — implemented, tests passing.
- Superadmin Course Catalog: the Dean edits a course's code, title and lecture/laboratory units and retires or restores it. A retired course leaves Faculty's course list and cannot be typed again (Faculty are told to ask the Dean); existing classes keep it. Courses are never deleted — ADM-001 — implemented, tests passing.
- Superadmin People & Accounts: the Dean lists Faculty (with their classes) and Students and deactivates or reactivates an account. Deactivation ends every session and blocks every sign-in ("Contact the Dean."), keeps all records, and also blocks a Student's Class Secretary sign-in; a Faculty member with a class this school year cannot be deactivated, and the classes are listed; a Dean cannot be deactivated — ADM-001 — implemented, tests passing.

## Deliberate boundaries

- Email-code sign-in verification is retired; system email remains for non-authentication features.
- The Dean/Admin class-section screen is a non-authoritative preview with sample data and no server calls — CLS-003.
- Facial biometrics are not a complete production flow (BIO-001 to BIO-010).
- The demo and production VPS servers (RUN-002, DEL-001; see [vps-deployment.md](vps-deployment.md) and [release-guide.md](release-guide.md)) use manual GHCR publishing, Traefik HTTPS, app-only Watchtower updates and PostgreSQL backups; CI/CD remains out of scope.
