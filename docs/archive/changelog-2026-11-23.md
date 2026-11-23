# Production changelog: 2026-11-23

Promoted sha `37cf737951d5` (branch `lighthal9-responsive`, emergency batch). Previous production sha `c17ad9423369`.
Each item links to its entry in [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md) "Done". How the batch was merged and checked: [emergency-merge-2026-11.md](emergency-merge-2026-11.md).

## Grading

- **12.12 Final grades released only after Submit grades** (GRD-004, commit d764e95, migration 073). Outside Grade Computation, Final grades and Retention Status appear only after Faculty submit the class's grades.
- **12.13 Midterm advisory publish, update and unpublish** (GRD-004 / UI-003, commits d764e95 and c0468c3, migration 073).
  - Faculty publish, update or unpublish the Midterm advisory from a `Midterm advisory ▾` menu next to Submit grades. The menu's first line shows the current status.
  - The bar above the tabs now shows only grade submission states.
- **9.30 Dean Grade Submissions without an Academic Terms row** (commits 0a3a5df, 3ebd6a7). The page falls back to the classes' own term dates when Academic Terms has no matching row, so it is no longer empty.

## Biometrics

- **12.9 Face revocation needs approval** (BIO-002 / BIO-009, commit 8358237, migration 072).
  - A Student asks to revoke their face with a reason of 8 to 240 characters. A Superadmin approves or rejects it. A Student has at most one pending request.
  - A face update that does not match the enrolled face is blocked and flagged (F2).
  - Repeat revocations are flagged (F3).
  - New Superadmin **Face Enrolments** page with Revoke Requests and Flags tabs, and a row for it on Overview.
- **12.10 Consent withdrawal cannot delete a face** (BIO-005, commit def2ab4). The consent API no longer deletes an enrolled face without an approved revocation.

## UI

- **9.25 8-character reason minimum, remaining dialogs** (commits 44e7233, 5dedbc1). Superadmin Audit Trail revoke, grade change "Send for Dean approval" and Dean "Reject Grade Change" show the minimum and check it on click.
- **9.29 Faculty layout on phones** (commits 53ea31f, 1c544e6). The Grade Weights title no longer runs under Reload. The Assessments sticky header no longer covers the class picker.

## What users notice right after the promotion

- Current-term classes that are not yet submitted stop showing Final grades and Retention Status until Faculty submit them.
- Midterm Advisory shows only for classes that already emailed an advisory (marked by the 073 backfill) or that Faculty publish from now on.

## Database and rollback

- Migration 072 adds the `face_revoke_requests` table and widens the `face_enrolment_flags.kind` check to F1, F2 and F3. Older images do not use either.
- Migration 073 adds three nullable columns to `class_sections` (`midterm_published_at`, `midterm_published_by`, `midterm_published_snapshot`). Older images do not read them.
- 073 also backfills `midterm_published_at` on current-year, unsubmitted, periods-mode classes that already sent a Midterm Advisory email. A rollback does not undo that, and older images ignore it.
- Rollback command: `.\scripts\promote-prod.ps1 -Sha c17ad9423369`. After a rollback, Final grades show before submission again and the revocation queue is not reachable.

## Verification status

This changelog was written from the commit list and the migrations between `c17ad94` and `37cf737`, the backlog "Done" entries and the merge record.

- Read in full: migrations 072 and 073.
- Taken from the backlog, commit messages and merge record only: the screen and API behaviour of every item above. The controllers and pages were not re-read for this changelog.
- Checked before promotion (per the merge record): `check.ps1` and `check-postgres.ps1` on the merged commit, unit and mocked browser tests, and a real-screenshot review demo.
- Not known: how many production classes the 073 backfill marked as published.

## Not in production yet

- Nothing that changes the app. The commits after `37cf737` on `lighthal9-responsive` are docs and workflow only (b34aa62 backlog Done move, 6bf7e9c workflow rules on the working branch).
