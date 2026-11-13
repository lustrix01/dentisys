# Product backlog items closed before 2026-11-14

Full text of backlog items moved to the "Done" section of [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md) on 2026-11-14, kept for their Owner decisions.

# 3. Profiles and names (all roles)

## 3.1 Read-only profiles with a Change Name action

**Status: Done.** All four roles use the shared Change Name action; self-service rejects identity-critical fields and activated Students own their name changes.

## 3.2 Authenticator confirmation for name changes

**Status: Done.** Authenticator-app MFA requires a rate-limited, single-use TOTP confirmation; recovery codes are rejected.

---

# 4. Dean / Admin

## 4.1 Dean My Activity

**Status: Dropped (Owner, 2026-10-15).** The Dean's Audit Trail already shows the Dean's own actions through its role filter, with better filters than Faculty and Secretary My Activity. No separate page.

## 5.5 Attendance worksheet date

**Status: Done.** Under ATT-001 (2026-10-01), a future Asia/Manila date may be selected to schedule or view sessions, but attendance cannot be recorded for it. Backend unit, PostgreSQL integration and mocked E2E tests cover this.

## 5.8 Email History from the outbox

**Status: Done (2026-10-15).** Email History groups each send action from the outbox (migration 047) with per-recipient status and failure reasons; the Dean's Faculty invitations have their own history.

Build Email History from the email outbox/delivery records and relevant audit events, not a separate log.

Owner decisions (2026-10-08): include every email actually sent; each user sees only the emails they sent; one row per action that expands to its recipients with per-recipient delivery status; show only what is needed (action, recipients, status, time, failure reason), never the email body; view-only, no resend; emails sent before the outbox link existed are hidden. Open: whether purely automatic emails (no human sender) appear anywhere — proposed: not shown.

