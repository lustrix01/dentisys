# Production changelog: 2026-11-24

Promoted sha `1bb190c1f32d` (branch `lighthal9-responsive-polish`, fast-forwarded into `lighthal9-responsive` before the promote). Previous production sha `37cf737951d5`.
Every item answers a user report from production (backlog section 14) and is listed in [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md) "On the demo, awaiting promotion" until the Done move. Full text: [backlog-built-2026-11-24.md](backlog-built-2026-11-24.md). How polish1 and polish2 were merged: [polish-merge-2026-11.md](polish-merge-2026-11.md).

## Faculty

- **14.1 Main action colour** (commit 06bb1a1). Faculty main action buttons (Create class, Send invitations, Appoint Secretary, Submit grades, Send for Dean approval, Save grade weights, Confirm assessment) use #338037 (`clinical-600`) at rest, not only on hover.
- **14.3 Retention Monitoring sends through Email Management** (commit fd41be4).
  - At-Risk Students and Remedials no longer have row checkboxes.
  - Send advisory and Send remedial notices are always enabled and open the matching Email Management tab, where Faculty choose the recipients.
  - The notice link shown after scheduling a remedial still preselects that one student.
- **14.4 Retention & Remedials report lists only retention students** (commit 676b03e). Reports & Export lists only students who were in retention or remedial in the selected school year and class, including those who since passed. The table, PDF and Excel use the same list. When no student qualifies, the table shows "No students in retention or remedial for the selected school year."
- **14.7 My Classes card header** (commit 06bb1a1). A long course label ("DNUTRI 222 • YEAR 2") no longer wraps. When the header does not fit, the section, Edit and Archive move down together.

## Secretary

- **14.2 Attendance requests** (commit 06bb1a1). Each group header has Approve selected and Reject selected. They stay greyed out until a row is ticked, read "all" once the whole group is ticked, and always ask for confirmation. The top "Select all shown" and "Approve selected" are gone.

## Student

- **14.5 Attendance Logs export** (commit 1fe64d0). Export Excel and Export PDF at the end of the filter card. Files hold the rows shown after search, filters and sort, in that order. The PDF is saved from the browser print dialog. With no rows, both buttons are disabled ("No attendance logs to export").
- **14.8 Class join link on the sign-in page** (commit 06bb1a1). A signed-out visitor who opens a class join link is told to sign in to join the class. A Student without an account is told to accept the Faculty's invitation email first.

## Superadmin

- **14.6 Change Faculty reason** (commit 06bb1a1). The reason must be 8 to 240 characters. The label shows the limit and the server refuses anything outside it.

## Every role

- **14.9 New in-app notices** (NTF-002, commit 351c0b0). Six notices added:
  - Student: final grades released; grade changed (after the Dean approves a grade change); class Faculty changed.
  - Faculty: join request waiting (when auto-approve is off).
  - Superadmin: face revocation request waiting; face enrolment flagged.

  Notices go only to active accounts, once per event, never to the person who acted. "Final grades released" is sent at Submit grades; a withdraw within the 24-hour grace keeps it, and a re-submit sends no second one.
- **14.10 Filters carry across pages** (commit 9f7dc12). A school year, course or class chosen in one page's filter carries to the same user's other pages with that filter, Dashboards included.
  - It lasts for one sign-in in one browser tab. Signing out or closing the tab forgets it.
  - Search, sort, status filters and tabs stay on their own page.
  - "All" never replaces the class on a page that always shows one class (Grade Computation, Attendance Monitoring).
  - Dean Reports carries the school year only. My Classes & Rosters is unchanged.
  - Attendance Monitoring's old saved class choice (`localStorage` key `faculty_attendance_selected_cs_id`) is no longer used.

## What users notice right after the promotion

- Faculty who used to tick students in Retention Monitoring now pick them in Email Management.
- Faculty Reports, Retention & Remedials shows fewer rows: students never in retention or remedial no longer appear.
- Notices start from events after the promotion. Earlier grade releases, grade changes and Faculty changes do not send them.
- Attendance Monitoring forgets each Faculty member's last class once, then remembers the class chosen on any page.

## Database and rollback

- No migrations. Notices use the existing `notifications` table with two new type values (`grades_released`, `grade_changed`).
- Rollback command: `.\scripts\promote-prod.ps1 -Sha 37cf737951d5`. A rollback ships images only; notices already sent stay in the table. How older images show the two new types was not checked.

## Verification status

This changelog was written from the commit list between `37cf737` and `1bb190c`, the commit messages, the backlog text and the polish merge record.

- Checked on the demo at `1bb190c1f32d` (2026-11-24): every role signs in and stays signed in after reload (`demo-test.ps1`, 4/4); audit chain OK (420 events). The demo's frontend bundle contains the new 14.3, 14.4, 14.5, 14.6, 14.8 and 14.10 code.
- Checked before publishing: `check.ps1` on `1bb190c` (373 mocked browser tests, unit tests, docs contract). `check-postgres.ps1` passed after both merges (at e2e624c); no server-side file changed after that.
- Not clicked through on the demo: the screens of each item. They were shown to the Owner on real-app demos before commit (links in the commits and the merge record).
- Not verified anywhere with real data: the Retention Monitoring links on a current-year class with At-Risk students (dev data has none), and the 14.9 notices reaching real phones.

## Not in production yet

- Nothing that changes the app. Commits after `1bb190c` are docs only (this changelog and the backlog fix for 14.1 to 14.9).
