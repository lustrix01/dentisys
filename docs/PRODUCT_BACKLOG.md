# DentiSYS Product Backlog

The Owner-approved list of open work, the standing rules every change follows, and a one-line record of finished items. Implemented behaviour is in [spec.md](../spec.md) and [features.md](features.md); the order of work is in the [roadmap](roadmap.md). Who does which kind of work, and how it is validated, is in [AGENTS.md](../AGENTS.md).

The backlog is not exhaustive. The Owner may add, clarify, remove or reprioritise requirements at any time, especially after manual testing. Omissions are not permission to invent behaviour: when uncertain, ask the Owner.

Item numbers are permanent; a built item waits in [On the demo, awaiting promotion](#on-the-demo-awaiting-promotion) until the Owner promotes it, then moves to [Done](#done) with its number.

---

# Priority (above the backlog)

Owner, 2026-11-23. Full text of each item is in its section below; P1–P3 (2026-11-19) are in Done.

**Highest** (agreed with the users and the Owner on 2026-11-23): 14.1 to 14.10, all on production (2026-11-24).

**Not yet prioritised** (the Owner ranks these next): 9.19, 9.20, 9.21, 9.28, 9.32, 12.6, 12.7, 12.11, 12.14, 13.4, 13.10, 13.11.

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
- **9.20** Face Registration on production (Owner, 2026-11-17): the Owner checks enrolment and biometric check-in with a real phone camera on bu-dentisys.com after the fixes for action frames the server rejected, uploads cut off by the 30 s browser limit, and error text that blamed lighting for every failure. Open: production Traefik uses its default request read timeout, so an upload slower than about 60 s is still cut off. Owner decision (2026-11-20): if the real-phone check shows slow uploads are being cut off, the Owner raises the production Traefik read timeout to 120 s on the production server (Claude never touches production).
- **9.21** Flaky mocked browser tests (2026-11-17): with 8 workers and one local retry, a test that passes only on retry is reported as "flaky" and does not fail `check.ps1`. Each one hides a timing bug in the app or the test (the TimePicker re-sync race was a real app bug; the Secretary Excused test recorded the page's GET refresh as the request). Fix one, then remove it here; add any new flaky test the run reports. Open: `e2e/dfd_verification.spec.ts:43` (did not fail in 130 runs on 2026-11-24); `e2e/faculty.spec.ts:2754` (Grade Weights "Version 2" not visible within 5 s once in a full run on 2026-11-24, then 0 of 10 alone).
- **9.28** Capitals (Owner ruling 2026-11-20, `ui-fix-demo/references/dentisys.md`): CSS capitals stay only on table column headers, the printed class list and the emphasised red action button of a dialog that needs it (Cancel · RETIRE, DELETE, CONFIRM). The Owhie merge removed them from 44 small labels; about 260 places still use them (small labels above a value, form labels, chips, headings) and the emphasised dialog buttons do not have them yet. One `ui-fix-demo` batch with its own demo; update `docs/frontend.md` "Page patterns" with the rule.
- **9.32** Midterm advisory menu after Publish (found 2026-11-24; fails on the demo, same code as production): `e2e/live/grade-submission.spec.ts:154` fails because after Publish the class refresh unmounts the `Midterm advisory` menu while it is being reopened (`frontend/src/components/GradeSubmissionBanner.tsx` around line 309, `setMidterm(null)` on `refreshToken`). It blocks the `check-postgres` pass. Bug routine: the live test already reproduces it.

---

# 12. Next features (Owner, 2026-11-15)

Requested by the Owner. Each starts with the contract (fields, errors, examples) and the Owner's `/grill-me`, and any spec change needs the Owner's approval first.

- **12.6** UI formality pass (Owner, 2026-11-16): make every screen clean, polished and formal: remove messiness, inconsistencies and unnecessary elements, and bring each page part to one standard look. Starts like the other items: a contract listing the screens and rules, the Owner's rulings, then Before/After demos from the real app. Owner decisions (2026-11-20): one role per batch, in the order Dean, Faculty, Secretary, Student, Superadmin, each with one Before/After demo for the Owner's approval, then a commit. The checklist per screen is only: (1) every page part matches its "Page patterns" standard (`docs/frontend.md`); (2) text follows the spec's casing and wording rules; (3) no decorative extras (emoji, playful wording, extra colours or gradients); (4) no duplicate controls or leftover placeholder text; (5) consistent spacing. Anything missing or broken that the pass finds becomes its own backlog item, not part of the batch. No batch in the days before the capstone defense; unfinished roles carry over.
- **12.7** Optional (Owner, 2026-11-19): Superadmin full class management: create, edit, archive and restore class sections from the Superadmin Classes page, on top of P1's view and Change Faculty. Today only Faculty do these (CLS-001, CLS-003), so it needs a spec change, a contract and `/grill-me` (~4–6 days). Not scheduled: stays unscheduled until after the capstone defense (Owner, 2026-11-20).
- **12.11** Optional (Owner, 2026-11-23): Student UI and API support to withdraw biometric consent as an immediate pause (stops biometric check-in and face updates while keeping `.sface` locked until Superadmin approves a revocation request or the Student restores consent), distinct from 12.9 normal revocation requests (where `.sface` remains usable while pending). Needs migration relaxing `ck_biometric_active_reference`, contract, `/grill-me`, `BIO-002` update, and UI demo.
- **12.14** Optional (Owner, 2026-11-23): Follow-up UI responsiveness, theme/color alignment, and control placement polish pass for 12.12 and 12.13 (Grade Computation Midterm lifecycle banner, confirmation modals, Retention Monitoring / Email Management signposts, and Student Pending cards) to match site theme and improve mobile/desktop ergonomics. Needs a Before/After UI demo (`ui-fix-demo` / `Stage 2 Final Demo`) when scheduled.
- **12.5** Dropped (Owner, 2026-11-15): check-out with geofencing. In a classroom a Student who leaves is noticed, and a second check would double the time attendance takes; face enrolment flags (12.2) cover the real abuse.

---

# 13. User evaluation (IT Faculty and client, 2026-11-18)

The full report text, what DentiSYS did at the time, the gaps, open questions and size estimates are in [the evaluation record](archive/user-evaluation-2026-11.md); read the item's section there before starting it. The original report, client notes and paper objective are quoted word for word in [its Source text section](archive/user-evaluation-2026-11.md#1-source-text); each item below links to the part it comes from and to its analysis. Nothing here is approved scope until the Owner rules on it; spec changes need the Owner's approval first.

**Now** (step-by-step [implementation plan](archive/plan-user-evaluation-batch-1-2026-11.md)):

- **13.4** Speed: measured 2026-11-18 on demo 071c84f (`benchmarks/results/20261117-180637-demo-071c84f.json`): pages p95 0.08 s (1 user) to 2.3 s (50 users), sign-in 0.39 s, face check-in server time 0.5 / 1.0 / 1.5 s for 1 / 2 / 4 students, no errors. Owner (2026-11-20): the evaluators found face enrolment and face attendance check-in slow, and the Owner agrees they are. Next: one joint session (~20 min): the Owner does a face enrolment and a check-in on the demo with a real phone while Claude reads the server's per-step timings (camera capture, upload, server), since `scripts/benchmark.ps1` times only the server side of check-in and not enrolment; scope the optimisation from those numbers. The benchmark fingerprint's row counts read 0 (script bug, timings unaffected).

**Later** (bigger, or waiting for information):

- **13.10** Paper objectives against the system: the paper says Retention Monitoring "projects retention risk through rules-based risk assessment", but UI-003 retired risk levels and projection; the Midterm Watchlist is the remaining rules-based check. Owner decision (2026-11-20): change the paper's wording to describe the Midterm Watchlist and the remedial rules; the system does not bring back risk projection. The paper is outside this repository. ISO/IEC 25010 is the study's evaluation, supported by 13.1 and 13.4. Report: [paper objective 1.2](archive/user-evaluation-2026-11.md#paper-objective-quoted-by-the-client) · [Analysis](archive/user-evaluation-2026-11.md#1310-paper-objectives).
- **13.11** Past sessions on their own page instead of the Sessions dialog's Past Sessions tab (13.6). Owner (2026-11-20): a class will likely have many sessions, and a dialog is too small to review them. Needs a contract (where the page lives, its columns, sorting and filters, how it opens a roll call), a `ui-fix-demo` Stage 1 demo and a UI-005 spec change.

---

# 14. User reports (2026-11-23)

Reported by users on production, reviewed by them and the Owner on 2026-11-23. Check whether each is still open before starting it.

Nothing open: every item is on production (see Done).

---

# On the demo, awaiting promotion

Built and running on the demo, not yet on production. Each moves to [Done](#done) after the Owner promotes it.

Nothing at the moment.

---

# Done

Full text and Owner decisions of these items: [backlog items closed before 2026-11-14](archive/backlog-done-2026-11.md). Promoted to production on 2026-11-21 (sha c17ad942): [items built on 2026-11-20](archive/backlog-built-2026-11-20.md) [items from the Owhie merge](archive/backlog-built-2026-11-20-owhie.md) and [13.8](archive/backlog-built-2026-11-21.md). Promoted to production on 2026-11-23 (sha 37cf7379): [items from the emergency branch](archive/backlog-built-2026-11-23.md). Promoted to production on 2026-11-24 (sha 1bb190c1): [items from the polish branch](archive/backlog-built-2026-11-24.md), [changelog](archive/changelog-2026-11-24.md). Promoted to production on 2026-11-24 (sha 87d4e08c): [items from the Gemini swarm](archive/backlog-built-2026-11-24-swarm1124.md), [changelog](archive/changelog-2026-11-24-swarm1124.md).

- **9.27** The page you are on is plain text in the breadcrumb; the crumbs above it are links (78b33bb).
- **9.31** After a class switch in Grade Computation with no edits, a sidebar link leaves the page and closing the tab asks nothing (1b21689).
- **9.21** (part) Flaky tests fixed: `grade-release-gates.spec.ts:120`, `roster-import.spec.ts:58` and `:157` (f193cf8, 6fb61fe).
- **14.1** Faculty main action buttons use #338037 (`clinical-600`) at rest (06bb1a1).
- **14.2** Secretary requests: Approve selected and Reject selected in each group header; the page-wide select-all and Approve selected are gone (06bb1a1).
- **14.3** Retention Monitoring Send advisory and Send remedial notices are links to the matching Email Management tab; the row checkboxes are gone (fd41be4).
- **14.4** Reports & Export, Retention & Remedials lists only students in retention or remedial in the selected school year (676b03e).
- **14.5** Student Attendance Logs export to Excel and PDF, with the rows as shown (1fe64d0).
- **14.6** Change Faculty reason: 8 to 240 characters, shown in the label and checked by the server (06bb1a1).
- **14.7** My Classes card header: the course label never wraps (06bb1a1).
- **14.8** The sign-in page explains a class join link (06bb1a1).
- **14.9** Six new in-app notices per role, NTF-002 (351c0b0).
- **14.10** A school year, course or class chosen in one page's filter carries to the user's other pages with that filter, every role, until sign-out (9f7dc12).
- **9.25** The remaining reason dialogs (Superadmin Audit Trail revoke, grade change Send for Dean approval, Dean Reject Grade Change) show the 8-character minimum and check it on click.
- **9.29** Grade Weights title no longer runs under Reload on phones; the Assessments sticky header no longer covers the class picker.
- **9.30** Dean Grade Submissions falls back to the classes' own term dates when Academic Terms has no matching row.
- **12.9** Face revocation needs a reason and Superadmin approval; non-matching face updates are blocked (F2); repeat revocations are flagged (F3); Superadmin Face Enrolments page (migration 072).
- **12.10** Withdrawing biometric consent can no longer delete an enrolled face without approval.
- **12.12** Final grades and Retention Status appear outside Grade Computation only after Submit grades (migration 073).
- **12.13** Midterm advisory publish, update and unpublish from a `Midterm advisory` menu next to Submit grades. Commit c0468c3.
- **9.23** A malformed recovery code on the 2FA sign-in page fails as a wrong code ("Invalid recovery code.", 400) instead of a server error. Commit bb2bdbe.
- **9.24** 2FA "Remember this device for 30 days" at sign-in (migration 069), with "Forget my trusted devices" in Profile. Commit 112b338.
- **9.26** "Remember me for 7 days" on `/login` (migration 070); unticked sessions end when the browser closes; never for the Superadmin. Commit c410bc6.
- **12.8** The Superadmin signs in only at `/superadmin/sign-in`; `/login` refuses it and its page refuses every other role. Commit f0a171e.
- **13.6** (review part) Past Sessions tab in the Faculty Sessions dialog: ended sessions newest first with their counts, a From–To filter and revoked sessions behind a switch; a card opens its roll call; past-school-year and Finished classes open Sessions with only this tab (UI-005). Commit ff6f6e1.
- **9.22** Layout batch: shorter desktop header with a 44 px Home breadcrumb target, collapsed sidebar labels fit at iPad 820, Audit Trail role on its own line at 320 px, Faculty Reports Retention & Remedials as phone row cards (with 13.3's 320 px column). Owhie merge 5210a14.
- **9.25** (Secretary part) The attendance change request labels its reason "Reason (at least 8 characters)"; Send for approval stays clickable and a short reason shows the error. Owhie merge 5210a14.
- **13.3** Report generation, rest: Dean and Faculty reports and exports count each course enrollment with its own grade, the attendance sheet and remedial summary exports, and the follow-ups approved 2026-11-19. Owhie merge 5210a14 closes its last open part (9.22).
- **13.5** Faculty Retention Monitoring puts the grade right after Student on all three tabs; At-Risk Students and Remedials tick rows and open Email Management with them preselected (Send advisory / Send remedial notices). Owhie merge 5210a14.
- **13.6** (hint part) Start Session says "You can change the date and time." Owhie merge 5210a14.
- **13.7** Confirmations before every one-click data change that had none: single-row Approve / Reject of requests, join requests and join switches (automatic approval on warns that anyone with the code joins without review), Save grade weights, Superadmin restores. Owhie merge 5210a14.
- **13.8** Grade submission, deadlines and Dean approval (GRD-004, migration 071): Faculty submit a class's grades (24-hour withdraw), the class locks with its shared grade weights, grade changes go through a draft the Dean approves or rejects on the new Grade Submissions page (Superadmin read-only), and each term has a deadline on Academic Terms. Contract: [grade-submission.md](contracts/grade-submission.md). Commit 8dca163.
- **P3** Owhie's `owhie-responsive` (exports, confirmations, session scheduling) merged with `lighthal9-superadmin`, six Owner rulings applied; `lighthal9-responsive` moves to that merge. Record: [owhie-exports-sessions-merge-2026-11.md](archive/owhie-exports-sessions-merge-2026-11.md).
- **P2** Superadmin pages checked on the device list (11 core devices, light and dark): no sideways scroll or cut-off text; phone card labels on People & Accounts, Face Enrolment Flags and Course Catalog use the readable small-text grey. Layout findings shared with the Dean are 9.22.
- **P1** Superadmin Classes with live records: every Faculty member's real classes and rosters, read-only, with one action, Change Faculty (grade weights copied to the new Faculty member). Contract: [superadmin-classes.md](contracts/superadmin-classes.md).
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
- **5.7** Email Management filters by Course and Class Section; recipients are chosen from the rows, with no individual-student dropdown. Ticked recipients stay ticked when filters change; on desktop the search box sits on its own row.
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
