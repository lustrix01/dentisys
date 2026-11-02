# Approved specification amendment: responsive audit

**Status: APPROVED and applied to `spec.md` (amendments 1–4).**

Owner approval: 2026-11-03, "Approved spec amendment".

The Owner approved the responsive-audit changes on branch `lighthal9-responsive-audit` after a Before/After demo (2026-11-03). Three of them change behaviour that `spec.md` states as Owner decisions, so under AGENTS.md they must be recorded there before merge. Each amendment below is a new dated paragraph inserted directly after the decision it narrows; the earlier paragraph stays as history, as `spec.md` already does elsewhere.

## 1. UI-001: phone blocks and the collapsed sidebar

Insert after the "Owner decision (2026-10-13): Below 1280 px wide …" paragraph of UI-001 (currently `spec.md` line 1094):

> Owner decision (2026-11-03): Below 768 px wide, a data list that does not fit MAY show each row as a stacked block instead of a table that scrolls sideways. A block shows every field of the desktop row in the desktop data format. It MAY put the row's name or date first, show two related fields on one line (for example date · time, or course code · course name), and leave out a field that has no value for that row (shown as "—" on desktop). Where a block field has no visible label, it carries a label for screen readers. From 768 px up, tables follow the 2026-10-13 rule. This applies to the Student Dashboard enrolled subjects (approved 2026-11-03, which also uses blocks at 1024–1279 px), Student Attendance Logs, the Faculty and Secretary roll calls, the Faculty roster, the Reports grade summary, the Email Management invitation lists and the Audit Trail. In the collapsed sidebar each icon shows a short name under it, and the full name also appears on keyboard focus. This supersedes the "never merged, reordered" part of the 2026-10-13 decision for these lists below 768 px only.

## 2. Audit trail display (AUD, "Display." paragraph)

In the "Display." paragraph of the 2026-10-17 audit-trail decision (currently `spec.md` line 417), replace the last sentence

> Below 1280 px the UI-001 responsive rule applies: same columns, the table scrolls inside its own box with When pinned.

with

> Below 768 px each entry is a block showing When, Who, What, Record, Change and the status badge in that order under the day headers, with its Details button. From 768 px to 1279 px the UI-001 responsive rule applies: same columns, the table scrolls inside its own box with When pinned. Owner decision (2026-11-03).

## 3. UI-002: Full Matrix Pin switch

Insert after the "Owner decision (2026-10-13): Below 1280 px wide, Full Matrix View shows a Pin switch …" paragraph of UI-002 (currently `spec.md` line 1104):

> Owner decision (2026-11-03): Below 640 px wide only the Full Name column stays pinned, in a narrower column that wraps, and the Pin switch is hidden. From 640 px to 1279 px the switch reads "Keep visible while scrolling: Name / ID and name" (default Name). Below 1280 px the matrix grows to the screen height (at least its former 600 px). ID Number and Full Name stay separate columns, and at 1280 px and wider nothing changes. This supersedes the 2026-10-13 decision's phone behaviour and switch wording.

## 4. Optional: wording decided in the same review

None of these contradicts `spec.md`. Recording them keeps later work from undoing them. Insert after amendment 1 if wanted:

> Owner decision (2026-11-03): Interface wording: buttons that start an attendance session say "Start session" (a future date says "Schedule session") and the session list is "Sessions", on Faculty and Secretary pages alike; a class with no grade yet shows the state "No grade yet" in a neutral grey pill, while a missing grade value reads "Pending"; school-year filters use "S.Y."; sign-in and password-reset forms label the field "University email"; the roll-call filter for rows without attendance reads "Not recorded" on both roll calls.

The UI-001 sentence that names "Start Attendance Session" (currently line 1166) describes the feature, not a button label, and needs no change.