Owner decisions (2026-10-15, demo approved: [Email History Demo](https://claude.ai/artifact/BCMUpwpEDC85EjtiWDw3L8)): these replace the "hidden" rule above — emails sent before action grouping exists stay visible, each as its own one-recipient action. Columns are Action, Recipients, Status (per-status counts), Date sent; the Subject column is removed; opening an action lists each recipient with status and, when failed, the failure reason. The tab counter counts actions; the last 100 actions load with all their recipients. The Dean's Faculty invitations (send, reissue, email correction) are recorded in the outbox and listed in an "Email history" card on the Faculty Invitations page, below Invitation status; the Dean's history starts with the first invitation after deploy. Automatic emails (password reset, first-Dean invitation) are not shown anywhere.

Testing must never email real or real-looking addresses (spam risk): automated tests use mocks or Mailpit only, and manual checks need `EMAIL_PROVIDER=mailpit`, or `custom` with an `EMAIL_TEST_ALLOWLIST` of Owner-controlled addresses.

## 5.11 Client requests waiting on information

**Status: Unclear.** Blocked until the client answers.

- **Cost recovery remedials:** implemented under the 2026-11-13 clarification. The API accepts one-decimal grades; 2.4 passes and 2.5–5.0 fail. The cost-recovery program itself remains outside DentiSys; the app records the status, grade and result.
- **Remove-student error:** not reproduced; the client was asked for the exact message shown.

---

## 7.2 Manual Override filtering

**Status: Done (2026-10-15).** Date, then session, then records on both screens; revoked sessions are view-only and hidden by default; Overridden and Recorded by filters added.

Add filters for attendance status, overridden/original state and Student search, so users never scroll an unbounded list to reach a record.

Owner decisions (2026-10-08): applies to both the Faculty and Secretary override screens; a single date, then a session on that date, then its records; Student search by name/surname or student number; filters for status, overridden/original and how attendance was recorded (biometric, Faculty manual, Secretary manual); revoked sessions are hidden by default, shown labelled Revoked and view-only when included, never overridable (check current behaviour first and ask before changing it); no pagination — a bounded scrolling list with a sticky header.

Owner decisions (2026-10-15, demo approved: [Revoked Sessions Demo](https://claude.ai/artifact/VuauttgUzBW7gCd5WFgnnr)): the server refuses every attendance write aimed at a revoked session ("This session was revoked. Its attendance is view-only."). Both session pickers hide revoked sessions behind a "Revoked sessions: Hide / Show (n)" switch in the Pin-switch design (default Hide, not remembered); shown sessions keep the lowercase status "revoked"; switching to Hide closes an open revoked session. An open revoked session is view-only (no Override, no Mark-all) on both screens, and the Secretary also sees its saved records. A date with only revoked sessions says how many are hidden. The Faculty session picker also appears whenever the date has a revoked session. The Secretary "All recorded results" option is removed; the worksheet opens on the live session, otherwise "Choose a session". New filters on both screens: Overridden (All / Overridden / Original) and Recorded by (All / Biometric / Faculty manual / Secretary manual).

---
## 9.6 UI follow-ups from the November 2026 polish audit

**Status: Done (2026-11-06, see docs/archive/casing-2026-11.md).** The 2026-11-06 device audit found these. They predate the polish pass (see docs/archive/ui-polish-2026-11.md):
- Academic Terms: a semester without dates ("2nd Semester", "Summer") has its name dimmed to about 2.6:1 contrast, which is hard to read. Use the standard small grey text.
- Classes, Archived Classes tab: the "Edit" button pokes out of its card on 320 px phones and at desktop 1280.
- The audit flags controls under the sticky header ("under-bar") because it scrolls while capturing. Check whether any are real before fixing.

## 9.8 Tab bar UX follow-ups

**Status: Done — all items below implemented and approved by the Owner on 2026-11-06.** The 2026-11-10 follow-up keeps the full accessible name on phones and the warning count tone on the selected tab. (Standard E: white card bar for page sections, grey bar with outline for list switches; per-role colour; one shared `Tabs` component; Student My Classes moves to the grey bar, Student Retention and Faculty Attendance Monitoring to the white card bar.) The 2026-11-06 tab bar review measured all 12 tab bars on the running app; Before / After previews and the numbers are in the Owner's private Tab Bar Standard demo (https://claude.ai/artifact/EBfuzdD5bdrWAdxVw3S1fL). The standards are in [frontend.md](../frontend.md) "Page patterns".
- U1: in the grey list switch the selected tab stands out only 1.1:1 from the others (target 3:1). Mark it with an outline, fill or underline (outline recommended). Rooms, Dean Class Sections, Classes, Score Entry view, Attendance Monitoring.
- U2: tab text below 4.5:1 becomes one shade darker: green selected text on Classes and Attendance (3.8:1), grey text on Dean Class Sections and Score Entry view (3.1–4.3:1).
- U3: no tab bar tells screen readers that it is a set of tabs or which tab is selected. Best done with one shared tab component that replaces the 12 copies.
- U4: on phones the section tabs of Grades, Reports and Email take 3 rows and Retention 2. Short phone names, as Dean Reports already uses, bring them to 2, 2, 1 and 1 rows (a wording change).
- U5: on phones the Student My Classes tab names split onto two lines. Moving the year out of the tab and tightening the padding keeps both tabs on one line, side by side; not yet measured below 390 px.
- Student My Classes and Student Retention use two tab looks found nowhere else, so a student sees two different tab bars.

## 9.9 Full Matrix follow-ups (GRA-03, 2026-11-14)

- **Show computation on phones and tablets.** It is desktop-only (1280 px and wider) by the Owner's choice and comes next, after its own demo and approval. See `docs/archive/proposals/gra-03-matrix-computation.md`.
- **Slow score loading.** Full Matrix View requests scores one assessment at a time: about 100 requests for the seeded Faculty account, so the score boxes fill in over several seconds. One request per class would fix it. This is pre-existing and not caused by GRA-03.
- **Excel export.** The matrix export does not include the new % / Transmuted steps. Add them only if Faculty ask.

---

## 10.1 T1 — transmutation defaults and the attendance link

**Status: Implemented (2026-11-13).** Transmutation remains optional per assessment and uses the fixed `(score ÷ maximum score) × 50 + 50` formula. Admin and Faculty bound controls were removed; legacy bound columns remain for compatibility and are ignored. Attendance behavior and incomplete-score handling remain unchanged. The Reports bundle spreadsheet and print view show effective percentages. New assessments still default to transmutation OFF.

## 10.2 T4 — Full-Matrix sign-out proof and unsaved-edit protection

**Status: Not started (needs Owner environment).** The matrix path alone cannot expire the session on the current build (auto-save and heartbeat are activity-flagged). Ranked causes and the demo-DB fingerprint queries are in `t4-matrix-scenario.md`; the Owner needs to provide the date/time, browser and whether the tab predated the 2026-11-11 14:56 deploy. Separately, a forced sign-out silently loses matrix edits pending in the 10-second debounce or invalid cells; a sessionStorage draft + restore was proposed and is not implemented.

## 10.4 T8 + T11 — grading system clarification

**Status: Implemented (2026-11-13).** Remedial is course-level and applies to completed final grades 2.5–4.9 across course types. A 5.0 follows the in-person irregular reenrollment path outside DentiSys. Each of at most two attempts passes at 75%; failing attempt one permits attempt two, and failing attempt two moves to cost recovery. Cost recovery accepts one-decimal grades from 1.0 to 5.0; 1.0–2.4 passes and 2.5–5.0 fails. These outcomes do not replace the original course grade. The implementation adds a read-only report for potentially affected historical rows; saved records are not backfilled. The in-person irregular reenrollment process remains outside DentiSys.

## 10.9 T9 — no action

**Status: Closed (2026-11-11).** The Owner confirmed that a logged-in site should restore the session after closing/restarting the computer; the persistent session (30-minute idle, 7-day absolute) stays unchanged.
