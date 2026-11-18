# DentiSYS Product Backlog

The Owner-approved list of open work, the standing rules every change follows, and a one-line record of finished items. Implemented behaviour is in [spec.md](../spec.md) and [features.md](features.md); the order of work is in the [roadmap](roadmap.md). Who does which kind of work, and how it is validated, is in [AGENTS.md](../AGENTS.md).

The backlog is not exhaustive. The Owner may add, clarify, remove or reprioritise requirements at any time, especially after manual testing. Omissions are not permission to invent behaviour: when uncertain, ask the Owner.

Item numbers are permanent; a finished item moves to [Done](#done) with its number.

---

# Priority (above the backlog)

Owner, 2026-11-19: these come before every backlog item, in this order.

- **P1** Superadmin Classes with live records: the page lists every Faculty member's real classes and rosters, read-only, with one action, Change Faculty. Contract: [superadmin-classes.md](contracts/superadmin-classes.md).
- **P2** Superadmin pages responsive on the device list.
- **P3** Merge `owhie-responsive` (the colleague's UI work and fixes) into `lighthal9-responsive`, then `lighthal9-superadmin` into `lighthal9-responsive`. How is decided with the Owner before starting.

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

# 9. Known issues

- **9.19** Production `devops` sudo password (Owner, 2026-11-17): it is still the original one from the emergency kit (an earlier `sudo passwd` changed root's password, not `devops`'s). Change it on the production server with `passwd` as `devops` (no `sudo`), then update the emergency kit.
- **9.20** Face Registration on production (Owner, 2026-11-17): the Owner checks enrolment and biometric check-in with a real phone camera on bu-dentisys.com after the fixes for action frames the server rejected, uploads cut off by the 30 s browser limit, and error text that blamed lighting for every failure. Open: production Traefik uses its default request read timeout, so an upload slower than about 60 s is still cut off.
- **9.21** Flaky mocked browser tests (2026-11-17): with 8 workers and one local retry, a test that passes only on retry is reported as "flaky" and does not fail `check.ps1`. Each one hides a timing bug in the app or the test (the TimePicker re-sync race was a real app bug; the Secretary Excused test recorded the page's GET refresh as the request). Fix one, then remove it here; add any new flaky test the run reports. Known: none open. To find the cause, record a trace of the failing test (`--repeat-each=40 --retries=0 --trace=retain-on-failure`) and read its page errors.

---

# 12. Next features (Owner, 2026-11-15)

Requested by the Owner. Each starts with the contract (fields, errors, examples) and the Owner's `/grill-me`, and any spec change needs the Owner's approval first.

- **12.6** UI formality pass (Owner, 2026-11-16): make every screen clean, polished and formal: remove messiness, inconsistencies and unnecessary elements, and bring each page part to one standard look. Starts like the other items: a contract listing the screens and rules, the Owner's rulings, then Before/After demos from the real app.
- **12.5** Dropped (Owner, 2026-11-15): check-out with geofencing. In a classroom a Student who leaves is noticed, and a second check would double the time attendance takes; face enrolment flags (12.2) cover the real abuse.

---

# 13. User evaluation (IT Faculty and client, 2026-11-18)

The full report text, what DentiSYS did at the time, the gaps, open questions and size estimates are in [the evaluation record](archive/user-evaluation-2026-11.md); read the item's section there before starting it. The original report, client notes and paper objective are quoted word for word in [its Source text section](archive/user-evaluation-2026-11.md#1-source-text); each item below links to the part it comes from and to its analysis. Nothing here is approved scope until the Owner rules on it; spec changes need the Owner's approval first.

**Now** (step-by-step [implementation plan](archive/plan-user-evaluation-batch-1-2026-11.md)):

- **13.3** Report generation, rest. Done: Dean reports read current remedial attempts; attendance sheet (X31) and remedial summary (X32) in Excel/PDF menus; Dean Students and Retention exports list one row per course enrollment with its own grade (X30); Faculty Excel exports print `LAST, First Middle` (the Faculty reports API now sends name parts); Faculty Retention Watch Lists show Remedial Courses with no Risk Level column (UI-003; the Midterm Watchlist "Risk Standing" stays per X28); Dean class cards, drill-downs, class filters, per-class attendance and exports count a student in every class they are enrolled in, with that class's own standing and attendance records (CLINIC-4A: 15 students, 150 records). Goes to the client as our reading of "fix the export". Follow-ups (each a visible change, needs a demo): the Dean on-screen Students and Retention tables still show one row per student while the files have one row per course; Faculty "Remedial Courses" shows 0 in rose and sits next to "Remedial Program Status" with no explanation; on phones "Remedial exam scheduled" wraps to three lines and the Dean drill-down table needs a sideways scroll; the Dean page tiles count each student once while the class cards count per class. Report: [Analysis](archive/user-evaluation-2026-11.md#133-report-generation).
- **13.4** Speed: measured 2026-11-18 on demo 071c84f (`benchmarks/results/20261117-180637-demo-071c84f.json`): pages p95 0.08 s (1 user) to 2.3 s (50 users), sign-in 0.39 s, face check-in server time 0.5 / 1.0 / 1.5 s for 1 / 2 / 4 students, no errors. Waits on: when the faculty tested and which step was slow. The benchmark fingerprint's row counts read 0 (script bug, timings unaffected).

**Later** (bigger, or waiting for information):

- **13.5** Retention Monitoring shows grades first and sends notices to selected students with a review step (~1 day, after 13.2). Waits on: which view is "the retention record"; move the send action or link to Email Management with students preselected. Report: [Retention 1–3](archive/user-evaluation-2026-11.md#retention-module-important) · [Analysis](archive/user-evaluation-2026-11.md#135-retention-monitoring).
- **13.6** Filter in Sessions disappeared, and sessions outside class hours. The 2026-10-11/12 redesign hid the Course and Class Section selects, removed the past-sessions list (UI-005: "There is no past-sessions list") and shows the roll-call session switch only when a date has several sessions; every Start session field is still editable. Waits on: which filter the user means (a screenshot helps), the Owner's spec approval if the past-sessions list returns (~½ day + demo), and steps for the outside-hours case. Report: [Attendance 1–2](archive/user-evaluation-2026-11.md#attendance-module-important) and the Owner clarification below it · [Analysis](archive/user-evaluation-2026-11.md#136-sessions-filter-and-sessions-outside-class-hours).
- **13.7** Confirmation pop-ups. Waits on: the list of actions that lacked one; score entry auto-saves, so not per score change; "Submit grades" in 13.8 would be one. Report: [Faculty 5](archive/user-evaluation-2026-11.md#faculty-module-important), [General 2](archive/user-evaluation-2026-11.md#general-system-improvements) · [Analysis](archive/user-evaluation-2026-11.md#137-confirmation-pop-ups).
- **13.8** Grade submission, deadlines and Dean approval (~4–7 days; new spec requirement, contract and `/grill-me`): Faculty submit grades with a logged time, per-course deadlines, the Dean sees on-time and late submissions, grades lock after the deadline, later changes and archived-class reactivation need Dean approval. Report: [Faculty 1–4](archive/user-evaluation-2026-11.md#faculty-module-important), [Admin/Dean 2–3](archive/user-evaluation-2026-11.md#admindean-module) · [Analysis](archive/user-evaluation-2026-11.md#138-grade-submission-and-dean-approval).
- **13.10** Paper objectives against the system: the paper says Retention Monitoring "projects retention risk through rules-based risk assessment", but UI-003 retired risk levels and projection; the Midterm Watchlist is the remaining rules-based check. Waits on: the Owner's choice to adjust the paper wording or the system. ISO/IEC 25010 is the study's evaluation, supported by 13.1 and 13.4. Report: [paper objective 1.2](archive/user-evaluation-2026-11.md#paper-objective-quoted-by-the-client) · [Analysis](archive/user-evaluation-2026-11.md#1310-paper-objectives).

---

# Done

Full text and Owner decisions of these items: [backlog items closed before 2026-11-14](archive/backlog-done-2026-11.md).

- **13.9** Dean and Superadmin as separate roles and accounts: the Dean keeps Dashboard, Reports & Analytics, Faculty Invitations and My Activity; the Superadmin (one account, created by the server script, 2FA required at the first sign-in) gets setup, accounts, the audit trail and the Dean handover. Contract: [dean-superadmin-split.md](contracts/dean-superadmin-split.md).
- **9.14** Notice banner, empty state and loading state standards on the Faculty, Secretary and Student pages (small dashboard panels keep a one-line message).
- **9.15** People & Accounts phone cards wrap emails only before "@".
- **9.16** Superadmin account actions: sign out everywhere, reset 2FA, revoke face enrollment, Invited people with resend and revoke, People and Course Catalog Excel export.
- **9.17** People & Accounts course and class-section filters (this school year).
- **9.18** Pinned header row and first column on every screen table.
- **12.1** Account management in Superadmin mode: move a Faculty or Student account to a new email (compromised mailboxes) and correct names; retired emails; a server script for the one-Dean handover. The Dean and the Superadmin stay one account and permissions stay tied to the roles (Owner rulings 2026-11-15). Contract: `docs/contracts/roles.md`.
- **12.2** Face enrolment flags: Update my face (matching updates raise nothing), faces expire at term end again (Owner, 2026-11-16), and a Dean-only Face Enrolment Flags page for re-enrolment within 30 days of the Student's own withdrawal (F1) and updates whose new face does not match (F2); nothing is blocked. Contract: `docs/contracts/face-reenrolment.md`.
- **12.3** Simpler session setup: Windows-style clock picker for the four session times, Start session filled from the class's current or next meeting (opens 15 minutes early; class grace periods Present +30, Late +45 from the opening), cutoffs and face/geofence under More settings, and Sessions from the Weekly Schedule (auto-sessions for the next 7 days, labelled Auto; turned on in the class Edit dialog). Spec ATT-001 and ATT-008; contract: `docs/contracts/session-creation.md`.
- **12.4** Join a class by code: each class has a code and link that only its Faculty see and share (hidden on the class card with an eye button; Join code button on the roster with New code, Code On, Auto-Approve and the join requests); Students join from My Classes after seeing which class the code belongs to; Faculty approve or reject. Spec CLS-004; contract: `docs/contracts/class-join-code.md`.
- **3.1** Read-only profiles with a Change Name action for every role.
- **3.2** Authenticator confirmation for name changes.
- **4.1** Dean My Activity: dropped; the Audit Trail role filter covers it.
- **4.2** Dean Dashboard: server-backed metrics, no Quick Actions block (tested).
- **4.3** Faculty invitation rows start with a read-only View action; the Invitation Details dialog shows name, email, status, sent and expiry dates and the invitation's email history, with no token or link.
- **4.4** Dean Settings: no Course Component Ratios or Retention Standard setting (tested).
- **4.5–4.7** Superadmin mode (spec ADM-001, [contract](contracts/superadmin.md)): Dean / Superadmin switch; Audit Trail class work; Course Catalog edit, retire and restore (migration 060); People & Accounts deactivate and reactivate.
- **4.9** Dean / Superadmin regroup (spec ADM-001): the Dean view keeps Dashboard, Reports & Analytics and Classes; Superadmin mode gets an Overview plus People & Accounts, Faculty Invitations, Course Catalog, Academic Terms, Rooms and the only Audit Trail; Course Catalog and People & Accounts filters (People filters run on the server); Page patterns standards for page header, notice banner, empty and loading states.
- **4.8** Invitation Details matches email history by invitation id (migration 059 stores it on each invitation email), falling back to the address for older emails.
- **5.1** Faculty Dashboard: no repeated Quick Actions or duplicate class figures (tested).
- **5.2** Grade Computation confirms mutations, not interactions: a Save that deletes saved scores asks first, the grade-sheet import asks once with a summary, and leaving the page through an in-app link (or closing the tab) warns only when unsaved scores or grade weights would be lost. Browser Back/Forward is not guarded (needs a data router).
- **5.3** Midterm Watchlist offers no remedial action; the server refuses remedial without a final grade (tested).
- **5.4** Faculty Remedial Record dialog: Student Number, both attempts with Faculty notes and a completion date (set once when the result is recorded, migration 058; older records show Last updated), and the cost-recovery grade, result and date.
- **5.5** Future worksheet dates: sessions can be scheduled or viewed, not recorded.
- **5.6** Attendance roll call lists (Faculty and Secretary) keep a solid sticky header inside their bounded scroll box.
- **5.7** Email Management filters by Course, then Class Section, then Student; ticked recipients stay ticked when filters change; on desktop the search box sits on its own row.
- **5.8** Email History built from the outbox, one row per send action.
- **5.9** Class archiving gaps: Cancelled and Created-by-mistake classes are excluded from Email Management, school-year lists and offering-wide grading; archived-class messages match the server.
- **5.11** Client requests: cost-recovery remedials implemented; the remove-student error was not reproduced.
- **7.1** Secretary Dashboard: no Quick Actions; status, alerts and pending work remain (tested).
- **7.2** Manual Override filtering: date, then session, then records; revoked sessions view-only.
- **8.1** Field validation: form inputs carry the server limits; assessment title ≤ 255, Student Number 3–50; the server counts characters; server field errors show under the field.
- **8.2** 2FA settings: recovery-code regeneration and turning 2FA off are limited to 10 attempts per 5 minutes per user; regeneration is audited ("Regenerated recovery codes.").
- **9.1** Faculty Dashboard counts only classes still running in the current school year, like the Classes & Rosters Assigned tab.
- **9.2** Grade Computation tab strip on phones: no horizontal scrolling at 320–390 px; the shared section tabs wrap with short names.
- **9.3** Main bundle size (2.3 MB, 565 kB gzipped): the ineffective dynamic import of `apiClient` is fixed; the size is left as is by the Owner; reopen if first load on phones feels slow.
- **9.4** iBU look on every export (navy report-name row, light-blue header rows, white PDF header with a navy rule); the Faculty Reports Grade Summary uses iBU's columns (Student Number, Full Name, Status, Midterm, Tentative, Final, Completion, Notes) with LAST, First names.
- **9.6** November 2026 polish-audit UI follow-ups.
- **9.7** Wording: DentiSYS in everything users see; Student No. in table headers and phone cards, Student Number elsewhere; Student Details; Dean; Faculty. Full Matrix switch reads "Name / Student No. and name". The authenticator app entry keeps "DentiSYS".
- **9.8** Shared tab bar standard (white card bar and grey list switch).
- **9.9** Full Matrix View loads all scores in one request per class; Show computation at every width; the Reports Assessment Scores sheet and PDF print show Score, %, Transmuted, Average % and Weighted.
- **9.10** One small-capitals header style on every table (docs/frontend.md Page patterns; tested).
- **9.11** The shared Email history table becomes stacked cards below 768 px.
- **9.12** Profile security cards use a 16 px inset on phones.
- **9.13** Export wording: a dash for no clinic hours or no score yet (PDF), Midterm Watchlist status Graded / Missing scores / Pending, names LAST, First in every remaining export.
- **10.1** T1 transmutation: fixed formula, optional per assessment, new assessments start with it on.
- **10.2** T4 Full Matrix View unsaved scores kept in the tab and offered back after a forced sign-out.
- **10.4** T8 + T11 grading clarification: course-level remedial, two attempts at 75%, cost recovery.
- **10.5** GoogleLinkCard confirm-password field has the standard show/hide control and a screen-reader label.
- **10.6** The Features page badge reads "PDF / CSV Roster · Excel Grades"; a synthetic partially readable grade-sheet fixture is tested.
- **10.7** Phone pass: Student Retention cards full width; Face Registration "Back to terms" never splits and its ID line is readable in dark mode.
- **10.8** Session cards: the Scheduled date line aligns with its title; View-only checked and correct.
- **10.9** T9 session restored after closing the browser: intended behaviour.
- **10.10** A new assessment in a category named Attendance starts with transmutation off.
- **11.1–11.4** Docs-audit defects: development show-link flags forwarded, single-server start scripts check every required biometric key, timezone/CA/biometric timeouts settable on single-server and VPS, unused watchlist-unlock route removed.
- **11.5** A session whose class end equals its opening time is rejected: "Class end must be after the opening time."
- **13.2** Remedial notices are sent only from Email Management → Remedial; saving a date never emails; Retention offers Preview and send notice (EML-001, 2026-11-18).
