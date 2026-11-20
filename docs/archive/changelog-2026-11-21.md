# Production changelog: 2026-11-21

Promoted sha `c17ad942` (branch `lighthal9-responsive`). Previous production sha `efb39223994a`.
Each item links to its entry in [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md) "Done".

## Grading

- **13.8 Grade submission, deadlines and Dean approval** (GRD-004, [contract](../contracts/grade-submission.md), commit 8dca163, migration 071).
  - Faculty submit a class's grades, with a 24-hour withdraw window.
  - A submitted class locks, including its shared grade weights.
  - Grade changes go through a draft. The Dean approves or rejects it on the new Grade Submissions page. The Superadmin has read-only access.
  - Each term gets a grade deadline on Academic Terms.
  - A class now locks when its grades are submitted, not when its school year ends. Migration 071 marks existing past-year classes as submitted.
- **13.3 Report generation, rest** (Owhie merge 5210a14). Dean and Faculty reports and exports count each course enrollment with its own grade. This also covers the attendance sheet and remedial summary exports.

## Sign-in and security

- **9.26 Remember me for 7 days** (c410bc6, migration 070). Ticked: a 7-day session with no idle timeout. Unticked: the session ends when the browser closes. Never available to the Superadmin.
- **9.24 Remember this device for 30 days at the 2FA step** (112b338, migration 069). "Forget my trusted devices" is in Profile.
- **12.8 Superadmin sign-in page** (f0a171e). The Superadmin signs in only at `/superadmin/sign-in`. `/login` refuses the Superadmin, and the new page refuses every other role.
- **9.23 Malformed recovery code** (bb2bdbe). It now fails as a wrong code ("Invalid recovery code.", 400) and no longer returns a 500.

## Attendance

- **13.6 Past Sessions tab** (ff6f6e1). Faculty open ended sessions from a new tab, newest first, with counts and a From-To filter. Revoked sessions sit behind a switch. Past-school-year and Finished classes open Sessions with only this tab.
- **13.6 Start Session hint.** It now says "You can change the date and time."

## UI and confirmations (Owhie merge 5210a14)

- **13.7 Confirmations before one-click data changes.** They cover single-row approve and reject, join requests and join switches, Save grade weights and Superadmin restores. Turning on automatic approval warns that anyone with the code joins without review.
- **13.5 Retention Monitoring.** Grade sits right after Student on all three tabs. Rows can be ticked and sent to Email Management with "Send advisory" or "Send remedial notices".
- **9.22 Layout batch.** It covers the header, sidebar labels, Audit Trail and the Reports phone cards.
- **9.25 Secretary reason label.** It now reads "Reason (at least 8 characters)".

## Database and rollback

- Migrations 069, 070 and 071 add tables and columns, and an images-only rollback works with them.
- 071 also rewrites existing class rows, and a rollback does not undo that.
- Rollback command: `.\scripts\promote-prod.ps1 -Sha efb39223994a`.

## Verification status

This changelog was written from the code diff between `efb3922` and `c17ad94` and from the backlog. It is not fully verified.

- Checked in the diff: the sign-in changes (9.23, 9.24, 9.26, 12.8), the migrations, the read-side effects of grade submission (what Students, Secretaries and the Dean see during a grade change), the 7-day session length, the grace-window rule for excused requests, and the confirmation dialogs.
- Not read in full: `GradeSubmissionController.php`, `GradeSubmissions.tsx`, `GradeSubmissionBanner.tsx` and the `AttendanceMonitoring.tsx` rewrite. The submit rules, the 24-hour window and the Dean's approval steps in 13.8, and the Past Sessions tab in 13.6, rest on the contract, the backlog text and function names.
- Taken from the backlog or commit messages only: 13.3 (report counts and exports), 9.25 (Secretary reason label), and the Owhie layout items 9.22 and 13.5.
- Not run: migration 071's backfill was not run, so how many production classes it changed is not known. No behaviour was tested.
- Production having an ongoing term (see below) is the Owner's statement; it was not checked.

## Open after promotion

- 9.30: the Dean's Grade Submissions page is empty when Academic Terms has no row for the current term. Production has an ongoing term, so it should not apply there.
